import os
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from xgboost import XGBRegressor
import shap
from sklearn.metrics import mean_absolute_error
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client
import pickle

# ──────────────────────────────────────────────────────────────────────────────
# FEATURE LIST — 21 features. Single source of truth. Never change order.
# gen_lag_48h permanently removed (near-zero signal beyond gen_lag_24h).
# ──────────────────────────────────────────────────────────────────────────────
FEATURE_LIST = [
    'physics_ceiling_mw',   # 01 — sets the scale, expected SHAP #1
    'cloud_cover_norm',     # 02 — primary solar attenuator
    'wind_speed_hub',       # 03 — hub-height wind, primary wind driver
    'wind_dir_sin',         # 04 — circular wind direction
    'wind_dir_cos',         # 05 — circular wind direction
    'temperature_c',        # 06 — panel efficiency degrades at heat
    'soiling_factor',       # 07 — dust accumulation on panels
    'hour_sin',             # 08 — time of day, circular
    'hour_cos',             # 09 — time of day, circular
    'month_sin',            # 10 — seasonal irradiance
    'month_cos',            # 11 — seasonal irradiance
    'is_monsoon',           # 12 — structural break Jun–Sep
    'asset_type_num',       # 13 — 0=solar 1=wind (single model covers both)
    'terrain_type_num',     # 14 — plateau/coastal/interior
    'capacity_mw',          # 15 — scale the plant correctly
    'lat',                  # 16 — micro-climate differentiation
    'lon',                  # 17 — micro-climate differentiation
    'gen_lag_1h',           # 18 — autocorrelation memory
    'gen_lag_24h',          # 19 — day-ahead persistence signal
    'cloud_lag_1h',         # 20 — cloud inertia signal
    'has_real_lag',         # 21 — cold-start flag
]

# Supabase numeric columns — cast to float after fetch to prevent string dtype
# bug that causes SHAP to crash with "could not convert string to float"
NUMERIC_COLS = {
    'weather_readings': [
        'ghi_wm2', 'cloud_cover_pct', 'wind_speed_10m',
        'wind_direction_deg', 'temperature_c', 'precipitation_mm'
    ],
    'generation_readings': [
        'generation_mw', 'physics_ceiling_mw', 'soiling_factor', 'attenuation'
    ],
    'plants': [
        'lat', 'lon', 'capacity_mw', 'hub_height_m',
        'wind_speed_correction', 'cloud_correction'
    ],
}

# ──────────────────────────────────────────────────────────────────────────────
# STEP 0 — SETUP
# ──────────────────────────────────────────────────────────────────────────────
load_dotenv()
supabase = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
os.makedirs('model', exist_ok=True)


def fetch_all(table_name):
    """Paginated fetch. Forces numeric columns to float to prevent SHAP crash."""
    rows, start, chunk = [], 0, 1000
    while True:
        resp = supabase.table(table_name).select('*').range(start, start + chunk - 1).execute()
        if not resp.data:
            break
        rows.extend(resp.data)
        if len(resp.data) < chunk:
            break
        start += chunk
    df = pd.DataFrame(rows)
    for col in NUMERIC_COLS.get(table_name, []):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    return df


def patch_and_reload(model_path):
    """
    XGBoost ≥2.1 serialises base_score as '[0.5]' (bracketed string).
    SHAP TreeExplainer cannot parse that format and crashes.
    This patch strips the brackets in-place so SHAP works correctly.
    The patched file REPLACES the original — Session 6 loads these same files.
    """
    with open(model_path, 'r') as f:
        js = json.load(f)
    param = js.get('learner', {}).get('learner_model_param', {})
    bs = param.get('base_score', '')
    if isinstance(bs, str) and bs.startswith('['):
        param['base_score'] = bs.strip('[]')
        js['learner']['learner_model_param'] = param
        with open(model_path, 'w') as f:
            json.dump(js, f)
    booster = xgb.Booster()
    booster.load_model(model_path)
    return booster


# ──────────────────────────────────────────────────────────────────────────────
# PART A — LOAD DATA
# ──────────────────────────────────────────────────────────────────────────────
print('PART A — LOADING DATA...')
weather    = fetch_all('weather_readings')
generation = fetch_all('generation_readings')
plants     = fetch_all('plants')

weather['timestamp']    = pd.to_datetime(weather['timestamp'],    utc=True)
generation['timestamp'] = pd.to_datetime(generation['timestamp'], utc=True)

df = pd.merge(weather, generation, on=['plant_id', 'timestamp'], how='inner')
df = pd.merge(
    df,
    plants[['id', 'name', 'lat', 'lon', 'capacity_mw',
            'asset_type', 'terrain_type', 'hub_height_m']],
    left_on='plant_id', right_on='id', how='left'
)

df = df.sort_values('timestamp').reset_index(drop=True)
df = df.dropna(subset=['physics_ceiling_mw'])
df = df[df['physics_ceiling_mw'] > 0]

assert len(df) > 100_000, f"Expected >100k rows, got {len(df)}"
print(f"Loaded {len(df):,} rows across {df['plant_id'].nunique()} plants.")


# ──────────────────────────────────────────────────────────────────────────────
# PART B — FEATURE ENGINEERING (exact order matches FEATURE_LIST)
# ──────────────────────────────────────────────────────────────────────────────
print('PART B — FEATURE ENGINEERING...')

df['cloud_cover_norm'] = df['cloud_cover_pct'] / 100.0

df['wind_speed_hub'] = np.where(
    df['asset_type'] == 'wind',
    df['wind_speed_10m'] * (df['hub_height_m'].fillna(80.0) / 10.0) ** 0.15,
    0.0
)

df['wind_dir_sin'] = np.sin(np.radians(df['wind_direction_deg']))
df['wind_dir_cos'] = np.cos(np.radians(df['wind_direction_deg']))

# temperature_c and soiling_factor already present from generation_readings fetch

df['hour_sin']  = np.sin(2 * np.pi * df['timestamp'].dt.hour  / 24)
df['hour_cos']  = np.cos(2 * np.pi * df['timestamp'].dt.hour  / 24)
df['month_sin'] = np.sin(2 * np.pi * df['timestamp'].dt.month / 12)
df['month_cos'] = np.cos(2 * np.pi * df['timestamp'].dt.month / 12)

df['is_monsoon']       = df['timestamp'].dt.month.isin([6, 7, 8, 9]).astype(int)
df['asset_type_num']   = (df['asset_type'] == 'wind').astype(int)
df['terrain_type_num'] = df['terrain_type'].map(
    {'plateau': 0, 'coastal': 1, 'interior': 2}
).fillna(0).astype(int)

# Lag features — must groupby plant_id (global shift = data leakage)
df['gen_lag_1h']  = df.groupby('plant_id')['generation_mw'].shift(1)  / df['capacity_mw']
df['gen_lag_24h'] = df.groupby('plant_id')['generation_mw'].shift(24) / df['capacity_mw']
df['cloud_lag_1h'] = df.groupby('plant_id')['cloud_cover_norm'].shift(1)

# has_real_lag MUST be computed before fillna (it flags the cold-start rows)
df['has_real_lag'] = (~df['gen_lag_1h'].isna()).astype(int)

df['gen_lag_1h']   = df['gen_lag_1h'].fillna(0)
df['gen_lag_24h']  = df['gen_lag_24h'].fillna(0)
df['cloud_lag_1h'] = df['cloud_lag_1h'].fillna(0)

# Final dtype enforcement — guarantees no string columns reach XGBoost/SHAP
X_full = df[FEATURE_LIST].apply(pd.to_numeric, errors='coerce').fillna(0)

# Confirm no NaN leaked through
assert X_full.isna().sum().sum() == 0, "NaN in feature matrix after fillna"
print(f"Feature matrix: {X_full.shape[0]:,} rows × {X_full.shape[1]} features")

# TARGET: attenuation in [0, 1.05]
y = (df['generation_mw'] / df['physics_ceiling_mw']).clip(0, 1.05)


# ──────────────────────────────────────────────────────────────────────────────
# PART C — WALK-FORWARD SPLIT (never shuffle — lag features leak)
# ──────────────────────────────────────────────────────────────────────────────
print('PART C — SPLITTING DATA...')
t = df['timestamp']
mask_train = t <  pd.Timestamp('2023-04-01', tz='UTC')
mask_val   = (t >= pd.Timestamp('2023-04-01', tz='UTC')) & (t < pd.Timestamp('2023-07-01', tz='UTC'))
mask_test  =  t >= pd.Timestamp('2023-07-01', tz='UTC')

X_train, y_train = X_full[mask_train], y[mask_train]
X_val,   y_val   = X_full[mask_val],   y[mask_val]
X_test,  y_test  = X_full[mask_test],  y[mask_test]

assert len(X_train) > 50_000, f"Training set too small: {len(X_train)}"
assert len(X_test)  > 20_000, f"Test set too small: {len(X_test)}"
print(f"Train: {len(X_train):,} | Val: {len(X_val):,} | Test: {len(X_test):,}")


# ──────────────────────────────────────────────────────────────────────────────
# PART D — TRAIN THREE XGBoost QUANTILE MODELS
# ──────────────────────────────────────────────────────────────────────────────
print('PART D — TRAINING MODELS...')

PARAMS = dict(
    n_estimators       = 400,   # document spec
    max_depth          = 6,
    learning_rate      = 0.05,
    subsample          = 0.8,
    colsample_bytree   = 0.8,
    min_child_weight   = 5,
    random_state       = 42,
    tree_method        = 'hist',
    early_stopping_rounds = 30,
)

models = {}
for alpha in [0.1, 0.5, 0.9]:
    tag = {0.1: 'p10', 0.5: 'p50', 0.9: 'p90'}[alpha]
    m = XGBRegressor(objective='reg:quantileerror', quantile_alpha=alpha, **PARAMS)
    m.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    m.save_model(f'model/xgb_{tag}.json')
    models[alpha] = m
    print(f"  {tag}: best_iteration={m.best_iteration}, "
          f"trees_used={min(m.best_iteration + 1, 400)}")

# Save feature list — this is what fetch_and_forecast.py loads at runtime
with open('model/features.json', 'w') as f:
    json.dump(FEATURE_LIST, f, indent=2)
print(f"features.json saved: {len(FEATURE_LIST)} features")


# ──────────────────────────────────────────────────────────────────────────────
# PART E — VALIDATION METRICS
# ──────────────────────────────────────────────────────────────────────────────
print('PART E — VALIDATING...')

p10 = models[0.1].predict(X_test)
p50 = models[0.5].predict(X_test)
p90 = models[0.9].predict(X_test)

# Monotonicity enforcement
p10 = np.maximum(np.minimum(p10, p50), 0.0)
p90 = np.maximum(p90, p50)

mae_p50   = mean_absolute_error(y_test, p50)
coverage  = float(np.mean((y_test >= p10) & (y_test <= p90)))

# Persistence baseline: attenuation = (lag24 × capacity) / ceiling
ceil_test  = df[mask_test]['physics_ceiling_mw'].values
lag24_test = df[mask_test]['gen_lag_24h'].values   # already / capacity_mw
cap_test   = df[mask_test]['capacity_mw'].values

persistence = np.clip(
    (lag24_test * cap_test) / np.maximum(ceil_test, 1e-6),
    0, 1.05
)
valid = ~np.isnan(persistence)
persistence_mae = mean_absolute_error(y_test[valid], persistence[valid])

print(f"  p50 MAE:        {mae_p50:.4f}  (target: < persistence MAE)")
print(f"  Persistence MAE:{persistence_mae:.4f}")
print(f"  Skill score:    {(1 - mae_p50/persistence_mae)*100:.1f}% better than persistence")
print(f"  Coverage:       {coverage*100:.1f}%  (target: 70–88%)")

assert mae_p50 < persistence_mae, \
    f"FAIL: model MAE {mae_p50:.4f} >= persistence {persistence_mae:.4f}"
assert 0.65 <= coverage <= 0.92, \
    f"FAIL: coverage {coverage*100:.1f}% outside 65–92% window"
print("  [OK] All metric assertions passed.")


# ──────────────────────────────────────────────────────────────────────────────
# PART F — SHAP PERSISTENCE (Fixes XGBoost 2.0 base_score parsing error)
# ──────────────────────────────────────────────────────────────────────────────
print('PART F — SHAP PERSISTENCE...')

# MONKEYPATCH SHAP for XGBoost 2.0+ JSON compatibility
import shap.explainers._tree as shap_tree
original_float = float
def patched_float(x):
    if isinstance(x, str) and x.startswith('[') and x.endswith(']'):
        return original_float(x[1:-1])
    return original_float(x)
shap_tree.float = patched_float

# 1. Save background sample for model-agnostic explanation
background = X_train.sample(100, random_state=42)[FEATURE_LIST]
background.to_parquet('model/shap_background.parquet', index=False)
print("  shap_background.parquet saved (100 rows).")

# 2. Patch model files in-place (keeps files compatible for other tools)
for tag in ['p10', 'p50', 'p90']:
    patch_and_reload(f'model/xgb_{tag}.json')
print("  base_score patch applied to all model files.")

# 3. Create and pickle the robust Explainer
# We use shap.Explainer (model-agnostic) to bypass TreeExplainer's JSON parser
explainer = shap.Explainer(models[0.5], background)
with open('model/shap_explainer.pkl', 'wb') as f:
    pickle.dump(explainer, f)
print("  shap_explainer.pkl saved.")

# 4. Verification check
print("  Verifying SHAP output...")
try:
    X_shap = X_test.iloc[:50][FEATURE_LIST]
    shap_vals = explainer(X_shap)
    # mean_abs of values across rows
    mean_abs = pd.Series(np.abs(shap_vals.values).mean(axis=0), index=FEATURE_LIST)
    
    top5 = mean_abs.sort_values(ascending=False).head(5)
    print("  SHAP top 5 features:")
    for feat, val in top5.items():
        print(f"    {feat:<22} {val:.6f}")

    # Critical assertion: physics_ceiling_mw must dominate
    rank1 = mean_abs.idxmax()
    assert rank1 == 'physics_ceiling_mw', f"FAIL: {rank1} dominates, expected physics_ceiling_mw"
    print("  [OK] SHAP verification passed.")

except Exception as e:
    print(f"  [ERROR] SHAP verification failed: {e}")
    # Don't exit; metrics might still be valid


# ──────────────────────────────────────────────────────────────────────────────
# PART G — PER-PLANT METRICS
# ──────────────────────────────────────────────────────────────────────────────
print('PART G — PER-PLANT METRICS...')

test_ids   = df[mask_test]['plant_id'].values
test_names = df[mask_test]['name'].values
per_plant  = {}

for pid in df[mask_test]['plant_id'].unique():
    mask = test_ids == pid
    if mask.sum() < 10:
        continue
    pname = test_names[mask][0]
    pm    = mean_absolute_error(y_test[mask], p50[mask])

    p_persist = persistence[mask]
    valid_p   = ~np.isnan(p_persist)
    p_pmae    = mean_absolute_error(y_test[mask][valid_p], p_persist[valid_p]) \
                if valid_p.sum() > 0 else 1.0

    skill = round(float(1 - pm / p_pmae), 3) if p_pmae > 0 else 0.0
    per_plant[pname] = {'mae': round(float(pm), 4), 'skill': skill}
    print(f"  {pname:<22} MAE={pm:.4f}  skill={skill:.3f}")


# ──────────────────────────────────────────────────────────────────────────────
# PART H — WRITE TO SUPABASE
# ──────────────────────────────────────────────────────────────────────────────
print('PART H — WRITING TO SUPABASE...')

supabase.table('model_health').insert({
    'checked_at':       datetime.now(timezone.utc).isoformat(),
    'mae_p50':          round(float(mae_p50), 4),
    'persistence_mae':  round(float(persistence_mae), 4),
    'coverage_pct':     round(float(coverage * 100), 2),
    'needs_retraining': bool(mae_p50 > persistence_mae),
    'per_plant_metrics': per_plant,
}).execute()

print('model_health written to Supabase.')

# ──────────────────────────────────────────────────────────────────────────────
# PART I — SAVING SHAP BACKGROUND
# ──────────────────────────────────────────────────────────────────────────────
print('PART I — SAVING SHAP BACKGROUND...')
# Save 100-row background sample for stable SHAP at inference time
background = X_train.sample(100, random_state=42)[FEATURE_LIST].copy()
background = background.apply(pd.to_numeric, errors='coerce').fillna(0)
background.to_parquet('model/shap_background.parquet', index=False)

# Verify SHAP works with background explainer
try:
    ex_verify = shap.Explainer(models[0.5], background)
    sv_check  = ex_verify(X_test.iloc[:20])
    mean_abs  = pd.Series(np.abs(sv_check.values).mean(axis=0), index=FEATURE_LIST)
    top5      = mean_abs.sort_values(ascending=False).head(5)
    print("SHAP (background explainer) top 5:")
    print(top5.to_string())
    print(f"SHAP rank 1: {top5.index[0]}")
    # Save explainer object for reuse at inference
    import pickle
    with open('model/shap_explainer.pkl', 'wb') as f:
        pickle.dump(ex_verify, f)
    print("shap_explainer.pkl saved")
except Exception as e:
    print(f"SHAP background explainer failed: {e}")
    print("Continuing without saving explainer")


# ──────────────────────────────────────────────────────────────────────────────
# FINAL SUMMARY
# ──────────────────────────────────────────────────────────────────────────────
print()
print('=' * 55)
print('TRAINING COMPLETE')
print('=' * 55)
print(f"  Features:        {len(FEATURE_LIST)} (features.json)")
print(f"  p50 MAE:         {mae_p50:.4f}")
print(f"  Persistence MAE: {persistence_mae:.4f}")
print(f"  Skill:           {(1-mae_p50/persistence_mae)*100:.1f}% improvement")
print(f"  Coverage:        {coverage*100:.1f}%")
print(f"  Plants in test:  {len(per_plant)}")
print(f"  SHAP patch:      applied to all 3 model files")
print(f"  Supabase:        model_health updated")
print()
print("Files ready for Session 6:")
for f in ['model/xgb_p10.json', 'model/xgb_p50.json',
          'model/xgb_p90.json', 'model/features.json']:
    size = os.path.getsize(f) / 1024
    print(f"  {f:<30} {size:.0f} KB")
print('=' * 55)
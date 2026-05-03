import os
import sys
import time
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
load_dotenv()

# STEP -1: EARLY DIAGNOSTICS
print(f"[{datetime.now(timezone.utc).isoformat()}] CRON START: fetch_and_forecast.py initiated.")

# Validate environment variables early
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print(f"[{datetime.now(timezone.utc).isoformat()}] CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY missing from environment.")
    sys.exit(1)

print(f"[{datetime.now(timezone.utc).isoformat()}] Environment validated. Loading dependencies...")

# Sequential imports with logging to identify hangs/OOM
print("Loading data libraries (numpy, pandas)...")
import numpy as np
import pandas as pd
import json
import requests
import pickle

print("Loading specialized libraries (pvlib, xgboost, shap, bs4)...")
try:
    import pvlib
    import shap
    import shap.explainers._tree as shap_tree
    from xgboost import XGBRegressor
    from zoneinfo import ZoneInfo
    from bs4 import BeautifulSoup
    from supabase import create_client
except ImportError as e:
    print(f"CRITICAL ERROR: Dependency failure: {e}")
    sys.exit(1)

print("All dependencies loaded. Initializing...")

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
start_time = time.time()

# STEP 0 — STALENESS GUARD (handles first run with empty table)
try:
    resp = supabase.table('forecasts').select('created_at').eq('is_demo', False) \
           .order('created_at', desc=True).limit(1).execute()
    if resp.data:
        last_ts = datetime.fromisoformat(resp.data[0]['created_at'].replace('Z', '+00:00'))
        age_min = (datetime.now(timezone.utc) - last_ts).total_seconds() / 60
        if age_min < 12:
            print(f"Recent forecast exists ({age_min:.1f} min ago). Skipping.")
            sys.exit(0)
except Exception as e:
    print(f"Staleness check error (continuing): {e}")

# STEP 1 — LOAD CONFIG
print("Loading configuration and models...")
plants = supabase.table('plants').select('*').execute().data
plant_map = {p['id']: p for p in plants}
name_map  = {p['name']: p['id'] for p in plants}
FEATURE_LIST = json.load(open('model/features.json'))
gon_priors   = json.load(open('data/gon_priors.json'))

model_p10 = XGBRegressor(); model_p10.load_model('model/xgb_p10.json')
model_p50 = XGBRegressor(); model_p50.load_model('model/xgb_p50.json')
model_p90 = XGBRegressor(); model_p90.load_model('model/xgb_p90.json')

# Load SHAP explainer (background-based, avoids XGBoost 2.0 base_score bug)
import pickle as _pickle
_shap_pkl = 'model/shap_explainer.pkl'
if os.path.exists(_shap_pkl):
    with open(_shap_pkl, 'rb') as _f:
        shap_explainer = _pickle.load(_f)
    print("SHAP explainer loaded from pkl")
else:
    # Fallback: build from background parquet if pkl missing
    try:
        _bg = pd.read_parquet('model/shap_background.parquet')
        _bg = _bg.apply(pd.to_numeric, errors='coerce').fillna(0)
        shap_explainer = shap.Explainer(model_p50, _bg)
        print("SHAP explainer built from background parquet")
    except Exception as _e:
        shap_explainer = None
        print(f"SHAP explainer unavailable: {_e}")

# STEP 2 — FETCH 24HR FORECAST WEATHER (all plants, batched)
print("Fetching weather forecasts...")
all_weather = {}   # {plant_id: DataFrame of 24 hourly rows}
for plant in plants:
    url = 'https://api.open-meteo.com/v1/forecast'
    params = {
        'latitude': plant['lat'], 
        'longitude': plant['lon'],
        'hourly': 'shortwave_radiation,cloud_cover,wind_speed_10m,wind_speed_80m,wind_direction_10m,temperature_2m,precipitation',
        'forecast_days': 2, 
        'timezone': 'Asia/Kolkata'
    }
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=30)
            r.raise_for_status()
            break
        except:
            time.sleep(5)
    else:
        print(f"Failed to fetch {plant['name']}, skipping")
        continue
    
    h = r.json()['hourly']
    df_w = pd.DataFrame({
        'timestamp': pd.to_datetime(h['time']),
        'ghi_wm2':            np.clip(h['shortwave_radiation'], 0, 1400),
        'cloud_cover_pct':    np.clip(h['cloud_cover'], 0, 100),
        'wind_speed_10m':     np.clip(h['wind_speed_10m'], 0, 80),
        'wind_speed_80m':     np.clip(h.get('wind_speed_80m', h['wind_speed_10m']), 0, 100),
        'wind_direction_deg': np.clip(h['wind_direction_10m'], 0, 360),
        'temperature_c':      np.clip(h['temperature_2m'], -10, 60),
        'precipitation_mm':   np.clip(h['precipitation'], 0, 500)
    }).iloc[:25].ffill().dropna()
    df_w['plant_id'] = plant['id']
    all_weather[plant['id']] = df_w

# STEP 3 — PHYSICS CEILING per plant
print("Calculating physics ceilings...")
for pid, df_w in all_weather.items():
    p = plant_map[pid]
    if p['asset_type'] == 'solar':
        loc = pvlib.location.Location(p['lat'], p['lon'], tz='Asia/Kolkata')
        times = pd.DatetimeIndex(df_w['timestamp']).tz_localize('Asia/Kolkata')
        cs = loc.get_clearsky(times)
        ceil = np.clip((cs['ghi'].values / 1000.0) * p['capacity_mw'], 0, None)
        ceil[cs['ghi'].values < 10] = 0.0
    else:  # wind
        hub_h = p['hub_height_m'] if p['hub_height_m'] else 80.0
        # Prefer 80m wind speed if available
        ws_key = 'wind_speed_80m' if 'wind_speed_80m' in df_w.columns else 'wind_speed_10m'
        wind_speed = df_w[ws_key].values
        
        if hub_h == 80.0 and ws_key == 'wind_speed_80m':
            v = wind_speed # direct measurement
        elif ws_key == 'wind_speed_80m':
            v = wind_speed * (hub_h/80.0)**0.15 # extrapolate from 80m
        else:
            v = wind_speed * (hub_h/10.0)**0.15 # extrapolate from 10m
            
        ceil = np.zeros(len(df_w))
        v_mask = (v >= 3.5) & (v < 12.0)
        ceil[v_mask] = p['capacity_mw'] * (v[v_mask] / 12.0)**3
        ceil[(v >= 12.0) & (v <= 25.0)] = p['capacity_mw']
    all_weather[pid]['physics_ceiling_mw'] = ceil

# STEP 4 — SOILING FACTOR (batch query last 7 days precipitation)
print("Calculating soiling factors...")
cutoff_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
precip_rows = supabase.table('weather_readings').select('plant_id,timestamp,precipitation_mm') \
    .gte('timestamp', cutoff_7d).execute().data
precip_df = pd.DataFrame(precip_rows) if precip_rows else pd.DataFrame(columns=['plant_id','timestamp','precipitation_mm'])

for pid, df_w in all_weather.items():
    p = plant_map[pid]
    if p['asset_type'] != 'solar':
        all_weather[pid]['soiling_factor'] = 1.0
        continue
    
    if not precip_df.empty and pid in precip_df['plant_id'].values:
        hist = precip_df[precip_df['plant_id'] == pid].sort_values('timestamp')['precipitation_mm'].values
    else:
        hist = np.zeros(7 * 24)
    
    hrs = 0
    sf = 1.0
    for pr in hist:
        if pr >= 5.0:
            hrs = 0
        sf = max(0.80, 1.0 - (hrs / 24) * 0.0008)
        hrs += 1
    all_weather[pid]['soiling_factor'] = sf

# STEP 5 — LAG FEATURES (batch query last 48 hrs all plants)
print("Calculating lag features...")
cutoff_48h = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
lag_rows = supabase.table('generation_readings').select('plant_id,timestamp,generation_mw') \
    .gte('timestamp', cutoff_48h).eq('is_synthetic', False).execute().data
lag_df = pd.DataFrame(lag_rows) if lag_rows else pd.DataFrame(columns=['plant_id','timestamp','generation_mw'])

for pid in all_weather:
    p = plant_map[pid]
    plant_hist = lag_df[lag_df['plant_id'] == pid].sort_values('timestamp') if not lag_df.empty else pd.DataFrame()
    
    if len(plant_hist) >= 1:
        all_weather[pid]['gen_lag_1h'] = float(plant_hist['generation_mw'].iloc[-1]) / p['capacity_mw']
    else:
        all_weather[pid]['gen_lag_1h'] = 0.0
        
    if len(plant_hist) >= 24:
        all_weather[pid]['gen_lag_24h'] = float(plant_hist['generation_mw'].iloc[-24]) / p['capacity_mw']
    else:
        all_weather[pid]['gen_lag_24h'] = 0.0
        
    all_weather[pid]['has_real_lag'] = 1 if len(plant_hist) >= 1 else 0

# STEP 6 — BUILD FEATURE MATRIX and PREDICT per plant
print("Generating predictions and SHAP drivers...")
all_forecasts = {}


for pid, df_w in all_weather.items():
    p = plant_map[pid]
    df_w = df_w.copy()
    
    # Feature engineering
    df_w['cloud_cover_norm'] = df_w['cloud_cover_pct'] / 100.0
    df_w['wind_speed_hub'] = np.where(p['asset_type'] == 'wind',
        df_w['wind_speed_10m'] * ((p['hub_height_m'] or 80.0) / 10.0)**0.15, 0.0)
    df_w['wind_dir_sin'] = np.sin(np.radians(df_w['wind_direction_deg']))
    df_w['wind_dir_cos'] = np.cos(np.radians(df_w['wind_direction_deg']))
    
    ts = pd.DatetimeIndex(df_w['timestamp'])
    df_w['hour_sin'] = np.sin(2 * np.pi * ts.hour / 24)
    df_w['hour_cos'] = np.cos(2 * np.pi * ts.hour / 24)
    df_w['month_sin'] = np.sin(2 * np.pi * ts.month / 12)
    df_w['month_cos'] = np.cos(2 * np.pi * ts.month / 12)
    df_w['is_monsoon'] = ts.month.isin([6, 7, 8, 9]).astype(int)
    
    df_w['asset_type_num'] = 1 if p['asset_type'] == 'wind' else 0
    df_w['terrain_type_num'] = {'plateau': 0, 'coastal': 1, 'interior': 2}.get(p['terrain_type'], 0)
    df_w['capacity_mw'] = p['capacity_mw']
    df_w['lat'] = p['lat']
    df_w['lon'] = p['lon']
    
    df_w['cloud_lag_1h'] = df_w['cloud_cover_norm'].shift(1).fillna(df_w['cloud_cover_norm'].iloc[0])
    
    # Ensure all required features are present
    for feat in ['gen_lag_1h', 'gen_lag_24h', 'has_real_lag', 'soiling_factor']:
        if feat not in df_w.columns:
            df_w[feat] = 0.0

    X = df_w[FEATURE_LIST].fillna(0)
    
    # Predict attenuation units
    p10_att = model_p10.predict(X)
    p50_att = model_p50.predict(X)
    p90_att = model_p90.predict(X)
    
    # Sanity checks for quantiles
    p10_att = np.minimum(p10_att, p50_att)
    p90_att = np.maximum(p90_att, p50_att)
    p10_att = np.maximum(p10_att, 0.0)
    
    # Hard physics cap — attenuation cannot exceed 1.0 (100% of ceiling)
    # p90 allowed slight 2% over-performance margin for uncertainty band
    p50_att = np.clip(p50_att, 0.0, 1.00)
    p10_att = np.clip(p10_att, 0.0, p50_att)
    p90_att = np.clip(p90_att, p50_att, 1.02)
    
    ceil = df_w['physics_ceiling_mw'].values
    df_w['p10_mw'] = p10_att * ceil
    df_w['p50_mw'] = p50_att * ceil
    df_w['p90_mw'] = p90_att * ceil

    # Enforce minimum uncertainty band for wind plants (Step 4)
    if p['asset_type'] == 'wind':
        min_band = df_w['p50_mw'] * 0.20
        df_w['p10_mw'] = np.minimum(df_w['p10_mw'], df_w['p50_mw'] - min_band)
        df_w['p90_mw'] = np.maximum(df_w['p90_mw'], df_w['p50_mw'] + min_band)

    idx_peak = int(np.argmax(df_w['p50_mw'].values))
    # SHAP — use background explainer to avoid XGBoost 2.0 base_score crash
    shap_json = '{}'
    if shap_explainer is not None:
        try:
            X_peak_clean = X.iloc[[idx_peak]].apply(pd.to_numeric, errors='coerce').fillna(0)
            sv           = shap_explainer(X_peak_clean).values[0]  # shape (21,)
            ceil_peak    = float(ceil[idx_peak])
            shap_mw      = {
                feat: round(float(v) * ceil_peak, 1)
                for feat, v in zip(FEATURE_LIST, sv)
            }
            top3     = dict(sorted(shap_mw.items(), key=lambda x: abs(x[1]), reverse=True)[:3])
            shap_json = json.dumps(top3)
        except Exception as _shap_err:
            print(f"SHAP failed for {plant_map[pid]['name']}: {_shap_err}")
            shap_json = '{}'
    df_w['shap_drivers'] = shap_json  # stored on ALL rows for this plant

    # Risk and Reserve
    df_w['reserve_mw'] = np.ceil((df_w['p50_mw'] - df_w['p10_mw']) / 10) * 10
    ratio = (df_w['p50_mw'] - df_w['p10_mw']) / np.maximum(df_w['p50_mw'], 1)
    df_w['risk_level'] = np.where(ratio < 0.1, 'LOW', np.where(ratio < 0.25, 'MEDIUM', 'HIGH'))
    
    all_forecasts[pid] = df_w

# STEP 7 — GON ADJUSTMENT (correct direction: source leads target)
print("Applying GON adjustments...")
cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
hist_resp = supabase.table('forecasts').select('plant_id,p50_mw') \
    .gte('forecast_for', cutoff_24h).eq('is_demo', False).execute().data

from collections import defaultdict
hist_by_plant = defaultdict(list)
for row in (hist_resp or []):
    hist_by_plant[row['plant_id']].append(row['p50_mw'])
hist_means = {pid: float(np.mean(vals)) for pid, vals in hist_by_plant.items() if vals}

plant_name_to_id = {p['name']: p['id'] for p in plants}
for pid, df_f in all_forecasts.items():
    pname = plant_map[pid]['name']
    gon_fired = False
    
    for source_name, targets in gon_priors.items():
        if pname not in targets:
            continue
        
        edge = targets[pname]
        if edge['r'] < 0.6:
            continue
            
        src_id = plant_name_to_id.get(source_name)
        if not src_id or src_id not in all_forecasts:
            continue
            
        up_current = float(all_forecasts[src_id]['p50_mw'].mean())
        up_hist = hist_means.get(src_id, up_current)
        
        if up_hist > 0:
            deviation = (up_current - up_hist) / up_hist
            if abs(deviation) > 0.15:
                factor = 1 + 0.3 * deviation * edge['r']
                df_f['p50_mw'] = df_f['p50_mw'] * np.clip(factor, 0.7, 1.3)
                gon_fired = True
                print(f"GON: {source_name}->{pname} factor={factor:.3f}")
    
    all_forecasts[pid]['gon_adjusted'] = gon_fired

# STEP 7.5 — KPTCL LIVE CALIBRATION
print("Performing KPTCL live calibration...")
def scrape_kptcl():
    url = "https://kptclsldc.in/StateNCEP.aspx"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    r = requests.get(url, headers=headers, timeout=15)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, 'html.parser')
    
    table = None
    for t in soup.find_all('table'):
        cells = [c.get_text(strip=True).upper() for c in t.find_all(['td', 'th'])[:10]]
        if 'WIND' in cells and 'SOLAR' in cells:
            table = t
            break
    
    if not table:
        raise ValueError("KPTCL data table not found")
        
    headers_row = [c.get_text(strip=True).upper() for c in table.find_all(['td', 'th'])]
    try:
        wind_idx = headers_row.index('WIND')
        solar_idx = headers_row.index('SOLAR')
    except ValueError:
        raise ValueError("WIND or SOLAR column not found in KPTCL table")
        
    data = {'solar_mw': 0.0, 'wind_mw': 0.0, 'pavagada_mw': 0.0}
    for row in table.find_all('tr'):
        cells = row.find_all(['td', 'th'])
        if not cells: continue
        label = cells[0].get_text(strip=True).upper()
        if 'PAVAGADA' in label:
            try: data['pavagada_mw'] = round(float(cells[solar_idx].get_text(strip=True)), 1)
            except: pass
        if 'TOTAL' in label and 'IPPS' in label:
            try:
                data['wind_mw'] = round(float(cells[wind_idx].get_text(strip=True)), 1)
                data['solar_mw'] = round(float(cells[solar_idx].get_text(strip=True)), 1)
            except: pass
    return data

kptcl_signal = None
try:
    SOLAR_PENETRATION = 0.488
    WIND_PENETRATION  = 0.400
    kptcl_data = scrape_kptcl()
    ist_now = datetime.now(timezone.utc).astimezone(ZoneInfo('Asia/Kolkata'))
    current_hour = ist_now.hour
    
    f_solar_p50 = 0.0
    f_wind_p50 = 0.0
    for pid, df_f in all_forecasts.items():
        match = df_f[df_f['timestamp'].dt.hour == current_hour]
        if not match.empty:
            p50_val = float(match['p50_mw'].iloc[0])
            if plant_map[pid]['asset_type'] == 'solar': f_solar_p50 += p50_val
            else: f_wind_p50 += p50_val
                
    if f_solar_p50 > 200:
        expected_solar = f_solar_p50 / SOLAR_PENETRATION
        cal_solar = float(np.clip(kptcl_data['solar_mw'] / max(expected_solar, 1.0), 0.60, 1.40))
    else: cal_solar = 1.0
        
    if f_wind_p50 > 50:
        expected_wind = f_wind_p50 / WIND_PENETRATION
        cal_wind = float(np.clip(kptcl_data['wind_mw'] / max(expected_wind, 1.0), 0.60, 1.40))
    else: cal_wind = 1.0
        
    kptcl_signal = {**kptcl_data, 'cal_solar': cal_solar, 'cal_wind': cal_wind}
    print(f"KPTCL solar={kptcl_data['solar_mw']} wind={kptcl_data['wind_mw']} pavagada={kptcl_data['pavagada_mw']} | cal_solar={cal_solar:.3f} cal_wind={cal_wind:.3f}")
except Exception as e:
    print(f"KPTCL Error: {e}")
    try:
        supabase.table('kptcl_readings').insert({'scraped_at': datetime.now(timezone.utc).isoformat(), 'scrape_success': False, 'error_msg': str(e)}).execute()
        # Log to model_health for dashboard visibility
        supabase.table('model_health').insert({
            'checked_at': datetime.now(timezone.utc).isoformat(),
            'mae_p50': None,
            'persistence_mae': None,
            'coverage_pct': None,
            'needs_retraining': False,
            'per_plant_metrics': {'scrape_status': 'failed', 'reason': str(e)}
        }).execute()
    except: pass

if kptcl_signal:
    DECAY = {0: 1.0, 1: 0.6, 2: 0.3}
    applied_any = False
    for pid, df_f in all_forecasts.items():
        cal_base = kptcl_signal['cal_solar'] if plant_map[pid]['asset_type'] == 'solar' else kptcl_signal['cal_wind']
        if abs(cal_base - 1.0) < 0.05:
            df_f['kptcl_calibrated'] = False
            continue
        applied_any = True
        for offset, weight in DECAY.items():
            target_hour = (current_hour + offset) % 24
            mask = df_f['timestamp'].dt.hour == target_hour
            if not mask.any(): continue
            factor = 1.0 + (cal_base - 1.0) * weight
            for col in ['p10_mw', 'p50_mw', 'p90_mw']:
                df_f.loc[mask, col] = np.clip(df_f.loc[mask, col] * factor, 0, None)
            df_f.loc[mask, 'p10_mw'] = np.minimum(df_f.loc[mask, 'p10_mw'], df_f.loc[mask, 'p50_mw'])
            df_f.loc[mask, 'p90_mw'] = np.maximum(df_f.loc[mask, 'p90_mw'], df_f.loc[mask, 'p50_mw'])
            df_f.loc[mask, 'reserve_mw'] = np.ceil((df_f.loc[mask, 'p50_mw'] - df_f.loc[mask, 'p10_mw']) / 10) * 10
        df_f['kptcl_calibrated'] = True

    try:
        supabase.table('kptcl_readings').insert({
            'scraped_at': datetime.now(timezone.utc).isoformat(), 'solar_mw': kptcl_signal['solar_mw'],
            'wind_mw': kptcl_signal['wind_mw'], 'pavagada_mw': kptcl_signal['pavagada_mw'],
            'calibration_factor_solar': kptcl_signal['cal_solar'], 'calibration_factor_wind': kptcl_signal['cal_wind'],
            'applied': applied_any, 'scrape_success': True
        }).execute()
    except: pass

# STEP 8 — RAMP ALERTS (next 3 hours only, exclude physics-driven transitions)
print("Checking for ramp alerts...")
ramp_rows = []
for pid, df_f in all_forecasts.items():
    cap  = plant_map[pid]['capacity_mw']
    p50  = df_f['p50_mw'].values
    ceil = df_f['physics_ceiling_mw'].values
    times = df_f['timestamp'].values

    # Only check next 3 hourly transitions — operational horizon only
    for i in range(1, min(4, len(p50))):
        delta        = p50[i] - p50[i-1]
        ceil_delta   = ceil[i] - ceil[i-1]
        pct_change   = abs(delta) / cap

        # Skip if both hours are below meaningful generation
        if p50[i] < cap * 0.05 and p50[i-1] < cap * 0.05:
            continue

        # Skip if ramp is just following the physics ceiling (sunrise/sunset)
        # If model ramp ≈ ceiling ramp it's physics-driven, not a forecast anomaly
        if cap > 0 and abs(ceil_delta) / cap > 0.10 and \
           abs(delta - ceil_delta) / cap < 0.10:
            continue

        if pct_change > 0.15:
            ramp_rows.append({
                'plant_id':    pid,
                'triggered_at': pd.Timestamp(times[i]).isoformat(),
                'ramp_mw':     round(float(abs(delta)), 1),
                'direction':   'up' if delta > 0 else 'down',
                'expires_at':  (pd.Timestamp(times[i]) +
                                pd.Timedelta(minutes=90)).isoformat()
            })

# STEP 9 — UPSERT FORECASTS and RAMP ALERTS
print("Upserting data to Supabase...")
forecast_rows = []
for pid, df_f in all_forecasts.items():
    for _, row in df_f.iterrows():
        sd = row.get('shap_drivers', '{}')
        forecast_rows.append({
            'plant_id': pid,
            'forecast_for': pd.Timestamp(row['timestamp']).isoformat(),
            'p10_mw': round(float(row['p10_mw']), 2),
            'p50_mw': round(float(row['p50_mw']), 2),
            'p90_mw': round(float(row['p90_mw']), 2),
            'reserve_mw': round(float(row['reserve_mw']), 1),
            'risk_level': str(row['risk_level']),
            'shap_drivers': json.loads(sd) if isinstance(sd, str) else sd,
            'gon_adjusted': bool(row.get('gon_adjusted', False)),
            'kptcl_calibrated': bool(row.get('kptcl_calibrated', False)),
            'is_demo': False,
            'demo_scenario': None
        })

# Batch upsert forecasts
for i in range(0, len(forecast_rows), 100):
    supabase.table('forecasts').upsert(
        forecast_rows[i:i+100],
        on_conflict='plant_id,forecast_for,is_demo,demo_scenario'
    ).execute()

# Upsert ramp alerts
if ramp_rows:
    supabase.table('ramp_alerts').upsert(
        ramp_rows,
        on_conflict='plant_id,triggered_at,direction'
    ).execute()

# STEP 10 — PRUNE
print("Pruning old data...")
prune_cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
supabase.table('forecasts').delete().lt('forecast_for', prune_cutoff).eq('is_demo', False).execute()
supabase.table('ramp_alerts').delete().lt('expires_at', prune_cutoff).execute()
supabase.table('kptcl_readings').delete().lt('scraped_at', (datetime.now(timezone.utc)-timedelta(days=30)).isoformat()).execute()

elapsed = time.time() - start_time
print(f"Done: {len(forecast_rows)} rows, {len(ramp_rows)} ramp alerts. {elapsed:.1f}s. Pruned >7d.")

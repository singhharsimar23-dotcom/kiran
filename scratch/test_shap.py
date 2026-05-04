import os
import sys
import json
import pandas as pd
import numpy as np
import xgboost as xgb
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Load model and features
FEATURE_LIST = json.load(open('model/features.json'))
model_p50 = xgb.XGBRegressor()
model_p50.load_model('model/xgb_p50.json')

# Fetch one plant
plant = supabase.table('plants').select('*').limit(1).execute().data[0]
print(f"Testing for plant: {plant['name']}")

# Mock some features
X = pd.DataFrame(np.random.rand(1, len(FEATURE_LIST)), columns=FEATURE_LIST)

try:
    print("Computing SHAP...")
    _dmat = xgb.DMatrix(X)
    sv_all = model_p50.get_booster().predict(_dmat, pred_contribs=True)[:, :-1]
    print(f"SHAP computed: {sv_all}")
    
    top3 = dict(sorted(zip(FEATURE_LIST, sv_all[0]), key=lambda x: abs(x[1]), reverse=True)[:3])
    print(f"Top 3: {top3}")
except Exception as e:
    print(f"SHAP failed: {e}")

import os
import json
import pandas as pd
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def main():
    # STEP 1 — load data
    print("Step 1: Loading data from Supabase...")
    
    # Fetch all plants
    plants_resp = supabase.table("plants").select("id, name").execute()
    name_lookup = {p['id']: p['name'] for p in plants_resp.data}
    print(f"Loaded {len(name_lookup)} plants.")

    # Fetch all generation_readings with pagination
    all_readings = []
    offset = 0
    page_size = 1000  # Supabase default limit is usually 1000
    
    while True:
        print(f"Fetching rows {offset} to {offset + page_size - 1}...")
        resp = supabase.table("generation_readings") \
            .select("plant_id, timestamp, generation_mw") \
            .range(offset, offset + page_size - 1) \
            .execute()
        
        data = resp.data
        if not data:
            break
            
        all_readings.extend(data)
        if len(data) < page_size:
            break
            
        offset += page_size
            
    print(f"Loaded {len(all_readings)} generation readings.")
    df = pd.DataFrame(all_readings)
    
    # STEP 2 — pivot to wide format
    print("Step 2: Pivoting to wide format...")
    df['plant_name'] = df['plant_id'].map(name_lookup)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    
    df_wide = df.pivot_table(index='timestamp', columns='plant_name', values='generation_mw', aggfunc='mean')
    df_wide = df_wide.sort_index()
    df_wide = df_wide.ffill(limit=2)
    
    # STEP 3 — compute residuals (remove 24hr rolling mean)
    print("Step 3: Computing residuals...")
    for col in df_wide.columns:
        df_wide[col] = df_wide[col] - df_wide[col].rolling(24, min_periods=12).mean()
    
    df_wide = df_wide.dropna()
    print(f"Data shape after processing: {df_wide.shape}")

    # STEP 4 — cross-correlate all plant pairs
    print("Step 4: Computing cross-correlations with lags...")
    gon = {}
    plants = df_wide.columns
    
    for plant_A in plants:
        for plant_B in plants:
            if plant_A == plant_B:
                continue
                
            best_r = 0.0
            best_lag = 0
            
            for lag in range(-6, 7):  # -6 to +6 hours
                series_b_shifted = df_wide[plant_B].shift(lag)
                # Combine series and drop NaNs to ensure matching indices
                combined = pd.concat([df_wide[plant_A], series_b_shifted], axis=1).dropna()
                
                if len(combined) < 100:
                    continue
                
                r = combined.iloc[:, 0].corr(combined.iloc[:, 1])
                
                if not np.isnan(r) and abs(r) > abs(best_r):
                    best_r = r
                    best_lag = lag
            
            if abs(best_r) > 0.4:
                if plant_A not in gon:
                    gon[plant_A] = {}
                gon[plant_A][plant_B] = {
                    'lag_h': int(best_lag), 
                    'r': round(float(best_r), 3)
                }

    # STEP 5 — write to BOTH paths
    print("Step 5: Writing results to files...")
    output_paths = ['data/gon_priors.json', 'public/data/gon_priors.json']
    for path in output_paths:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            json.dump(gon, f, indent=2)

    total_edges = sum(len(v) for v in gon.values())
    print(f"GON: {total_edges} edges above r=0.4")
    
    # Sort and print top 5 edges
    all_edges = []
    for a, targets in gon.items():
        for b, stats in targets.items():
            all_edges.append((a, b, stats['lag_h'], stats['r']))
            
    all_edges.sort(key=lambda x: abs(x[3]), reverse=True)
    
    print("Top 5 edges:")
    for a, b, l, r in all_edges[:5]:
        print(f"  {a} -> {b}: lag={l}h r={r}")
        
    print(f"Written to {', '.join(output_paths)}")

if __name__ == "__main__":
    main()

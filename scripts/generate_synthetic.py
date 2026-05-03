import os
import numpy as np
import pandas as pd
import pvlib
from dotenv import load_dotenv
from supabase import create_client

# STEP 1 — load env and create client
load_dotenv()
supabase = create_client(
    os.environ['SUPABASE_URL'], 
    os.environ['SUPABASE_SERVICE_KEY']
)

def fetch_plants():
    print("Fetching plants...")
    resp = supabase.table('plants').select('id, name, lat, lon, capacity_mw, asset_type, hub_height_m').execute()
    return resp.data

def fetch_weather_readings():
    print("Fetching weather readings (paginated)...")
    all_data = []
    offset = 0
    page_size = 1000
    
    while True:
        resp = supabase.table('weather_readings') \
            .select('*') \
            .order('plant_id', desc=False) \
            .order('timestamp', desc=False) \
            .range(offset, offset + page_size - 1) \
            .execute()
        
        data = resp.data
        if not data:
            break
            
        all_data.extend(data)
        offset += page_size
        if len(data) < page_size:
            break
            
    print(f"Total weather records fetched: {len(all_data)}")
    return pd.DataFrame(all_data)

def generate_synthetic():
    plants = fetch_plants()
    plant_lookup = {p['id']: p for p in plants}
    
    weather_df = fetch_weather_readings()
    if weather_df.empty:
        print("No weather data found.")
        return

    # Add plant metadata to weather_df
    weather_df['name'] = weather_df['plant_id'].map(lambda x: plant_lookup[x]['name'])
    
    # Process per plant
    for plant_id, df_plant in weather_df.groupby('plant_id'):
        plant = plant_lookup[plant_id]
        capacity_mw = float(plant['capacity_mw'])
        asset_type = plant['asset_type']
        lat = float(plant['lat'])
        lon = float(plant['lon'])
        hub_height_m = plant.get('hub_height_m')
        
        print(f"Processing {plant['name']} ({asset_type})...")
        
        # Ensure sorted by timestamp
        df_plant = df_plant.sort_values('timestamp')
        timestamps = pd.to_datetime(df_plant['timestamp'])

        # 2a. Physics ceiling
        if asset_type == 'solar':
            location = pvlib.location.Location(lat, lon, tz='Asia/Kolkata')
            # Localize or convert to Asia/Kolkata
            if timestamps.dt.tz is None:
                times = pd.DatetimeIndex(timestamps).tz_localize('UTC').tz_convert('Asia/Kolkata')
            else:
                times = pd.DatetimeIndex(timestamps).tz_convert('Asia/Kolkata')
            
            clearsky = location.get_clearsky(times)
            ghi_clearsky = clearsky['ghi'].values
            ceiling = np.clip((ghi_clearsky / 1000.0) * capacity_mw, 0, None)
            ceiling[ghi_clearsky < 10] = 0.0
        else: # wind
            hub_h = hub_height_m if hub_height_m else 80.0
            v_10m = df_plant['wind_speed_10m'].values
            v_hub = v_10m * (hub_h / 10.0) ** 0.15
            
            ceiling = np.zeros(len(df_plant))
            mask_partial = (v_hub >= 3.5) & (v_hub < 12.0)
            mask_rated   = (v_hub >= 12.0) & (v_hub <= 25.0)
            
            ceiling[mask_partial] = capacity_mw * (v_hub[mask_partial] / 12.0) ** 3
            ceiling[mask_rated]   = capacity_mw

        # 2b. Soiling factor
        if asset_type == 'solar':
            hours_since_rain = 0
            soiling_list = []
            for precip in df_plant['precipitation_mm'].values:
                if precip >= 5.0:
                    hours_since_rain = 0
                soiling_list.append(max(0.80, 1.0 - (hours_since_rain / 24.0) * 0.0008))
                hours_since_rain += 1
            soiling = np.array(soiling_list)
        else: # wind
            soiling = np.ones(len(df_plant))

        # 2c. Base attenuation
        if asset_type == 'solar':
            cloud = df_plant['cloud_cover_pct'].values.copy().astype(float)
            month = timestamps.dt.month.values
            monsoon_mask = np.isin(month, [6, 7, 8, 9])
            cloud[monsoon_mask] = np.minimum(cloud[monsoon_mask] * 1.2, 100.0)
            
            temp = df_plant['temperature_c'].values.astype(float)
            att = (1 - 0.75 * (cloud / 100.0) ** 3.4) * (1 - 0.004 * (temp - 25.0)) * soiling
        else: # wind
            att = np.ones(len(df_plant))

        # 2d. Operational noise
        np.random.seed(42 + hash(plant['name']) % 1000)
        noise = np.random.normal(1.0, 0.03, size=len(df_plant))
        att = att * noise

        # Curtailment
        is_curtailed = np.zeros(len(df_plant), dtype=bool)
        
        # Solar daytime curtailment
        if asset_type == 'solar':
            daytime_indices = np.where(ceiling > 0.1 * capacity_mw)[0]
            if len(daytime_indices) > 0:
                num_curtail = int(len(daytime_indices) * 0.05)
                curtailed_idx = np.random.choice(daytime_indices, size=num_curtail, replace=False)
                is_curtailed[curtailed_idx] = True
        
        # Equipment trips (0.3% of ALL indices)
        all_indices = np.arange(len(df_plant))
        num_trips = int(len(all_indices) * 0.003)
        trip_idx = np.random.choice(all_indices, size=num_trips, replace=False)
        is_curtailed[trip_idx] = True

        # 2e. Final generation
        generation_mw = np.clip(ceiling * att, 0, None)
        generation_mw[is_curtailed] = 0.0

        # 2f. Build records list
        records = []
        for i in range(len(df_plant)):
            row = df_plant.iloc[i]
            records.append({
                'plant_id': plant_id,
                'timestamp': row['timestamp'],
                'generation_mw': round(float(generation_mw[i]), 3),
                'physics_ceiling_mw': round(float(ceiling[i]), 3),
                'soiling_factor': round(float(soiling[i]), 4),
                'is_curtailed': bool(is_curtailed[i]),
                'is_synthetic': True
            })

        # STEP 3 — upsert in chunks of 500
        for i in range(0, len(records), 500):
            chunk = records[i : i + 500]
            supabase.table('generation_readings').upsert(chunk, on_conflict='plant_id,timestamp').execute()
        
        print(f"{plant['name']}: {len(records)} rows written")

if __name__ == "__main__":
    generate_synthetic()

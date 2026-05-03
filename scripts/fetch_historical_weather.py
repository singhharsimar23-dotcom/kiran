import os
import time
import requests
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()
supabase = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

def fetch_weather_for_plant(plant):
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        'latitude': plant['lat'],
        'longitude': plant['lon'],
        'start_date': '2022-01-01',
        'end_date': '2023-12-31',
        'hourly': 'shortwave_radiation,cloud_cover,wind_speed_10m,wind_direction_10m,temperature_2m,precipitation',
        'timezone': 'Asia/Kolkata'
    }
    
    for attempt in range(3):
        try:
            resp = requests.get(url, params=params, timeout=60)
            if resp.status_code == 200:
                return resp.json()
            else:
                print(f"Error fetching data for {plant['name']}: HTTP {resp.status_code}. Attempt {attempt + 1}/3")
        except Exception as e:
            print(f"Exception fetching data for {plant['name']}: {str(e)}. Attempt {attempt + 1}/3")
        
        if attempt < 2:
            time.sleep(5)
    
    print(f"Failed to fetch data for {plant['name']} after 3 attempts.")
    return None

def process_and_upload():
    # STEP 1 — load all plants
    try:
        plants = supabase.table('plants').select('id,name,lat,lon').execute().data
    except Exception as e:
        print(f"Error fetching plants: {e}")
        return

    print(f"Found {len(plants)} plants.")

    for plant in plants:
        print(f"Fetching weather for {plant['name']}...")
        # STEP 2 — fetch from Open-Meteo archive API
        data = fetch_weather_for_plant(plant)
        if not data or 'hourly' not in data:
            continue
            
        # STEP 3 — parse response JSON
        hourly = data['hourly']
        df = pd.DataFrame({
            'timestamp': hourly['time'],
            'ghi_wm2': hourly['shortwave_radiation'],
            'cloud_cover_pct': hourly['cloud_cover'],
            'wind_speed_10m': hourly['wind_speed_10m'],
            'wind_direction_deg': hourly['wind_direction_10m'],
            'temperature_c': hourly['temperature_2m'],
            'precipitation_mm': hourly['precipitation']
        })
        
        # STEP 4 — validate and clean (BEFORE inserting)
        df['ghi_wm2'] = df['ghi_wm2'].clip(0, 1400)
        df['cloud_cover_pct'] = df['cloud_cover_pct'].clip(0, 100)
        df['wind_speed_10m'] = df['wind_speed_10m'].clip(0, 80)
        df['wind_direction_deg'] = df['wind_direction_deg'].clip(0, 360)
        df['temperature_c'] = df['temperature_c'].clip(-10, 60)
        df['precipitation_mm'] = df['precipitation_mm'].clip(0, 500)
        
        df.ffill(limit=2, inplace=True)
        df.dropna(inplace=True)
        
        records = df.to_dict('records')
        
        # STEP 5 — upsert to Supabase in chunks of 500
        total_written = 0
        chunk_size = 500
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i + chunk_size]
            for record in chunk:
                record['plant_id'] = plant['id']
                record['source'] = 'open-meteo'
            
            try:
                # Upsert on plant_id and timestamp
                supabase.table('weather_readings').upsert(chunk, on_conflict='plant_id,timestamp').execute()
                total_written += len(chunk)
            except Exception as e:
                print(f"Error writing chunk for {plant['name']}: {str(e)}")
                break
        
        print(f"{plant['name']}: {total_written} rows written")

if __name__ == "__main__":
    process_and_upload()

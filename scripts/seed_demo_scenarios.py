import os
import json
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def seed_demo():
    # STEP 1: Load plants
    response = supabase.table("plants").select("id, name, capacity_mw, asset_type").execute()
    plants = {p['name']: p for p in response.data}
    
    now_utc = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    forecast_hours = [now_utc + timedelta(hours=h) for h in range(1, 25)]
    
    forecast_rows = []
    ramp_alerts = []
    
    scenarios = ['A', 'B', 'C']
    
    for scenario in scenarios:
        for hour in forecast_hours:
            for name, plant in plants.items():
                cap = plant['capacity_mw']
                asset_type = plant['asset_type']
                plant_id = plant['id']
                
                # Base values initialization
                p50, p10, p90, reserve, risk, gon_adjusted = 0, 0, 0, 0, 'LOW', False
                shap = {}
                
                if scenario == 'A':
                    risk = 'LOW'
                    gon_adjusted = False
                    if asset_type == 'solar':
                        p50 = cap * 0.90
                        p10 = cap * 0.86
                        p90 = cap * 0.94
                        reserve = round(cap * 0.04 / 10) * 10
                        shap = {"physics_ceiling_mw": 150.0, "cloud_cover_norm": -45.0, "soiling_factor": -12.0}
                    else: # wind
                        shap = {"wind_speed_hub": 320.0, "physics_ceiling_mw": 180.0, "is_monsoon": -10.0}
                        if name == 'Gadag':
                            p50, p10, p90, reserve = 480, 380, 580, 110
                        elif name == 'Koppal':
                            p50, p10, p90, reserve = 240, 190, 290, 60
                        elif name == 'Dakshina K':
                            p50, p10, p90, reserve = 160, 125, 195, 40
                        elif name == 'Uttara K':
                            p50, p10, p90, reserve = 105, 82, 128, 30
                
                elif scenario == 'B':
                    risk = 'MEDIUM'
                    if asset_type == 'solar':
                        p50 = cap * 0.72
                        p10 = cap * 0.58
                        p90 = cap * 0.86
                        reserve = round(cap * 0.14 / 10) * 10
                        shap = {"cloud_cover_norm": -180.0, "physics_ceiling_mw": 90.0, "gen_lag_1h": -60.0}
                        if name == 'Chitradurga':
                            p50 = 360 # boosted 15% (0.72 * 500 = 360)
                            gon_adjusted = True
                    else: # wind
                        if name in ['Gadag', 'Koppal']:
                            gon_adjusted = True
                            shap = {"wind_speed_hub": 380.0, "physics_ceiling_mw": 200.0, "cloud_cover_norm": 30.0}
                            if name == 'Gadag':
                                p50, p10, p90, reserve = 576, 450, 700, 140
                            elif name == 'Koppal':
                                p50, p10, p90, reserve = 288, 228, 350, 70
                        else: # coastal
                            # coastal: same as Scenario A
                            shap = {"wind_speed_hub": 320.0, "physics_ceiling_mw": 180.0, "is_monsoon": -10.0}
                            if name == 'Dakshina K':
                                p50, p10, p90, reserve = 160, 125, 195, 40
                            elif name == 'Uttara K':
                                p50, p10, p90, reserve = 105, 82, 128, 30
                    
                    # Ramp alert for B (Chitradurga)
                    if hour == forecast_hours[0] and name == 'Chitradurga':
                        ramp_alerts.append({
                            "plant_id": plant_id,
                            "triggered_at": hour.isoformat(),
                            "direction": "up",
                            "ramp_mw": 108,
                            "expires_at": (hour + timedelta(hours=2)).isoformat()
                        })

                elif scenario == 'C':
                    risk = 'HIGH'
                    if asset_type == 'solar':
                        p50 = cap * 0.28
                        p10 = cap * 0.18
                        p90 = cap * 0.38
                        reserve = round(cap * 0.10 / 10) * 10
                        shap = {"cloud_cover_norm": -620.0, "is_monsoon": -280.0, "physics_ceiling_mw": 50.0}
                    else: # wind
                        risk = 'MEDIUM' # wind less affected
                        shap = {"wind_speed_hub": 250.0, "physics_ceiling_mw": 160.0, "is_monsoon": -40.0}
                        if name == 'Gadag':
                            p50, p10, p90, reserve = 380, 290, 470, 100
                        elif name == 'Koppal':
                            p50, p10, p90, reserve = 190, 145, 235, 50
                        elif name == 'Dakshina K':
                            p50, p10, p90, reserve = 210, 165, 255, 40 # slightly elevated
                        elif name == 'Uttara K':
                            p50, p10, p90, reserve = 140, 110, 170, 30
                    
                    # Ramp alerts for C (Bellary down 190, Raichur down 110)
                    if hour == forecast_hours[0]:
                        if name == 'Bellary':
                            ramp_alerts.append({
                                "plant_id": plant_id,
                                "triggered_at": hour.isoformat(),
                                "direction": "down",
                                "ramp_mw": 190,
                                "expires_at": (hour + timedelta(hours=2)).isoformat()
                            })
                        elif name == 'Raichur':
                            ramp_alerts.append({
                                "plant_id": plant_id,
                                "triggered_at": hour.isoformat(),
                                "direction": "down",
                                "ramp_mw": 110,
                                "expires_at": (hour + timedelta(hours=2)).isoformat()
                            })

                forecast_rows.append({
                    "plant_id": plant_id,
                    "forecast_for": hour.isoformat(),
                    "p10_mw": p10,
                    "p50_mw": p50,
                    "p90_mw": p90,
                    "reserve_mw": reserve,
                    "risk_level": risk,
                    "shap_drivers": shap,
                    "gon_adjusted": gon_adjusted,
                    "is_demo": True,
                    "demo_scenario": scenario
                })

    # Upsert forecasts
    for i in range(0, len(forecast_rows), 100):
        chunk = forecast_rows[i:i+100]
        supabase.table("forecasts").upsert(
            chunk, 
            on_conflict="plant_id,forecast_for,is_demo"
        ).execute()

    # Upsert ramp alerts
    if ramp_alerts:
        supabase.table("ramp_alerts").upsert(
            ramp_alerts,
            on_conflict="plant_id,triggered_at,direction"
        ).execute()

    print(f"Seeded {len(forecast_rows)} demo forecast rows. {len(ramp_alerts)} ramp alerts.")

if __name__ == "__main__":
    seed_demo()

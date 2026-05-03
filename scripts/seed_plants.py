import os
from dotenv import load_dotenv
from supabase import create_client

# STEP 1 — load env and create client
load_dotenv()
supabase = create_client(
    os.environ['SUPABASE_URL'], 
    os.environ['SUPABASE_SERVICE_KEY']
)

def seed_data():
    # STEP 2 — insert 4 clusters using upsert on_conflict='name'
    clusters = [
        {"name": "Northern Solar", "region": "north Karnataka plateau"},
        {"name": "Northern Wind", "region": "north Karnataka plateau (wind corridor)"},
        {"name": "Southern Solar", "region": "south Karnataka plateau"},
        {"name": "Coastal Wind", "region": "Karnataka coast"}
    ]
    
    supabase.table('clusters').upsert(clusters, on_conflict='name').execute()

    # STEP 3 — query cluster IDs by name into a dict {name: uuid}
    clusters_resp = supabase.table('clusters').select('id, name').execute()
    cluster_map = {row['name']: row['id'] for row in clusters_resp.data}

    # STEP 4 — insert exactly these 10 plants using upsert on_conflict='name'
    plants_data = [
        ("Pavagada", 14.10, 77.27, 2050.0, "solar", "plateau", None, "Northern Solar"),
        ("Chitradurga", 14.23, 76.39, 500.0, "solar", "plateau", None, "Northern Solar"),
        ("Bellary", 15.14, 76.92, 700.0, "solar", "plateau", None, "Northern Solar"),
        ("Raichur", 16.20, 77.35, 400.0, "solar", "plateau", None, "Northern Solar"),
        ("Gadag", 15.42, 75.62, 1000.0, "wind", "plateau", 80.0, "Northern Wind"),
        ("Koppal", 15.35, 76.15, 500.0, "wind", "plateau", 80.0, "Northern Wind"),
        ("Tumkur", 13.34, 77.10, 300.0, "solar", "interior", None, "Southern Solar"),
        ("Bidar", 17.91, 77.52, 200.0, "solar", "interior", None, "Southern Solar"),
        ("Dakshina K", 12.86, 74.99, 300.0, "wind", "coastal", 90.0, "Coastal Wind"),
        ("Uttara K", 14.80, 74.13, 200.0, "wind", "coastal", 90.0, "Coastal Wind")
    ]

    plants_to_upsert = []
    for name, lat, lon, cap, asset_type, terrain, hub, cluster_name in plants_data:
        plant_dict = {
            "name": name,
            "lat": lat,
            "lon": lon,
            "capacity_mw": cap,
            "asset_type": asset_type,
            "terrain_type": terrain,
            "hub_height_m": hub,
            "wind_speed_correction": 1.0,
            "cloud_correction": 1.0,
            "cluster_id": cluster_map[cluster_name]
        }
        plants_to_upsert.append(plant_dict)

    supabase.table('plants').upsert(plants_to_upsert, on_conflict='name').execute()

    # STEP 5 — print confirmation
    for plant in plants_to_upsert:
        cluster_name = next(name for name, id in cluster_map.items() if id == plant['cluster_id'])
        print(f"Seeded: {plant['name']} | {plant['asset_type']} | {plant['capacity_mw']} MW | cluster: {cluster_name}")

    print(f"Done: {len(plants_to_upsert)} plants, {len(clusters)} clusters")

if __name__ == "__main__":
    seed_data()

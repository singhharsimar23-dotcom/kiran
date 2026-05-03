export interface Cluster {
  id: string;
  name: string;
  region: string | null;
}

export interface Plant {
  id: string;
  name: string;
  lat: number;
  lon: number;
  capacity_mw: number;
  asset_type: 'solar' | 'wind';
  terrain_type: string;
  hub_height_m: number | null;
  cluster_id: string | null;
  cluster_name: string | null; // CRITICAL — populated from Supabase join clusters(name)
}

export interface Forecast {
  id: string;
  plant_id: string;
  forecast_for: string;
  created_at: string;
  p10_mw: number | null;
  p50_mw: number | null;
  p90_mw: number | null;
  reserve_mw: number | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  shap_drivers: Record<string, number> | null;
  gon_adjusted: boolean;
  is_demo: boolean;
  demo_scenario: string | null;
}

export interface RampAlert {
  id: string;
  plant_id: string;
  triggered_at: string;
  ramp_mw: number;
  direction: 'up' | 'down';
  expires_at: string;
}

export interface ModelHealth {
  id: string;
  checked_at: string;
  mae_p50: number | null;
  persistence_mae: number | null;
  coverage_pct: number | null;
  needs_retraining: boolean;
  per_plant_metrics: Record<string, { mae: number; skill: number }> | null;
}

export interface ClusterSummary {
  cluster_name: string;
  total_p50: number;
  uncertainty: number;
  plant_count: number;
}

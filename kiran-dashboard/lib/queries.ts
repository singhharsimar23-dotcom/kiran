import { supabase } from './supabase'
import type { Plant, Forecast, RampAlert, ModelHealth, ClusterSummary } from './types'

export async function getAllPlants(): Promise<Plant[]> {
  const { data, error } = await supabase.from('plants').select('*, clusters(name)').order('name')
  if (error) {
    console.error('getAllPlants:', error)
    return []
  }
  return (data || []).map((p) => ({
    ...p,
    cluster_name: p.clusters?.name ?? null,
  }))
}

export async function getForecasts(
  plantId: string,
  isDemo: boolean,
  scenario?: string
): Promise<Forecast[]> {
  let q = supabase
    .from('forecasts')
    .select('*')
    .eq('plant_id', plantId)
    .eq('is_demo', isDemo)
    .order('forecast_for', { ascending: true })
    .limit(30)

  if (isDemo && scenario) {
    q = q.eq('demo_scenario', scenario)
  }

  const { data, error } = await q
  if (error) {
    console.error('getForecasts:', error)
    return []
  }
  return data || []
}

export async function getLatestForecast(plantId: string): Promise<Forecast | null> {
  // Return the max p50 row in the next 24 hours — peak operational forecast
  const now = new Date().toISOString()
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('forecasts')
    .select('*')
    .eq('plant_id', plantId)
    .eq('is_demo', false)
    .gte('forecast_for', now)
    .lte('forecast_for', tomorrow)
    .order('p50_mw', { ascending: false })
    .limit(1)

  if (error) {
    console.error('getLatestForecast:', error)
    return null
  }
  return data?.[0] ?? null
}

export async function getLatestForecastsAll(
  isDemo: boolean,
  scenario?: string
): Promise<Record<string, Forecast>> {
  // Returns the peak p50 forecast for each plant in the next 24 hours
  const now = new Date().toISOString()
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  let q = supabase
    .from('forecasts')
    .select('*')
    .eq('is_demo', isDemo)
    .gte('forecast_for', now)
    .lte('forecast_for', tomorrow)

  if (isDemo && scenario) {
    q = q.eq('demo_scenario', scenario)
  }

  const { data, error } = await q
  if (error) {
    console.error('getLatestForecastsAll:', error)
    return {}
  }

  // Group by plant_id and pick the one with max p50_mw
  const latest: Record<string, Forecast> = {}
  for (const f of data || []) {
    if (!latest[f.plant_id] || (f.p50_mw || 0) > (latest[f.plant_id].p50_mw || 0)) {
      latest[f.plant_id] = f
    }
  }
  return latest
}

export async function getClusterForecasts(
  isDemo: boolean,
  scenario?: string
): Promise<ClusterSummary[]> {
  const plants = await getAllPlants()
  const forecasts = await getLatestForecastsAll(isDemo, scenario)
  const byCluster: Record<
    string,
    { p50s: number[]; uncertainties: number[]; count: number }
  > = {}

  for (const p of plants) {
    const f = forecasts[p.id]
    const cn = p.cluster_name ?? 'Unknown'
    if (!byCluster[cn]) {
      byCluster[cn] = { p50s: [], uncertainties: [], count: 0 }
    }
    byCluster[cn].count++
    if (f?.p50_mw != null) {
      byCluster[cn].p50s.push(f.p50_mw)
    }
    if (f?.p90_mw != null && f?.p10_mw != null) {
      byCluster[cn].uncertainties.push(((f.p90_mw - f.p10_mw) / 3.92) ** 2)
    }
  }

  return Object.entries(byCluster).map(([cluster_name, d]) => ({
    cluster_name,
    total_p50: Math.round(d.p50s.reduce((a, b) => a + b, 0)),
    uncertainty: Math.round(Math.sqrt(d.uncertainties.reduce((a, b) => a + b, 0))),
    plant_count: d.count,
  }))
}

export async function getActiveRampAlerts(): Promise<RampAlert[]> {
  const { data, error } = await supabase
    .from('ramp_alerts')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('triggered_at', { ascending: false })

  if (error) {
    console.error('getActiveRampAlerts:', error)
    return []
  }
  return data || []
}

export async function getModelHealth(): Promise<ModelHealth | null> {
  const { data, error } = await supabase
    .from('model_health')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('getModelHealth:', error)
    return null
  }
  return data?.[0] ?? null
}

export async function getKptclStatus() {
  const { data } = await supabase
    .from('kptcl_readings')
    .select('scraped_at, solar_mw, wind_mw, pavagada_mw, '
          + 'calibration_factor_solar, calibration_factor_wind, '
          + 'applied, scrape_success')
    .order('scraped_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

export async function getKptclHistory() {
  const cutoff = new Date(Date.now() - 6*60*60*1000).toISOString()
  const { data } = await supabase
    .from('kptcl_readings')
    .select('scraped_at, solar_mw, wind_mw, calibration_factor_solar, applied, scrape_success')
    .gte('scraped_at', cutoff)
    .order('scraped_at', { ascending: true })
  return data ?? []
}

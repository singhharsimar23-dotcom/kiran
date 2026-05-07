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
  // Demo mode
  if (isDemo) {
    const { data } = await supabase
      .from('forecasts')
      .select('*')
      .eq('plant_id', plantId)
      .eq('is_demo', true)
      .eq('demo_scenario', scenario ?? 'A')
      .order('forecast_for', { ascending: true })
      .limit(24)
    return data ?? []
  }

  // Live mode: get the 25 most recent forecast rows for this plant
  // ordered by forecast_for ascending — simple, never returns 0 rows
  // if any data exists at all for this plant
  const { data } = await supabase
    .from('forecasts')
    .select('*')
    .eq('plant_id', plantId)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })
    .limit(25)

  if (!data || data.length === 0) return []

  // Sort by forecast_for ascending for chart rendering
  return [...data].sort(
    (a, b) => new Date(a.forecast_for).getTime() - new Date(b.forecast_for).getTime()
  )
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
): Promise<Forecast[]> {
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
    return []
  }

  return data || []
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
    const plantRows = forecasts.filter(f => f.plant_id === p.id)
    // Use the peak p50 row for cluster summary contributions
    const f = plantRows.reduce((best, row) => (row.p50_mw || 0) > (best?.p50_mw || 0) ? row : best, plantRows[0] as Forecast | undefined)

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
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('kptcl_readings')
    .select('scraped_at, solar_mw, wind_mw, calibration_factor_solar, applied, scrape_success')
    .gte('scraped_at', cutoff)
    .order('scraped_at', { ascending: true })
  return data ?? []
}

export interface BacktestDay {
  date: string        // 'YYYY-MM-DD'
  actual: number      // fleet MWh that day (synthetic actuals)
  model: number       // physics prediction (no noise) MWh
  persistence: number // previous day actual (naive baseline)
}

export async function getBacktestData(): Promise<BacktestDay[]> {
  const { data, error } = await supabase
    .from('generation_readings')
    .select('timestamp, generation_mw, plant_id, plants(asset_type, capacity_mw)')
    .eq('is_synthetic', true)
    .gte('timestamp', new Date(Date.now() - 32 * 86400000).toISOString())
    .order('timestamp', { ascending: true })

  if (error || !data) return []

  // Group by IST date → sum generation_mw
  const byDate: Record<string, { actual: number; modelSum: number }> = {}

  for (const row of data) {
    const d = new Date(row.timestamp)
    // Convert to IST date string
    const istDate = new Date(d.getTime() + 5.5 * 3600000)
    const dateKey = istDate.toISOString().slice(0, 10)
    const hr = istDate.getUTCHours()
    const plant = row.plants as any
    const cap = plant?.capacity_mw ?? 0
    const isWind = plant?.asset_type === 'wind'

    // Physics model prediction (deterministic, no noise) — same formula as SQL
    const doy = Math.floor((istDate.getTime() - new Date(istDate.getUTCFullYear(), 0, 0).getTime()) / 86400000)
    let modelMw = 0
    if (isWind) {
      modelMw = (0.38 + 0.10 * Math.abs(Math.sin(doy * 0.4)))
        * (0.82 + 0.28 * Math.sin(Math.PI * hr / 17))
        * (doy >= 152 && doy <= 273 ? 1.18 : 1.0)
        * cap
    } else {
      const solarFrac = Math.max(0, Math.sin(Math.PI * (hr - 5.5) / 13))
      modelMw = solarFrac * (0.70 + 0.22 * Math.sin(2 * Math.PI * (doy - 80) / 365)) * cap
    }

    if (!byDate[dateKey]) byDate[dateKey] = { actual: 0, modelSum: 0 }
    byDate[dateKey].actual  += row.generation_mw ?? 0
    byDate[dateKey].modelSum += Math.max(0, modelMw)
  }

  const days = Object.keys(byDate).sort()
  return days.map((date, i) => ({
    date,
    actual:      Math.round(byDate[date].actual),
    model:       Math.round(byDate[date].modelSum),
    persistence: i > 0 ? Math.round(byDate[days[i - 1]].actual) : Math.round(byDate[date].actual),
  }))
}

import { getAllPlants, getLatestForecastsAll, getActiveRampAlerts } from '@/lib/queries'
import ReserveDashboard from '@/components/ReserveDashboard'
import KptclSignalBadge from '@/components/KptclSignalBadge'

export const revalidate = 900

export default async function ReservePage({
  searchParams,
}: {
  searchParams: { demo?: string; scenario?: string }
}) {
  const isDemo = searchParams.demo === 'true'
  const scenario = searchParams.scenario

  const [plants, forecasts, rampAlerts] = await Promise.all([
    getAllPlants(),
    getLatestForecastsAll(isDemo, scenario),
    getActiveRampAlerts(),
  ])

  // Find heroPlantId: plant_id with highest reserve_mw across all forecast rows
  let heroPlantId = plants[0]?.id ?? ''
  let maxReserve = -1

  forecasts.forEach((f) => {
    if (f.reserve_mw !== null && f.reserve_mw > maxReserve) {
      maxReserve = f.reserve_mw
      heroPlantId = f.plant_id
    }
  })

  return (
    <div className="p-7 animate-fadein">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border border-kgreen/30 text-kgreen">Criterion 03 — Uncertainty &amp; Explainability</span>
            <span className="font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border border-kcyan/30 text-kcyan">Criterion 05 — Edge Cases</span>
          </div>
          <p className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-1">
            Operational Output · MW Requirement · Timing · Ramp Alerts
          </p>
          <h1 className="text-[26px] font-black text-ktp tracking-tight">Reserve Procurement</h1>
          <p className="font-mono text-[10.5px] text-kts mt-2 max-w-[560px] leading-relaxed">
            Uncertainty band (P90−P10) converted to <strong className="text-ktp">actionable MW reserve</strong> with exact timing. SHAP drivers explain <em>why</em> each reserve is needed. KPTCL live reading calibrates the forecast in real-time.
          </p>
        </div>
        <KptclSignalBadge />
      </div>
      <ReserveDashboard
        plants={plants}
        forecasts={forecasts}
        heroPlantId={heroPlantId}
        rampAlerts={rampAlerts}
      />
    </div>
  )
}

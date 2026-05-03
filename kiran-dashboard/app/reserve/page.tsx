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

  // Find heroPlantId: plant_id with highest reserve_mw in latestForecasts
  let heroPlantId = plants[0]?.id ?? ''
  let maxReserve = -1

  Object.entries(forecasts).forEach(([plantId, forecast]) => {
    if (forecast.reserve_mw !== null && forecast.reserve_mw > maxReserve) {
      maxReserve = forecast.reserve_mw
      heroPlantId = plantId
    }
  })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reserve Management</h1>
          <KptclSignalBadge />
        </div>
        <ReserveDashboard
          plants={plants}
          forecasts={forecasts}
          heroPlantId={heroPlantId}
          rampAlerts={rampAlerts}
        />
      </div>
    </div>
  )
}

import { getAllPlants, getForecasts } from '@/lib/queries'
import ForecastChart from '@/components/ForecastChart'

export const revalidate = 900 // Revalidate every 15 minutes

interface PageProps {
  searchParams: {
    plantId?: string
    demo?: string
    scenario?: string
  }
}

export default async function ForecastPage({ searchParams }: PageProps) {
  // Fetch all plants for the selector
  const plants = await getAllPlants()
  
  // Determine selected plant ID
  const plantId = searchParams.plantId ?? plants[0]?.id ?? ''
  
  // Parse demo and scenario
  const isDemo = searchParams.demo === 'true'
  const scenario = searchParams.scenario
  
  // Fetch forecasts for the selected plant
  const forecasts = await getForecasts(plantId, isDemo, scenario)
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">KIRAN Energy Forecasting</h1>
        
        <div className="grid grid-cols-1 gap-8">
          <ForecastChart 
            plants={plants} 
            forecasts={forecasts} 
            selectedPlantId={plantId} 
            isDemo={isDemo} 
          />
        </div>
      </div>
    </div>
  )
}

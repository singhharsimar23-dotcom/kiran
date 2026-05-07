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
    <div className="p-7 animate-fadein">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border border-kcyan/30 text-kcyan">Criterion 01 — Problem Understanding</span>
          <span className="font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border border-kamber/30 text-kamber">Criterion 02 — Technical Soundness</span>
        </div>
        <p className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-1">
          Quantile Bands P10 · P50 · P90 · 24H Horizon · SHAP Attribution
        </p>
        <h1 className="text-[26px] font-black text-ktp tracking-tight">Generation Forecast</h1>
        <p className="font-mono text-[10.5px] text-kts mt-2 max-w-[620px] leading-relaxed">
          Each forecast uses <strong className="text-ktp">7 weather variables per plant</strong> from Open-Meteo NWP — shortwave radiation, cloud cover, wind speed at hub height, temperature, precipitation — converted via pvlib physics ceiling into P10/P50/P90 MW bands. SHAP values identify which driver caused each change.
        </p>
      </div>
      <ForecastChart
        plants={plants}
        forecasts={forecasts}
        selectedPlantId={plantId}
        isDemo={isDemo}
      />
    </div>
  )
}

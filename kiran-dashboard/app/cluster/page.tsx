import { getClusterForecasts } from '@/lib/queries'

export const revalidate = 900

interface PageProps {
  searchParams: {
    isDemo?: string
    scenario?: string
  }
}

const CLUSTER_COLORS: Record<string, string> = {
  'Northern Solar': '#1D4ED8',
  'Northern Wind': '#10B981',
  'Southern Solar': '#7C3AED',
  'Coastal Wind': '#D97706',
}

export default async function ClusterPage({ searchParams }: PageProps) {
  const isDemo = searchParams.isDemo === 'true'
  const scenario = searchParams.scenario
  
  const clusters = await getClusterForecasts(isDemo, scenario)
  
  // Sort clusters by total_p50 descending for the chart
  const sortedClusters = [...clusters].sort((a, b) => b.total_p50 - a.total_p50)
  
  const totalMW = clusters.reduce((acc, curr) => acc + curr.total_p50, 0)
  const maxMW = Math.max(...clusters.map(c => c.total_p50), 1)

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cluster Forecasts</h1>
          <p className="text-slate-500 mt-1">Regional aggregation across Karnataka fleet</p>
        </div>
        {isDemo && scenario && (
          <div className="px-3 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-full">
            Demo Scenario: {scenario}
          </div>
        )}
      </div>

      {/* 2x2 Grid of Cluster Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {clusters.map((cluster) => (
          <div 
            key={cluster.cluster_name}
            className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-slate-700">{cluster.cluster_name}</h2>
              <span className="text-sm text-slate-400 font-medium">{cluster.plant_count} plants</span>
            </div>
            <div className="mt-4">
              <div className="text-4xl font-bold text-slate-900">
                {cluster.total_p50.toFixed(0)} <span className="text-xl font-medium text-slate-500">MW</span>
              </div>
              <p className="mt-1 text-sm text-slate-500 font-medium">
                ± {cluster.uncertainty.toFixed(0)} MW uncertainty
              </p>
            </div>
            <div 
              className="mt-4 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden"
            >
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${(cluster.total_p50 / maxMW) * 100}%`,
                  backgroundColor: CLUSTER_COLORS[cluster.cluster_name] || '#64748b'
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Contribution Chart */}
      <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">Cluster Contribution</h3>
        <div className="space-y-5">
          {sortedClusters.map((cluster) => (
            <div key={cluster.cluster_name} className="space-y-1.5">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-700">{cluster.cluster_name}</span>
                <span className="text-slate-900">{cluster.total_p50.toFixed(0)} MW</span>
              </div>
              <div className="relative h-8 w-full bg-slate-50 rounded-md overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
                  style={{ 
                    width: `${(cluster.total_p50 / maxMW) * 100}%`,
                    backgroundColor: CLUSTER_COLORS[cluster.cluster_name] || '#64748b'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Total Row */}
      <div className="p-8 bg-slate-900 rounded-2xl shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider">Aggregate Capacity</h2>
          <div className="text-3xl font-bold text-white mt-1">
            Total Karnataka Forecast: {totalMW.toFixed(0)} MW
          </div>
        </div>
        <div className="h-px md:h-12 w-full md:w-px bg-slate-700" />
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-slate-300 font-medium">System status: Normal</span>
        </div>
      </div>
    </div>
  )
}

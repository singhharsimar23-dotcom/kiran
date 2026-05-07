import { getClusterForecasts } from '@/lib/queries'

export const revalidate = 900

interface PageProps {
  searchParams: {
    demo?: string
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
  const isDemo = searchParams.demo === 'true'
  const scenario = searchParams.scenario
  
  const clusters = await getClusterForecasts(isDemo, scenario)
  
  // Sort clusters by total_p50 descending for the chart
  const sortedClusters = [...clusters].sort((a, b) => b.total_p50 - a.total_p50)
  
  const totalMW = clusters.reduce((acc, curr) => acc + curr.total_p50, 0)
  const maxMW = Math.max(...clusters.map(c => c.total_p50), 1)

  return (
    <div className="p-7 animate-fadein space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border border-kamber/30 text-kamber">Criterion 06 — Architecture & Risk</span>
          </div>
          <p className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-1">Aggregated Output · 4 Zones · Flexible Regional Aggregation</p>
          <h1 className="text-[26px] font-black text-ktp tracking-tight">Regional Clusters</h1>
          <p className="font-mono text-[10.5px] text-kts mt-2 max-w-[560px] leading-relaxed">
            Plant-level forecasts aggregated across <strong className="text-ktp">4 geographic zones</strong>. Uncertainty bands propagate through aggregation using quadrature (σ² sum). Flexible — add or remove plants without retraining.
          </p>
        </div>
        {isDemo && scenario && (
          <div className="px-3 py-1 bg-kamber/10 border border-kamber/20 text-kamber font-mono text-[10px] rounded-full">
            Demo Scenario: {scenario}
          </div>
        )}
      </div>

      {/* 2x2 Grid of Cluster Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {clusters.map((cluster) => (
          <div
            key={cluster.cluster_name}
            className="relative p-5 bg-ks1 rounded-[10px] border border-kborder overflow-hidden hover:border-kcyan/20 transition-colors"
          >
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: CLUSTER_COLORS[cluster.cluster_name] || '#64748b' }} />
            <div className="flex items-start justify-between mt-1">
              <h2 className="text-[13px] font-bold" style={{ color: CLUSTER_COLORS[cluster.cluster_name] || '#6B9EC4' }}>{cluster.cluster_name}</h2>
              <span className="font-mono text-[9px] text-ktm">{cluster.plant_count} plants</span>
            </div>
            <div className="mt-3">
              <div className="font-mono text-[32px] font-semibold text-ktp tracking-tight leading-none">
                {cluster.total_p50.toFixed(0)}
                <span className="text-[16px] font-normal text-kts ml-1">MW</span>
              </div>
              <p className="mt-1 font-mono text-[9.5px] text-ktm">
                ± {cluster.uncertainty.toFixed(0)} MW uncertainty
              </p>
            </div>
            <div className="mt-3 h-1 w-full rounded-full bg-kborder overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(cluster.total_p50 / maxMW) * 100}%`,
                  background: CLUSTER_COLORS[cluster.cluster_name] || '#64748b'
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Contribution Chart */}
      <div className="p-[18px] bg-ks1 rounded-[10px] border border-kborder">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-mono text-[9px] uppercase tracking-widest text-kts">Cluster Contribution</h3>
          <span className="font-mono text-[10px] text-ktm">{totalMW.toFixed(0)} MW total</span>
        </div>
        <div className="space-y-4">
          {sortedClusters.map((cluster) => (
            <div key={cluster.cluster_name}>
              <div className="flex justify-between text-[11.5px] font-semibold mb-1.5">
                <span style={{ color: CLUSTER_COLORS[cluster.cluster_name] || '#6B9EC4' }}>{cluster.cluster_name}</span>
                <span className="font-mono text-kts">{cluster.total_p50.toFixed(0)} MW</span>
              </div>
              <div className="relative h-[22px] w-full bg-kborder rounded overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
                  style={{
                    width: `${(cluster.total_p50 / maxMW) * 100}%`,
                    background: `linear-gradient(90deg, ${CLUSTER_COLORS[cluster.cluster_name] || '#64748b'}, ${CLUSTER_COLORS[cluster.cluster_name] || '#64748b'}aa)`
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Total Row */}
      <div className="p-6 bg-kcyan/[0.04] border border-kcyan/20 rounded-[10px] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] text-kcyan uppercase tracking-[2px] mb-1">Aggregate Karnataka Forecast</p>
          <div className="font-mono text-[28px] font-semibold text-ktp tracking-tight">
            {totalMW.toFixed(0)} <span className="text-kcyan text-[18px]">MW</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-kgreen animate-blink" />
          <span className="font-mono text-[11px] text-kgreen">All systems nominal</span>
        </div>
      </div>
    </div>
  )
}

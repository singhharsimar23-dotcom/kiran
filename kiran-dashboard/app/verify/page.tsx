import { getModelHealth } from '@/lib/queries'

export const revalidate = 3600

export default async function VerifyPage() {
  const health = await getModelHealth()

  if (!health) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">No model data yet</h2>
        <p className="text-slate-500 mt-2 max-w-sm">
          Model performance metrics haven&apos;t been computed. Run <code className="bg-slate-100 px-1 rounded text-slate-900 font-mono">train_model.py</code> first.
        </p>
      </div>
    )
  }

  const skillScore = health.mae_p50 != null && health.persistence_mae != null
    ? ((1 - health.mae_p50 / health.persistence_mae) * 100)
    : null
    
  const coverage = health.coverage_pct ?? 0
  const isCoverageIdeal = coverage >= 75 && coverage <= 85

  const perPlantMetrics = health.per_plant_metrics 
    ? Object.entries(health.per_plant_metrics)
        .map(([name, m]) => ({ name, ...m }))
        .sort((a, b) => b.skill - a.skill)
    : []

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Model Verification</h1>
          <p className="text-slate-500 mt-1">Benchmarking performance against persistence baseline</p>
        </div>

        {health.needs_retraining && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm font-medium">
              Model drift detected — retrain recommended (trigger <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">Actions/train.yml</span>)
            </div>
          </div>
        )}
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-sm font-medium text-slate-500">Your MAE</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {health.mae_p50?.toFixed(4) ?? 'N/A'}
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-sm font-medium text-slate-500">Persistence MAE</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {health.persistence_mae?.toFixed(4) ?? 'N/A'}
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-sm font-medium text-slate-500">Skill Score</div>
          <div className={`text-2xl font-bold mt-2 ${skillScore !== null ? (skillScore > 0 ? 'text-green-600' : 'text-red-600') : 'text-slate-900'}`}>
            {skillScore !== null ? `${skillScore.toFixed(1)}%` : 'N/A'}
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-sm font-medium text-slate-500">Coverage</div>
          <div className={`text-2xl font-bold mt-2 ${isCoverageIdeal ? 'text-green-600' : 'text-amber-600'}`}>
            {coverage.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Explanation Box */}
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="flex gap-4">
          <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-sm text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-900 mb-1">How to read these metrics</p>
            Persistence baseline = assuming this hour output equals same hour yesterday. 
            Skill score &gt; 0% means KIRAN beats persistence. 
            Evaluated on held-out Jul–Dec 2023 data including full monsoon season.
          </div>
        </div>
      </div>

      {/* Per-plant Metrics Table */}
      {perPlantMetrics.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Per-plant Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-3">Plant Name</th>
                  <th className="px-6 py-3">MAE</th>
                  <th className="px-6 py-3">Skill Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perPlantMetrics.map((plant) => (
                  <tr key={plant.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{plant.name}</td>
                    <td className="px-6 py-4 text-slate-600 font-mono">{plant.mae.toFixed(4)}</td>
                    <td className={`px-6 py-4 font-bold ${plant.skill > 0.2 ? 'text-green-700' : plant.skill < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                      {(plant.skill * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

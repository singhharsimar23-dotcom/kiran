import { getModelHealth, getKptclHistory, getBacktestData } from '@/lib/queries'
import KptclCalibrationChart from '@/components/KptclCalibrationChart'
import BacktestChart from '@/components/BacktestChart'

export const dynamic = 'force-dynamic'

export default async function VerifyPage() {
  const [health, kptclHistory, backtestData] = await Promise.all([
    getModelHealth(),
    getKptclHistory(),
    getBacktestData(),
  ])

  if (!health) {
    return (
      <div className="p-7">
        <div className="bg-ks1 border border-kborder rounded-[10px] p-8 text-center">
          <p className="font-mono text-ktm mb-1">No model data yet.</p>
          <p className="font-mono text-kts text-sm">Run <code className="bg-ks2 px-1 rounded text-kcyan font-mono">train_model.py</code> first.</p>
        </div>
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
        .map(([name, m]: [string, any]) => ({ 
          name, 
          mae:   typeof m?.mae   === 'number' ? m.mae   : 0,
          skill: typeof m?.skill === 'number' ? m.skill : 0,
        }))
        .sort((a, b) => b.skill - a.skill)
    : []

  return (
    <div className="p-7 animate-fadein space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <span className="font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border border-kamber/30 text-kamber">Criterion 02 — Technical Soundness</span>
          <span className="font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border border-kpurple/30 text-kpurple">Criterion 04 — Feasibility</span>
        </div>
        <p className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-1">Benchmarking vs Persistence Baseline · Per-plant Skill</p>
        <h1 className="text-[26px] font-black text-ktp tracking-tight">Model Verification</h1>
        <p className="font-mono text-[10.5px] text-kts mt-2 max-w-[580px] leading-relaxed">
          KIRAN evaluated against <strong className="text-ktp">24h persistence baseline</strong> on held-out Jul–Dec 2023 data including full monsoon season. KPTCL live calibration chart shows real-time model vs grid actuals.
        </p>
      </div>

      {health.needs_retraining && (
        <div className="flex items-center gap-3 p-4 bg-kamber/[0.06] border border-kamber/22 rounded-lg font-mono text-[12px] text-ktp">
          <span className="text-kamber">⚠</span>
          <span>Model drift detected — retrain recommended (trigger <span className="font-mono bg-kamber/10 px-1.5 py-0.5 rounded text-kamber">Actions/train.yml</span>)</span>
        </div>
      )}

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-[18px] bg-ks1 border border-kborder rounded-[10px] hover:border-kcyan/20 transition-colors">
          <div className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-3">Fleet MAE P50</div>
          <div className="font-mono text-[33px] font-semibold text-ktp tracking-tight leading-none">{health.mae_p50?.toFixed(4) ?? 'N/A'}</div>
          <div className="font-mono text-[10px] text-ktm mt-1">normalized scale (0–1)</div>
        </div>

        <div className="p-[18px] bg-ks1 border border-kborder rounded-[10px] hover:border-kcyan/20 transition-colors">
          <div className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-3">Persistence MAE</div>
          <div className="font-mono text-[33px] font-semibold text-ktp tracking-tight leading-none">{health.persistence_mae?.toFixed(4) ?? 'N/A'}</div>
          <div className="font-mono text-[10px] text-ktm mt-1">24h persistence · same test set</div>
        </div>

        <div className="p-[18px] bg-ks1 border border-kborder rounded-[10px] hover:border-kcyan/20 transition-colors">
          <div className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-3">Skill Score</div>
          <div className={`font-mono text-[33px] font-semibold tracking-tight leading-none ${skillScore !== null ? (skillScore > 0 ? 'text-kgreen' : 'text-kred') : 'text-ktp'}`}>
            {skillScore !== null ? `${skillScore.toFixed(1)}%` : 'N/A'}
          </div>
          <div className="font-mono text-[10px] text-ktm mt-1">KIRAN vs persistence baseline</div>
        </div>

        <div className="p-[18px] bg-ks1 border border-kborder rounded-[10px] hover:border-kcyan/20 transition-colors">
          <div className="font-mono text-[9.5px] text-kts uppercase tracking-widest mb-3">P10–P90 Coverage</div>
          <div className={`font-mono text-[33px] font-semibold tracking-tight leading-none ${isCoverageIdeal ? 'text-kgreen' : 'text-kamber'}`}>
            {coverage.toFixed(1)}%
          </div>
          <div className="h-1 bg-kborder rounded mt-3 overflow-hidden">
            <div className={`h-full rounded ${isCoverageIdeal ? 'bg-kgreen' : 'bg-kamber'}`} style={{ width: `${Math.min(coverage, 100)}%` }} />
          </div>
          <div className="font-mono text-[10px] text-ktm mt-1">Target: 80%</div>
        </div>
      </div>

      {/* Explanation Box */}
      <div className="p-4 bg-ks2 border border-kborder rounded-lg font-mono text-[10.5px] text-kts leading-relaxed">
        Persistence baseline = assuming this hour output equals same hour yesterday.
        Skill score &gt; 0% means KIRAN beats persistence.
        Evaluated on held-out Jul–Dec 2023 data including full monsoon season.
      </div>

      {/* KPTCL Live Calibration Section */}
      <div className="p-[18px] bg-ks1 border border-kborder rounded-[10px]">
        <h3 className="font-mono text-[9px] uppercase tracking-widest text-kts mb-4">KPTCL Live Calibration — Last 6 Hours</h3>
        <KptclCalibrationChart data={kptclHistory} />
      </div>

      {/* Per-plant Metrics Table */}
      {perPlantMetrics.length > 0 && (
        <div className="bg-ks1 border border-kborder rounded-[10px] overflow-hidden">
          <div className="px-6 py-4 border-b border-kborder flex justify-between items-center">
            <h3 className="font-mono text-[9px] uppercase tracking-widest text-kts">Per-plant Skill Metrics</h3>
            <span className="font-mono text-[9px] text-ktm">Skill = 1 − MAE / Persistence</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-[11.5px]">
              <thead>
                <tr className="border-b border-kborder">
                  <th className="px-6 py-3 text-ktm text-[9px] uppercase tracking-wider">Plant</th>
                  <th className="px-6 py-3 text-ktm text-[9px] uppercase tracking-wider">MAE</th>
                  <th className="px-6 py-3 text-ktm text-[9px] uppercase tracking-wider">Skill Score</th>
                </tr>
              </thead>
              <tbody>
                {perPlantMetrics.map((plant) => (
                  <tr key={plant.name} className="border-b border-kborder/45 hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-3 font-semibold text-ktp">{plant.name}</td>
                    <td className="px-6 py-3 text-kts">{plant.mae.toFixed(4)}</td>
                    <td className={`px-6 py-3 font-bold ${plant.skill > 0.2 ? 'text-kgreen' : plant.skill < 0 ? 'text-kred' : 'text-kts'}`}>
                      {(plant.skill * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {backtestData.length > 0 && (
        <BacktestChart data={backtestData} />
      )}
    </div>
  )
}

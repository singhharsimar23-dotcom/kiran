import { getAllPlants, getClusterForecasts, getActiveRampAlerts, getModelHealth, getKptclStatus } from '@/lib/queries'
import Link from 'next/link'

export const revalidate = 900

const CRIT_BADGE = 'font-mono text-[8px] uppercase tracking-[2px] px-2 py-0.5 rounded-full border'

export default async function HomePage() {
  const [plants, clusterSummaries, rampAlerts, modelHealth, kptclRaw] = await Promise.all([
    getAllPlants(),
    getClusterForecasts(false),
    getActiveRampAlerts(),
    getModelHealth(),
    getKptclStatus(),
  ])
  const kptcl = kptclRaw as any

  const totalMW = clusterSummaries.reduce((s, c) => s + c.total_p50, 0)
  const totalCapacityMW = plants.reduce((s, p) => s + (p.capacity_mw ?? 0), 0)
  const skillPct = modelHealth?.mae_p50 != null && modelHealth?.persistence_mae != null
    ? ((1 - modelHealth.mae_p50 / modelHealth.persistence_mae) * 100).toFixed(1)
    : '—'
  const coveragePct = modelHealth?.coverage_pct?.toFixed(1) ?? '—'
  const kptclAge = kptcl?.scraped_at
    ? Math.round((Date.now() - new Date(kptcl.scraped_at).getTime()) / 60000)
    : null

  const CRITERIA = [
    {
      id: '01', label: 'Problem Understanding', color: 'text-kcyan', border: 'border-kcyan/20', bg: 'bg-kcyan/[0.04]',
      href: '/forecast',
      icon: '◈',
      title: 'Weather → Generation Forecasting',
      bullets: [
        `Open-Meteo NWP: GHI, cloud cover, wind ${plants[0] ? `at ${plants.length} plant lat/lon coords` : ''}`,
        'Soiling from precipitation history · terrain type · hub height per plant',
        'Asset variability: solar pvlib ceiling vs wind power curve — same model',
        'Geography: coastal, plateau, interior — one architecture, parameterised',
      ],
      proof: 'Single XGBoost handles all asset types and geographies',
    },
    {
      id: '02', label: 'Technical Soundness', color: 'text-kamber', border: 'border-kamber/20', bg: 'bg-kamber/[0.04]',
      href: '/forecast',
      icon: '◉',
      title: 'Physics-Constrained XGBoost',
      bullets: [
        'XGBoost quantile regression: P10, P50, P90 simultaneously',
        'pvlib clearsky ceiling — solar output physically capped per hour',
        'Wind power curve: cut-in 3.5 m/s, rated 12 m/s, cut-out 25 m/s',
        `Skill score: ${skillPct}% better than 24h persistence baseline`,
      ],
      proof: `${skillPct}% improvement over industry standard persistence baseline`,
    },
    {
      id: '03', label: 'Uncertainty & Explainability', color: 'text-kgreen', border: 'border-kgreen/20', bg: 'bg-kgreen/[0.04]',
      href: '/reserve',
      icon: '◎',
      title: 'P10/P50/P90 + SHAP in MW',
      bullets: [
        'P10/P50/P90 quantile bands — not abstract ±% but exact MW range',
        `Coverage: ${coveragePct}% of actuals fall within P10–P90 (target: 80%)`,
        'SHAP in megawatts: "cloud cover cost 142 MW at this hour"',
        '"Procure 310 MW by next dispatch cycle" — not a vague signal',
      ],
      proof: `${coveragePct}% probabilistic coverage — calibrated uncertainty`,
    },
    {
      id: '04', label: 'Feasibility Within Constraints', color: 'text-kpurple', border: 'border-kpurple/20', bg: 'bg-kpurple/[0.04]',
      href: '/verify',
      icon: '◇',
      title: 'Forecasting Layer — No Modifications',
      bullets: [
        'KREDL/KSPDCL systems untouched — pure side-layer architecture',
        'No LLM: XGBoost only — no sensitive data sent to cloud AI',
        'Demo mode: full synthetic dataset, 3 scenarios — works without real data',
        `KPTCL live scrape ${kptclAge !== null ? `running — last reading ${kptclAge}m ago` : 'active'}`,
      ],
      proof: 'Live against KPTCL portal · synthetic demo mode for evaluation',
    },
    {
      id: '05', label: 'Edge Cases & Real-World Use', color: 'text-kcyan', border: 'border-kcyan/20', bg: 'bg-kcyan/[0.04]',
      href: '/gon',
      icon: '◉',
      title: 'GON + Calibration + Ramp Alerts',
      bullets: [
        '6 cross-plant causal edges — Gadag wind predicts Chitradurga solar 2.5h ahead (r=0.88)',
        `KPTCL calibration: solar ${kptcl?.solar_mw ?? '—'} MW live · EMA smoothed · sanity-gated`,
        `Ramp alerts: ${rampAlerts.length} active — triggers when >15% MW swing in 3h`,
        'Soiling model: precipitation → panel efficiency decay over hours',
      ],
      proof: 'GON discovered 6 causal edges no team-level model finds',
    },
    {
      id: '06', label: 'Architecture & Risk', color: 'text-kamber', border: 'border-kamber/20', bg: 'bg-kamber/[0.04]',
      href: '/cluster',
      icon: '▣',
      title: 'Modular Pipeline + Drift Guards',
      bullets: [
        'Pipeline: Open-Meteo → Feature engineering → XGBoost → GON → KPTCL → Reserve',
        '4 cluster zones: Northern Solar, Northern Wind, Coastal Wind, Southern Solar',
        'Model drift guard: needs_retraining flag in model_health, auto-checked each run',
        'GitHub Actions cron: hourly reforecast, 7-day rolling prune, SHAP per slot',
      ],
      proof: `Fleet: ${clusterSummaries.length} clusters · ${totalMW.toFixed(0)} MW current · auto-updating`,
    },
  ]

  return (
    <div className="p-8 max-w-[1000px] animate-fadein">

      {/* Hero */}
      <p className="font-mono text-[10px] text-kcyan uppercase tracking-[3px] mb-3">
        AI-Based Renewable Generation Forecasting · KREDL / KSPDCL · Karnataka
      </p>
      <h1 className="text-[clamp(28px,3.8vw,48px)] font-black text-ktp tracking-[-1.5px] leading-[1.08] mb-3">
        Karnataka&apos;s Grid,<br />
        <em className="not-italic text-kcyan">Predicted 24h Ahead.</em>
      </h1>

      {/* Live stats bar */}
      <div className="flex gap-8 flex-wrap mb-10 pb-8 border-b border-kborder">
        {[
          { val: totalMW > 0 ? `${totalMW.toFixed(0)}` : '—', unit: 'MW', label: 'Current Fleet P50' },
          { val: totalCapacityMW.toLocaleString(), unit: 'MW', label: 'Installed Capacity' },
          { val: `${plants.filter(p => p.asset_type === 'solar').length} / ${plants.filter(p => p.asset_type === 'wind').length}`, unit: '', label: 'Solar / Wind Plants' },
          { val: skillPct, unit: '%', label: 'Skill vs Persistence' },
          { val: coveragePct, unit: '%', label: 'P10–P90 Coverage' },
          { val: String(rampAlerts.length), unit: rampAlerts.length > 0 ? '⚠' : '✓', label: 'Active Ramp Alerts' },
        ].map(({ val, unit, label }) => (
          <div key={label}>
            <div className="flex items-baseline gap-0.5">
              <span className="font-mono text-[30px] font-semibold text-ktp leading-none">{val}</span>
              {unit && <span className="font-mono text-[12px] text-kcyan ml-0.5">{unit}</span>}
            </div>
            <p className="font-mono text-[9px] text-ktm uppercase tracking-wider mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Evaluation Criteria Grid */}
      <div className="mb-4">
        <p className="font-mono text-[9px] text-ktm uppercase tracking-[2px] mb-5">
          Evaluation Criteria Coverage — 6 / 6 Addressed
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {CRITERIA.map((c) => (
            <Link key={c.id} href={c.href}>
              <div className={`relative h-full rounded-[10px] border ${c.border} ${c.bg} p-4 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer group`}>
                {/* Criterion badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`${CRIT_BADGE} ${c.border} ${c.color} bg-transparent`}>
                    Criterion {c.id}
                  </span>
                  <span className={`font-mono text-[10px] ${c.color} opacity-0 group-hover:opacity-100 transition-opacity`}>→ open</span>
                </div>
                <p className={`font-mono text-[9px] uppercase tracking-[1.5px] ${c.color} mb-1`}>{c.label}</p>
                <p className="text-[12px] font-bold text-ktp mb-3">{c.title}</p>
                <ul className="space-y-1.5 mb-3">
                  {c.bullets.map((b, i) => (
                    <li key={i} className="font-mono text-[9.5px] text-kts leading-[1.4] flex gap-1.5">
                      <span className={c.color}>·</span>{b}
                    </li>
                  ))}
                </ul>
                <div className={`mt-auto pt-2 border-t ${c.border}`}>
                  <p className={`font-mono text-[9px] ${c.color} font-semibold`}>✓ {c.proof}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Pipeline Architecture */}
      <div className="mt-8 p-5 bg-ks1 border border-kborder rounded-[10px]">
        <p className="font-mono text-[9px] text-ktm uppercase tracking-[2px] mb-4">System Architecture — Forecasting Pipeline</p>
        <div className="flex items-center gap-0 flex-wrap font-mono text-[10px] overflow-x-auto pb-2">
          {[
            { label: 'Open-Meteo NWP', sub: '7 weather vars/plant', color: 'text-kcyan', border: 'border-kcyan/30' },
            { label: '→', sub: '', color: 'text-ktm', border: '' },
            { label: 'pvlib Ceiling', sub: 'physics cap per hour', color: 'text-kamber', border: 'border-kamber/30' },
            { label: '→', sub: '', color: 'text-ktm', border: '' },
            { label: 'XGBoost P10/P50/P90', sub: 'quantile attenuation', color: 'text-kgreen', border: 'border-kgreen/30' },
            { label: '→', sub: '', color: 'text-ktm', border: '' },
            { label: 'GON Adjustment', sub: 'cross-plant causal', color: 'text-kcyan', border: 'border-kcyan/30' },
            { label: '→', sub: '', color: 'text-ktm', border: '' },
            { label: 'KPTCL Calibration', sub: 'live EMA correction', color: 'text-kamber', border: 'border-kamber/30' },
            { label: '→', sub: '', color: 'text-ktm', border: '' },
            { label: 'Reserve MW', sub: 'actionable output', color: 'text-kgreen', border: 'border-kgreen/30' },
          ].map((n, i) => (
            n.border ? (
              <div key={i} className={`px-3 py-2 rounded-lg border ${n.border} bg-ks2 text-center min-w-[110px]`}>
                <div className={`font-bold ${n.color} text-[9.5px]`}>{n.label}</div>
                <div className="text-ktm text-[8px] mt-0.5">{n.sub}</div>
              </div>
            ) : (
              <span key={i} className={`${n.color} text-[14px] px-1 font-bold flex-shrink-0`}>{n.label}</span>
            )
          ))}
        </div>
      </div>

      {/* Data Quality row */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-ks1 border border-kborder rounded-[10px]">
          <p className="font-mono text-[9px] text-ktm uppercase tracking-wider mb-2">Live KPTCL Signal</p>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-kgreen animate-blink flex-shrink-0" />
            <span className="font-mono text-[11px] text-ktp">Solar {kptcl?.solar_mw ?? '—'} MW · Wind {kptcl?.wind_mw ?? '—'} MW</span>
          </div>
          <p className="font-mono text-[9px] text-ktm">Scraped {kptclAge !== null ? `${kptclAge}m ago` : '—'} · calibration {kptcl?.applied ? 'applied ✓' : 'pending'}</p>
        </div>
        <div className="p-4 bg-ks1 border border-kborder rounded-[10px]">
          <p className="font-mono text-[9px] text-ktm uppercase tracking-wider mb-2">Model Status</p>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${modelHealth?.needs_retraining ? 'bg-kamber' : 'bg-kgreen animate-blink'}`} />
            <span className="font-mono text-[11px] text-ktp">{modelHealth?.needs_retraining ? 'Retrain recommended' : 'Model healthy'}</span>
          </div>
          <p className="font-mono text-[9px] text-ktm">MAE {modelHealth?.mae_p50?.toFixed(4) ?? '—'} · Persistence {modelHealth?.persistence_mae?.toFixed(4) ?? '—'}</p>
        </div>
        <div className="p-4 bg-ks1 border border-kborder rounded-[10px]">
          <p className="font-mono text-[9px] text-ktm uppercase tracking-wider mb-2">Intra-Day Updates</p>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-kgreen animate-blink flex-shrink-0" />
            <span className="font-mono text-[11px] text-ktp">Hourly cron · GitHub Actions</span>
          </div>
          <p className="font-mono text-[9px] text-ktm">Open-Meteo updates 4× daily · KPTCL every 60s</p>
        </div>
      </div>

    </div>
  )
}

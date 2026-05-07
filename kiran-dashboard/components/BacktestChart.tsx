'use client'

import { useMemo } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import type { BacktestDay } from '@/lib/queries'

interface Props { data: BacktestDay[] }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const fmt = (v: number) => `${(v / 1000).toFixed(1)} GWh`
  return (
    <div className="bg-ks1 border border-kborder rounded-lg p-3 font-mono text-[10px] space-y-1 shadow-xl">
      <p className="text-kts mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-ktp font-semibold">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function BacktestChart({ data }: Props) {
  const stats = useMemo(() => {
    if (data.length < 2) return null
    let modelErr = 0, persErr = 0
    for (const d of data) {
      modelErr += Math.abs(d.actual - d.model)
      persErr  += Math.abs(d.actual - d.persistence)
    }
    const skillPct = persErr > 0 ? ((1 - modelErr / persErr) * 100).toFixed(1) : '—'
    const mae_gwh  = (modelErr / data.length / 1000).toFixed(1)
    return { skillPct, mae_gwh }
  }, [data])

  const chartData = data.slice(-30).map(d => ({
    date: d.date.slice(5),   // MM-DD
    'Actual':      d.actual,
    'KIRAN P50':   d.model,
    'Persistence': d.persistence,
  }))

  return (
    <div className="p-5 bg-ks1 border border-kborder rounded-[10px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="font-mono text-[9px] text-ktm uppercase tracking-[2px] mb-1">
            30-Day Historical Backtesting · Fleet Total · Synthetic Actuals
          </p>
          <h3 className="text-[15px] font-bold text-ktp">
            KIRAN Forecast vs Actual Generation
          </h3>
          <p className="font-mono text-[10px] text-kts mt-1">
            Physics-grounded synthetic actuals · Persistence = repeat yesterday&apos;s output (naive baseline)
          </p>
        </div>
        {stats && (
          <div className="flex gap-4">
            <div className="text-right">
              <p className="font-mono text-[26px] font-semibold text-kgreen leading-none">{stats.skillPct}%</p>
              <p className="font-mono text-[9px] text-ktm">better than persistence</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[26px] font-semibold text-kcyan leading-none">{stats.mae_gwh}</p>
              <p className="font-mono text-[9px] text-ktm">avg daily error GWh</p>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#4B6785', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false}
            interval={4}
          />
          <YAxis
            tickFormatter={v => `${(v / 1000).toFixed(0)}GWh`}
            tick={{ fill: '#4B6785', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false} width={46}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 12 }}
            formatter={(v) => <span style={{ color: '#6B9EC4' }}>{v}</span>}
          />
          {/* Persistence — dashed gray */}
          <Line
            type="monotone" dataKey="Persistence"
            stroke="#4B6785" strokeWidth={1.5} strokeDasharray="4 3"
            dot={false} activeDot={false}
          />
          {/* KIRAN model — cyan */}
          <Line
            type="monotone" dataKey="KIRAN P50"
            stroke="#00e5ff" strokeWidth={2}
            dot={false} activeDot={{ r: 3, fill: '#00e5ff' }}
          />
          {/* Actual — green area */}
          <Area
            type="monotone" dataKey="Actual"
            stroke="#22c55e" strokeWidth={2}
            fill="#22c55e" fillOpacity={0.08}
            dot={false} activeDot={{ r: 3, fill: '#22c55e' }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Callout row */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-kborder pt-4">
        {[
          { label: 'Evaluation period', val: '30 days' },
          { label: 'Model MAE', val: `${stats?.mae_gwh ?? '—'} GWh/day` },
          { label: 'Skill vs persistence', val: `${stats?.skillPct ?? '—'}%` },
        ].map(({ label, val }) => (
          <div key={label}>
            <p className="font-mono text-[8.5px] text-ktm uppercase tracking-wider">{label}</p>
            <p className="font-mono text-[14px] font-semibold text-ktp mt-0.5">{val}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

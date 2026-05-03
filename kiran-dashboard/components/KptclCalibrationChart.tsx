'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'

type KptclHistory = {
  scraped_at: string
  solar_mw: number
  wind_mw: number
  calibration_factor_solar: number
  applied: boolean
  scrape_success: boolean
}

export default function KptclCalibrationChart({ data }: { data: KptclHistory[] }) {
  if (data.length < 2) {
    return (
      <div className="h-[200px] flex items-center justify-center bg-slate-50 border border-dashed border-slate-300 rounded-xl text-slate-500 text-sm">
        Calibration data accumulating — check back in 30 min
      </div>
    )
  }

  const chartData = data.map(d => ({
    ...d,
    time: new Date(d.scraped_at).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }))

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props
    if (cx === undefined || cy === undefined) return null
    
    let fill = '#94a3b8' // gray
    if (!payload.scrape_success) fill = '#ef4444' // red
    else if (payload.applied) fill = '#22c55e' // green

    return (
      <circle cx={cx} cy={cy} r={3} fill={fill} stroke="white" strokeWidth={1} />
    )
  }

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="time" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
            tick={{ fill: '#94a3b8' }}
            minTickGap={30}
          />
          <YAxis 
            domain={[0.6, 1.4]} 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
            tick={{ fill: '#94a3b8' }}
          />
          <Tooltip 
            contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            labelStyle={{ fontWeight: 'bold', marginBottom: 4 }}
          />
          <ReferenceLine y={1.0} stroke="#cbd5e1" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="calibration_factor_solar"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { Plant, Forecast } from '@/lib/types'

interface Props {
  plants: Plant[]
  forecasts: Forecast[]
  selectedPlantId: string
  isDemo: boolean
}

export default function ForecastChart({ plants, forecasts: initialForecasts, selectedPlantId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [forecasts, setForecasts] = useState<Forecast[]>(initialForecasts)

  // Cache management
  useEffect(() => {
    if (initialForecasts && initialForecasts.length > 0) {
      localStorage.setItem('fc_cache', JSON.stringify(initialForecasts))
      setForecasts(initialForecasts)
    } else {
      const cached = localStorage.getItem('fc_cache')
      if (cached) {
        try {
          setForecasts(JSON.parse(cached))
        } catch (e) {
          console.error('Failed to parse cached forecasts', e)
        }
      }
    }
  }, [initialForecasts])

  // Auto-refresh logic
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
    }, 14 * 60 * 1000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router])

  // Stat calculations
  const stats = useMemo(() => {
    if (!forecasts || forecasts.length === 0) return null

    const peakP50 = Math.max(...forecasts.map((f) => f.p50_mw ?? 0))
    const peakReserve = Math.max(...forecasts.map((f) => f.reserve_mw ?? 0))

    // Find risk level at peak P50
    const peakIndex = forecasts.findIndex(f => (f.p50_mw ?? 0) === peakP50)
    const riskLevel = forecasts[peakIndex]?.risk_level ?? 'LOW'

    return { peakP50, peakReserve, riskLevel }
  }, [forecasts])

  const handlePlantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPlantId = e.target.value
    const params = new URLSearchParams(window.location.search)
    params.set('plantId', newPlantId)
    router.push(`${pathname}?${params.toString()}`)
  }

  const riskBadgeClass = (level: string | null) => {
    switch (level) {
      case 'HIGH': return 'bg-red-100 text-red-800 border-red-200'
      case 'MEDIUM': return 'bg-amber-100 text-amber-800 border-amber-200'
      default: return 'bg-green-100 text-green-800 border-green-200'
    }
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { payload: Forecast }[]; label?: string }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as Forecast
      return (
        <div className="bg-white p-3 border rounded shadow-lg text-sm">
          <p className="font-bold mb-1">{label}</p>
          <p className="text-blue-700">P50: <span className="font-semibold">{(data.p50_mw ?? 0).toFixed(0)} MW</span></p>
          <div className="flex gap-4 text-gray-600 border-t mt-1 pt-1">
            <p>P10: {(data.p10_mw ?? 0).toFixed(0)}</p>
            <p>P90: {(data.p90_mw ?? 0).toFixed(0)}</p>
          </div>
          <p className="text-gray-500 mt-1 italic">Reserve: {(data.reserve_mw ?? 0).toFixed(0)} MW</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="p-6 space-y-6 flex flex-col h-full bg-ks1 rounded-[10px] border border-kborder">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-ktp">Generation Forecast</h2>
        <select
          value={selectedPlantId}
          onChange={handlePlantChange}
          className="p-2 border border-kborder rounded-md bg-ks2 text-ktp font-mono text-[12px] focus:outline-none focus:ring-1 focus:ring-kcyan cursor-pointer hover:border-kcyan/30 transition-colors"
        >
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.asset_type})
            </option>
          ))}
        </select>
      </div>

      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={forecasts} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="forecast_for"
              tickFormatter={(value: string) => {
                try {
                  return new Date(value).toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })
                } catch { return value }
              }}
              stroke="#94a3b8"
              fontSize={12}
              tickMargin={10}
            />
            <YAxis
              tickFormatter={(v) => v.toFixed(0) + ' MW'}
              stroke="#94a3b8"
              fontSize={12}
              tickMargin={10}
            />
            <Tooltip
              content={<CustomTooltip />}
              labelFormatter={(label) => {
                try {
                  return new Date(String(label)).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  }) + ' IST'
                } catch { return label }
              }}
            />

            {/* P10/P90 Band */}
            <Area
              dataKey="p10_mw"
              fill="#BFDBFE"
              opacity={0.3}
              stroke="none"
              animationDuration={500}
            />
            <Area
              dataKey="p90_mw"
              fill="#BFDBFE"
              opacity={0.3}
              stroke="none"
              animationDuration={500}
            />

            {/* P50 Line */}
            <Line
              type="monotone"
              dataKey="p50_mw"
              stroke="#1D4ED8"
              strokeWidth={2}
              dot={false}
              animationDuration={800}
            />

            <ReferenceLine
              x={new Date().toISOString()}
              stroke="#9CA3AF"
              strokeDasharray="4 4"
              label={{ position: 'top', value: 'Now', fill: '#9CA3AF', fontSize: 10 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-kcyan/[0.06] rounded-lg border border-kcyan/20">
            <p className="text-sm text-kcyan font-mono font-medium">Peak P50</p>
            <p className="text-2xl font-bold text-ktp font-mono">{stats.peakP50.toFixed(0)} MW</p>
          </div>
          <div className="p-4 bg-ks2 rounded-lg border border-kborder">
            <p className="text-sm text-kts font-mono font-medium">Peak Reserve</p>
            <p className="text-2xl font-bold text-kamber font-mono">{stats.peakReserve.toFixed(0)} MW</p>
          </div>
          <div className="p-4 bg-ks2 rounded-lg border border-kborder flex flex-col justify-between">
            <p className="text-sm text-kts font-mono font-medium">Grid Risk</p>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${riskBadgeClass(stats.riskLevel)} w-fit mt-2`}>
              {stats.riskLevel}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

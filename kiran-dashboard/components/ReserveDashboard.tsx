'use client'

const FEATURE_LABELS: Record<string, string> = {
  asset_type_num: 'Asset type',
  cloud_cover_norm: 'Cloud cover',
  physics_ceiling_mw: 'Physics ceiling',
  wind_speed_hub: 'Wind speed',
  soiling_factor: 'Panel soiling',
  is_monsoon: 'Monsoon season',
  gen_lag_1h: 'Generation 1h ago',
  gen_lag_24h: 'Generation 24h ago',
  temperature_c: 'Temperature',
  lon: 'Location',
  lat: 'Location',
  hour_sin: 'Time of day',
  hour_cos: 'Time of day',
}

import React, { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'
import type { Plant, Forecast, RampAlert } from '@/lib/types'

interface Props {
  plants: Plant[]
  forecasts: Record<string, Forecast>
  heroPlantId: string
  rampAlerts: RampAlert[]
}

export default function ReserveDashboard({ plants, forecasts, heroPlantId, rampAlerts }: Props) {
  const [selectedPlantId, setSelectedPlantId] = useState<string>(heroPlantId)

  const heroForecast = forecasts[selectedPlantId]
  const heroPlant = plants.find((p) => p.id === selectedPlantId)

  const shapData = useMemo(() => {
    if (!heroForecast?.shap_drivers) return []
    return Object.entries(heroForecast.shap_drivers)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 3)
      .map(([name, value]) => ({
        name: FEATURE_LABELS[name] ?? name.replace(/_/g, ' '),
        value: value,
        fill: value >= 0 ? '#16A34A' : '#DC2626',
      }))
  }, [heroForecast])

  const topDriver = useMemo(() => {
    if (!heroForecast?.shap_drivers) return null
    const entries = Object.entries(heroForecast.shap_drivers).sort(
      (a, b) => Math.abs(b[1]) - Math.abs(a[1])
    )
    const [name, value] = entries[0]
    return {
      label: FEATURE_LABELS[name] ?? name.replace(/_/g, ' '),
      value: value,
    }
  }, [heroForecast])

  const renderRiskBadge = (level: string | null, isSmall = false) => {
    const base = isSmall ? 'text-[10px] px-2 py-0.5' : 'text-sm px-4 py-1.5'
    switch (level) {
      case 'LOW':
        return (
          <span className={`${base} bg-green-100 text-green-700 rounded-full font-semibold uppercase tracking-wider`}>
            Low Risk
          </span>
        )
      case 'MEDIUM':
        return (
          <span className={`${base} bg-amber-100 text-amber-700 rounded-full font-semibold uppercase tracking-wider`}>
            Medium Risk
          </span>
        )
      case 'HIGH':
        return (
          <span className={`${base} bg-red-100 text-red-700 rounded-full font-semibold uppercase tracking-wider`}>
            High Risk
          </span>
        )
      default:
        return (
          <span className={`${base} bg-gray-100 text-gray-600 rounded-full font-semibold uppercase tracking-wider`}>
            No Data
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Ramp Alert Banner */}
      {rampAlerts.length > 0 && (
        <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <p className="text-amber-800 font-medium">
            Ramp alert: {rampAlerts.length} active event{rampAlerts.length > 1 ? 's' : ''} detected
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Left Section - Hero (60%) */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm transition-all hover:shadow-md">
            {heroPlant && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-1">
                    {heroPlant.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <h2 className="text-6xl font-bold text-gray-900 tracking-tight">
                      {heroForecast?.reserve_mw?.toFixed(0) ?? '—'}
                      <span className="text-2xl ml-2 text-gray-400 font-normal">MW Reserve</span>
                    </h2>
                    {renderRiskBadge(heroForecast?.risk_level)}
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-50">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                    Impact Drivers (SHAP)
                  </h3>
                  <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={shapData}
                        layout="vertical"
                        margin={{ top: 5, right: 80, left: 20, bottom: 5 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={140}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }}
                        />
                        <Tooltip
                          cursor={{ fill: 'transparent' }}
                          contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                          {shapData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="right"
                            content={(props: any) => {
                              const { x, y, width, height, value } = props
                              return (
                                <text
                                  x={x + width + 8}
                                  y={y + height / 2}
                                  fill={value >= 0 ? '#16A34A' : '#DC2626'}
                                  textAnchor="start"
                                  dominantBaseline="middle"
                                  className="text-xs font-bold"
                                >
                                  {value >= 0 ? '+' : ''}
                                  {value.toFixed(0)} MW
                                </text>
                              )
                            }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <p className="text-gray-700 leading-relaxed text-lg">
                    {heroPlant.name} forecast: <span className="font-bold">{heroForecast?.p50_mw?.toFixed(0) ?? '—'} MW</span>.
                    {topDriver && (
                      <>
                        {' '}Primary driver: <span className="font-semibold text-gray-900">{topDriver.label}</span> ({topDriver.value > 0 ? '+' : ''}{topDriver.value.toFixed(0)} MW impact).
                      </>
                    )}
                    {' '}Procure <span className="text-blue-600 font-bold">{heroForecast?.reserve_mw?.toFixed(0) ?? '—'} MW</span> reserve for reliability.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section - Plant List (40%) */}
        <div className="lg:col-span-4 h-[calc(100vh-180px)] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
          {plants.map((plant) => {
            const forecast = forecasts[plant.id]
            const isSelected = selectedPlantId === plant.id
            return (
              <button
                key={plant.id}
                onClick={() => setSelectedPlantId(plant.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? 'bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-500'
                    : 'bg-white border-gray-100 hover:border-gray-300 shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-gray-900 truncate pr-2">{plant.name}</span>
                  {renderRiskBadge(forecast?.risk_level, true)}
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                      Forecast
                    </span>
                    <span className="text-sm font-bold text-gray-700">
                      {forecast?.p50_mw?.toFixed(0) ?? '—'}
                      <span className="text-[10px] ml-1 font-normal">MW</span>
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider text-blue-500/70">
                      Reserve
                    </span>
                    <span className="text-sm font-extrabold text-blue-600">
                      {forecast?.reserve_mw?.toFixed(0) ?? '—'}
                      <span className="text-[10px] ml-1 font-normal">MW</span>
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e5e7eb;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #d1d5db;
        }
      `}</style>
    </div>
  )
}

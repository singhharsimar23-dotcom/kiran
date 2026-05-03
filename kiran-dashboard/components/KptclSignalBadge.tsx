'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type KptclReading = {
  scraped_at: string
  solar_mw: number
  wind_mw: number
  pavagada_mw: number
  calibration_factor_solar: number
  calibration_factor_wind: number
  applied: boolean
  scrape_success: boolean
}

export default function KptclSignalBadge() {
  const [reading, setReading] = useState<KptclReading | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('kptcl_readings')
        .select('*')
        .order('scraped_at', { ascending: false })
        .limit(1)
      setReading(data?.[0] ?? null)
    }
    load()
    // Real-time subscription — update badge when new reading arrives
    const channel = supabase
      .channel('kptcl_live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kptcl_readings' },
        (payload) => setReading(payload.new as KptclReading))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  if (!reading) return null

  const ageMin = Math.round(
    (Date.now() - new Date(reading.scraped_at).getTime()) / 60000)
  const isLive = reading.scrape_success && ageMin < 20
  const factor = reading.calibration_factor_solar ?? 1.0
  const deviation = Math.round(Math.abs(factor - 1.0) * 100)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px',
      border: `0.5px solid ${isLive ? 'var(--color-border-success, #22c55e)' : 'var(--color-border-tertiary, #e2e8f0)'}`,
      borderRadius: 'var(--border-radius-md, 8px)',
      background: isLive ? 'var(--color-background-success, #f0fdf4)' : 'var(--color-background-secondary, #f8fafc)',
      fontSize: 12,
    }}>
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isLive ? 'var(--color-text-success, #16a34a)' : 'var(--color-text-tertiary, #94a3b8)',
        flexShrink: 0,
        animation: isLive ? 'pulse 2s infinite' : 'none',
      }}/>
      <span style={{ color: 'var(--color-text-secondary, #64748b)', fontFamily: 'var(--font-mono, monospace)' }}>
        KPTCL SLDC
      </span>
      {isLive ? (
        <>
          <span style={{ color: 'var(--color-text-primary, #1e293b)', fontWeight: 500 }}>
            Solar {reading.solar_mw?.toLocaleString('en-IN')} MW
          </span>
          <span style={{ color: 'var(--color-text-secondary, #64748b)' }}>·</span>
          <span style={{ color: 'var(--color-text-primary, #1e293b)', fontWeight: 500 }}>
            Wind {reading.wind_mw?.toLocaleString('en-IN')} MW
          </span>
          {reading.applied && deviation > 5 && (
            <>
              <span style={{ color: 'var(--color-text-secondary, #64748b)' }}>·</span>
              <span style={{
                color: factor > 1 ? 'var(--color-text-success, #16a34a)' : 'var(--color-text-warning, #d97706)',
                fontWeight: 500,
              }}>
                {factor > 1 ? '+' : '-'}{deviation}% grid adj.
              </span>
            </>
          )}
          <span style={{ color: 'var(--color-text-tertiary, #94a3b8)', fontSize: 11 }}>
            {ageMin}m ago
          </span>
        </>
      ) : (
        <span style={{ color: 'var(--color-text-tertiary, #94a3b8)' }}>
          {reading.scrape_success ? `${ageMin}m ago` : 'unavailable — model only'}
        </span>
      )}
    </div>
  )
}

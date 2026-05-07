'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '/forecast', icon: '◈', label: 'Forecast' },
  { href: '/reserve',  icon: '◎', label: 'Reserve', badge: '!' },
  { href: '/gon',      icon: '◉', label: 'GON' },
  { href: '/cluster',  icon: '▣', label: 'Cluster' },
  { href: '/verify',   icon: '◇', label: 'Verify' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const scenario = searchParams.get('scenario')

  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      const h = String(ist.getHours()).padStart(2, '0')
      const m = String(ist.getMinutes()).padStart(2, '0')
      const s = String(ist.getSeconds()).padStart(2, '0')
      setTime(`${h}:${m}:${s}`)
      setDate(
        ist.toLocaleDateString('en-IN', {
          weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata',
        }).toUpperCase() + ' · IST'
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Carry demo mode across nav links
  const buildHref = (base: string) => {
    if (!isDemo) return base
    const p = new URLSearchParams()
    p.set('demo', 'true')
    if (scenario) p.set('scenario', scenario)
    return `${base}?${p.toString()}`
  }

  return (
    <aside className="fixed w-[230px] left-0 top-0 h-screen bg-ks1 border-r border-kborder flex flex-col z-50">
      {/* Logo */}
      <div className="border-b border-kborder px-5 py-[22px]">
        <Link href="/">
          <p className="font-mono text-2xl font-black text-kcyan tracking-[5px] hover:opacity-80 transition-opacity">
            KIRAN
          </p>
        </Link>
        <p className="font-mono text-[8px] text-ktm tracking-[1.5px] mt-1 leading-relaxed">
          Karnataka Intelligent<br />Renewable Analytics Network
        </p>
        <span className="inline-flex items-center gap-1 mt-2 bg-kgreen/[0.08] border border-kgreen/20 rounded-full px-2.5 py-0.5 font-mono text-[9px] text-kgreen tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-kgreen animate-blink" />
          {isDemo ? 'DEMO MODE' : 'LIVE'}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-px overflow-y-auto">
        <p className="font-mono text-[8px] text-ktm tracking-[2.5px] uppercase px-2 py-2">
          Analytics
        </p>
        {NAV_LINKS.map(({ href, icon, label, badge }) => {
          const isActive = pathname === href
          return (
            <Link key={href} href={buildHref(href)}>
              <div
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-medium border transition-all duration-150 cursor-pointer
                  ${isActive
                    ? 'bg-kcyan/[0.07] text-kcyan border-kcyan/[0.18]'
                    : 'text-kts border-transparent hover:bg-ks2 hover:text-ktp'
                  }`}
              >
                {isActive && (
                  <span className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-kcyan rounded-r-sm" />
                )}
                <span className="w-3.5 text-[13px] flex-shrink-0 text-center">{icon}</span>
                <span>{label}</span>
                {badge && (
                  <span className="ml-auto bg-kred/15 border border-kred/30 text-kred font-mono text-[9px] px-1.5 rounded-full">
                    {badge}
                  </span>
                )}
              </div>
            </Link>
          )
        })}

        {/* Demo mode indicator */}
        {isDemo && (
          <div className="mt-3 mx-2 px-3 py-2 bg-kamber/[0.08] border border-kamber/20 rounded-lg">
            <p className="font-mono text-[9px] text-kamber tracking-wider uppercase">Demo Mode</p>
            {scenario && (
              <p className="font-mono text-[9px] text-ktm mt-0.5">Scenario {scenario}</p>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-kborder px-4 py-3.5">
        <p className="font-mono text-xl font-medium text-kcyan tracking-[2px]">{time}</p>
        <p className="font-mono text-[9px] text-ktm tracking-wider mt-0.5">{date}</p>
        <div className="mt-3 space-y-1">
          {([
            ['Total Fleet', '6,150 MW'],
            ['10 Plants',   '6☀ · 4💨'],
            ['4 Clusters',  'KREDL/KSPDCL'],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="font-mono text-[9.5px] text-ktm">{k}</span>
              <span className="font-mono text-[9.5px] text-kcyan font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

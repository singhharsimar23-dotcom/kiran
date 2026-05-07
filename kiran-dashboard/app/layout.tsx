import type { Metadata } from 'next'
import { Suspense } from 'react'
import Sidebar from '@/components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'KIRAN — Karnataka Intelligent Renewable Analytics',
  description: 'AI-Based Renewable Generation Forecasting · KREDL / KSPDCL',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-kbg text-ktp font-syne antialiased">
        <Suspense fallback={<div className="w-[230px] flex-shrink-0 bg-ks1 border-r border-kborder" />}>
          <Sidebar />
        </Suspense>
        <main className="flex-1 min-h-screen" style={{ marginLeft: 'var(--sidebar)' }}>
          {children}
        </main>
      </body>
    </html>
  )
}

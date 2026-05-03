export const revalidate = 3600
import dynamic from 'next/dynamic'
import path from 'path'
import fs from 'fs'
import { getAllPlants } from '@/lib/queries'

const GONGraph = dynamic(() => import('@/components/GONGraph'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 480,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
      }}
    >
      Loading GON graph...
    </div>
  ),
})

export default async function GONPage() {
  const plants = await getAllPlants()
  // Use path.join(process.cwd(), ...) — works correctly on both local and Vercel
  const gonPath = path.join(process.cwd(), 'public', 'data', 'gon_priors.json')
  let gonData = {}
  try {
    gonData = JSON.parse(fs.readFileSync(gonPath, 'utf-8'))
  } catch (e) {
    console.error('Failed to read gon_priors.json:', e)
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Grid Observation Network</h1>
      <p className="text-gray-500 mb-4 text-sm">
        Directed edges show inter-plant correlation with temporal lag. Gadag (wind) → Chitradurga
        (solar): plateau wind clearing leads solar recovery by ~2.5 hours.
      </p>
      <GONGraph plants={plants} gonData={gonData} />
    </div>
  )
}

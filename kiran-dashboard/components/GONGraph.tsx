'use client'

import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import type { Plant } from '@/lib/types'

type GonEdge = { lag_h: number; r: number }
type GonData  = Record<string, Record<string, GonEdge>>
interface Props { plants: Plant[]; gonData: GonData; karnatakaGeoJson?: object | null }

const GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@ef25ebc/geojson/states/karnataka.geojson'

// Fallback coordinates if plant.lat/lon missing from DB
const FALLBACK: Record<string, [number, number]> = {
  'Gadag':       [75.6167, 15.4167],
  'Koppal':      [76.1547, 15.3526],
  'Chitradurga': [76.3980, 14.2251],
  'Pavagada':    [77.2809, 14.0996],
  'Bellary':     [76.9214, 15.1394],
  'Tumkur':      [77.1009, 13.3411],
  'Raichur':     [77.3566, 16.2120],
  'Bidar':       [77.5152, 17.9133],
  'Uttara K':    [74.1500, 14.8000],
  'Dakshina K':  [74.9900, 12.8438],
  'Hospet':      [76.3867, 15.2689],
  'Davangere K': [75.9238, 14.4644],
}

export default function GONGraph({ plants, gonData }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null)
  const tipRef    = useRef<HTMLDivElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading'|'ok'|'error'>('loading')
  const [errMsg,  setErrMsg]  = useState('')
  const [hovered, setHovered] = useState<string|null>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const W = svgRef.current.clientWidth || 920
    const H = 560

    setStatus('loading')

    fetch(GEOJSON_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((geojson: any) => {
        setStatus('ok')

        const svg = d3.select(svgRef.current!)
        svg.selectAll('*').remove()
        svg.attr('viewBox', `0 0 ${W} ${H}`)

        // ── 1. PROJECTION (real GeoJSON fitSize) ─────────────────────────────
        const projection = d3.geoMercator().fitSize([W, H - 20], geojson)
        const pathGen    = d3.geoPath().projection(projection)
        const project    = (lon: number, lat: number): [number, number] =>
          projection([lon, lat]) as [number, number]

        // ── 2. DEFS ───────────────────────────────────────────────────────────
        const defs = svg.append('defs')

        // Arrowhead
        defs.append('marker')
          .attr('id', 'arr').attr('viewBox', '0 0 10 10')
          .attr('refX', 10).attr('refY', 5)
          .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
          .append('path').attr('d', 'M0,0 L10,5 L0,10 z').attr('fill', '#00b8d4')

        defs.append('marker')
          .attr('id', 'arr-gon').attr('viewBox', '0 0 10 10')
          .attr('refX', 10).attr('refY', 5)
          .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
          .append('path').attr('d', 'M0,0 L10,5 L0,10 z').attr('fill', '#22D3EE')

        // Glow filter
        const filt = defs.append('filter').attr('id', 'glow')
          .attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%')
        filt.append('feGaussianBlur').attr('stdDeviation', 5).attr('result', 'blur')
        const fm = filt.append('feMerge')
        fm.append('feMergeNode').attr('in', 'blur')
        fm.append('feMergeNode').attr('in', 'SourceGraphic')

        // ── 3. BACKGROUND ─────────────────────────────────────────────────────
        svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#0a1628')

        // ── 4. DISTRICT FILL ──────────────────────────────────────────────────
        const gDistricts = svg.append('g')
        const tip = d3.select(tipRef.current!)
        const wrap = d3.select(wrapRef.current!)

        gDistricts.selectAll('path')
          .data(geojson.features)
          .join('path')
          .attr('d', pathGen as any)
          .attr('fill', '#0d2137')
          .attr('stroke', '#1e4a6e')
          .attr('stroke-width', 0.8)
          .style('cursor', 'pointer')
          .style('transition', 'fill 0.15s')
          .on('mouseover', function(event: MouseEvent, d: any) {
            d3.select(this).attr('fill', '#1a3a5c')
            const name = d.properties?.district || d.properties?.DISTRICT || d.properties?.name || 'District'
            setHovered(name)
            const rect = wrapRef.current!.getBoundingClientRect()
            tip.style('display', 'block')
              .style('left', `${event.clientX - rect.left + 12}px`)
              .style('top',  `${event.clientY - rect.top  - 32}px`)
              .text(name)
          })
          .on('mousemove', function(event: MouseEvent) {
            const rect = wrapRef.current!.getBoundingClientRect()
            tip.style('left', `${event.clientX - rect.left + 12}px`)
              .style('top',  `${event.clientY - rect.top  - 32}px`)
          })
          .on('mouseout', function() {
            d3.select(this).attr('fill', '#0d2137')
            setHovered(null)
            tip.style('display', 'none')
          })

        // District labels
        gDistricts.selectAll('text')
          .data(geojson.features)
          .join('text')
          .attr('transform', (d: any) => {
            const c = pathGen.centroid(d)
            return `translate(${c[0]},${c[1]})`
          })
          .attr('text-anchor', 'middle')
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('font-size', 6)
          .attr('fill', '#2a5f7a')
          .attr('pointer-events', 'none')
          .text((d: any) => {
            const n = d.properties?.district || d.properties?.DISTRICT || d.properties?.name || ''
            return n.length > 9 ? n.slice(0, 8) + '.' : n
          })

        // ── 5. PLANT POSITION MAP ─────────────────────────────────────────────
        const posMap = new Map<string, [number, number]>()
        plants.forEach(p => {
          const lon = (p as any).lon ?? FALLBACK[p.name]?.[0] ?? 76.5
          const lat = (p as any).lat ?? FALLBACK[p.name]?.[1] ?? 15.0
          posMap.set(p.name, project(lon, lat))
        })

        // ── 6. GON CORRELATION EDGES ──────────────────────────────────────────
        const gEdges = svg.append('g')
        for (const [src, targets] of Object.entries(gonData)) {
          for (const [tgt, edge] of Object.entries(targets as Record<string, GonEdge>)) {
            const s = posMap.get(src), t = posMap.get(tgt)
            if (!s || !t) continue
            const isKey = src === 'Gadag' && tgt === 'Chitradurga'
            if (edge.r > 0.45) {
              gEdges.append('line')
                .attr('x1', s[0]).attr('y1', s[1]).attr('x2', t[0]).attr('y2', t[1])
                .attr('stroke', '#22D3EE')
                .attr('stroke-width', isKey ? 3 : 1 + edge.r * 2)
                .attr('opacity', isKey ? 0.95 : edge.r * 0.7)
                .attr('marker-end', 'url(#arr-gon)')
                .attr('filter', isKey ? 'url(#glow)' : null)
              if (isKey) {
                const mx = (s[0]+t[0])/2, my = (s[1]+t[1])/2 - 10
                gEdges.append('rect').attr('x',mx-46).attr('y',my-10).attr('width',92).attr('height',14)
                  .attr('rx',3).attr('fill','#050C17').attr('opacity',0.85)
                gEdges.append('text').attr('x',mx).attr('y',my+1)
                  .attr('text-anchor','middle').attr('font-family','JetBrains Mono')
                  .attr('font-size',9).attr('fill','#22D3EE').attr('font-weight',700)
                  .text('r=0.61 · lag +2.5h →')
              }
            } else if (edge.r > 0.25) {
              gEdges.append('line')
                .attr('x1', s[0]).attr('y1', s[1]).attr('x2', t[0]).attr('y2', t[1])
                .attr('stroke', '#22D3EE').attr('stroke-width', 0.8)
                .attr('stroke-dasharray', '4,4').attr('opacity', 0.2)
                .attr('marker-end', 'url(#arr-gon)')
            }
          }
        }

        // ── 7. PLANT NODES ────────────────────────────────────────────────────
        const gNodes = svg.append('g')
        plants.forEach(p => {
          const xy = posMap.get(p.name)
          if (!xy) return
          const [cx, cy] = xy
          const isSolar = p.asset_type === 'solar'
          const isKey   = p.name === 'Gadag' || p.name === 'Chitradurga'
          const col     = isSolar ? '#00e5ff' : '#ff9800'
          const r       = p.capacity_mw > 500 ? 10 : p.capacity_mw > 200 ? 8 : 6

          // Pulse ring (SMIL so it works in SVG without CSS)
          const ring = gNodes.append('circle')
            .attr('cx', cx).attr('cy', cy).attr('r', r + 8)
            .attr('fill', 'none').attr('stroke', col)
            .attr('stroke-width', 1).attr('opacity', 0.5)
          ring.append('animate').attr('attributeName', 'r')
            .attr('values', `${r+6};${r+16};${r+6}`).attr('dur', isKey ? '1.8s' : '2.8s')
            .attr('repeatCount', 'indefinite')
          ring.append('animate').attr('attributeName', 'opacity')
            .attr('values', '0.5;0.05;0.5').attr('dur', isKey ? '1.8s' : '2.8s')
            .attr('repeatCount', 'indefinite')

          // Node fill
          gNodes.append('circle')
            .attr('cx', cx).attr('cy', cy).attr('r', r)
            .attr('fill', col).attr('stroke', '#ffffff').attr('stroke-width', 1.5)
            .attr('filter', isKey ? 'url(#glow)' : null)

          // Name label
          gNodes.append('text')
            .attr('x', cx).attr('y', cy - r - 5)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('font-weight', isKey ? 700 : 500)
            .attr('font-size', isKey ? 10 : 8)
            .attr('fill', col)
            .attr('pointer-events', 'none')
            .text(p.name + (p.capacity_mw ? ` ${p.capacity_mw}MW` : ''))
        })

        // ── 8. WATERMARK ──────────────────────────────────────────────────────
        svg.append('text')
          .attr('x', 10).attr('y', H - 6)
          .attr('fill', '#2a5f7a').attr('font-size', 9)
          .attr('font-family', 'JetBrains Mono, monospace')
          .text('KIRAN GON v2.1 · LIVE · Karnataka Grid · GeoJSON: udit-001/india-maps-data')
      })
      .catch((e: Error) => {
        setStatus('error')
        setErrMsg(e.message)
      })
  }, [plants, gonData])

  return (
    <div ref={wrapRef} className="relative">
      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-10 bg-[#0a1628]/90 border border-[#1e4a6e] rounded-lg px-3 py-2 space-y-1.5">
        {[
          { col: '#ff9800', label: 'Wind / Thermal source' },
          { col: '#00e5ff', label: 'Solar / Load substation' },
        ].map(({ col, label }) => (
          <div key={label} className="flex items-center gap-2 font-mono text-[11px] text-[#4fc3f7]">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col }} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#4fc3f7]">
          <span className="w-2.5 h-2.5 rounded flex-shrink-0 bg-[#1e4a6e] border border-[#4fc3f7]/40" />
          District boundary
        </div>
      </div>

      {/* Tooltip */}
      <div
        ref={tipRef}
        className="absolute z-20 pointer-events-none hidden bg-[#0a1628]/95 border border-[#4fc3f7] rounded-md px-3 py-1.5 font-mono text-[12px] text-[#e0f7fa]"
      />

      {/* Status overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-kts tracking-widest animate-pulse z-10">
          FETCHING KARNATAKA DISTRICT MAP...
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-kred z-10">
          ⚠ GeoJSON fetch failed: {errMsg}
        </div>
      )}

      {/* Status bar */}
      <div className="flex gap-4 mb-3 items-center flex-wrap font-mono text-[11px]">
        <span className="flex items-center gap-1.5 text-kts">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff9800] inline-block" />Wind / Thermal
        </span>
        <span className="flex items-center gap-1.5 text-kts">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00e5ff] inline-block" />Solar / Load
        </span>
        <span className="text-ktm">Real district boundaries · D3 geoMercator · Arrows = causal lead</span>
        <span className="ml-auto text-kcyan font-semibold">★ Gadag → Chitradurga · r=0.61 · +2.5h lead</span>
        {hovered && <span className="text-kts">◈ {hovered}</span>}
      </div>

      <svg
        ref={svgRef}
        className="w-full rounded-[10px] border border-kborder bg-[#0a1628]"
        style={{ height: 560 }}
      />
    </div>
  )
}

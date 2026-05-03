'use client'
import * as d3 from 'd3'
import { useEffect, useRef, useState } from 'react'
import type { Plant } from '@/lib/types'

type GonEdge = { lag_h: number; r: number }
type GonData = Record<string, Record<string, GonEdge>>
interface Props {
  plants: Plant[]
  gonData: GonData
}

export default function GONGraph({ plants, gonData }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const width = svgRef.current.clientWidth || 700
    const height = 480

    // Build nodes
    const nodes = plants.map((p) => ({
      id: p.name,
      capacity: p.capacity_mw,
      type: p.asset_type,
      x: width / 2 + Math.random() * 100 - 50,
      y: height / 2 + Math.random() * 100 - 50,
      fx: null as number | null,
      fy: null as number | null,
    }))

    // Build links — only edges with r > 0.5
    const links: { source: any; target: any; lag_h: number; r: number }[] = []
    for (const [src, targets] of Object.entries(gonData)) {
      for (const [tgt, edge] of Object.entries(targets)) {
        if (edge.r > 0.5) {
          links.push({ source: src, target: tgt, lag_h: edge.lag_h, r: edge.r })
        }
      }
    }

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    // Arrowhead marker
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#9CA3AF')

    const g = svg.append('g')

    // Zoom / pan
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.5, 3])
        .on('zoom', (e) => g.attr('transform', e.transform)) as any
    )

    // D3 force simulation
    const sim = d3
      .forceSimulation(nodes as any)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance(130)
      )
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))

    // ── EDGES ──────────────────────────────────────────────────────────────
    const linkLines = g
      .append('g')
      .selectAll<SVGLineElement, (typeof links)[0]>('line')
      .data(links)
      .join('line')
      .attr('stroke', '#9CA3AF')
      .attr('stroke-width', (d) => 1 + d.r * 3)
      .attr('opacity', (d) => d.r)
      .attr('marker-end', 'url(#arrow)')

    // Tooltip on each line
    linkLines.append('title').text(
      (d: any) =>
        `${d.source.id || d.source}→${d.target.id || d.target}: lag=${d.lag_h}h r=${d.r.toFixed(2)}`
    )

    // ── NODES ──────────────────────────────────────────────────────────────
    const node = g
      .append('g')
      .selectAll<SVGCircleElement, (typeof nodes)[0]>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d) => 8 + d.capacity / 500)
      .attr('fill', (d) => (d.type === 'solar' ? '#1D4ED8' : '#D97706'))
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (_: any, d: any) => setSelectedNode((prev) => (d.id === prev ? null : d.id)))
      .call(
        d3
          .drag<SVGCircleElement, any>()
          .on('start', (e, d) => {
            if (!e.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (e, d) => {
            d.fx = e.x
            d.fy = e.y
          })
          .on('end', (e, d) => {
            if (!e.active) sim.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )

    node.append('title').text((d: any) => `${d.id} | ${d.type} | ${d.capacity} MW`)

    // ── LABELS ─────────────────────────────────────────────────────────────
    const label = g
      .append('g')
      .selectAll<SVGTextElement, (typeof nodes)[0]>('text')
      .data(nodes)
      .join('text')
      .text((d) => d.id)
      .attr('font-size', 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#374151')
      .attr('dy', 20)
      .style('pointer-events', 'none')

    // ── TICK — uses linkLines (lines), not title elements ──────────────────
    sim.on('tick', () => {
      linkLines
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)
      label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    })

    return () => sim.stop()
  }, [plants, gonData])

  return (
    <div>
      <div className="flex gap-4 mb-3 text-sm">
        <span>
          <span className="inline-block w-3 h-3 bg-blue-700 rounded-full mr-1" />
          Solar
        </span>
        <span>
          <span className="inline-block w-3 h-3 bg-amber-500 rounded-full mr-1" />
          Wind
        </span>
        <span className="text-gray-400">
          Edge thickness = correlation strength · Arrows show lead direction
        </span>
      </div>
      <svg
        ref={svgRef}
        className="w-full border border-gray-200 rounded-lg"
        style={{ height: 480 }}
      />
      {selectedNode && (
        <p className="mt-2 text-sm text-gray-500">
          Selected: <strong>{selectedNode}</strong> — hover edges to see lag and correlation values
        </p>
      )}
    </div>
  )
}

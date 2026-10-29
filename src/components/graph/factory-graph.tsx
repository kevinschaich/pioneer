import { DataSources } from "@/components/data-sources"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useEdgesState,
  useNodesState, useReactFlow, type Node,
} from "@xyflow/react"
import ELK from "elkjs/lib/elk.bundled.js"
import { Factory, LayoutGrid, Maximize } from "lucide-react"
import { useMapUi } from "@/components/map/map-context"
import { edgeTypes, type FlowEdge } from "@/components/graph/flow-edge"
import { nodeTypes } from "@/components/graph/nodes"
import { isLiquid } from "@/lib/game"
import { usePlanner } from "@/lib/store"
import { Button } from "@kevinschaich/components"

const elk = new ELK()
const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // Wide gaps between columns leave room for the belt pills (~100px) and the curve of each belt.
  "elk.layered.spacing.nodeNodeBetweenLayers": "240",
  "elk.layered.spacing.edgeNodeBetweenLayers": "60",
  "elk.spacing.nodeNode": "48",
  "elk.spacing.edgeNode": "32",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
}

function useGraphModel() {
  const { state, plan } = usePlanner()
  return useMemo(() => {
    const at = { x: 0, y: 0 }
    const nodes: Node[] = [
      ...plan.miners.map((m) => ({ id: `miner:${m.key}`, type: "miner", position: at, data: { miner: m } })),
      ...state.parts.map((p) => ({ id: `supply:${p.id}`, type: "supply", position: at, data: { part: p } })),
      ...plan.junctions.map((j) => ({ id: j.id, type: "junction", position: at, data: { junction: j } })),
      ...plan.groups.map((g) => ({ id: g.id, type: "group", position: at, data: { group: g } })),
      ...plan.sinks.map((x) => ({ id: x.id, type: "sink", position: at, data: { sink: x } })),
      ...plan.generators.map((g) => ({ id: g.id, type: "power", position: at, data: { power: g } })),
    ]
    const ids = new Set(nodes.map((n) => n.id))
    const maxRate = Math.max(1e-9, ...plan.flows.map((f) => (isLiquid(f.item) ? f.rate / 5 : f.rate)))
    const edges: FlowEdge[] = plan.flows.filter((f) => ids.has(f.from) && ids.has(f.to)).map((f, i) => ({
      id: `${f.from}>${f.to}>${f.item}>${i}`, source: f.from, target: f.to, type: "flow",
      data: { item: f.item, rate: f.rate, weight: Math.sqrt((isLiquid(f.item) ? f.rate / 5 : f.rate) / maxRate), status: f.status, note: f.note },
    }))
    return { nodes, edges }
  }, [plan, state.parts])
}

// Where to put a card that just appeared: next to something it's connected to, so nothing else moves.
function placeNear(id: string, edges: FlowEdge[], placed: Record<string, { x: number; y: number }>, taken: Set<string>) {
  const right = edges.find((e) => e.source === id && placed[e.target])
  const left = edges.find((e) => e.target === id && placed[e.source])
  const anchor = right ? placed[right.target] : left ? placed[left.source] : null
  let p = anchor ? { x: anchor.x + (right ? -520 : 520), y: anchor.y } : { x: 0, y: Math.max(0, ...Object.values(placed).map((q) => q.y)) + 260 }
  // Step down until the spot is free.
  while (taken.has(`${Math.round(p.x / 40)},${Math.round(p.y / 40)}`)) p = { x: p.x, y: p.y + 200 }
  taken.add(`${Math.round(p.x / 40)},${Math.round(p.y / 40)}`)
  return p
}

function Graph({ onShowMap }: { onShowMap: () => void }) {
  const { runSiteSearch } = useMapUi()
  const model = useGraphModel()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const [needsLayout, setNeedsLayout] = useState(true)
  const rf = useReactFlow()

  // Keep every card where it is. Only new cards get a position (beside a neighbour); nothing re-flows.
  useEffect(() => {
    setNodes((prev) => {
      const placed = Object.fromEntries(prev.map((n) => [n.id, n.position]))
      const taken = new Set(prev.map((n) => `${Math.round(n.position.x / 40)},${Math.round(n.position.y / 40)}`))
      const old = Object.fromEntries(prev.map((n) => [n.id, n]))
      return model.nodes.map((n) => old[n.id]
        ? { ...old[n.id], data: n.data }
        : { ...n, position: prev.length ? placeNear(n.id, model.edges, placed, taken) : n.position })
    })
    setEdges(model.edges)
  }, [model, setNodes, setEdges])

  // Full automatic layout: on first load and when you press Tidy up.
  const layout = useCallback(async () => {
    const current = rf.getNodes()
    const sizes = current.map((n) => {
      const el = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(n.id)}"]`)
      // Fall back to React Flow's measurement, then a generous default, so no card is laid out as zero-sized.
      const w = el?.offsetWidth || n.measured?.width || 280
      const h = el?.offsetHeight || n.measured?.height || 200
      return { id: n.id, width: w, height: h }
    })
    if (!sizes.length) return false
    const g = await elk.layout({
      id: "root",
      layoutOptions: ELK_OPTIONS,
      children: sizes as { id: string; width: number; height: number }[],
      edges: rf.getEdges().map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    })
    const pos = Object.fromEntries((g.children || []).map((c) => [c.id, { x: c.x!, y: c.y! }]))
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos[n.id] ?? n.position })))
    setTimeout(() => rf.fitView({ padding: 0.12, duration: 300, maxZoom: 1.1 }), 50)
    return true
  }, [rf, setNodes])

  useEffect(() => {
    if (!needsLayout) return
    let tries = 0
    const t = setInterval(async () => {
      if ((await layout()) || ++tries > 40) { clearInterval(t); setNeedsLayout(false) }
    }, 50)
    return () => clearInterval(t)
  }, [needsLayout, layout])

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      colorMode="dark"
      minZoom={0.1} maxZoom={2} proOptions={{ hideAttribution: true }}
      nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null}
      className="bg-canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} className="!bg-canvas" />
      <Controls showInteractive={false} className="overflow-hidden !rounded-lg !border !shadow-sm" />
      <MiniMap pannable zoomable className="!rounded-lg !border !shadow-sm" nodeBorderRadius={8}
        nodeColor={(n) => (n.type === "miner" ? "var(--muted-foreground)" : n.type === "power" ? "oklch(0.7 0.17 160)" : n.type === "sink" ? "var(--brand)" : "var(--muted)")} />
      <Panel position="bottom-right" className="!mr-[230px] !mb-3">
        <DataSources trigger={<button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Data sources</button>} />
      </Panel>
      <Panel position="top-right" className="flex items-center gap-1.5">
        <Button size="sm" className="shadow-sm" onClick={() => { runSiteSearch(); onShowMap() }}>
          <Factory className="size-3.5" />Find build site
        </Button>
        <Button size="sm" variant="outline" className="bg-background/80 shadow-sm backdrop-blur" onClick={() => layout()}>
          <LayoutGrid className="size-3.5" />Tidy up
        </Button>
        <Button size="sm" variant="outline" className="bg-background/80 shadow-sm backdrop-blur" onClick={() => rf.fitView({ padding: 0.12, duration: 300 })}>
          <Maximize className="size-3.5" />Fit
        </Button>
      </Panel>
    </ReactFlow>
  )
}

export function FactoryGraph({ onShowMap }: { onShowMap: () => void }) {
  return (
    <ReactFlowProvider>
      <Graph onShowMap={onShowMap} />
    </ReactFlowProvider>
  )
}

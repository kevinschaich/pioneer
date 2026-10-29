import raw from "@/data/map-nodes.json"
import { fmt, itemName, unit, type Purity } from "@/lib/game"
import { nodeRate, type MapFilter, type PlannerState } from "@/lib/solver"

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
export const distLabel = (cm: number) => (cm >= 100000 ? `${(cm / 100000).toFixed(1)} km` : `${Math.round(cm / 100)} m`)

export interface WorldNode {
  id: string
  kind: "node" | "well" | "satellite" | "geyser"
  res: string
  purity: Purity
  x: number
  y: number
  z: number
  well?: string // satellites: id of their well's core
}

export const WORLD_NODES = raw as WorldNode[]
export const nodeById: Record<string, WorldNode> = Object.fromEntries(WORLD_NODES.map((n) => [n.id, n]))
export const satellitesOf: Record<string, WorldNode[]> = {}
for (const n of WORLD_NODES) if (n.well) (satellitesOf[n.well] ??= []).push(n)

// Map image covers a 750,000-unit square of the world (1 unit = 1 cm).
export const MAP_PX = 5000
const X_MIN = -324700
const Y_MIN = -375000
const SIZE = 750000
export const fromPx = (p: { x: number; y: number }) => ({ x: (p.x / MAP_PX) * SIZE + X_MIN, y: (p.y / MAP_PX) * SIZE + Y_MIN })
export const toPx = (n: { x: number; y: number }) => ({ x: ((n.x - X_MIN) / SIZE) * MAP_PX, y: ((n.y - Y_MIN) / SIZE) * MAP_PX })

export const PURITY_COLOR: Record<Purity, string> = {
  impure: "oklch(0.63 0.23 27)",
  normal: "oklch(0.78 0.18 75)",
  pure: "oklch(0.7 0.2 150)",
}

export const GEYSER = "Desc_GeothermalEnergy_C"
export const nodeLabel = (n: WorldNode) => (n.kind === "geyser" ? "Geyser" : itemName(n.res))
export const kindLabel = (n: WorldNode) =>
  ({ node: "Resource node", well: "Resource well", satellite: "Well satellite", geyser: "Geothermal" })[n.kind]

// Resources shown in the filter list, most common first within solids then fluids.
export const MAP_RESOURCES = [...new Set(WORLD_NODES.filter((n) => n.kind !== "geyser" && n.kind !== "well").map((n) => n.res))]
  .sort((a, b) => itemName(a).localeCompare(itemName(b)))

export function visible(n: WorldNode, f: MapFilter, used: Set<string>) {
  if (f.hideUsed && used.has(n.id)) return false
  // Solo: just one resource at one purity (well cores show when any of their satellites match).
  if (f.solo) {
    if (n.res !== f.solo.res || ((n.kind === "well" || n.kind === "satellite") && !f.wells)) return false
    return n.kind === "well" ? (satellitesOf[n.id] || []).some((s) => s.purity === f.solo!.purity) : n.purity === f.solo.purity
  }
  if (n.kind === "geyser") return f.geysers && f.purities.includes(n.purity)
  if ((n.kind === "well" || n.kind === "satellite") && !f.wells) return false
  if (f.hidden.includes(n.res)) return false
  // A well core has no purity of its own; show it whenever any of its satellites shows.
  if (n.kind === "well") return (satellitesOf[n.id] || []).some((s) => f.purities.includes(s.purity))
  return f.purities.includes(n.purity)
}

// Extraction rate (per min) for a world node with the planner's current miner/clock settings.
export function worldRate(s: PlannerState, n: WorldNode): number | null {
  if (n.kind === "geyser") return null
  if (n.kind === "well") return (satellitesOf[n.id] || []).reduce((a, x) => a + (worldRate(s, x) ?? 0), 0)
  return nodeRate(s, { id: "", res: n.res, purity: n.purity, count: 1, well: n.kind === "satellite" }).each
}
export function worldNodeRate(s: PlannerState, n: WorldNode) {
  const r = worldRate(s, n)
  if (r === null) return "Power only"
  if (n.kind === "well") return `${fmt(r)} ${unit(n.res)} from ${(satellitesOf[n.id] || []).length} satellites`
  return `${fmt(r)} ${unit(n.res)}`
}

export const metres = (v: number) => `${Math.round(v / 100).toLocaleString()} m`

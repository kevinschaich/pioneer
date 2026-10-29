import { RESOURCES } from "@/lib/game"
import { WORLD_NODES, dist, type WorldNode } from "@/lib/map"
import { nodeRate, type PlannerState } from "@/lib/solver"

export interface SitePick { node: WorldNode; rate: number; dist: number }
export interface SiteNeed { res: string; need: number; picks: SitePick[]; short: number }
export interface Site { x: number; y: number; cost: number; belt: number; baseDist: number; needs: SiteNeed[] }

// Water Extractors work on any lake, so water never constrains where to build.
const FREE = new Set(["Desc_Water_C"])
const MIN_SEPARATION = 60000 // 600 m between suggested sites
const MAX_SITES = 3

/**
 * Score every candidate location by the conveyor/pipe length needed to reach enough unused nodes
 * for each raw resource (nearest first), plus a pull toward the nearest node you've already extracted. Candidates start at every
 * node position, then the best few are refined with a shrinking local grid search.
 */
export function findSites(s: PlannerState, leaves: Record<string, number>): Site[] {
  const used = new Set(s.used)
  const base = WORLD_NODES.filter((n) => used.has(n.id))
  const pools = Object.entries(leaves)
    .filter(([res, need]) => RESOURCES.has(res) && !FREE.has(res) && need > 1e-9)
    .map(([res, need]) => ({
      res, need,
      nodes: WORLD_NODES
        .filter((n) => n.res === res && (n.kind === "node" || n.kind === "satellite") && !used.has(n.id))
        .map((n) => ({ n, rate: nodeRate(s, { id: "", res, purity: n.purity, count: 1, well: n.kind === "satellite" }).each })),
    }))

  const evaluate = (p: { x: number; y: number }): Site => {
    let belt = 0
    const needs = pools.map(({ res, need, nodes }) => {
      const sorted = nodes.map((x) => ({ ...x, d: dist(p, x.n) })).sort((a, b) => a.d - b.d)
      const picks: SitePick[] = []
      let got = 0
      for (const x of sorted) {
        if (got >= need - 1e-9) break
        const take = Math.min(x.rate, need - got)
        picks.push({ node: x.n, rate: take, dist: x.d })
        got += take
        belt += x.d
      }
      return { res, need, picks, short: Math.max(0, need - got) }
    })
    // Your base is everything you've already extracted; distance is to the nearest piece of it.
    const baseDist = base.length ? Math.min(...base.map((b) => dist(p, b))) : 0
    return { x: p.x, y: p.y, belt, baseDist, needs, cost: belt + s.basePull * baseDist }
  }

  if (!pools.length) return []

  const candidates = WORLD_NODES.filter((n) => n.kind !== "geyser").map((n) => ({ x: n.x, y: n.y }))
  const scored = candidates.map(evaluate).sort((a, b) => a.cost - b.cost)

  // Refine the strongest distinct candidates with coordinate descent.
  const refine = (site: Site) => {
    let best = site
    for (const step of [8000, 4000, 2000, 1000]) {
      let improved = true
      while (improved) {
        improved = false
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const c = evaluate({ x: best.x + dx * step, y: best.y + dy * step })
          if (c.cost < best.cost - 1) { best = c; improved = true }
        }
      }
    }
    return best
  }

  const out: Site[] = []
  for (const c of scored) {
    if (out.length >= MAX_SITES) break
    if (out.some((o) => dist(o, c) < MIN_SEPARATION)) continue
    const r = refine(c)
    if (!out.some((o) => dist(o, r) < MIN_SEPARATION)) out.push(r)
  }
  return out.sort((a, b) => a.cost - b.cost)
}

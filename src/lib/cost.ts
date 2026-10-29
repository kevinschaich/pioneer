import { D, extractorFor } from "@/lib/game"
import { nodeById } from "@/lib/map"
import type { PlannerState, Solution } from "@/lib/solver"

export interface BuildCost {
  buildings: [string, number][] // building class → how many, most first
  materials: [string, number][] // item → total needed to build them, most first
}

/**
 * What it takes to build the factory: every production machine (whole machines), any generators burning
 * its fuel, an extractor for each node feeding it, and a Resource Well Pressurizer for each well you're tapping.
 */
export function buildCost(s: PlannerState, sol: Solution, generators: { generator: string; count: number }[] = []): BuildCost {
  const count: Record<string, number> = {}
  const add = (m: string, n: number) => { if (n > 0) count[m] = (count[m] || 0) + n }

  for (const st of Object.values(sol.steps)) add(st.r.m, Math.ceil(st.machines - 1e-9))
  for (const g of generators) add(g.generator, g.count)

  const wells = new Set<string>()
  for (const n of s.nodes) {
    if (!sol.leaves[n.res]) continue // node for something this factory doesn't use
    add(n.well ? "Desc_FrackingExtractor_C" : extractorFor(n.res, s.miner), n.count)
    const well = n.mapId ? nodeById[n.mapId]?.well : undefined
    if (well) wells.add(well)
  }
  add("Desc_FrackingSmasher_C", wells.size)

  const materials: Record<string, number> = {}
  for (const [m, n] of Object.entries(count)) for (const [it, amt] of D.buildCost[m] ?? []) materials[it] = (materials[it] || 0) + amt * n

  const byMost = (a: [string, number], b: [string, number]) => b[1] - a[1]
  return { buildings: Object.entries(count).sort(byMost), materials: Object.entries(materials).sort(byMost) }
}

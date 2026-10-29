import {
  BELTS, MINERS, extractorFor, PIPES, PURITY, RESOURCES, defaultRecipe, isLiquid, recipeById, recipePerMin, recipesFor,
  type Purity, type Recipe,
} from "@/lib/game"

export interface NodeInput {
  id: string
  res: string
  purity: Purity
  count: number
  mapId?: string // world node this was claimed from on the map
  well?: boolean // a resource well satellite rather than a regular node
  clock?: number // a clock % you've set for this miner (0 = off); unset means the planner picks it
}
export interface MapFilter {
  hidden: string[]
  purities: Purity[]
  wells: boolean
  geysers: boolean
  hideUsed: boolean
  solo?: { res: string; purity: Purity } | null // show only one resource at one purity
}
export interface PartInput { id: string; item: string; rate: number }
// In "max" mode amount is a ratio between products; in "fixed" mode it's the target per minute;
// "equal" mode ignores it.
export interface Target {
  id: string
  item: string
  amount: number
}
export interface PlannerState {
  miner: number // 1-3
  belt: number // index into BELTS
  pipe: number // index into PIPES
  shards: number // power shards you'll spend on overclocking miners, across the whole factory
  burnFuel: boolean // send fuel products and leftover fuel byproducts to power generators
  nodes: NodeInput[]
  parts: PartInput[]
  targets: Target[]
  mode: "max" | "fixed" | "equal" // max: biggest output at the targets' ratio; equal: inputs shared evenly
  choice: Record<string, string>
  showAlts: boolean
  map: MapFilter
  used: string[] // world node ids already extracted by existing factories
  basePull: number // how strongly build-site search favours staying near the base (your extracted nodes)
}

export const DEFAULT_STATE: PlannerState = {
  miner: 2, belt: 2, pipe: 0, shards: 0, burnFuel: true,
  nodes: [
    { id: "n1", res: "Desc_OreIron_C", purity: "normal", count: 2 },
    { id: "n2", res: "Desc_OreCopper_C", purity: "normal", count: 1 },
  ],
  parts: [],
  targets: [{ id: "t1", item: "Desc_IronPlateReinforced_C", amount: 1 }],
  mode: "max",
  choice: {},
  showAlts: true,
  map: { hidden: [], purities: ["impure", "normal", "pure"], wells: true, geysers: false, hideUsed: false },
  used: [],
  basePull: 1,
}

export const capFor = (s: PlannerState, item: string) => (isLiquid(item) ? PIPES[s.pipe] : BELTS[s.belt])

// The clock a node runs at outside a plan (map and list previews): yours if set, else 100%.
export const nodeClock = (_s: PlannerState, n: NodeInput) => n.clock ?? 100

/** Power shards a machine needs for a clock: one per 50% above 100%. */
export const shardsFor = (clock: number) => Math.max(0, Math.ceil((clock - 100) / 50 - 1e-9))

export function nodeRate(s: PlannerState, n: NodeInput) {
  const oc = nodeClock(s, n) / 100
  const p = PURITY[n.purity]
  // What the extractor makes at 100% clock.
  let base: number
  if (n.well) base = 60 * p // Resource Well satellite (any fluid)
  else if (n.res === "Desc_Water_C") base = 120 // Water Extractor: no purity
  else if (n.res === "Desc_LiquidOil_C") base = 120 * p
  else if (n.res === "Desc_NitrogenGas_C") base = 60 * p // per Resource Well satellite
  else base = MINERS[s.miner - 1].rate * p
  const r = base * oc
  // `raw` is what the extractor itself reports in game; `each` is what one belt/pipe out of it carries.
  const cap = capFor(s, n.res)
  // Under 1/min over the belt is rounding, not a real bottleneck.
  return { raw: r, each: Math.min(r, cap), capped: r > cap + 1, base, cap }
}

// Extractor power at 100% clock (MW). Well satellites are powered by their Pressurizer instead.
const EXTRACTOR_MW: Record<string, number> = {
  Desc_MinerMk1_C: 5, Desc_MinerMk2_C: 15, Desc_MinerMk3_C: 45, Desc_WaterPump_C: 20, Desc_OilPump_C: 40, Desc_FrackingExtractor_C: 0,
}
const extractorOf = (s: PlannerState, n: NodeInput) => (n.well ? "Desc_FrackingExtractor_C" : extractorFor(n.res, s.miner))
/** Power for all of a node row's extractors; overclocking costs clock^1.32, so wasted clock is expensive. */
export const nodePower = (s: PlannerState, n: NodeInput) =>
  (EXTRACTOR_MW[extractorOf(s, n)] ?? 0) * (nodeClock(s, n) / 100) ** 1.321928 * n.count


export type Supply = Record<string, number>
export function supplyOf(s: PlannerState): Supply {
  const out: Supply = {}
  for (const n of s.nodes) out[n.res] = (out[n.res] || 0) + nodeRate(s, n).each * (n.count || 0)
  for (const p of s.parts) out[p.item] = (out[p.item] || 0) + (p.rate || 0)
  return out
}

export const recipeOf = (s: PlannerState, item: string) =>
  s.choice[item] && recipeById[s.choice[item]] ? s.choice[item] : defaultRecipe(item)

export interface Step { r: Recipe; item: string; machines: number }
export interface Edge { from: string; to: string; item: string; rate: number }
export interface Solution {
  leaves: Record<string, number>
  steps: Record<string, Step>
  byproducts: Record<string, number>
  edges: Edge[]
}

export interface TargetRate { id: string; item: string; rate: number }
export const outId = (targetId: string) => "out:" + targetId

export const stepId = (rid: string) => "step:" + rid
export const srcId = (item: string) => "src:" + item

// Expand every target through the chosen recipes into one shared chain, so common intermediates
// (e.g. Steel Ingot for both pipes and beams) merge into the same steps. Supplied items and raw
// resources become leaves. Byproducts the chain makes anyway (Heavy Oil Residue from Rubber, Polymer
// Resin from Fuel) are used first wherever something needs them; only the leftover goes to a sink.
export function solve(s: PlannerState, targets: TargetRate[], sup: Supply): Solution {
  // Settle once with the recipes as chosen to see which byproducts are genuinely left over; then, where you
  // haven't picked a recipe, switch an item to one that eats a leftover (Residual Fuel eating Heavy Oil
  // Residue) and settle again. Deciding once keeps the choice from flip-flopping between passes.
  const base = settle(s, targets, sup)
  const eats: Record<string, string> = {}
  for (const st of Object.values(base.steps)) {
    const item = st.item
    if (s.choice[item]) continue
    const r = (recipesFor[item] || []).find((rc) => rc.id !== st.r.id && !rc.name.startsWith("Unpackage") && (s.showAlts || !rc.alt)
      && rc.out[0][0] === item && rc.in.some(([x]) => (base.byproducts[x] || 0) > 1e-9))
    if (r) eats[item] = r.id
  }
  return Object.keys(eats).length ? settle({ ...s, choice: { ...eats, ...s.choice } }, targets, sup) : base
}

// Byproduct output depends on the chain, which depends on how much byproduct is reused, so settle it by
// repeating: each pass may use the byproducts the previous pass made.
function settle(s: PlannerState, targets: TargetRate[], sup: Supply): Solution {
  let credit: Record<string, number> = {}
  let sol = solveOnce(s, targets, sup, credit)
  for (let i = 0; i < 30; i++) {
    const next = sol.made
    if (Object.keys({ ...next, ...credit }).every((k) => Math.abs((next[k] || 0) - (credit[k] || 0)) < 1e-6)) break
    credit = next
    sol = solveOnce(s, targets, sup, credit)
  }
  return sol.sol
}

function solveOnce(s: PlannerState, targets: TargetRate[], sup: Supply, credit: Record<string, number>) {
  const sol: Solution = { leaves: {}, steps: {}, byproducts: {}, edges: [] }
  const edges: Record<string, Edge> = {}
  const addEdge = (from: string, to: string, item: string, r: number) => {
    const k = `${from}>${to}>${item}`
    ;(edges[k] ??= { from, to, item, rate: 0 }).rate += r
  }
  const left = { ...credit } // byproduct still free to use this pass
  const taken: { item: string; to: string; rate: number }[] = []
  const expand = (item: string, r: number, path: string[], to: string): string | null => {
    // Use byproduct first.
    const free = Math.min(left[item] || 0, r)
    if (free > 1e-9) {
      left[item] -= free
      taken.push({ item, to, rate: free })
      r -= free
      if (r <= 1e-9) return null
    }
    const rid = recipeOf(s, item)
    if (sup[item] !== undefined || RESOURCES.has(item) || !rid || path.includes(item)) {
      sol.leaves[item] = (sol.leaves[item] || 0) + r
      addEdge(srcId(item), to, item, r)
      return srcId(item)
    }
    const rec = recipeById[rid]
    const machines = r / recipePerMin(rec, rec.out.find((o) => o[0] === item)![1])
    const step = (sol.steps[rid] ??= { r: rec, item, machines: 0 })
    step.machines += machines
    for (const [it, amt] of rec.in) expand(it, recipePerMin(rec, amt) * machines, [...path, item], stepId(rid))
    addEdge(stepId(rid), to, item, r)
    return stepId(rid)
  }
  for (const t of targets) expand(t.item, t.rate, [], outId(t.id))

  // What every step makes on the side, who takes it, and what's left for a sink.
  const made: Record<string, number> = {}
  const makers: Record<string, { from: string; rate: number }[]> = {}
  for (const [rid, st] of Object.entries(sol.steps)) for (const [it, amt] of st.r.out) if (it !== st.item) {
    const br = recipePerMin(st.r, amt) * st.machines
    made[it] = (made[it] || 0) + br
    ;(makers[it] ??= []).push({ from: stepId(rid), rate: br })
  }
  const usedOf: Record<string, number> = {}
  for (const t of taken) {
    usedOf[t.item] = (usedOf[t.item] || 0) + t.rate
    const total = made[t.item] || t.rate
    for (const m of makers[t.item] ?? []) addEdge(m.from, t.to, t.item, (t.rate * m.rate) / total)
  }
  for (const [it, total] of Object.entries(made)) {
    const rest = total - (usedOf[it] || 0)
    if (rest <= 1e-9) continue
    sol.byproducts[it] = rest
    for (const m of makers[it]) addEdge(m.from, "bp:" + it, it, (rest * m.rate) / total)
  }
  sol.edges = Object.values(edges)
  return { sol, made }
}

export const ratioTargets = (s: PlannerState): TargetRate[] => s.targets.map((t) => ({ id: t.id, item: t.item, rate: t.amount }))

// Output is linear in rate, so solve once at the targets' ratio and scale by the tightest supplied
// input. The returned rate is that scale factor: each target makes amount × rate per minute.
export function maxRate(s: PlannerState, sup: Supply) {
  const unitSol = solve(s, ratioTargets(s), sup)
  let best = Infinity
  let limiting: string | null = null
  for (const [it, need] of Object.entries(unitSol.leaves)) {
    if (need <= 0 || sup[it] === undefined) continue
    if (sup[it] / need < best) { best = sup[it] / need; limiting = it }
  }
  const missing = Object.keys(unitSol.leaves).filter((it) => sup[it] === undefined)
  return { rate: best === Infinity ? 0 : best, limiting, missing }
}

// "Equal share": every supplied input is divided evenly between the products that use it, and each
// product makes as much as its shares allow. Leftover from a share another input limits goes unused.
export function equalShares(s: PlannerState, sup: Supply): TargetRate[] {
  const needs = s.targets.map((t) => solve(s, [{ id: t.id, item: t.item, rate: 1 }], sup).leaves)
  const users: Record<string, number> = {}
  for (const n of needs) for (const [it, r] of Object.entries(n)) if (r > 1e-12 && sup[it] !== undefined) users[it] = (users[it] || 0) + 1
  return s.targets.map((t, p) => {
    let rate = Infinity
    for (const [it, r] of Object.entries(needs[p])) {
      if (r <= 1e-12 || sup[it] === undefined) continue
      rate = Math.min(rate, sup[it] / users[it] / r)
    }
    return { id: t.id, item: t.item, rate: rate === Infinity ? 0 : rate }
  })
}

// Greedy recipe search: try each recipe for each item in the chain and keep changes that
// reduce missing inputs or raise max output. Repeats until nothing improves.
export function optimizeRecipes(s: PlannerState): Record<string, string> {
  const sup = supplyOf(s)
  const choice = { ...s.choice }
  const st = { ...s, choice }
  const score = () => { const m = maxRate(st, sup); return [-m.missing.length, m.rate] as const }
  const better = (a: readonly number[], b: readonly number[]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1] + 1e-9)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    const items = new Set([...s.targets.map((t) => t.item), ...Object.values(solve(st, ratioTargets(st), {}).steps).map((x) => x.item)])
    for (const it of items) {
      if (RESOURCES.has(it) || sup[it] !== undefined) continue
      let cur = score()
      let bestId = recipeOf(st, it)!
      for (const r of recipesFor[it] || []) {
        const prev = choice[it]
        choice[it] = r.id
        const sc = score()
        if (better(sc, cur)) { cur = sc; bestId = r.id; changed = true }
        choice[it] = prev
      }
      choice[it] = bestId
    }
    if (!changed) break
  }
  return choice
}

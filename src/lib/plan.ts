import { D, recipePerMin } from "@/lib/game"
import {
  capFor, equalShares, maxRate, nodeRate, solve, type NodeInput, type PlannerState, type Solution, type Step, type Supply, type TargetRate,
} from "@/lib/solver"

/**
 * The planner. Given your products and mode, your nodes and a power-shard budget, it decides:
 *
 * - how fast every miner runs (lowest whole-% clock that covers what's used; shards only where they add output),
 * - how many machines to build, in groups of one belt per ingredient (one manifold), each group's clock
 *   lowered so its machines take exactly what's planned,
 * - how belts connect, using only mergers (combine up to one belt) and splitters (a splitter sends overflow to
 *   whichever side still has room, so exact clocks downstream make it deliver exact amounts).
 *
 * Every flow gets a status. With automatic clocks everything is "ok"; red only appears when something you
 * set by hand (a clock, a fixed rate) can't be met or wastes energy.
 */

export type FlowStatus = "ok" | "belt" | "excess" | "starved"

export interface MinerPlan {
  key: string // graph id suffix, stable per physical miner
  row: NodeInput
  index: number // which of the row's identical miners
  res: string
  base: number // per minute at 100%
  shards: number // power shards in this miner
  clock: number // % it runs at (0 = off)
  pinned: boolean // you set the clock
  makes: number // base × clock
  delivered: number // what its belt carries onward (≤ belt, ≤ what's used)
}

export interface GroupPlan {
  id: string
  step: Step
  group: number
  groups: number
  machines: number // whole machines in this group
  clock: number // % to set all of them to
  output: number // main product per minute from this group
  want: Record<string, number> // input per minute this group needs
  got: Record<string, number> // input per minute it actually receives
}

export interface Flow { from: string; to: string; item: string; rate: number; status: FlowStatus; note?: string }
export interface Junction { id: string; kind: "merger" | "splitter"; item: string; rate: number; ins: number; outs: number }
export interface Sink {
  id: string
  kind: "out" | "bp" | "missing"
  item: string
  rate: number
  target?: TargetRate
  fromLeftover?: string // fuel made from this leftover byproduct, to burn rather than store
}

/** Generators burning a fuel the factory ends up with: how many, what to clock them at, what they make. */
export interface PowerPlan {
  id: string
  from: string // the output or byproduct card feeding them
  generator: string
  item: string
  rate: number // fuel per minute burned
  count: number
  clock: number
  mw: number
  water: number // m³/min of water they need (coal and nuclear)
}

export interface Plan {
  rates: TargetRate[]
  sol: Solution
  miners: MinerPlan[]
  groups: GroupPlan[]
  junctions: Junction[]
  sinks: Sink[]
  flows: Flow[]
  shardsUsed: number
  power: number // MW the factory uses
  generated: number // MW its generators make
  generators: PowerPlan[]
}

const MINER_MW: Record<number, number> = { 1: 5, 2: 15, 3: 45 }
const powerAt = (mw: number, clock: number) => mw * (clock / 100) ** 1.321928

// ---------- 1. how much to make ----------

function ratesFor(s: PlannerState, sup: Supply): TargetRate[] {
  if (s.mode === "equal") return equalShares(s, sup)
  if (s.mode === "fixed") return s.targets.map((t) => ({ id: t.id, item: t.item, rate: t.amount }))
  const m = maxRate(s, sup)
  return s.targets.map((t) => ({ id: t.id, item: t.item, rate: t.amount * m.rate }))
}

// How good a supply is for the current mode: more output, or (fixed rates) more of the targets covered.
function score(s: PlannerState, sup: Supply) {
  if (s.mode === "fixed") {
    const sol = solve(s, ratesFor(s, sup), sup)
    return Object.entries(sol.leaves).reduce((a, [it, need]) => a + (sup[it] === undefined ? 0 : Math.min(1, sup[it] / need)), 0)
  }
  return ratesFor(s, sup).reduce((a, r) => a + r.rate, 0)
}

// ---------- 2. miners and shards ----------

function minerList(s: PlannerState): MinerPlan[] {
  return s.nodes.flatMap((row) =>
    Array.from({ length: row.count }, (_, index) => {
      const base = nodeRate(s, { ...row, clock: 100 }).base
      const pinned = row.clock !== undefined
      return { key: `${row.id}:${index}`, row, index, res: row.res, base, shards: 0, clock: pinned ? row.clock! : 100, pinned, makes: 0, delivered: 0 }
    }))
}

// Most a miner can usefully deliver: its clock limit (100% + 50% per shard) or its belt, whichever is lower.
const capacity = (s: PlannerState, m: MinerPlan) =>
  m.pinned ? Math.min(capFor(s, m.res), (m.base * m.clock) / 100) : Math.min(capFor(s, m.res), (m.base * Math.min(250, 100 + 50 * m.shards)) / 100)

function supplyFrom(s: PlannerState, miners: MinerPlan[]): Supply {
  const sup: Supply = {}
  for (const m of miners) sup[m.res] = (sup[m.res] || 0) + capacity(s, m)
  for (const p of s.parts) sup[p.item] = (sup[p.item] || 0) + Math.min(p.rate, capFor(s, p.item))
  return sup
}

// Spend shards where they raise output most. One shard at a time, or two together when only raising two
// inputs at once helps (steel needs more iron *and* more coal). Stop when nothing helps.
function spendShards(s: PlannerState, miners: MinerPlan[]) {
  let left = Math.max(0, Math.floor(s.shards))
  let best = score(s, supplyFrom(s, miners))
  const open = () => miners.filter((m) => !m.pinned && m.shards < 3 && capacity(s, m) < capFor(s, m.res) - 1e-6)
  const tryWith = (ms: MinerPlan[]) => { ms.forEach((m) => m.shards++); const sc = score(s, supplyFrom(s, miners)); ms.forEach((m) => m.shards--); return sc }
  while (left > 0) {
    let pick: MinerPlan[] = []
    let pickGain = 0
    for (const m of open()) {
      const gain = tryWith([m]) - best
      if (gain > pickGain + 1e-6) { pickGain = gain; pick = [m] }
    }
    if (!pick.length && left >= 2) {
      const list = open()
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const gain = (tryWith([list[i], list[j]]) - best) / 2
        if (gain > pickGain + 1e-6) { pickGain = gain; pick = [list[i], list[j]] }
      }
    }
    if (!pick.length) break
    pick.forEach((m) => m.shards++)
    left -= pick.length
    best = score(s, supplyFrom(s, miners))
  }
}

// Lowest shared whole-% clock for a resource's automatic miners that covers what's still needed.
function setClocks(s: PlannerState, miners: MinerPlan[], need: Record<string, number>) {
  const byRes: Record<string, MinerPlan[]> = {}
  for (const m of miners) (byRes[m.res] ??= []).push(m)
  for (const [res, list] of Object.entries(byRes)) {
    const fixed = list.filter((m) => m.pinned)
    const auto = list.filter((m) => !m.pinned)
    const parts = s.parts.filter((p) => p.item === res).reduce((a, p) => a + Math.min(p.rate, capFor(s, res)), 0)
    let want = (need[res] || 0) - parts - fixed.reduce((a, m) => a + Math.min(capFor(s, res), (m.base * m.clock) / 100), 0)
    if (want <= 1e-6) { for (const m of auto) m.clock = 0; continue }
    const deliver = (m: MinerPlan, c: number) => Math.min(capFor(s, res), (m.base * Math.min(c, 100 + 50 * m.shards)) / 100)
    let c = 1
    while (c < 250 && auto.reduce((a, m) => a + deliver(m, c), 0) < want - 1e-6) c++
    // Each miner: the shared clock, but never past its shards or past what its belt carries.
    for (const m of auto) m.clock = Math.min(c, 100 + 50 * m.shards, Math.ceil((capFor(s, res) / m.base) * 100 - 1e-9))
    want = 0
  }
  for (const m of miners) m.makes = (m.base * m.clock) / 100
}

// ---------- 2b. fuel from leftovers ----------

const fuelEnergy = (item: string) => Math.max(0, ...Object.values(D.generators).map((g) => g.fuels[item] ?? 0))
const needsWater = (item: string) => Object.values(D.generators).some((g) => g.fuels[item] && g.water > 0)

// For each leftover byproduct that isn't a fuel: the recipe turning it, and only it, into the fuel worth the
// most energy (fuels burned without water first), as an extra hidden target.
function leftoverFuel(s: PlannerState, sol: Solution): (TargetRate & { recipe: string; from: string })[] {
  const out: (TargetRate & { recipe: string; from: string })[] = []
  for (const [item, rate] of Object.entries(sol.byproducts)) {
    if (rate < 0.5 || fuelEnergy(item) > 0) continue
    let best: { recipe: string; fuel: string; per: number; score: number } | null = null
    for (const r of D.recipes) {
      if (r.in.length !== 1 || r.in[0][0] !== item || (r.alt && !s.showAlts) || r.name.startsWith("Package")) continue
      const fuel = r.out[0][0]
      const e = fuelEnergy(fuel)
      if (!e) continue
      const per = r.out[0][1] / r.in[0][1] // fuel per unit of byproduct
      const score = per * e * (needsWater(fuel) ? 0.5 : 1)
      if (!best || score > best.score) best = { recipe: r.id, fuel, per, score }
    }
    // Respect a recipe you picked for that fuel, and leave a fuel you're already making alone (forcing its
    // recipe would change how your own product is made).
    if (best && (!s.choice[best.fuel] || s.choice[best.fuel] === best.recipe) && !s.targets.some((t) => t.item === best!.fuel)) {
      out.push({ id: `burn:${item}`, item: best.fuel, rate: rate * best.per, recipe: best.recipe, from: item })
    }
  }
  return out
}

// ---------- 3. machine groups ----------

const perMinOf = (st: Step, list: "in" | "out", item: string) => {
  const e = st.r[list].find(([it]) => it === item)
  return e ? recipePerMin(st.r, e[1]) : 0
}

// Identical groups, each on one belt per ingredient. Fewest groups that keep every belt within capacity;
// if a raw input arrives on more belts than that, one group per belt so each belt goes straight to a group.
function groupsOf(s: PlannerState, sol: Solution, beltsOf: Record<string, number>): GroupPlan[] {
  return Object.values(sol.steps).flatMap((step) => {
    if (step.machines <= 1e-9) return []
    const minGroups = Math.max(1, ...[...step.r.in, ...step.r.out].map(([it, a]) => Math.ceil((recipePerMin(step.r, a) * step.machines) / capFor(s, it) - 1e-6)))
    // Only for inputs this recipe has to itself: when several recipes share a resource, each takes its
    // own belts and splitting them further just adds groups (and splitters) for nothing.
    const onlyUser = (it: string) => Object.values(sol.steps).filter((x) => x.machines > 1e-9 && x.r.in.some(([i]) => i === it)).length === 1
    const rawBelts = Math.max(0, ...step.r.in.filter(([it]) => onlyUser(it)).map(([it]) => beltsOf[it] ?? 0))
    // Only match raw belts when every group still gets at least one machine.
    const groups = rawBelts > minGroups && rawBelts <= Math.ceil(step.machines - 1e-9) ? rawBelts : minGroups
    const machines = Math.ceil(step.machines / groups - 1e-9)
    return Array.from({ length: groups }, (_, g) => {
      const share = step.machines / groups // this group's share of the work, in machine-equivalents
      const clock = Math.min(100, Math.ceil((share / machines) * 100 - 1e-6))
      const want = Object.fromEntries(step.r.in.map(([it, a]) => [it, recipePerMin(step.r, a) * share]))
      return {
        id: `group:${step.r.id}:${g + 1}`, step, group: g + 1, groups, machines, clock,
        output: perMinOf(step, "out", step.item) * share, want, got: {},
      }
    })
  })
}

// ---------- 4. wiring ----------

interface Src { id: string; amount: number }
interface Dst { id: string; need: number }

// Hand belts to consumers biggest first, carrying any remainder on to the next consumer (a splitter).
function allocate(srcs: Src[], dsts: Dst[]): { from: string; to: string; rate: number }[] {
  const out: { from: string; to: string; rate: number }[] = []
  const left = [...srcs].sort((a, b) => b.amount - a.amount).map((x) => ({ ...x }))
  for (const d of [...dsts].sort((a, b) => b.need - a.need)) {
    let want = d.need
    for (const sx of left) {
      if (want <= 1e-6) break
      if (sx.amount <= 1e-6) continue
      const take = Math.min(sx.amount, want)
      out.push({ from: sx.id, to: d.id, rate: take })
      sx.amount -= take
      want -= take
    }
  }
  return out
}

export function plan(s: PlannerState): Plan {
  const miners = minerList(s)
  spendShards(s, miners)
  const sup = supplyFrom(s, miners)
  const rates = ratesFor(s, sup)
  let sol = solve(s, rates, sup)
  // Leftover byproducts that aren't fuels but can be turned into one on their own (Heavy Oil Residue →
  // Residual Fuel) are converted, so their energy ends up in generators instead of a sink.
  const burned = s.burnFuel ? leftoverFuel(s, sol) : []
  if (burned.length) {
    const forced = Object.fromEntries(burned.map((b) => [b.item, b.recipe]))
    sol = solve({ ...s, choice: { ...forced, ...s.choice } }, [...rates, ...burned], sup)
  }
  setClocks(s, miners, sol.leaves)
  // How many belts each raw resource arrives on (miners packed onto belts, plus incoming belts).
  const beltsOf: Record<string, number> = {}
  for (const item of Object.keys(sol.leaves)) {
    const cap = capFor(s, item)
    const loads: number[] = []
    for (const d of miners.filter((m) => m.res === item && m.clock > 0).map((m) => Math.min(m.makes, cap)).sort((a, b) => b - a)) {
      const i = loads.findIndex((l) => l + d <= cap + 1e-6)
      if (i >= 0) loads[i] += d; else loads.push(d)
    }
    beltsOf[item] = loads.length + s.parts.filter((p) => p.item === item).length
  }
  const groups = groupsOf(s, sol, beltsOf)

  const junctions: Junction[] = []
  const sinks: Sink[] = []
  const flows: Flow[] = []
  const flow = (from: string, to: string, item: string, rate: number, status: FlowStatus = "ok", note?: string) =>
    flows.push({ from, to, item, rate, status, note })

  const consumersOf = (item: string) => groups.filter((g) => g.want[item] > 1e-9)
  const producersOf = (item: string) => groups.filter((g) => perMinOf(g.step, "out", item) > 0)
  const items = new Set<string>([...Object.keys(sol.leaves), ...groups.flatMap((g) => [...g.step.r.in, ...g.step.r.out].map(([it]) => it))])

  // Route one item from its sources to its consumers, adding mergers/splitters only where belts meet or part.
  const route = (item: string, srcs: Src[], dsts: Dst[]) => {
    const links = allocate(srcs, dsts)
    // A consumer that gets nothing still needs a (red) belt drawn to it, so the shortage is visible.
    if (srcs.length) for (const d of dsts) if (!links.some((l) => l.to === d.id)) links.push({ from: srcs[0].id, to: d.id, rate: 0 })
    const outsOf = (id: string) => links.filter((l) => l.from === id)
    const insOf = (id: string) => links.filter((l) => l.to === id)
    // A source feeding several consumers goes through a splitter; a consumer fed by several belts, a merger.
    const via: Record<string, string> = {}
    for (const sx of srcs) {
      const o = outsOf(sx.id)
      if (o.length > 1) {
        const id = `split:${sx.id}`
        junctions.push({ id, kind: "splitter", item, rate: o.reduce((a, l) => a + l.rate, 0), ins: 1, outs: o.length })
        flow(sx.id, id, item, o.reduce((a, l) => a + l.rate, 0))
        via[sx.id] = id
      }
    }
    for (const d of dsts) {
      const i = insOf(d.id)
      if (i.length > 1) {
        const id = `merge:${d.id}:${item}`
        junctions.push({ id, kind: "merger", item, rate: i.reduce((a, l) => a + l.rate, 0), ins: i.length, outs: 1 })
        for (const l of i) flow(via[l.from] ?? l.from, id, item, l.rate)
        flow(id, d.id, item, i.reduce((a, l) => a + l.rate, 0))
      } else for (const l of i) flow(via[l.from] ?? l.from, d.id, item, l.rate)
    }
    return links
  }

  // Raw resources: miners (merged onto belts where several fit) and incoming belts → machine groups.
  for (const item of items) {
    if (!(item in sol.leaves)) continue
    const cons = consumersOf(item)
    const cap = capFor(s, item)
    const ms = miners.filter((m) => m.res === item && m.clock > 0)
    // What each miner sends: what it makes, at most a belt.
    for (const m of ms) m.delivered = Math.min(m.makes, cap)
    // Pack miners onto belts (largest first), each belt at most one belt's worth.
    const belts: { id: string; amount: number; miners: MinerPlan[] }[] = []
    for (const m of [...ms].sort((a, b) => b.delivered - a.delivered)) {
      const b = belts.find((x) => x.amount + m.delivered <= cap + 1e-6)
      if (b) { b.miners.push(m); b.amount += m.delivered } else belts.push({ id: "", amount: m.delivered, miners: [m] })
    }
    belts.forEach((b, i) => {
      if (b.miners.length > 1) {
        b.id = `merge:raw:${item}:${i}`
        junctions.push({ id: b.id, kind: "merger", item, rate: b.amount, ins: b.miners.length, outs: 1 })
        for (const m of b.miners) flow(`miner:${m.key}`, b.id, item, m.delivered)
      } else b.id = `miner:${b.miners[0].key}`
    })
    const parts = s.parts.filter((p) => p.item === item).map((p) => ({ id: `supply:${p.id}`, amount: Math.min(p.rate, cap) }))
    const srcs = [...belts.map((b) => ({ id: b.id, amount: b.amount })), ...parts]
    const supplyTotal = srcs.reduce((a, x) => a + x.amount, 0)
    const needTotal = cons.reduce((a, g) => a + g.want[item], 0)
    if (!srcs.length && cons.length) {
      sinks.push({ id: `missing:${item}`, kind: "missing", item, rate: 0 })
      for (const g of cons) flow(`missing:${item}`, g.id, item, 0, "starved", `Nothing supplies ${item}`)
      continue
    }
    const links = route(item, srcs, cons.map((g) => ({ id: g.id, need: g.want[item] })))
    for (const g of cons) g.got[item] = links.filter((l) => l.to === g.id).reduce((a, l) => a + l.rate, 0)
    // Miners slow down evenly when not all their output is used.
    const used = Math.min(supplyTotal, needTotal)
    for (const m of ms) m.delivered = supplyTotal ? (m.delivered * used) / supplyTotal : 0
    // Re-point raw flows and mergers at what's actually used.
    for (const f of flows) if (f.item === item && f.from.startsWith("miner:")) {
      const m = ms.find((x) => `miner:${x.key}` === f.from)
      if (m) f.rate = m.delivered
    }
    for (const b of belts) if (b.miners.length > 1) {
      const j = junctions.find((x) => x.id === b.id)
      if (j) j.rate = b.miners.reduce((a, m) => a + m.delivered, 0)
    }
  }

  // Products made by one group and used by another: one output belt per group, routed the same way.
  for (const item of items) {
    if (item in sol.leaves) continue
    const prods = producersOf(item)
    const cons = consumersOf(item)
    if (!prods.length || !cons.length) continue
    const srcs = prods.map((g) => ({ id: g.id, amount: perMinOf(g.step, "out", item) * (g.output / perMinOf(g.step, "out", g.step.item)) }))
    const dsts = cons.map((g) => ({ id: g.id, need: g.want[item] }))
    // A byproduct only partly used: the rest overflows to a sink, or it would back up the machines making it.
    const spare = srcs.reduce((a, x) => a + x.amount, 0) - dsts.reduce((a, d) => a + d.need, 0)
    if (spare > 0.5 && prods.some((g) => g.step.item !== item)) {
      sinks.push({ id: `bp:${item}`, kind: "bp", item, rate: spare })
      dsts.push({ id: `bp:${item}`, need: spare })
    }
    const links = route(item, srcs, dsts)
    for (const g of cons) g.got[item] = links.filter((l) => l.to === g.id).reduce((a, l) => a + l.rate, 0)
  }

  // Final products to storage (fuel made from leftovers goes on to generators), byproducts to a sink.
  const allTargets = [...rates, ...burned]
  for (const t of allTargets) {
    const from = burned.find((b) => b.id === t.id)?.from
    sinks.push({ id: `out:${t.id}`, kind: "out", item: t.item, rate: 0, target: t, fromLeftover: from })
    // Several targets of the same item share its output in proportion to what each asked for.
    const sameItem = allTargets.filter((x) => x.item === t.item).reduce((a, x) => a + x.rate, 0)
    const share = sameItem ? t.rate / sameItem : 1
    for (const g of producersOf(t.item)) {
      const made = perMinOf(g.step, "out", t.item) * (g.output / perMinOf(g.step, "out", g.step.item))
      const onward = consumersOf(t.item).length ? 0 : made * share
      if (onward > 1e-9) { flow(g.id, `out:${t.id}`, t.item, onward); sinks[sinks.length - 1].rate += onward }
    }
  }
  for (const g of groups) for (const [it] of g.step.r.out) {
    if (it === g.step.item || consumersOf(it).length) continue
    const rate = perMinOf(g.step, "out", it) * (g.output / perMinOf(g.step, "out", g.step.item))
    let bp = sinks.find((x) => x.id === `bp:${it}`)
    if (!bp) { bp = { id: `bp:${it}`, kind: "bp", item: it, rate: 0 }; sinks.push(bp) }
    bp.rate += rate
    flow(g.id, bp.id, it, rate)
  }

  // ---- statuses ----
  for (const m of miners) {
    const cap = capFor(s, m.res)
    const id = `miner:${m.key}`
    // Clocks are whole percents, so a miner can overshoot by up to 1% of its rate; that's not waste.
    const slack = m.base * 0.01 + 0.5
    for (const f of flows.filter((x) => x.from === id)) {
      if (m.makes > cap + slack) { f.status = "belt"; f.note = `Mines ${Math.round(m.makes)}, belt carries ${cap}` }
      else if (m.makes > m.delivered + slack) { f.status = "excess"; f.note = `Mines ${Math.round(m.makes)}, factory uses ${Math.round(m.delivered)}` }
    }
  }
  for (const g of groups) for (const [it] of g.step.r.in) {
    if ((g.got[it] ?? 0) < g.want[it] - 0.5) {
      for (const f of flows.filter((x) => x.to === g.id && x.item === it || x.to === `merge:${g.id}:${it}`)) {
        f.status = "starved"; f.note = `Machines want ${Math.round(g.want[it])}, getting ${Math.round(g.got[it] ?? 0)}`
      }
    }
  }

  // Burn fuels the factory ends up with: products, and byproducts nothing else uses.
  const generators: PowerPlan[] = []
  if (s.burnFuel) for (const sink of sinks) {
    if ((sink.kind !== "out" && sink.kind !== "bp") || sink.rate <= 1e-6) continue
    const found = Object.entries(D.generators).find(([, g]) => g.fuels[sink.item])
    if (!found) continue
    const [generator, g] = found
    const energy = g.fuels[sink.item] // MJ per item (or per m³)
    const burn = (g.mw * 60) / energy // fuel per minute one generator burns at 100%
    const count = Math.ceil(sink.rate / burn - 1e-9)
    const mw = (sink.rate * energy) / 60
    const id = `power:${sink.id}`
    generators.push({
      id, from: sink.id, generator, item: sink.item, rate: sink.rate, count,
      clock: Math.min(100, Math.ceil((sink.rate / (count * burn)) * 100 - 1e-6)), mw, water: mw * g.water * 0.06,
    })
    flow(sink.id, id, sink.item, sink.rate)
  }

  const shardsUsed = miners.reduce((a, m) => a + (m.clock > 100 ? Math.ceil((m.clock - 100) / 50) : 0), 0)
  const power = groups.reduce((a, g) => a + g.machines * powerAt(g.step.r.power, g.clock), 0)
    + miners.filter((m) => !m.row.well && m.res !== "Desc_Water_C" && m.res !== "Desc_LiquidOil_C").reduce((a, m) => a + powerAt(MINER_MW[s.miner], m.clock), 0)
  const generated = generators.reduce((a, g) => a + g.mw, 0)
  return { rates, sol, miners, groups, junctions, sinks, flows, shardsUsed, power, generated, generators }
}

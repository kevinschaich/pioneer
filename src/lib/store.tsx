import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { DEFAULT_STATE, maxRate, supplyOf, type PlannerState } from "@/lib/solver"
import { plan } from "@/lib/plan"

const KEY = "sf-planner-v2"

function load(): PlannerState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null")
    if (!s) return DEFAULT_STATE
    // Older saves had a single target and a nullable rate.
    if (!s.targets && s.target) {
      s.targets = [{ id: "t1", item: s.target, amount: s.rate ?? 1 }]
      s.mode = s.rate == null ? "max" : "fixed"
    }
    delete s.target
    delete s.rate
    // Saves from before recommended clocks had hand-set per-node clocks; let the planner pick them now.
    if (s.shards === undefined && Array.isArray(s.nodes)) s.nodes = s.nodes.map(({ clock: _, ...n }: { clock?: number }) => n)
    delete s.maxClock
    delete s.clock
    delete s.splitLines
    return { ...DEFAULT_STATE, ...s, map: { ...DEFAULT_STATE.map, ...s.map } }
  } catch {
    return DEFAULT_STATE
  }
}

function usePlannerState() {
  const [state, setState] = useState<PlannerState>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage unavailable */ }
  }, [state])

  const derived = useMemo(() => {
    // Everything the app shows comes from one plan: rates, machines, clocks, wiring and statuses.
    const p = plan(state)
    const sup = supplyOf(state)
    const max = maxRate(state, sup)
    const perUnit = false
    const buildings = p.groups.reduce((a, g) => a + g.machines, 0)
    return { sup, max, perUnit, rates: p.rates, sol: p.sol, power: p.power, buildings, plan: p }
  }, [state])

  const update = (patch: Partial<PlannerState> | ((s: PlannerState) => Partial<PlannerState>)) =>
    setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }))

  return { state, update, ...derived }
}

type Planner = ReturnType<typeof usePlannerState>
const Ctx = createContext<Planner | null>(null)

export function PlannerProvider({ children }: { children: ReactNode }) {
  const p = usePlannerState()
  return <Ctx.Provider value={p}>{children}</Ctx.Provider>
}

export function usePlanner() {
  const p = useContext(Ctx)
  if (!p) throw new Error("usePlanner must be used inside PlannerProvider")
  return p
}

export const newId = () => Math.random().toString(36).slice(2, 9)

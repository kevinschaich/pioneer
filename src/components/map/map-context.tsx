import { createContext, useContext, useState, type ReactNode } from "react"
import { WORLD_NODES, nodeById, satellitesOf, type WorldNode } from "@/lib/map"
import { findSites, type Site } from "@/lib/site"
import { newId, usePlanner } from "@/lib/store"

// A well counts as a group: acting on it acts on all of its satellites.
const membersOf = (n: WorldNode) => (n.kind === "well" ? satellitesOf[n.id] || [] : [n])

// Selection, focus, base placement and build-site results are shared by the map, its sidebar and the graph.
function useMapUiState() {
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id?: string; x?: number; y?: number; t: number } | null>(null)
  // "extract" mode turns a click on a node into a quick toggle of its extracted state.
  const [clickMode, setClickMode] = useState<"inspect" | "extract">("inspect")
  const [sites, setSites] = useState<{ targets: string[]; list: Site[]; active: number } | null>(null)
  const { state, update, sol } = usePlanner()

  const claimedIds = new Set(state.nodes.map((n) => n.mapId).filter(Boolean) as string[])
  const usedIds = new Set(state.used)
  const isClaimed = (n: WorldNode) => membersOf(n).some((m) => claimedIds.has(m.id))
  const isUsed = (n: WorldNode) => { const m = membersOf(n); return m.length > 0 && m.every((x) => usedIds.has(x.id)) }

  // Claiming adds the node to the planner's inputs; unclaiming removes it.
  const setClaim = (targets: WorldNode[], claim: boolean) =>
    update((s) => ({
      nodes: claim
        ? [...s.nodes, ...targets.filter((t) => !claimedIds.has(t.id)).map((t) => ({
          id: newId(), res: t.res, purity: t.purity, count: 1, mapId: t.id, well: t.kind === "satellite",
        }))]
        : s.nodes.filter((x) => !targets.some((t) => t.id === x.mapId)),
    }))
  const toggleClaim = (n: WorldNode) => setClaim(membersOf(n), !isClaimed(n))

  const toggleUsed = (n: WorldNode) => {
    const ids = membersOf(n).map((m) => m.id)
    const mark = !isUsed(n)
    update((s) => ({ used: mark ? [...new Set([...s.used, ...ids])] : s.used.filter((id) => !ids.includes(id)) }))
  }

  const focusOn = (id: string) => { setSelected(id); setFocus({ id, t: Date.now() }) }
  const focusAt = (p: { x: number; y: number }) => setFocus({ ...p, t: Date.now() })

  const runSiteSearch = () => {
    const list = findSites(state, sol.leaves)
    setSites({ targets: [...new Set(state.targets.map((t) => t.item))], list, active: 0 })
    setSelected(null)
    if (list[0]) focusAt(list[0])
    return list
  }
  const showSite = (i: number) => {
    if (!sites?.list[i]) return
    setSites({ ...sites, active: i })
    focusAt(sites.list[i])
  }

  const markUsed = (targets: WorldNode[]) => update((s) => ({ used: [...new Set([...s.used, ...targets.map((t) => t.id)])] }))
  const claimed = WORLD_NODES.filter((n) => n.kind !== "well" && claimedIds.has(n.id))
  const usedCount = state.used.length

  return {
    selected, setSelected, focus, focusOn, focusAt, isClaimed, toggleClaim, setClaim, isUsed, toggleUsed, markUsed, claimed, usedCount,
    clickMode, setClickMode, sites, setSites, runSiteSearch, showSite,
    selectedNode: selected ? nodeById[selected] : null,
  }
}

type MapUi = ReturnType<typeof useMapUiState>
const Ctx = createContext<MapUi | null>(null)

export function MapUiProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useMapUiState()}>{children}</Ctx.Provider>
}

export function useMapUi() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useMapUi must be used inside MapUiProvider")
  return v
}

import { useEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Sidebar, type View } from "@/components/sidebar"
import { MapUiProvider } from "@/components/map/map-context"
import { ResourceMap } from "@/components/map/resource-map"
import { FactoryGraph } from "@/components/graph/factory-graph"
import { PlannerProvider } from "@/lib/store"

export default function App() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("sf-theme") !== "light" } catch { return true }
  })
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem("sf-view")
      return v === "map" ? "map" : "planner"
    } catch { return "planner" }
  })
  useEffect(() => { try { localStorage.setItem("sf-view", view) } catch { /* storage unavailable */ } }, [view])
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try { localStorage.setItem("sf-theme", dark ? "dark" : "light") } catch { /* storage unavailable */ }
  }, [dark])

  return (
    <PlannerProvider>
      <MapUiProvider>
        <TooltipProvider delayDuration={200}>
          <div className="flex h-dvh w-full overflow-hidden">
            <Sidebar dark={dark} onToggleDark={() => setDark((d) => !d)} view={view} onView={setView} />
            <main className="relative min-w-0 flex-1">
              {view === "map" ? <ResourceMap onShowPlanner={() => setView("planner")} />
                : <FactoryGraph dark={dark} onShowMap={() => setView("map")} />}
            </main>
          </div>
        </TooltipProvider>
      </MapUiProvider>
    </PlannerProvider>
  )
}

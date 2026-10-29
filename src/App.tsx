import { useEffect, useState } from "react"
import { Sidebar, type View } from "@/components/sidebar"
import { MapUiProvider } from "@/components/map/map-context"
import { ResourceMap } from "@/components/map/resource-map"
import { FactoryGraph } from "@/components/graph/factory-graph"
import { PlannerProvider } from "@/lib/store"
import { TooltipProvider } from "@kevinschaich/components"

export default function App() {
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem("sf-view")
      return v === "map" ? "map" : "planner"
    } catch { return "planner" }
  })
  useEffect(() => { try { localStorage.setItem("sf-view", view) } catch { /* storage unavailable */ } }, [view])

  return (
    <PlannerProvider>
      <MapUiProvider>
        <TooltipProvider delay={200}>
          <div className="flex h-dvh w-full overflow-hidden">
            <Sidebar view={view} onView={setView} />
            <main className="relative min-w-0 flex-1">
              {view === "map" ? <ResourceMap onShowPlanner={() => setView("planner")} />
                : <FactoryGraph onShowMap={() => setView("map")} />}
            </main>
          </div>
        </TooltipProvider>
      </MapUiProvider>
    </PlannerProvider>
  )
}

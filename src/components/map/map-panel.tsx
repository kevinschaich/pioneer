import { CircleCheck, Eye, EyeOff, Factory, MousePointer2, RotateCcw, X } from "lucide-react"
import { Icon, ItemIcon } from "@/components/item-picker"
import { MinerControls, Section } from "@/components/sidebar"
import { useMapUi } from "@/components/map/map-context"
import { GEYSER_ICON } from "@/components/map/resource-map"
import { PURITY, itemName, machineIcon, type Purity } from "@/lib/game"
import { MAP_RESOURCES, PURITY_COLOR, WORLD_NODES, distLabel, metres, nodeById, nodeLabel, worldNodeRate } from "@/lib/map"
import type { MapFilter } from "@/lib/solver"
import { usePlanner } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button, Label, ScrollArea, Tabs, TabsList, TabsTrigger, Separator, Slider, Switch, ToggleGroup, ToggleGroupItem } from "@kevinschaich/components"

const PURITIES = Object.keys(PURITY) as Purity[]

export function MapPanel() {
  const { state, update } = usePlanner()
  const { focusOn, toggleClaim, claimed, usedCount, clickMode, setClickMode, runSiteSearch, sites } = useMapUi()
  const f = state.map
  const setMap = (patch: Partial<MapFilter>) => update((s) => ({ map: { ...s.map, ...patch } }))

  return (
    <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
      <Section title="My base">
        <p className="text-[11px] text-muted-foreground">
          Your base is every node you've marked extracted. Shortcuts on any node: ⌘-click or right-click marks it extracted, Ctrl-click adds it to the planner.
        </p>
        <Tabs value={clickMode}
          onValueChange={(v) => setClickMode(v as "inspect" | "extract")}><TabsList className="w-full">
          <TabsTrigger value="inspect" className="flex-1 gap-1.5 text-xs"><MousePointer2 className="size-3.5" />Inspect</TabsTrigger>
          <TabsTrigger value="extract" className="flex-1 gap-1.5 text-xs data-active:text-emerald-500"><CircleCheck className="size-3.5" />Mark extracted</TabsTrigger>
        </TabsList></Tabs>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-card/50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Extracted nodes</div>
            <div className="text-base font-semibold tabular-nums">{usedCount}</div>
          </div>
          <div className="rounded-lg border bg-card/50 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Resources</div>
            <div className="flex h-6 items-center gap-0.5">
              {[...new Set(state.used.map((id) => nodeById[id]?.res).filter(Boolean))].slice(0, 7).map((r) => <ItemIcon key={r} id={r} size={18} />)}
              {usedCount === 0 && <span className="text-base font-semibold">—</span>}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label className="text-xs">Build sites stay near base</Label>
            <span className="text-muted-foreground">{["Ignore", "Light", "Normal", "Strong", "Very strong"][Math.round(state.basePull * 2)]}</span>
          </div>
          <Slider min={0} max={2} step={0.5} value={[state.basePull]} disabled={!usedCount} onValueChange={(v) => update({ basePull: typeof v === "number" ? v : v[0] })} />
        </div>
      </Section>

      <Separator />
      <Section title="Build site">
        <Button className="w-full" onClick={() => runSiteSearch()}>
          <Factory className="size-4" />Find best spot for {state.targets.length > 1 ? `${state.targets.length} products` : itemName(state.targets[0]?.item ?? "")}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Picks the spot with the shortest belt and pipe runs to enough unextracted nodes, pulled toward your base. Water is assumed available from any lake.
        </p>
        {sites?.list[sites.active] && (
          <div className="text-[11px] text-muted-foreground">Showing {sites.targets.map(itemName).join(" + ")} · {distLabel(sites.list[sites.active].belt)} of runs</div>
        )}
      </Section>

      <Separator />
      <Section title="Extraction">
        <MinerControls />
      </Section>

      <Separator />
      <Section title="Purity">
        <ToggleGroup multiple variant="outline" className="w-full" value={f.purities}
          onValueChange={(v) => setMap({ purities: v as Purity[] })}>
          {PURITIES.map((p) => (
            <ToggleGroupItem key={p} value={p} className="flex-1 gap-1.5 text-xs capitalize">
              <span className="size-2 rounded-full" style={{ background: PURITY_COLOR[p] }} />{p}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="wells" className="flex items-center gap-2 text-xs font-normal">
              <Icon src={machineIcon("Desc_FrackingSmasher_C")} size={18} />Resource wells
              <span className="text-muted-foreground tabular-nums">{WORLD_NODES.filter((n) => n.kind === "well").length}</span>
            </Label>
            <Switch id="wells" checked={f.wells} onCheckedChange={(wells) => setMap({ wells })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="geysers" className="flex items-center gap-2 text-xs font-normal">
              <Icon src={GEYSER_ICON} size={18} />Geysers
            </Label>
            <Switch id="geysers" checked={f.geysers} onCheckedChange={(geysers) => setMap({ geysers })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="hideUsed" className="text-xs font-normal">Hide extracted nodes</Label>
            <Switch id="hideUsed" checked={f.hideUsed} onCheckedChange={(hideUsed) => setMap({ hideUsed })} />
          </div>
        </div>
      </Section>

      <Separator />
      <Section title="Resources" action={
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setMap({ hidden: [], solo: null })}>All</Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setMap({ hidden: [...MAP_RESOURCES], solo: null })}>None</Button>
        </div>
      }>
        {f.solo ? (
          <div className="flex items-center gap-2 rounded-lg border bg-accent/50 px-2.5 py-1.5 text-xs">
            <span className="size-2 rounded-full" style={{ background: PURITY_COLOR[f.solo.purity] }} />
            <ItemIcon id={f.solo.res} size={18} />
            <span className="flex-1">Only <span className="font-medium capitalize">{f.solo.purity}</span> {itemName(f.solo.res)}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setMap({ solo: null })}>Show all</Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Click a coloured dot to show only that purity of that resource.</p>
        )}
        <div className="-mx-2 space-y-0.5">
          {MAP_RESOURCES.map((res) => {
            const on = !f.hidden.includes(res)
            const nodes = WORLD_NODES.filter((n) => n.res === res && n.kind !== "well")
            const by = (p: Purity) => nodes.filter((n) => n.purity === p).length
            const soloHere = f.solo?.res === res
            const toggle = () => setMap({ hidden: on ? [...f.hidden, res] : f.hidden.filter((x) => x !== res), solo: null })
            return (
              <div key={res}
                className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  (f.solo ? !soloHere : !on) && "opacity-45", soloHere && "bg-accent")}>
                <button type="button" onClick={toggle} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <ItemIcon id={res} size={22} />
                  <span className="flex-1 truncate">{itemName(res)}</span>
                </button>
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {PURITIES.map((p) => {
                    const active = soloHere && f.solo!.purity === p
                    return (
                      <button key={p} type="button" disabled={!by(p)}
                        title={active ? "Show everything again" : `Show only ${p} ${itemName(res)}`}
                        onClick={() => setMap({ solo: active ? null : { res, purity: p } })}
                        className={cn("flex w-7 items-center justify-center gap-1 rounded py-0.5 transition-colors enabled:hover:bg-background disabled:opacity-40",
                          active && "bg-background font-semibold text-foreground ring-1 ring-border")}>
                        <span className="size-2 rounded-full" style={{ background: PURITY_COLOR[p] }} />{by(p)}
                      </button>
                    )
                  })}
                </span>
                <button type="button" onClick={toggle} aria-label={on ? "Hide" : "Show"}>
                  {on ? <Eye className="size-3.5 text-muted-foreground" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
                </button>
              </div>
            )
          })}
        </div>
      </Section>

      <Separator />
      <Section title={`Extracted nodes · ${usedCount}`} action={usedCount > 0 && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => update({ used: [] })}><RotateCcw className="size-3" />Clear</Button>
      )}>
        {usedCount === 0 ? (
          <p className="text-xs text-muted-foreground">Nodes your factories already use. Saved in this browser.</p>
        ) : (
          <div className="-mx-2 space-y-0.5">
            {state.used.map((id) => nodeById[id]).filter(Boolean).map((n) => (
              <button key={n.id} type="button" onClick={() => focusOn(n.id)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left hover:bg-accent">
                <ItemIcon id={n.res} size={18} />
                <span className="flex-1 truncate text-xs">{nodeLabel(n)}</span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground capitalize">
                  <span className="size-1.5 rounded-full" style={{ background: PURITY_COLOR[n.purity] }} />{n.kind === "satellite" ? "well" : n.purity}
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Separator />
      <Section title={`Planned inputs · ${claimed.length}`}>
        {claimed.length === 0 ? (
          <p className="text-xs text-muted-foreground">Click a node on the map and choose "Use in planner" to add it to your inputs.</p>
        ) : (
          <div className="-mx-2 space-y-0.5">
            {claimed.map((n) => (
              <div key={n.id} className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => focusOn(n.id)}>
                  <ItemIcon id={n.res} size={20} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{nodeLabel(n)}</span>
                    <span className="block text-[11px] text-muted-foreground capitalize tabular-nums">
                      {n.kind === "satellite" ? "well · " : ""}{n.purity} · {worldNodeRate(state, n)}
                    </span>
                  </span>
                </button>
                <Button variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100" aria-label="Remove" onClick={() => toggleClaim(n)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </ScrollArea>
  )
}

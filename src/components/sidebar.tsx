import { useMemo, type ReactNode } from "react"
import { AlertTriangle, Map as MapIcon, Workflow, Plus, RotateCcw, Sparkles, X } from "lucide-react"
import { Icon, ItemIcon, ItemPicker } from "@/components/item-picker"
import { MapPanel } from "@/components/map/map-panel"
import {
  BELTS, D, MINERS, PIPES, PURITY, allItems, fmt, isLiquid, itemName, machineIcon, producibleItems, resourceItems, unit,
  type Purity,
} from "@/lib/game"
import { nodeRate, optimizeRecipes } from "@/lib/solver"
import { buildCost } from "@/lib/cost"
import { newId, usePlanner } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button, Byline, Input, Label, ScrollArea, Tabs, TabsList, TabsTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Slider, Switch, Tooltip, TooltipContent, TooltipTrigger } from "@kevinschaich/components"

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 px-4 py-4">
      <div className="flex h-5 items-center justify-between">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

// Common multi-product builds; amounts are ratios between the products.
const PRESETS: { name: string; items: [string, number][] }[] = [
  { name: "Steel base", items: [["Desc_SteelPipe_C", 1], ["Desc_SteelPlate_C", 1]] },
  { name: "Starter parts", items: [["Desc_IronPlate_C", 2], ["Desc_IronRod_C", 1], ["Desc_IronScrew_C", 4]] },
  { name: "Wiring", items: [["Desc_Wire_C", 2], ["Desc_Cable_C", 1]] },
  { name: "Construction", items: [["Desc_Cement_C", 2], ["Desc_IronPlateReinforced_C", 1], ["Desc_ModularFrame_C", 1]] },
  { name: "Electronics", items: [["Desc_CircuitBoard_C", 1], ["Desc_Computer_C", 1], ["Desc_HighSpeedConnector_C", 1]] },
]

function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card/50 px-3 py-2", className?.includes("col-span") && "col-span-2")}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("truncate text-base font-semibold tabular-nums", className)}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

export type View = "planner" | "map"

// Miner tier and clock speed (the only thing that gets clocked); shared by the planner and map sidebars.
export function MinerControls() {
  const { state: s, update, plan } = usePlanner()
  return (
    <>
            <div className="space-y-1.5">
              <Label className="text-xs">Miner</Label>
              <Tabs value={String(s.miner)}
                onValueChange={(v) => update({ miner: +v })}><TabsList className="w-full">
                {MINERS.map((m) => (
                  <TabsTrigger key={m.tier} value={String(m.tier)} className="flex-1 gap-1.5 text-xs">
                    <Icon src={machineIcon(m.id)} size={18} />Mk.{m.tier}
                  </TabsTrigger>
                ))}
              </TabsList></Tabs>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="shards" className="text-xs">Power shards</Label>
                <div className="text-[11px] text-muted-foreground">For the whole factory; spent on miners where they add the most.</div>
                {plan && <div className={cn("text-[11px]", plan.shardsUsed > s.shards ? "text-destructive" : "text-muted-foreground")}>
                  Using {plan.shardsUsed} of {s.shards}{plan.shardsUsed > s.shards ? " (clocks you set need more)" : ""}
                </div>}
              </div>
              <Input id="shards" type="number" min={0} step={1} value={s.shards} className="h-8 w-16 text-center tabular-nums"
                onChange={(e) => update({ shards: Math.max(0, Math.floor(+e.target.value) || 0) })} />
            </div>
    </>
  )
}

export function Sidebar({ view, onView }: {
  view: View; onView: (v: View) => void
}) {
  const { state: s, update, sup, max, perUnit, rates, sol, power, buildings, plan } = usePlanner()
  // The clock the plan runs each row's first miner at.
  const clockOf = (id: string) => plan.miners.find((m) => m.row.id === id)?.clock ?? 0
  const cost = useMemo(() => buildCost(s, sol, plan.generators), [s, sol, plan.generators])
  const setTarget = (id: string, patch: object) => update((st) => ({ targets: st.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))

  const setNode = (id: string, patch: object) => update((st) => ({ nodes: st.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
  const setPart = (id: string, patch: object) => update((st) => ({ parts: st.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-r bg-background">
      <header className="flex h-14 items-center gap-2.5 border-b px-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-brand/15">
          <Icon src={machineIcon("Desc_AssemblerMk1_C")} size={22} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-semibold">Pioneer</div>
          <div className="text-[11px] text-muted-foreground">Update 1.0 · all recipes & alternates</div>
        </div>
      </header>
      <div className="border-b px-4 py-2.5">
        <Tabs value={view} onValueChange={(v) => onView(v as View)}><TabsList className="w-full">
          <TabsTrigger value="planner"><Workflow className="size-3.5" />Planner</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="size-3.5" />Map</TabsTrigger>
        </TabsList></Tabs>
      </div>

      {view === "map" ? <MapPanel /> : <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <Section title="Produce" action={
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => update((st) => ({ targets: [...st.targets, { id: newId(), item: "Desc_IronPlate_C", amount: st.mode === "max" ? 1 : 30 }] }))}>
            <Plus className="size-3.5" />Add
          </Button>
        }>
          <Tabs value={s.mode}
            onValueChange={(v) => update((st) => ({
              mode: v as "max" | "fixed" | "equal",
              // Carry the current rates over so switching modes doesn't jump.
              targets: st.targets.map((t) => {
                const r = rates.find((x) => x.id === t.id)?.rate ?? t.amount
                return { ...t, amount: v === "fixed" ? +fmt(r) || 1 : 1 }
              }),
            }))}><TabsList className="w-full">
            <TabsTrigger value="max" className="flex-1 px-1 text-xs">Max ratio</TabsTrigger>
            <TabsTrigger value="fixed" className="flex-1 px-1 text-xs">Fixed rates</TabsTrigger>
            <TabsTrigger value="equal" className="flex-1 px-1 text-xs">Equal share</TabsTrigger>
          </TabsList></Tabs>
          <p className="text-[11px] text-muted-foreground">
            {s.mode === "max" ? "As much as your inputs allow, keeping the products at the ratio you set."
              : s.mode === "fixed" ? "Exactly the rates you set."
              : "Each input is split evenly between the products that use it; each product makes what its share allows."}
          </p>
          <div className="space-y-2">
            {s.targets.map((t) => {
              const r = rates.find((x) => x.id === t.id)?.rate ?? 0
              return (
                <div key={t.id} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <ItemPicker value={t.item} items={producibleItems} className="min-w-0 flex-1"
                      onChange={(item) => setTarget(t.id, { item })} />
                    {s.mode !== "equal" && <div className="relative">
                      <Input type="number" min={0} step="any" value={t.amount} aria-label={s.mode === "max" ? "Ratio" : "Rate"}
                        className={cn("h-9 pr-10 text-xs tabular-nums", s.mode === "max" ? "w-20" : "w-24")}
                        onChange={(e) => setTarget(t.id, { amount: Math.max(0, +e.target.value) })} />
                      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground">
                        {s.mode === "max" ? "ratio" : unit(t.item)}
                      </span>
                    </div>}
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="Remove product"
                      disabled={s.targets.length < 2}
                      onClick={() => update((st) => ({ targets: st.targets.filter((x) => x.id !== t.id) }))}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  {s.mode !== "fixed" && (
                    <div className="pl-1 text-[11px] text-muted-foreground tabular-nums">
                      {perUnit ? "Needs inputs · showing" : "Makes"} <span className="font-medium text-brand">{fmt(r)} {unit(t.item)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Select value="" onValueChange={(name) => {
            const p = PRESETS.find((x) => x.name === name)
            if (p) update({ targets: p.items.map(([item, amount]) => ({ id: newId(), item, amount })), mode: "max" })
          }}>
            <SelectTrigger size="sm" className="w-full text-xs text-muted-foreground"><SelectValue placeholder="Load a preset…" /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.name} value={p.name} className="text-xs">
                  <span className="flex items-center gap-1">{p.items.map(([it]) => <ItemIcon key={it} id={it} size={16} />)}</span>{p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            {plan.generated > 0 ? (
              <Stat label="Net power" className={plan.generated >= power ? "text-emerald-600 dark:text-emerald-400" : undefined}
                value={<>{plan.generated >= power ? "+" : ""}{fmt(plan.generated - power)} <span className="text-xs font-normal text-muted-foreground">MW</span></>}
                sub={`makes ${fmt(plan.generated)} · uses ${fmt(power)}`} />
            ) : (
              <Stat label="Power" value={<>{fmt(power)} <span className="text-xs font-normal text-muted-foreground">MW</span></>} />
            )}
            <Stat label="Buildings" value={buildings} />
            <Stat label="Limited by" value={max.limiting ? itemName(max.limiting) : "—"} className="col-span-2 text-sm"
              sub={max.limiting && s.mode === "fixed" ? `Inputs support ${fmt(max.rate)}× these rates` : undefined} />
          </div>
          {max.missing.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <div>
                <span className="font-medium">Missing inputs: </span>
                {max.missing.map(itemName).join(", ")}. Add them below or on the graph.
              </div>
            </div>
          )}
        </Section>

        <Separator />
        <Section title="Extraction">
          <MinerControls />
          <div className="space-y-1.5">
            <Label className="text-xs">Conveyor belt</Label>
            <Tabs value={String(s.belt)}
              onValueChange={(v) => update({ belt: +v })}><TabsList className="w-full">
              {BELTS.map((b, i) => (
                <Tooltip key={b}>
                  <TooltipTrigger render={<TabsTrigger value={String(i)} className="flex-1 px-0 text-xs" />}>{i + 1}</TooltipTrigger>
                  <TooltipContent>Mk.{i + 1} · {b}/min</TooltipContent>
                </Tooltip>
              ))}
            </TabsList></Tabs>
            <div className="text-[11px] text-muted-foreground">Mk.{s.belt + 1} · {BELTS[s.belt]} items/min</div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pipeline</Label>
            <Tabs value={String(s.pipe)}
              onValueChange={(v) => update({ pipe: +v })}><TabsList className="w-full">
              {PIPES.map((p, i) => (
                <TabsTrigger key={p} value={String(i)} className="flex-1 text-xs">Mk.{i + 1} · {p} m³</TabsTrigger>
              ))}
            </TabsList></Tabs>
          </div>
        </Section>

        <Separator />
        <Section title="Resource nodes" action={
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => update((st) => ({ nodes: [...st.nodes, { id: newId(), res: "Desc_OreIron_C", purity: "normal", count: 1 }] }))}>
            <Plus className="size-3.5" />Add
          </Button>
        }>
          {s.nodes.length === 0 && <p className="text-xs text-muted-foreground">No nodes. Add the ore, oil or water nodes near your factory.</p>}
          {s.nodes.map((n) => {
            const nr = nodeRate(s, n)
            return (
              <div key={n.id} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <ItemPicker size="sm" value={n.res} items={resourceItems} onChange={(res) => setNode(n.id, { res })} className="min-w-0 flex-1" />
                  <Select value={n.purity} onValueChange={(purity) => setNode(n.id, { purity: purity as Purity })}>
                    <SelectTrigger size="sm" className="w-[92px] shrink-0 px-2 text-xs capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(PURITY).map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" min={0} value={n.count} className="h-8 w-12 px-2 text-center text-xs tabular-nums"
                    onChange={(e) => setNode(n.id, { count: Math.max(0, +e.target.value) })} aria-label="Node count" />
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="Remove node"
                    onClick={() => update((st) => ({ nodes: st.nodes.filter((x) => x.id !== n.id) }))}>
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground tabular-nums">
                  <span className="font-medium text-foreground">{clockOf(n.id) === 0 ? "Off" : `${clockOf(n.id)}%`}</span>
                  <span>{n.clock === undefined ? "auto" : "set by you"}</span>
                  <span>· {fmt(nr.base)} {unit(n.res)} at 100%</span>
                  {n.count > 1 && <span>· ×{n.count}</span>}
                </div>
              </div>
            )
          })}
        </Section>

        <Separator />
        <Section title="Incoming parts" action={
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
            onClick={() => update((st) => ({ parts: [...st.parts, { id: newId(), item: "Desc_IronPlate_C", rate: 60 }] }))}>
            <Plus className="size-3.5" />Add
          </Button>
        }>
          {s.parts.length === 0 && <p className="text-xs text-muted-foreground">Parts already arriving from elsewhere. They're used as-is, not broken down.</p>}
          {s.parts.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <ItemPicker size="sm" value={p.item} items={allItems} onChange={(item) => setPart(p.id, { item })} className="min-w-0 flex-1" />
              <div className="relative">
                <Input type="number" min={0} step="any" value={p.rate} className="h-8 w-24 pr-10 text-xs tabular-nums"
                  onChange={(e) => setPart(p.id, { rate: Math.max(0, +e.target.value) })} aria-label="Rate" />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit(p.item)}</span>
              </div>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="Remove part"
                onClick={() => update((st) => ({ parts: st.parts.filter((x) => x.id !== p.id) }))}>
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </Section>

        <Separator />
        <Section title="Recipes">
          <div className="flex items-center justify-between">
            <Label htmlFor="burn" className="text-xs font-normal">Burn fuel products for power</Label>
            <Switch id="burn" checked={s.burnFuel} onCheckedChange={(burnFuel) => update({ burnFuel })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="alts" className="text-xs font-normal">Show alternate recipes</Label>
            <Switch id="alts" checked={s.showAlts} onCheckedChange={(showAlts) => update({ showAlts })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => update((st) => ({ choice: optimizeRecipes(st), showAlts: true }))}>
              <Sparkles className="size-3.5" />Optimize for my inputs
            </Button>
            <Button size="sm" variant="outline" onClick={() => update({ choice: {} })}>
              <RotateCcw className="size-3.5" />Reset
            </Button>
          </div>
        </Section>

        <Separator />
        <Section title="Input usage">
          <div className="space-y-1.5">
            {Object.entries(sol.leaves).map(([it, need]) => {
              const have = sup[it]
              const pct = have ? Math.min(100, (need / have) * 100) : 100
              return (
                <div key={it} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <ItemIcon id={it} size={18} />
                    <span className="flex-1 truncate">{itemName(it)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmt(need)}{have !== undefined && <> / {fmt(have)}</>}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", have === undefined ? "bg-destructive" : isLiquid(it) ? "bg-fluid" : "bg-brand")}
                      style={{ width: pct + "%" }} />
                  </div>
                </div>
              )
            })}
            {Object.keys(sup).filter((k) => !(k in sol.leaves)).length > 0 && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                Unused: {Object.keys(sup).filter((k) => !(k in sol.leaves)).map(itemName).join(", ")}
              </p>
            )}
          </div>
        </Section>

        <Separator />
        <Section title="Build cost">
          <div className="flex flex-wrap gap-1.5">
            {cost.buildings.map(([m, n]) => (
              <span key={m} className="flex items-center gap-1.5 rounded-md border py-0.5 pr-2 pl-1 text-xs" title={D.machines[m]?.name}>
                <Icon src={machineIcon(m)} size={20} />
                <span className="text-muted-foreground">{D.machines[m]?.name}</span>
                <span className="font-semibold tabular-nums">×{n}</span>
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
            {cost.materials.map(([it, n]) => (
              <div key={it} className="flex min-w-0 items-center gap-2 text-xs">
                <ItemIcon id={it} size={20} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{itemName(it)}</span>
                <span className="font-medium tabular-nums">{fmt(n)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Machines plus an extractor for each node used. Belts, pipes, splitters and foundations aren't included.</p>
        </Section>
      </ScrollArea>}
      <div className="border-t px-4 py-2.5">
        <Byline repo="kevinschaich/pioneer" />
      </div>
    </aside>
  )
}

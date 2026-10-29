import type { ReactNode } from "react"
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react"
import { AlertTriangle, GitMerge, Plus, Split, X } from "lucide-react"
import { Icon, ItemIcon } from "@/components/item-picker"
import { D, PURITY, RESOURCES, extractorFor, fmt, itemName, machineIcon, recipeName, recipesFor, unit, type Purity } from "@/lib/game"
import type { GroupPlan, Junction, MinerPlan, PowerPlan, Sink } from "@/lib/plan"
import { recipeOf, shardsFor, type NodeInput, type PartInput } from "@/lib/solver"
import { newId, usePlanner } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Badge, Button, Card as UiCard, Input, Tabs, TabsList, TabsTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider } from "@kevinschaich/components"

export type MinerNode = Node<{ miner: MinerPlan }, "miner">
export type SupplyNode = Node<{ part: PartInput }, "supply">
export type GroupNode = Node<{ group: GroupPlan }, "group">
export type JunctionNode = Node<{ junction: Junction }, "junction">
export type SinkNode = Node<{ sink: Sink }, "sink">
export type PowerNode = Node<{ power: PowerPlan }, "power">

const handle = "!size-2 !border-2 !border-background !bg-muted-foreground"

// A graph node: a shared Card with React Flow's connection handles.
function Card({ children, className, inputs = true, outputs = true }: { children: ReactNode; className?: string; inputs?: boolean; outputs?: boolean }) {
  return (
    <UiCard className={cn("w-64 gap-0 overflow-visible py-0 shadow-sm", className)}>
      {inputs && <Handle type="target" position={Position.Left} className={handle} />}
      {children}
      {outputs && <Handle type="source" position={Position.Right} className={handle} />}
    </UiCard>
  )
}

function IconTile({ src, badge, className }: { src: string; badge?: string; className?: string }) {
  return (
    <div className={cn("relative flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted", className)}>
      <Icon src={src} size={34} />
      {badge && <Icon src={badge} size={20} className="absolute -right-1.5 -bottom-1.5 rounded-md bg-card p-0.5 ring-1 ring-border" />}
    </div>
  )
}

// ---------- miner: purity and clock, nothing else ----------
export function MinerNodeView({ data: { miner: m } }: NodeProps<MinerNode>) {
  const { state, update } = usePlanner()
  const row = state.nodes.find((n) => n.id === m.row.id) ?? m.row
  const item = m.res
  const extractor = row.well ? "Desc_FrackingExtractor_C" : extractorFor(item, state.miner)
  // Changing one of several identical miners gives it its own row so the others stay as they are.
  const edit = (patch: Partial<NodeInput>) => update((s) => ({
    nodes: row.count <= 1
      ? s.nodes.map((n) => (n.id === row.id ? { ...n, ...patch } : n))
      : [...s.nodes.map((n) => (n.id === row.id ? { ...n, count: n.count - 1 } : n)), { ...row, ...patch, id: newId(), count: 1 }],
  }))
  const remove = () => update((s) => ({
    nodes: row.count <= 1 ? s.nodes.filter((n) => n.id !== row.id) : s.nodes.map((n) => (n.id === row.id ? { ...n, count: n.count - 1 } : n)),
  }))
  const shards = shardsFor(m.clock)
  return (
    <Card inputs={false} className="w-60">
      <div className="flex items-center gap-3 p-3 pb-2">
        <IconTile src={machineIcon(extractor)} badge={`icons/${D.items[item]?.icon}.png`} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{itemName(item)}</div>
          <div className="text-[11px] text-muted-foreground">{D.machines[extractor].name}</div>
        </div>
        <Button variant="ghost" size="icon" className="nodrag -mr-1 size-6 self-start text-muted-foreground" aria-label="Remove miner" onClick={remove}><X className="size-3.5" /></Button>
      </div>
      <div className="nodrag space-y-2.5 px-3 pb-3">
        {!row.well && item !== "Desc_Water_C" && (
          <Tabs value={row.purity} onValueChange={(v) => edit({ purity: v as Purity })}><TabsList className="w-full h-7">
            {Object.keys(PURITY).map((p) => <TabsTrigger key={p} value={p} className="h-6 flex-1 text-[10px] capitalize">{p}</TabsTrigger>)}
          </TabsList></Tabs>
        )}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tabular-nums">{m.clock === 0 ? "Off" : `${m.clock}%`}</span>
            {m.pinned
              ? <Button variant="link" size="xs" className="h-auto px-0" onClick={() => edit({ clock: undefined })}>Back to auto</Button>
              : <Badge variant="secondary">Auto</Badge>}
          </div>
          <Slider min={0} max={250} step={1} value={[m.clock]} onValueChange={(v) => edit({ clock: typeof v === "number" ? v : v[0] })} />
          <div className="text-[11px] text-muted-foreground">
            {m.clock === 0 ? "Not needed for this plan" : shards ? `${shards} power shard${shards > 1 ? "s" : ""}` : "No power shards"}
          </div>
        </div>
      </div>
    </Card>
  )
}

// Parts arriving on a belt from elsewhere.
export function SupplyNodeView({ data: { part } }: NodeProps<SupplyNode>) {
  return (
    <Card inputs={false} className="w-52">
      <div className="flex items-center gap-3 p-3">
        <IconTile src={`icons/${D.items[part.item]?.icon}.png`} className="size-9" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{itemName(part.item)}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">Incoming belt · {fmt(part.rate)} {unit(part.item)}</div>
        </div>
      </div>
    </Card>
  )
}

// ---------- machine group: how many to build and what to set them to ----------
export function GroupNodeView({ data: { group: g } }: NodeProps<GroupNode>) {
  const { state, update } = usePlanner()
  const { r, item } = g.step
  const current = recipeOf(state, item)!
  const options = (recipesFor[item] || []).filter((x) => state.showAlts || !x.alt || x.id === current)
  const run = g.machines * (g.clock / 100) // machine-equivalents at the set clock
  return (
    <Card>
      <div className="flex items-center gap-3 p-3 pb-2">
        <IconTile src={machineIcon(r.m)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums">{g.machines}×</span>
            <span className="truncate text-sm font-semibold">{D.machines[r.m].name}</span>
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {g.clock < 100 ? <>Set all to <span className="font-semibold text-foreground">{g.clock}%</span></> : "All at 100%"}
            {g.groups > 1 && <> · group {g.group} of {g.groups}</>}
          </div>
        </div>
      </div>
      <div className="px-3 pb-2">
        {options.length > 1 ? (
          <Select value={current} items={options.map((o) => ({ value: o.id, label: recipeName(o) }))} onValueChange={(v) => v && update((s) => ({ choice: { ...s.choice, [item]: v } }))}>
            <SelectTrigger size="sm" className="nodrag h-7 w-full text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-80">
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-xs">
                  <span className="flex items-center gap-2">
                    <span>{recipeName(o)}</span>
                    {o.alt && <Badge variant="outline" className="h-4 px-1 text-[10px] text-brand">Alt</Badge>}
                    <span className="flex items-center gap-0.5 opacity-70">{o.in.map(([it]) => <ItemIcon key={it} id={it} size={14} />)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex h-7 items-center gap-2 rounded-md border border-dashed px-2 text-xs text-muted-foreground">
            {recipeName(r)}{r.alt && <Badge variant="outline" className="h-4 px-1 text-[10px] text-brand">Alt</Badge>}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
        <span className="flex items-center gap-1"><ItemIcon id={item} size={16} />makes {fmt(g.output)} {unit(item)}</span>
        <span>{fmt(run * r.power)} MW</span>
      </div>
    </Card>
  )
}

// ---------- mergers and splitters: the only ways to combine or divide belts ----------
export function JunctionNodeView({ data: { junction: j } }: NodeProps<JunctionNode>) {
  const merger = j.kind === "merger"
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-sm">
      <Handle type="target" position={Position.Left} className={handle} />
      {merger ? <GitMerge className="size-4 text-muted-foreground" /> : <Split className="size-4 text-muted-foreground" />}
      <div className="leading-tight">
        <div className="text-xs font-semibold">{merger ? "Merger" : "Splitter"}</div>
        <div className="text-[10px] text-muted-foreground">{merger ? `${j.ins} belts → 1` : `1 belt → ${j.outs}`}</div>
      </div>
      <Handle type="source" position={Position.Right} className={handle} />
    </div>
  )
}

// ---------- products, byproducts and missing inputs ----------
export function SinkNodeView({ data: { sink } }: NodeProps<SinkNode>) {
  const { state, update } = usePlanner()
  const item = sink.item
  if (sink.kind === "missing") {
    const isRes = RESOURCES.has(item)
    return (
      <Card inputs={false} className="w-60 border-destructive/60 bg-destructive/5">
        <div className="flex items-center gap-3 p-3">
          <IconTile src={`icons/${D.items[item]?.icon}.png`} className="size-9" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{itemName(item)}</div>
            <div className="flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="size-3" />Nothing supplies this</div>
          </div>
        </div>
        <div className="nodrag border-t px-3 py-2">
          <Button size="sm" className="h-6 w-full text-[11px]" onClick={() => update((s) => isRes
            ? { nodes: [...s.nodes, { id: newId(), res: item, purity: "normal", count: 1 }] }
            : { parts: [...s.parts, { id: newId(), item, rate: 60 }] })}>
            <Plus className="size-3" />{isRes ? "Add a node" : "Add incoming belt"}
          </Button>
        </div>
      </Card>
    )
  }
  if (sink.kind === "bp") {
    return (
      <Card className="w-52 border-dashed">
        <div className="flex items-center gap-3 p-3">
          <IconTile src={`icons/${D.items[item]?.icon}.png`} className="size-9" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{itemName(item)}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">Byproduct · {fmt(sink.rate)} {unit(item)}</div>
          </div>
        </div>
      </Card>
    )
  }
  const t = sink.target!
  const target = state.targets.find((x) => x.id === t.id)
  const max = state.mode === "max"
  return (
    <Card className="border-brand/50 bg-brand/5 ring-4 ring-brand/10">
      <div className="flex items-center gap-3 p-3">
        <IconTile src={`icons/${D.items[item]?.icon}.png`} className="bg-brand/15" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium tracking-wide text-brand uppercase">
            {sink.fromLeftover ? `From leftover ${itemName(sink.fromLeftover)}` : "Output"}
          </div>
          <div className="truncate text-sm font-semibold">{itemName(item)}</div>
          <div className="text-lg font-bold text-brand tabular-nums">{fmt(t.rate)} <span className="text-xs font-normal text-muted-foreground">{unit(item)}</span></div>
        </div>
        {state.targets.length > 1 && (
          <Button variant="ghost" size="icon" className="nodrag -mt-6 -mr-1 size-6 self-start text-muted-foreground" aria-label="Remove product"
            onClick={() => update((s) => ({ targets: s.targets.filter((x) => x.id !== t.id) }))}>
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      {target && state.mode !== "equal" && (
        <div className="nodrag flex items-center gap-2 border-t border-brand/20 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">{max ? "Ratio" : "Target"}</span>
          <div className="relative flex-1">
            <Input type="number" min={0} step="any" className="h-7 pr-12 text-xs font-semibold tabular-nums" value={target.amount}
              aria-label={max ? "Ratio" : "Target rate"}
              onChange={(e) => update((s) => ({ targets: s.targets.map((x) => (x.id === t.id ? { ...x, amount: Math.max(0, +e.target.value) } : x)) }))} />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground">{max ? "×" : unit(item)}</span>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------- generators burning a fuel the factory makes ----------
export function PowerNodeView({ data: { power: p } }: NodeProps<PowerNode>) {
  return (
    <Card outputs={false} className="border-emerald-500/50 bg-emerald-500/5">
      <div className="flex items-center gap-3 p-3 pb-2">
        <IconTile src={machineIcon(p.generator)} badge={`icons/${D.items[p.item]?.icon}.png`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums">{p.count}×</span>
            <span className="truncate text-sm font-semibold">{D.machines[p.generator].name}</span>
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {p.clock < 100 ? <>Set all to <span className="font-semibold text-foreground">{p.clock}%</span></> : "All at 100%"}
          </div>
        </div>
      </div>
      <div className="flex items-baseline justify-between border-t px-3 py-2">
        <span className="text-[11px] text-muted-foreground">Generates</span>
        <span className="text-lg font-bold text-emerald-600 tabular-nums dark:text-emerald-400">{fmt(p.mw)} <span className="text-xs font-normal text-muted-foreground">MW</span></span>
      </div>
      {p.water > 0 && (
        <div className="flex items-center gap-1.5 border-t px-3 py-2 text-[11px] text-muted-foreground tabular-nums">
          <ItemIcon id="Desc_Water_C" size={16} />Needs {fmt(p.water)} m³/min of water
        </div>
      )}
    </Card>
  )
}

export const nodeTypes = {
  miner: MinerNodeView, supply: SupplyNodeView, group: GroupNodeView, junction: JunctionNodeView, sink: SinkNodeView, power: PowerNodeView,
}

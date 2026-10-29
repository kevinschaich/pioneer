import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Check, Factory, Home, Info, Workflow, Maximize, MousePointerClick, Minus, Plus, X } from "lucide-react"
import { DataSources } from "@/components/data-sources"
import { Icon, ItemIcon } from "@/components/item-picker"
import { useMapUi } from "@/components/map/map-context"
import { fmt, itemIcon, itemName, unit } from "@/lib/game"
import {
  GEYSER, MAP_PX, PURITY_COLOR, WORLD_NODES, distLabel, kindLabel, metres, nodeById, nodeLabel, satellitesOf, toPx,
  visible, worldNodeRate, type WorldNode,
} from "@/lib/map"
import type { Site } from "@/lib/site"
import type { PlannerState } from "@/lib/solver"
import { usePlanner } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Badge, Button } from "@kevinschaich/components"

const MAX_K = 6
const TILE_MAX_Z = 6
export const GEYSER_ICON = "icons/desc-generatorgeothermal-c.png"
const iconFor = (n: WorldNode) => (n.res === GEYSER ? GEYSER_ICON : itemIcon(n.res))
type View = { x: number; y: number; k: number; w: number; h: number }

// ---------- background tiles ----------
// Pyramid level z is (256 * 2^z) px across: z4 4096px, z5 8192px, z6 16384px.
const levelFor = (v: View) =>
  Math.max(0, Math.min(TILE_MAX_Z, Math.ceil(Math.log2((v.k * MAP_PX * (window.devicePixelRatio || 1)) / 256))))

function visibleTiles(v: View, z: number) {
  const n = 2 ** z, size = MAP_PX / n
  const x0 = Math.max(0, Math.floor(-v.x / v.k / size)), x1 = Math.min(n - 1, Math.floor((v.w - v.x) / v.k / size))
  const y0 = Math.max(0, Math.floor(-v.y / v.k / size)), y1 = Math.min(n - 1, Math.floor((v.h - v.y) / v.k / size))
  const out: { key: string; x: number; y: number; size: number }[] = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ key: `${z}/${x}/${y}`, x, y, size })
  return out
}

// Warm the browser cache with every tile up to 8192px (~9 MB) so level switches never wait on the network.
let warmed = false
function warmTiles() {
  if (warmed) return
  warmed = true
  const queue: string[] = []
  for (let z = 1; z <= 5; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) queue.push(`tiles/${z}/${x}/${y}.webp`)
  const next = () => {
    const batch = queue.splice(0, 24)
    if (!batch.length) return
    Promise.all(batch.map((u) => fetch(u).catch(() => null))).then(() => requestIdleCallback?.(next) ?? setTimeout(next, 16))
  }
  next()
}

// Draws the sharpest level for the settled view over the level below it, so there's never a blank
// gap while new tiles decode. The view only updates after a gesture settles; during the gesture the
// existing tiles are simply scaled by the parent transform.
const TileLayer = memo(function TileLayer({ v }: { v: View }) {
  useEffect(warmTiles, [])
  const z = levelFor(v)
  const levels = z > 1 ? [z - 1, z] : z === 1 ? [1] : []
  return (
    <>
            <img src="tiles/0/0/0.webp" width={MAP_PX} height={MAP_PX} alt="" draggable={false} className="pointer-events-none absolute inset-0" />
      {levels.flatMap((lz) => visibleTiles(v, lz)).map((t) => (
        <img key={t.key} src={`tiles/${t.key}.webp`} alt="" draggable={false} decoding="async"
          className="pointer-events-none absolute"
          // +0.5px overlap hides hairline seams between tiles.
          style={{ left: t.x * t.size, top: t.y * t.size, width: t.size + 0.5, height: t.size + 0.5 }} />
      ))}
    </>
  )
})

// ---------- markers ----------
const Marker = memo(function Marker({ n, claimed, used, selected, picked, onHover, onSelect, onExtract, onPlan }: {
  n: WorldNode; claimed: boolean; used: boolean; selected: boolean; picked: boolean
  onHover: (id: string | null) => void; onSelect: (id: string) => void; onExtract: (id: string) => void; onPlan: (id: string) => void
}) {
  const p = toPx(n)
  const size = n.kind === "satellite" ? 28 : n.kind === "well" ? 40 : 36
  const ring = n.kind === "well" ? "var(--fluid)" : PURITY_COLOR[n.purity]
  return (
    <div className="map-marker absolute" style={{ left: p.x, top: p.y, zIndex: selected ? 30 : picked ? 20 : claimed ? 10 : undefined }}>
      <button
        type="button"
        data-node={n.id}
        className={cn(
          "relative grid place-items-center bg-black/30 shadow-md ring-[2.5px] transition-[box-shadow,opacity] outline-none hover:ring-4",
          n.kind === "well" ? "rounded-lg" : "rounded-full",
          selected && "ring-4 ring-offset-2 ring-offset-background",
          // Extracted: solid green outline. Planned: solid amber outline with a glow. Build-site pick: dashed amber.
          used && "outline-[3px] outline-offset-2 outline-emerald-500",
          claimed && !used && "outline-[3px] outline-offset-2 outline-brand",
          picked && !used && !claimed && "outline-2 outline-offset-[3px] outline-brand outline-dashed",
        )}
        style={{
          width: size, height: size, "--tw-ring-color": ring,
          ...(claimed && !used ? { boxShadow: `0 0 0 2.5px ${ring}, 0 0 16px 5px color-mix(in oklch, var(--brand) 75%, transparent)` } : {}),
        } as CSSProperties}
        onPointerEnter={() => onHover(n.id)}
        onPointerLeave={() => onHover(null)}
        // ⌘-click toggles extracted, Ctrl-click toggles "use in planner", right-click toggles extracted.
        // On macOS Ctrl-click arrives as a context-menu event, so both paths check the modifier.
        onClick={(e) => {
          if (n.kind !== "geyser" && e.metaKey) onExtract(n.id)
          else if (n.kind !== "geyser" && e.ctrlKey) onPlan(n.id)
          else onSelect(n.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          if (n.kind === "geyser") return
          if (e.ctrlKey) onPlan(n.id)
          else onExtract(n.id)
        }}
        aria-label={`${nodeLabel(n)} ${n.kind === "well" ? "well" : n.purity}${used ? ", extracted" : ""}`}
      >
        <Icon src={iconFor(n)} size={size - 9} />
        {used && (
          <span className="absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-background">
            <Check className="size-3" strokeWidth={3.5} />
          </span>
        )}
        {claimed && (
          <span className="absolute -top-1.5 -left-1.5 grid size-[18px] place-items-center rounded-full bg-brand text-black ring-2 ring-background">
            <Workflow className="size-2.5" strokeWidth={3} />
          </span>
        )}
      </button>
    </div>
  )
})

const MarkerLayer = memo(function MarkerLayer({ shown, state, claimedIds, usedIds, pickedIds, selected, onHover, onSelect, onExtract, onPlan }: {
  shown: WorldNode[]; state: PlannerState; claimedIds: Set<string>; usedIds: Set<string>; pickedIds: Set<string>
  selected: string | null; onHover: (id: string | null) => void; onSelect: (id: string) => void; onExtract: (id: string) => void
  onPlan: (id: string) => void
}) {
  const shownIds = new Set(shown.map((n) => n.id))
  const members = (n: WorldNode) => (n.kind === "well" ? satellitesOf[n.id] || [] : [n])
  return (
    <>
      <svg width={MAP_PX} height={MAP_PX} className="pointer-events-none absolute inset-0">
        <defs>
          <radialGradient id="base-halo">
            <stop offset="0%" stopColor="rgb(14 165 233)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="rgb(14 165 233)" stopOpacity="0" />
          </radialGradient>
        </defs>
        {WORLD_NODES.filter((n) => usedIds.has(n.id)).map((n) => {
          const p = toPx(n)
          return <circle key={"halo" + n.id} cx={p.x} cy={p.y} r={70} fill="url(#base-halo)" />
        })}
        {shown.filter((n) => n.kind === "satellite" && shownIds.has(n.well!)).map((n) => {
          const a = toPx(n), b = toPx(nodeById[n.well!])
          return <line key={n.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--fluid)" strokeOpacity={0.8} strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      {shown.map((n) => {
        const m = members(n)
        return (
          <Marker key={n.id} n={n} selected={selected === n.id}
            claimed={m.some((x) => claimedIds.has(x.id))}
            used={m.length > 0 && m.every((x) => usedIds.has(x.id))}
            picked={m.some((x) => pickedIds.has(x.id))}
            onHover={onHover} onSelect={onSelect} onExtract={onExtract} onPlan={onPlan} />
        )
      })}
    </>
  )
})

const Kbd = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <kbd className={cn("rounded border bg-muted px-1 font-sans text-[10px] leading-4", className)}>{children}</kbd>
)

// ---------- overlays ----------
function Pin({ at, children, className, label }: { at: { x: number; y: number }; children: React.ReactNode; className?: string; label: string }) {
  const p = toPx(at)
  return (
    <div className="map-marker pointer-events-none absolute z-40" style={{ left: p.x, top: p.y }}>
      <div className={cn("grid size-11 place-items-center rounded-full shadow-lg ring-4 ring-background", className)}>{children}</div>
      <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-background/90 px-1.5 text-[11px] leading-5 font-semibold whitespace-nowrap shadow-sm">{label}</span>
    </div>
  )
}

function SiteLines({ site }: { site: Site }) {
  const s = toPx(site)
  return (
    <svg width={MAP_PX} height={MAP_PX} className="pointer-events-none absolute inset-0 z-[15]">
      {site.needs.flatMap((nd) => nd.picks.map((pk) => {
        const a = toPx(pk.node)
        return (
          <g key={pk.node.id}>
            <line x1={s.x} y1={s.y} x2={a.x} y2={a.y} stroke="#000" strokeOpacity={0.55} strokeWidth={7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <line x1={s.x} y1={s.y} x2={a.x} y2={a.y} stroke="var(--brand)" strokeWidth={3.5} strokeLinecap="round"
              strokeDasharray="10 8" vectorEffect="non-scaling-stroke" className="flow-dash" />
          </g>
        )
      }))}
    </svg>
  )
}

function NodeCard({ n, onClose }: { n: WorldNode; onClose: () => void }) {
  const { state } = usePlanner()
  const { isClaimed, toggleClaim, isUsed, toggleUsed, focusOn } = useMapUi()
  const claimed = isClaimed(n)
  const used = isUsed(n)
  const sats = satellitesOf[n.id] || []
  const parent = n.well ? nodeById[n.well] : null
  return (
    <div className="absolute top-4 right-4 z-50 w-72 rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <div className="flex items-start gap-3 p-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted"><Icon src={iconFor(n)} size={38} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{nodeLabel(n)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px]">{kindLabel(n)}</Badge>
            {n.kind !== "well" && (
              <Badge variant="outline" className="gap-1.5 text-[11px] capitalize">
                <span className="size-2 rounded-full" style={{ background: PURITY_COLOR[n.purity] }} />{n.purity}
              </Badge>
            )}
            {used && <Badge className="bg-emerald-500/15 text-[11px] text-emerald-500 hover:bg-emerald-500/15">Extracted</Badge>}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-7" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t px-4 py-3 text-xs">
        <dt className="text-muted-foreground">Extraction</dt><dd className="text-right font-medium tabular-nums">{worldNodeRate(state, n)}</dd>
        <dt className="text-muted-foreground">Position</dt><dd className="text-right tabular-nums">{metres(n.x)}, {metres(n.y)}</dd>
        <dt className="text-muted-foreground">Altitude</dt><dd className="text-right tabular-nums">{metres(n.z)}</dd>

      </dl>
      {sats.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t px-4 py-3">
          {sats.map((s) => (
            <button key={s.id} onClick={() => focusOn(s.id)} title={`${s.purity} satellite`}
              className={cn("size-4 rounded-full ring-1 ring-border transition hover:scale-125", state.used.includes(s.id) && "opacity-40")}
              style={{ background: PURITY_COLOR[s.purity] }} />
          ))}
        </div>
      )}
      {parent && (
        <button className="w-full border-t px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => focusOn(parent.id)}>
          Part of a resource well · {(satellitesOf[parent.id] || []).length} satellites →
        </button>
      )}
      {n.kind !== "geyser" && (
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Button variant={used ? "secondary" : "outline"} size="sm" onClick={() => toggleUsed(n)}>
            <Check className="size-3.5" />{used ? "Extracted" : "Mark extracted"}
          </Button>
          <Button variant={claimed ? "outline" : "default"} size="sm" onClick={() => toggleClaim(n)}>
            {claimed ? <><X className="size-3.5" />Unplan</> : <><Plus className="size-3.5" />{n.kind === "well" ? "Plan all" : "Use in planner"}</>}
          </Button>
        </div>
      )}
    </div>
  )
}

function SiteCard({ onPlanned }: { onPlanned: () => void }) {
  const { sites, setSites, showSite, setClaim, markUsed, focusOn } = useMapUi()
  const { state } = usePlanner()
  if (!sites) return null
  const site = sites.list[sites.active]
  return (
    <div className="absolute bottom-4 left-4 z-50 w-80 rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className="flex shrink-0 -space-x-3">
          {sites.targets.slice(0, 3).map((t) => (
            <div key={t} className="grid size-10 place-items-center rounded-lg bg-brand/15 ring-2 ring-background"><ItemIcon id={t} size={30} /></div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium tracking-wide text-brand uppercase">Build site</div>
          <div className="truncate text-sm font-semibold">{sites.targets.map(itemName).join(" + ")}</div>
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 size-7" onClick={() => setSites(null)} aria-label="Close"><X className="size-4" /></Button>
      </div>
      {!site ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">This recipe doesn't need any raw resources from nodes, so build it wherever suits you.</p>
      ) : (
        <>
          {sites.list.length > 1 && (
            <div className="flex gap-1 px-4 pb-3">
              {sites.list.map((_, i) => (
                <Button key={i} size="sm" variant={i === sites.active ? "secondary" : "ghost"} className="h-7 flex-1 text-xs" onClick={() => showSite(i)}>
                  {i === 0 ? "Best" : `Option ${i + 1}`}
                </Button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 border-t px-4 py-3">
            <div><div className="text-[11px] text-muted-foreground">Total belt/pipe runs</div><div className="font-semibold tabular-nums">{distLabel(site.belt)}</div></div>
            <div><div className="text-[11px] text-muted-foreground">To base</div><div className="font-semibold tabular-nums">{state.used.length ? distLabel(site.baseDist) : "No base yet"}</div></div>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto border-t px-4 py-3">
            {site.needs.map((nd) => (
              <div key={nd.res} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <ItemIcon id={nd.res} size={18} />
                  <span className="flex-1 truncate font-medium">{itemName(nd.res)}</span>
                  <span className="text-muted-foreground tabular-nums">{fmt(nd.need)} {unit(nd.res)}</span>
                </div>
                <div className="flex flex-wrap gap-1 pl-6">
                  {nd.picks.map((pk) => (
                    <button key={pk.node.id} onClick={() => focusOn(pk.node.id)}
                      className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors hover:bg-accent">
                      <span className="size-1.5 rounded-full" style={{ background: PURITY_COLOR[pk.node.purity] }} />{distLabel(pk.dist)}
                    </button>
                  ))}
                  {nd.short > 0 && <span className="text-[10px] text-destructive">short {fmt(nd.short)} — not enough unused nodes</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t p-3">
            <Button size="sm" variant="outline" onClick={() => markUsed(site.needs.flatMap((nd) => nd.picks.map((p) => p.node)))}>
              <Check className="size-3.5" />Mark as built
            </Button>
            <Button size="sm" onClick={() => { setClaim(site.needs.flatMap((nd) => nd.picks.map((p) => p.node)), true); onPlanned() }}>
              <Plus className="size-3.5" />Plan these nodes
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- map ----------
export function ResourceMap({ onShowPlanner }: { onShowPlanner: () => void }) {
  const { state } = usePlanner()
  const { selected, setSelected, focus, clickMode, toggleUsed, toggleClaim, sites } = useMapUi()
  const vpRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const view = useRef({ x: 0, y: 0, k: 0.15, min: 0.05 })
  const [tileView, setTileView] = useState<View>({ x: 0, y: 0, k: 0.15, w: 1, h: 1 })
  const [hover, setHover] = useState<string | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const raf = useRef(0)

  // During a gesture only the container's transform changes, so the GPU moves the whole map as one
  // layer. Marker sizing (--inv), frosted blur and sharper tiles are applied once the gesture settles;
  // re-rasterising ~600 markers every frame is what made zooming choppy.
  const frame = useRef(0)
  const settle = useCallback(() => {
    const el = innerRef.current, vp = vpRef.current
    if (!el || !vp) return
    const { x, y, k } = view.current
    if (!el.style.transition) el.style.transform = `translate(${x}px, ${y}px) scale(${k})`
    el.style.setProperty("--inv", String(Math.pow(k, -0.8)))
    delete vp.dataset.moving
    setTileView({ x, y, k, w: vp.clientWidth, h: vp.clientHeight })
  }, [])

  const apply = useCallback((animate = false) => {
    const el = innerRef.current, vp = vpRef.current
    if (!el || !vp) return
    vp.dataset.moving = "1"
    // Coalesce bursts of wheel/pointer events into one style write per frame.
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const { x, y, k } = view.current
      el.style.transition = animate ? "transform 450ms cubic-bezier(.2,.8,.2,1)" : ""
      el.style.transform = `translate(${x}px, ${y}px) scale(${k})`
    })
    clearTimeout(raf.current)
    raf.current = window.setTimeout(settle, animate ? 470 : 160)
  }, [settle])

  const fit = useCallback((animate = false) => {
    const vp = vpRef.current
    if (!vp) return
    const k = Math.min(vp.clientWidth, vp.clientHeight) / MAP_PX
    view.current = { x: (vp.clientWidth - MAP_PX * k) / 2, y: (vp.clientHeight - MAP_PX * k) / 2, k, min: k * 0.8 }
    apply(animate)
  }, [apply])

  // Frame every node you've extracted (your base); falls back to the whole map before you've marked any.
  const usedRef = useRef(state.used)
  usedRef.current = state.used
  const fitBase = useCallback((animate = false) => {
    const vp = vpRef.current
    const pts = usedRef.current.map((id) => nodeById[id]).filter(Boolean).map(toPx)
    if (!vp || !pts.length) return fit(animate)
    const pad = 120
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const min = (Math.min(vp.clientWidth, vp.clientHeight) / MAP_PX) * 0.8
    const k = Math.max(min, Math.min(1.5, (vp.clientWidth - pad * 2) / Math.max(1, maxX - minX), (vp.clientHeight - pad * 2) / Math.max(1, maxY - minY)))
    view.current = { k, min, x: vp.clientWidth / 2 - ((minX + maxX) / 2) * k, y: vp.clientHeight / 2 - ((minY + maxY) / 2) * k }
    apply(animate)
  }, [fit, apply])

  const zoomAt = useCallback((factor: number, cx: number, cy: number, animate = false) => {
    const v = view.current
    const k = Math.min(MAX_K, Math.max(v.min, v.k * factor))
    v.x = cx - ((cx - v.x) * k) / v.k
    v.y = cy - ((cy - v.y) * k) / v.k
    v.k = k
    apply(animate)
  }, [apply])

  useLayoutEffect(() => {
    fitBase()
    settle()
    const ro = new ResizeObserver(() => { view.current.min = Math.min(vpRef.current!.clientWidth, vpRef.current!.clientHeight) / MAP_PX * 0.8; apply() })
    ro.observe(vpRef.current!)
    return () => ro.disconnect()
  }, [fitBase, apply, settle])

  // Fly to a node or point when the sidebar or graph asks for it.
  useEffect(() => {
    if (!focus || !vpRef.current) return
    const target = focus.id ? nodeById[focus.id] : { x: focus.x!, y: focus.y! }
    const p = toPx(target)
    const vp = vpRef.current
    const k = Math.max(view.current.k, focus.id ? 1 : 0.5)
    view.current = { ...view.current, k, x: vp.clientWidth / 2 - p.x * k, y: vp.clientHeight / 2 - p.y * k }
    apply(true)
  }, [focus, apply])

  // Wheel zoom and drag pan go straight to the DOM so panning never re-renders the markers.
  useEffect(() => {
    const vp = vpRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = vp.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
      setTip(null)
    }
    let drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null
    const down = (e: PointerEvent) => {
      // Let markers receive their own clicks; capturing here would retarget them to the map.
      if ((e.target as Element).closest("button")) return
      drag = { x: e.clientX - view.current.x, y: e.clientY - view.current.y, sx: e.clientX, sy: e.clientY, moved: false }
      vp.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) drag.moved = true
      if (!drag.moved) return
      view.current.x = e.clientX - drag.x
      view.current.y = e.clientY - drag.y
      apply()
      vp.style.cursor = "grabbing"
    }
    const up = (e: PointerEvent) => {
      if (drag && !drag.moved) {
        setSelected(null)
      }
      drag = null
      vp.style.cursor = ""
    }
    vp.addEventListener("wheel", onWheel, { passive: false })
    vp.addEventListener("pointerdown", down)
    vp.addEventListener("pointermove", move)
    vp.addEventListener("pointerup", up)
    vp.addEventListener("pointercancel", up)
    return () => {
      vp.removeEventListener("wheel", onWheel)
      vp.removeEventListener("pointerdown", down)
      vp.removeEventListener("pointermove", move)
      vp.removeEventListener("pointerup", up)
      vp.removeEventListener("pointercancel", up)
    }
  }, [apply, zoomAt, setSelected])

  const usedIds = useMemo(() => new Set(state.used), [state.used])
  const claimedIds = useMemo(() => new Set(state.nodes.map((n) => n.mapId).filter(Boolean) as string[]), [state.nodes])
  const site = sites?.list[sites.active]
  const pickedIds = useMemo(() => new Set(site ? site.needs.flatMap((nd) => nd.picks.map((p) => p.node.id)) : []), [site])
  const shown = useMemo(() => WORLD_NODES.filter((n) => visible(n, state.map, usedIds)), [state.map, usedIds])
  // Only the inputs that change a marker's rate label go into this key, so unrelated edits don't re-render markers.
  const rateState = useMemo(() => state, [state.miner, state.belt, state.pipe]) // eslint-disable-line react-hooks/exhaustive-deps

  const onHover = useCallback((id: string | null) => {
    setHover(id)
    if (id && vpRef.current) {
      const el = vpRef.current.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)
      const r = el?.getBoundingClientRect()
      const vr = vpRef.current.getBoundingClientRect()
      if (r) setTip({ x: r.left + r.width / 2 - vr.left, y: r.top - vr.top })
    }
  }, [])
  const onExtract = useCallback((id: string) => toggleUsed(nodeById[id]), [toggleUsed])
  const onPlan = useCallback((id: string) => toggleClaim(nodeById[id]), [toggleClaim])
  const onSelect = useCallback((id: string) => {
    if (clickMode === "extract") onExtract(id)
    else setSelected((s) => (s === id ? null : id))
  }, [clickMode, onExtract, setSelected])

  const hovered = hover ? nodeById[hover] : null
  const selectedNode = selected ? nodeById[selected] : null
  const counts = { impure: 0, normal: 0, pure: 0 }
  for (const n of shown) if (n.kind !== "well") counts[n.purity]++
  const wells = shown.filter((n) => n.kind === "well").length
  const usedShown = shown.filter((n) => n.kind !== "well" && usedIds.has(n.id)).length

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b1116]">
      <div ref={vpRef} className={cn("absolute inset-0 touch-none select-none", clickMode === "extract" ? "cursor-cell" : "cursor-grab")}>
        <div ref={innerRef} className="group/map absolute top-0 left-0 origin-top-left will-change-transform" style={{ width: MAP_PX, height: MAP_PX }}>
          <TileLayer v={tileView} />
          {site && <SiteLines site={site} />}
          <MarkerLayer shown={shown} state={rateState} claimedIds={claimedIds} usedIds={usedIds} pickedIds={pickedIds}
            selected={selected} onHover={onHover} onSelect={onSelect} onExtract={onExtract} onPlan={onPlan} />

          {sites?.list.map((s, i) => i !== sites.active && (
            <Pin key={i} at={s} label={`Option ${i + 1}`} className="size-8 bg-background text-brand ring-2"><Factory className="size-4" /></Pin>
          ))}
          {site && (
            <Pin at={site} label="Build here" className="bg-brand"><ItemIcon id={sites!.targets[0]} size={30} /></Pin>
          )}
        </div>
      </div>

      {hovered && tip && hovered.id !== selected && (
        <div className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full pb-2" style={{ left: tip.x, top: tip.y }}>
          <div className="flex items-center gap-2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
            {hovered.kind !== "well" && <span className="size-2 rounded-full" style={{ background: PURITY_COLOR[hovered.purity] }} />}
            <span className="font-medium">{nodeLabel(hovered)}</span>
            <span className="text-muted-foreground capitalize">{hovered.kind === "well" ? "well" : hovered.purity}</span>
            <span className="text-muted-foreground tabular-nums">· {worldNodeRate(state, hovered)}</span>
            {hovered.kind !== "geyser" && (
              <span className="flex items-center gap-1 border-l pl-2 text-[11px] text-muted-foreground">
                <Kbd>⌘</Kbd>extracted<Kbd className="ml-1">⌃</Kbd>plan
              </span>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute top-4 left-4 z-40 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
        <span className="font-medium tabular-nums">{counts.pure + counts.normal + counts.impure} nodes</span>
        {(["pure", "normal", "impure"] as const).map((p) => (
          <span key={p} className="flex items-center gap-1.5 text-muted-foreground capitalize">
            <span className="size-2 rounded-full" style={{ background: PURITY_COLOR[p] }} />{p}
            <span className="text-foreground tabular-nums">{counts[p]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-[2px] ring-[1.5px] ring-fluid" />Wells<span className="text-foreground tabular-nums">{wells}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="grid size-2.5 place-items-center rounded-full bg-emerald-500"><Check className="size-2 text-white" strokeWidth={4} /></span>
          Extracted<span className="text-foreground tabular-nums">{usedShown}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="grid size-2.5 place-items-center rounded-full bg-brand" />
          Planned<span className="text-foreground tabular-nums">{shown.filter((n) => n.kind !== "well" && claimedIds.has(n.id)).length}</span>
        </span>
      </div>

      {clickMode === "extract" && (
        <div className="absolute top-16 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-500/40 bg-background/95 py-1.5 pr-4 pl-3 text-sm shadow-lg backdrop-blur">
          <MousePointerClick className="size-4 text-emerald-500" />Click nodes to mark them extracted
        </div>
      )}

      {selectedNode && <NodeCard n={selectedNode} onClose={() => setSelected(null)} />}
      <SiteCard onPlanned={onShowPlanner} />

      <div className="absolute right-4 bottom-4 z-40 flex flex-col overflow-hidden rounded-lg border bg-background/90 shadow-sm backdrop-blur">
        {[
          { icon: Plus, label: "Zoom in", f: () => zoomAt(1.6, vpRef.current!.clientWidth / 2, vpRef.current!.clientHeight / 2, true) },
          { icon: Minus, label: "Zoom out", f: () => zoomAt(1 / 1.6, vpRef.current!.clientWidth / 2, vpRef.current!.clientHeight / 2, true) },
          { icon: Home, label: "Center on my base", f: () => fitBase(true) },
          { icon: Maximize, label: "Fit map", f: () => fit(true) },
        ].map(({ icon: I, label, f }) => (
          <Button key={label} variant="ghost" size="icon" className="size-8 rounded-none border-b last:border-b-0" onClick={f} aria-label={label}>
            <I className="size-4" />
          </Button>
        ))}
        <DataSources trigger={<Button variant="ghost" size="icon" className="size-8 rounded-none border-t text-muted-foreground" aria-label="Data sources"><Info className="size-4" /></Button>} />
      </div>
    </div>
  )
}

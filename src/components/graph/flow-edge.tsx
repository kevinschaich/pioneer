import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react"
import { ItemIcon } from "@/components/item-picker"
import { fmt, isLiquid } from "@/lib/game"
import type { FlowStatus } from "@/lib/plan"
import { cn } from "@/lib/utils"

export type FlowEdge = Edge<{ item: string; rate: number; weight: number; status: FlowStatus; note?: string }, "flow">

// Short reason shown inside a red pill; the full sentence is in the tooltip.
const REASON: Record<Exclude<FlowStatus, "ok">, string> = {
  belt: "belt can't carry",
  excess: "factory can't use",
  starved: "machines starved",
}

export function FlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<FlowEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const fluid = isLiquid(data!.item)
  const color = fluid ? "var(--fluid)" : "var(--brand)"
  const width = 1.5 + 4 * data!.weight
  const ok = data!.status === "ok"
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: color, strokeOpacity: 0.35, strokeWidth: width }} />
      <path d={path} fill="none" stroke={color} strokeWidth={Math.max(1.5, width / 2)} strokeLinecap="round" strokeDasharray="2 14" className="flow-dash" />
      <EdgeLabelRenderer>
        <div
          className={cn(
            "nodrag nopan pointer-events-auto absolute flex items-center gap-1 rounded-full border-[1.5px] bg-background py-0.5 pr-2 pl-0.5 text-[11px] font-medium tabular-nums shadow-sm",
            ok ? "border-emerald-500/70" : "border-destructive bg-destructive/10 text-destructive",
          )}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          title={data!.note}
        >
          <ItemIcon id={data!.item} size={16} />
          {fmt(data!.rate)}
          {!ok && <span className="ml-0.5 text-[10px] font-semibold">· {REASON[data!.status as Exclude<FlowStatus, "ok">]}</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const edgeTypes = { flow: FlowEdgeView }

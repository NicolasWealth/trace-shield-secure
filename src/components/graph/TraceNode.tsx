import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { GraphNodeData, GraphNodeKind } from "@/services/graph";

const TONE: Record<GraphNodeKind, string> = {
  BATCH: "border-primary/60 bg-seal-500/10",
  MANUFACTURER: "border-border bg-card",
  DISTRIBUTOR: "border-border bg-card",
  WAREHOUSE: "border-border bg-card",
  RETAILER: "border-ok-500/40 bg-ok-500/8",
};

export function TraceNode({ data, selected }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div
      className={cn(
        "w-52 rounded-md border px-3 py-2 shadow-sm transition-colors",
        TONE[data.kind],
        selected && "ring-1 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Left} />
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {data.kind}
      </p>
      <p className="truncate font-display text-sm font-medium text-foreground">
        {data.label}
      </p>
      <p className="truncate text-xs text-mist-400">{data.subtitle}</p>
      <dl className="mt-2 space-y-0.5">
        {data.detail.slice(0, 3).map((d) => (
          <div key={d.label} className="flex justify-between gap-2 text-[10px]">
            <dt className="text-muted-foreground">{d.label}</dt>
            <dd className="truncate font-mono text-mist-300">{d.value}</dd>
          </div>
        ))}
      </dl>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AppShell } from "@/components/layout/AppShell";
import { TraceNode } from "@/components/graph/TraceNode";
import { useTraceData } from "@/hooks/useTraceData";
import { buildSupplyChainGraph, type GraphNodeData } from "@/services/graph";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Search {
  batch?: string;
}

export const Route = createFileRoute("/supply-chain")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search.batch === "string" && search.batch ? { batch: search.batch } : {},
  head: () => ({
    meta: [
      { title: "Supply Chain Map — TraceShield" },
      {
        name: "description",
        content:
          "Interactive map of manufacturers, distributors, warehouses and retailers with custody flows between them.",
      },
      { property: "og:title", content: "Supply chain map — TraceShield" },
      {
        property: "og:description",
        content: "Trace every custody hand-off from plant to retail shelf.",
      },
    ],
  }),
  component: SupplyChainPage,
});

const nodeTypes = { traceNode: TraceNode };

const LEGEND = [
  { label: "Batch", className: "border-primary/60 bg-seal-500/10" },
  { label: "Manufacturer / Distributor / Warehouse", className: "border-border bg-card" },
  { label: "Retailer", className: "border-ok-500/40 bg-ok-500/10" },
];

function SupplyChainPage() {
  const { batch } = Route.useSearch();
  const navigate = useNavigate();
  const { organizations, batches, events } = useTraceData();

  const { nodes, edges } = useMemo(
    () => buildSupplyChainGraph(organizations, batches, events, batch),
    [organizations, batches, events, batch],
  );

  return (
    <AppShell
      title="Supply chain map"
      subtitle="Manufacturer A into the Lagos and Abuja distribution legs."
      actions={
        <Select
          value={batch ?? "ALL"}
          onValueChange={(v) =>
            navigate({
              to: "/supply-chain",
              search: v === "ALL" ? {} : { batch: v },
            })
          }
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All batches</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b.batchId} value={b.batchId}>
                {b.batchId} — {b.productName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="mb-3 flex flex-wrap gap-4">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`size-3 rounded-sm border ${l.className}`} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="h-[70vh] overflow-hidden rounded-lg border border-border bg-card">
        <ReactFlow
          nodes={nodes as Node<GraphNodeData>[]}
          edges={edges as Edge[]}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--ink-700)" gap={20} />
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(0,0,0,0.55)"
            style={{ background: "var(--ink-900)" }}
          />
          <Controls />
        </ReactFlow>
      </div>
    </AppShell>
  );
}

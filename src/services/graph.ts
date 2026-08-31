/**
 * Builds the supply-chain graph (React Flow nodes + edges) from batches,
 * custody events and organizations. Pure logic, no React.
 */
import type { Edge, Node } from "@xyflow/react";
import type { Batch, CustodyEvent, Organization, OrganizationType } from "@/types";

export type GraphNodeKind = OrganizationType | "BATCH";

export interface GraphNodeData extends Record<string, unknown> {
  kind: GraphNodeKind;
  label: string;
  subtitle: string;
  detail: { label: string; value: string }[];
  refId: string;
}

const COLUMN: Record<GraphNodeKind, number> = {
  BATCH: 0,
  MANUFACTURER: 1,
  DISTRIBUTOR: 2,
  WAREHOUSE: 3,
  RETAILER: 4,
};

export function buildSupplyChainGraph(
  organizations: Organization[],
  batches: Batch[],
  events: CustodyEvent[],
  selectedBatchId?: string,
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const scopedEvents = selectedBatchId
    ? events.filter((e) => e.batchId === selectedBatchId)
    : events;
  const scopedBatches = selectedBatchId
    ? batches.filter((b) => b.batchId === selectedBatchId)
    : batches;

  const usedOrgIds = new Set<string>();
  scopedEvents.forEach((e) => {
    usedOrgIds.add(e.fromOrganization);
    usedOrgIds.add(e.toOrganization);
  });

  const orgs = organizations.filter((o) => usedOrgIds.has(o.organizationId));
  const nodes: Node<GraphNodeData>[] = [];
  const rowCursor: Record<number, number> = {};

  const place = (kind: GraphNodeKind) => {
    const col = COLUMN[kind];
    const row = rowCursor[col] ?? 0;
    rowCursor[col] = row + 1;
    return { x: col * 260, y: row * 120 };
  };

  scopedBatches.forEach((b) => {
    const batchEvents = events.filter((e) => e.batchId === b.batchId);
    nodes.push({
      id: `batch:${b.batchId}`,
      type: "traceNode",
      position: place("BATCH"),
      data: {
        kind: "BATCH",
        label: b.batchId,
        subtitle: b.productName,
        refId: b.batchId,
        detail: [
          { label: "Status", value: b.status.replace(/_/g, " ") },
          { label: "Quantity", value: b.quantity.toLocaleString() },
          { label: "Origin", value: b.origin },
          { label: "Custody events", value: String(batchEvents.length) },
        ],
      },
    });
  });

  orgs.forEach((o) => {
    const handled = scopedEvents.filter(
      (e) => e.toOrganization === o.organizationId || e.fromOrganization === o.organizationId,
    );
    const batchIds = [...new Set(handled.map((e) => e.batchId))];
    nodes.push({
      id: `org:${o.organizationId}`,
      type: "traceNode",
      position: place(o.type),
      data: {
        kind: o.type,
        label: o.name,
        subtitle: o.location,
        refId: o.organizationId,
        detail: [
          { label: "Type", value: o.type },
          { label: "Custody events", value: String(handled.length) },
          { label: "Batches handled", value: batchIds.join(", ") || "—" },
        ],
      },
    });
  });

  const edgeMap = new Map<string, Edge>();

  scopedEvents.forEach((e) => {
    if (e.fromOrganization !== e.toOrganization) {
      const id = `${e.fromOrganization}->${e.toOrganization}`;
      const existing = edgeMap.get(id);
      if (existing) {
        existing.label = `${Number(existing.label ?? 0) + 1}`;
      } else {
        edgeMap.set(id, {
          id,
          source: `org:${e.fromOrganization}`,
          target: `org:${e.toOrganization}`,
          label: "1",
          animated: false,
        });
      }
    }
  });

  scopedBatches.forEach((b) => {
    const first = events.find((e) => e.batchId === b.batchId);
    if (first) {
      edgeMap.set(`batch:${b.batchId}`, {
        id: `batch:${b.batchId}`,
        source: `batch:${b.batchId}`,
        target: `org:${first.fromOrganization}`,
      });
    }
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = [...edgeMap.values()].filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );

  return { nodes, edges };
}

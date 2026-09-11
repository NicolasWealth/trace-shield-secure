/**
 * Builds the supply-chain investigation graph (React Flow nodes + edges) from
 * batches, custody events and organizations. Pure logic, no React.
 */
import type { Edge, Node } from "@xyflow/react";
import type {
  Analysis,
  Batch,
  CustodyEvent,
  Incident,
  Organization,
  OrganizationType,
} from "@/types";
import { analyseIncident, calculateInventoryFlow, type InventoryFlowResult } from "./riskEngine";

export type GraphNodeKind = OrganizationType | "BATCH" | "UNKNOWN";
export type GraphEntityType = "batch" | "organization" | "unknown";
export type GraphEvidenceState = "VERIFIED" | "PENDING_VERIFICATION" | "EVIDENCE_GAP" | "UNKNOWN";
export type InvestigationState = "default" | "selected" | "connected" | "dimmed";
export type GraphDirection = "self" | "upstream" | "downstream" | "connected";

export interface GraphNodeData extends Record<string, unknown> {
  kind: GraphNodeKind;
  entityType: GraphEntityType;
  label: string;
  subtitle: string;
  detail: { label: string; value: string }[];
  refId: string;
  organizationId?: string;
  batchId?: string;
  batchIds: string[];
  location: string;
  organizationType: string;
  currentInventory: number | null;
  affectedQuantity: number | null;
  accountedQuantity: number | null;
  unaccountedQuantity: number | null;
  upstreamOrganizationIds: string[];
  downstreamOrganizationIds: string[];
  upstreamOrganizationNames: string[];
  downstreamOrganizationNames: string[];
  lastEvent: CustodyEvent | null;
  connectedToIncident: boolean | null;
  exposureRisk: number | null;
  evidenceConfidence: number | null;
  priority: Analysis["priority"] | null;
  evidenceState: GraphEvidenceState;
  evidenceItems: string[];
  investigationState: InvestigationState;
  investigationDirection: GraphDirection | null;
}

export interface GraphEdgeData extends Record<string, unknown> {
  event: CustodyEvent;
  batchId: string;
  evidenceState: GraphEvidenceState;
  evidenceItems: string[];
  previousEventId: string | null;
  duplicate: boolean;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceOrganizationName: string;
  targetOrganizationName: string;
  investigationState: InvestigationState;
}

export interface SupplyChainGraph {
  nodes: Node<GraphNodeData>[];
  edges: Edge<GraphEdgeData>[];
  analysesByBatch: Record<string, Analysis>;
  flowByBatch: Record<string, InventoryFlowResult>;
  scopedBatchIds: string[];
  evidenceGaps: string[];
}

export interface ConnectedPath {
  selectedNodeId: string | null;
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  upstreamNodeIds: Set<string>;
  downstreamNodeIds: Set<string>;
  directUpstreamNodeIds: Set<string>;
  directDownstreamNodeIds: Set<string>;
}

const COLUMN: Record<GraphNodeKind, number> = {
  BATCH: 0,
  MANUFACTURER: 1,
  DISTRIBUTOR: 2,
  WAREHOUSE: 3,
  RETAILER: 4,
  UNKNOWN: 5,
};

const KNOWN_ORG_TYPES: OrganizationType[] = [
  "MANUFACTURER",
  "DISTRIBUTOR",
  "WAREHOUSE",
  "RETAILER",
];

const MOVEMENT_EVENTS = new Set<CustodyEvent["type"]>([
  "PRODUCED",
  "SHIPPED",
  "RECEIVED",
  "STORED",
  "SOLD",
]);

const ARROW_CLOSED = "arrowclosed" as const;

const compactNumber = (value: number) => value.toLocaleString("en-GB");

const unknownOrgRef = (event: CustodyEvent, side: "from" | "to") =>
  `UNKNOWN-${side.toUpperCase()}-${event.eventId || event.batchId || "EVENT"}`;

const orgRef = (event: CustodyEvent, side: "from" | "to") => {
  const value = side === "from" ? event.fromOrganization : event.toOrganization;
  return value?.trim() || unknownOrgRef(event, side);
};

const orgNodeId = (organizationId: string, known: boolean) =>
  known ? `org:${organizationId}` : `unknown:${organizationId}`;

const eventDedupeKey = (e: CustodyEvent) =>
  `${e.type}|${orgRef(e, "from")}|${orgRef(e, "to")}|${e.quantity}|${e.timestamp}|${e.location}|${e.batchId}`;

const eventIdentityKey = (e: CustodyEvent) => `${e.eventId}|${eventDedupeKey(e)}`;

function uniqueEvents(events: CustodyEvent[]) {
  const seen = new Set<string>();
  const duplicateKeys = new Set<string>();
  const unique: CustodyEvent[] = [];
  let duplicateCount = 0;

  for (const event of events) {
    const identity = eventIdentityKey(event);
    const dedupe = eventDedupeKey(event);
    if (seen.has(identity) || seen.has(dedupe)) {
      duplicateKeys.add(identity);
      duplicateKeys.add(dedupe);
      duplicateCount++;
      continue;
    }
    seen.add(identity);
    seen.add(dedupe);
    unique.push(event);
  }

  return { unique, duplicateKeys, duplicateCount };
}

function isKnownOrgType(type: string | undefined): type is OrganizationType {
  return KNOWN_ORG_TYPES.includes(type as OrganizationType);
}

function resolveOrganization(organizationId: string, organizationsById: Map<string, Organization>) {
  const organization = organizationsById.get(organizationId);
  if (!organization) {
    return {
      known: false,
      kind: "UNKNOWN" as GraphNodeKind,
      label: organizationId.startsWith("UNKNOWN-")
        ? organizationId.replace(/-/g, " ").toLowerCase()
        : `Unknown organization ${organizationId}`,
      subtitle: "Not recorded",
      location: "Unknown",
      type: "Unknown / Unclassified",
    };
  }

  const type = String(organization.type);
  const kind = isKnownOrgType(type) ? organization.type : "UNKNOWN";
  return {
    known: true,
    kind,
    label: organization.name || organization.organizationId,
    subtitle: organization.location || "Not recorded",
    location: organization.location || "Not recorded",
    type: isKnownOrgType(type) ? type : "Unknown / Unclassified",
    organization,
  };
}

function displayOrganizationName(
  organizationId: string,
  organizationsById: Map<string, Organization>,
) {
  if (organizationId.startsWith("UNKNOWN-")) return "Unknown";
  return organizationsById.get(organizationId)?.name || organizationId || "Unknown";
}

export function mapVerificationToEvidenceState(
  events: CustodyEvent[],
  evidenceItems: string[] = [],
): GraphEvidenceState {
  if (evidenceItems.length > 0) return "EVIDENCE_GAP";
  if (events.length === 0) return "UNKNOWN";
  const cryptographicallyVerified = events.every(
    (event) =>
      event.verificationStatus === "VERIFIED" &&
      Boolean(event.eventHash) &&
      Boolean(event.blockchainTxHash),
  );
  if (cryptographicallyVerified) return "VERIFIED";
  return "PENDING_VERIFICATION";
}

function getNodeEvidenceItems(
  organizationId: string,
  known: boolean,
  relatedEvents: CustodyEvent[],
  eventById: Map<string, CustodyEvent>,
  duplicateEventCount: number,
) {
  const items: string[] = [];

  if (!known) {
    items.push("Organization is not recorded in the registry.");
  }

  for (const event of relatedEvents) {
    if (event.previousEventId && !eventById.has(event.previousEventId)) {
      items.push(
        `Event ${event.eventId} references missing previous event ${event.previousEventId}.`,
      );
    }
    if (!event.previousEventId && event.type !== "PRODUCED") {
      items.push(`Event ${event.eventId} has no previous event recorded.`);
    }
    if (!event.timestamp) {
      items.push(`Event ${event.eventId} has no timestamp recorded.`);
    }
    if (!event.fromOrganization || !event.toOrganization) {
      items.push(`Event ${event.eventId} has an incomplete organization reference.`);
    }
  }

  if (duplicateEventCount > 0) {
    items.push(
      `${duplicateEventCount} duplicate custody event(s) were ignored for inventory flow.`,
    );
  }

  return [...new Set(items)];
}

function getEdgeEvidenceItems(
  event: CustodyEvent,
  eventById: Map<string, CustodyEvent>,
  duplicate: boolean,
  sourceKnown: boolean,
  targetKnown: boolean,
) {
  const items: string[] = [];
  if (duplicate) items.push("Duplicate custody event detected.");
  if (!sourceKnown || !targetKnown) items.push("Custody event references an unknown organization.");
  if (event.previousEventId && !eventById.has(event.previousEventId)) {
    items.push(`Previous event ${event.previousEventId} is not recorded.`);
  }
  if (!event.previousEventId && event.type !== "PRODUCED") {
    items.push("Previous event is not recorded.");
  }
  if (!event.timestamp) items.push("Timestamp is not recorded.");
  return items;
}

function latestEvent(events: CustodyEvent[]) {
  return [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;
}

export function buildSupplyChainGraph(
  organizations: Organization[],
  batches: Batch[],
  events: CustodyEvent[],
  selectedBatchId?: string,
  selectedIncident?: Incident,
): SupplyChainGraph {
  const scopedBatches = selectedBatchId
    ? batches.filter((batch) => batch.batchId === selectedBatchId)
    : batches;
  const scopedBatchIds = new Set(scopedBatches.map((batch) => batch.batchId));
  const scopedEvents = events
    .filter((event) => scopedBatchIds.has(event.batchId))
    .sort((a, b) => {
      const byTime = a.timestamp.localeCompare(b.timestamp);
      return byTime || a.eventId.localeCompare(b.eventId);
    });
  const { unique, duplicateKeys, duplicateCount } = uniqueEvents(scopedEvents);

  const organizationsById = new Map(organizations.map((org) => [org.organizationId, org]));
  const batchesById = new Map(scopedBatches.map((batch) => [batch.batchId, batch]));
  const eventById = new Map(unique.map((event) => [event.eventId, event]));

  const analysesByBatch: Record<string, Analysis> = {};
  const flowByBatch: Record<string, InventoryFlowResult> = {};
  for (const batch of scopedBatches) {
    const incident = selectedIncident?.batchId === batch.batchId ? selectedIncident : undefined;
    flowByBatch[batch.batchId] = calculateInventoryFlow(batch, events, organizations);
    if (incident) {
      analysesByBatch[batch.batchId] = analyseIncident({
        incident,
        batch,
        events,
        organizations,
      });
    }
  }

  const usedOrganizationIds = new Set<string>();
  for (const event of unique) {
    usedOrganizationIds.add(orgRef(event, "from"));
    usedOrganizationIds.add(orgRef(event, "to"));
  }

  const upstreamMap = new Map<string, Set<string>>();
  const downstreamMap = new Map<string, Set<string>>();
  for (const event of unique) {
    const from = orgRef(event, "from");
    const to = orgRef(event, "to");
    if (from === to) continue;
    if (!downstreamMap.has(from)) downstreamMap.set(from, new Set());
    if (!upstreamMap.has(to)) upstreamMap.set(to, new Set());
    downstreamMap.get(from)?.add(to);
    upstreamMap.get(to)?.add(from);
  }

  const nodes: Node<GraphNodeData>[] = [];

  for (const batch of scopedBatches) {
    const batchEvents = unique.filter((event) => event.batchId === batch.batchId);
    const flow = flowByBatch[batch.batchId];
    const analysis = analysesByBatch[batch.batchId];
    const evidenceItems = [...(flow?.evidenceGaps ?? [])];
    nodes.push({
      id: `batch:${batch.batchId}`,
      type: "traceNode",
      position: { x: 0, y: 0 },
      data: {
        kind: "BATCH",
        entityType: "batch",
        label: batch.batchId,
        subtitle: batch.productName || "Not recorded",
        refId: batch.batchId,
        batchId: batch.batchId,
        batchIds: [batch.batchId],
        location: batch.origin || "Not recorded",
        organizationType: "Batch",
        currentInventory: null,
        affectedQuantity: flow?.affectedQuantity ?? null,
        accountedQuantity: flow?.accountedQuantity ?? null,
        unaccountedQuantity: flow?.unaccountedQuantity ?? null,
        upstreamOrganizationIds: [],
        downstreamOrganizationIds: [...new Set(batchEvents.map((event) => orgRef(event, "from")))],
        upstreamOrganizationNames: [],
        downstreamOrganizationNames: [
          ...new Set(
            batchEvents.map((event) =>
              displayOrganizationName(orgRef(event, "from"), organizationsById),
            ),
          ),
        ].sort(),
        lastEvent: latestEvent(batchEvents),
        connectedToIncident: selectedIncident ? selectedIncident.batchId === batch.batchId : null,
        exposureRisk: analysis?.exposureRisk ?? null,
        evidenceConfidence: analysis?.evidenceConfidence ?? null,
        priority: analysis?.priority ?? null,
        evidenceState: mapVerificationToEvidenceState(batchEvents, evidenceItems),
        evidenceItems,
        investigationState: "default",
        investigationDirection: null,
        detail: [
          { label: "Status", value: batch.status.replace(/_/g, " ") },
          { label: "Quantity", value: compactNumber(batch.quantity) },
          { label: "Origin", value: batch.origin || "Not recorded" },
          { label: "Custody events", value: String(batchEvents.length) },
        ],
      },
    });
  }

  for (const organizationId of [...usedOrganizationIds].sort()) {
    const resolved = resolveOrganization(organizationId, organizationsById);
    const relatedEvents = unique.filter(
      (event) => orgRef(event, "from") === organizationId || orgRef(event, "to") === organizationId,
    );
    const batchIds = [...new Set(relatedEvents.map((event) => event.batchId))].sort();
    const currentInventory = batchIds.reduce((sum, batchId) => {
      const flow = flowByBatch[batchId];
      return (
        sum +
        (flow?.inventoryPositions
          .filter((position) => position.organizationId === organizationId)
          .reduce((positionSum, position) => positionSum + position.quantity, 0) ?? 0)
      );
    }, 0);
    const affectedQuantity = batchIds.reduce((sum, batchId) => {
      const flow = flowByBatch[batchId];
      return (
        sum +
        (flow?.inventoryPositions
          .filter(
            (position) => position.organizationId === organizationId && !position.isManufacturer,
          )
          .reduce((positionSum, position) => positionSum + position.quantity, 0) ?? 0)
      );
    }, 0);
    const evidenceItems = getNodeEvidenceItems(
      organizationId,
      resolved.known,
      relatedEvents,
      eventById,
      duplicateCount,
    );
    const nodeId = orgNodeId(organizationId, resolved.known);
    const upstreamOrganizationIds = [...(upstreamMap.get(organizationId) ?? [])].sort();
    const downstreamOrganizationIds = [...(downstreamMap.get(organizationId) ?? [])].sort();

    nodes.push({
      id: nodeId,
      type: "traceNode",
      position: { x: 0, y: 0 },
      data: {
        kind: resolved.kind,
        entityType: resolved.known ? "organization" : "unknown",
        label: resolved.label,
        subtitle: resolved.subtitle,
        refId: organizationId,
        organizationId,
        batchIds,
        location: resolved.location,
        organizationType: resolved.type,
        currentInventory,
        affectedQuantity,
        accountedQuantity: null,
        unaccountedQuantity: null,
        upstreamOrganizationIds,
        downstreamOrganizationIds,
        upstreamOrganizationNames: upstreamOrganizationIds
          .map((id) => displayOrganizationName(id, organizationsById))
          .sort(),
        downstreamOrganizationNames: downstreamOrganizationIds
          .map((id) => displayOrganizationName(id, organizationsById))
          .sort(),
        lastEvent: latestEvent(relatedEvents),
        connectedToIncident: selectedIncident ? batchIds.includes(selectedIncident.batchId) : null,
        exposureRisk:
          selectedIncident && batchIds.includes(selectedIncident.batchId)
            ? (analysesByBatch[selectedIncident.batchId]?.exposureRisk ?? null)
            : null,
        evidenceConfidence:
          selectedIncident && batchIds.includes(selectedIncident.batchId)
            ? (analysesByBatch[selectedIncident.batchId]?.evidenceConfidence ?? null)
            : null,
        priority:
          selectedIncident && batchIds.includes(selectedIncident.batchId)
            ? (analysesByBatch[selectedIncident.batchId]?.priority ?? null)
            : null,
        evidenceState: mapVerificationToEvidenceState(relatedEvents, evidenceItems),
        evidenceItems,
        investigationState: "default",
        investigationDirection: null,
        detail: [
          { label: "Type", value: resolved.type },
          { label: "Inventory", value: compactNumber(currentInventory) },
          { label: "Batches", value: batchIds.join(", ") || "Not recorded" },
        ],
      },
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: Edge<GraphEdgeData>[] = [];
  const firstEventByBatch = new Map<string, CustodyEvent>();
  for (const event of unique) {
    if (!firstEventByBatch.has(event.batchId)) {
      firstEventByBatch.set(event.batchId, event);
    }
  }

  for (const [batchId, firstEvent] of firstEventByBatch.entries()) {
    const source = `batch:${batchId}`;
    const targetOrgId = orgRef(firstEvent, "from");
    const target = orgNodeId(targetOrgId, organizationsById.has(targetOrgId));
    if (nodeIds.has(source) && nodeIds.has(target)) {
      const evidenceItems = getEdgeEvidenceItems(
        firstEvent,
        eventById,
        false,
        true,
        organizationsById.has(targetOrgId),
      );
      edges.push({
        id: `batch:${batchId}:event:${firstEvent.eventId}`,
        source,
        target,
        label: "origin",
        markerEnd: { type: ARROW_CLOSED },
        data: {
          event: firstEvent,
          batchId,
          evidenceState: mapVerificationToEvidenceState([firstEvent], evidenceItems),
          evidenceItems,
          previousEventId: firstEvent.previousEventId,
          duplicate: false,
          sourceOrganizationId: batchId,
          targetOrganizationId: targetOrgId,
          sourceOrganizationName: batchId,
          targetOrganizationName: displayOrganizationName(targetOrgId, organizationsById),
          investigationState: "default",
        },
      });
    }
  }

  for (const event of unique) {
    const sourceOrgId = orgRef(event, "from");
    const targetOrgId = orgRef(event, "to");
    if (sourceOrgId === targetOrgId || !MOVEMENT_EVENTS.has(event.type)) continue;

    const sourceKnown = organizationsById.has(sourceOrgId);
    const targetKnown = organizationsById.has(targetOrgId);
    const source = orgNodeId(sourceOrgId, sourceKnown);
    const target = orgNodeId(targetOrgId, targetKnown);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

    const evidenceItems = getEdgeEvidenceItems(
      event,
      eventById,
      duplicateKeys.has(eventIdentityKey(event)) || duplicateKeys.has(eventDedupeKey(event)),
      sourceKnown,
      targetKnown,
    );

    edges.push({
      id: `event:${event.eventId}`,
      source,
      target,
      label: `${event.type.replace(/_/g, " ")} - ${compactNumber(event.quantity)}`,
      markerEnd: { type: ARROW_CLOSED },
      data: {
        event,
        batchId: event.batchId,
        evidenceState: mapVerificationToEvidenceState([event], evidenceItems),
        evidenceItems,
        previousEventId: event.previousEventId,
        duplicate: false,
        sourceOrganizationId: sourceOrgId,
        targetOrganizationId: targetOrgId,
        sourceOrganizationName: displayOrganizationName(sourceOrgId, organizationsById),
        targetOrganizationName: displayOrganizationName(targetOrgId, organizationsById),
        investigationState: "default",
      },
    });
  }

  const sortedNodes = layoutNodes(nodes);
  const evidenceGaps = [
    ...new Set(Object.values(flowByBatch).flatMap((flow) => flow.evidenceGaps)),
  ];

  return {
    nodes: sortedNodes,
    edges,
    analysesByBatch,
    flowByBatch,
    scopedBatchIds: [...scopedBatchIds],
    evidenceGaps,
  };
}

function layoutNodes(nodes: Node<GraphNodeData>[]) {
  const rowCursor: Record<number, number> = {};
  return [...nodes]
    .sort((a, b) => {
      const colA = COLUMN[a.data.kind];
      const colB = COLUMN[b.data.kind];
      return colA - colB || a.data.label.localeCompare(b.data.label);
    })
    .map((node) => {
      const col = COLUMN[node.data.kind];
      const row = rowCursor[col] ?? 0;
      rowCursor[col] = row + 1;
      return {
        ...node,
        position: { x: col * 270, y: row * 132 },
      };
    });
}

export function getConnectedPath(
  edges: Edge<GraphEdgeData>[],
  selectedNodeId: string | null,
): ConnectedPath {
  if (!selectedNodeId) {
    return {
      selectedNodeId: null,
      nodeIds: new Set(),
      edgeIds: new Set(),
      upstreamNodeIds: new Set(),
      downstreamNodeIds: new Set(),
      directUpstreamNodeIds: new Set(),
      directDownstreamNodeIds: new Set(),
    };
  }

  const upstreamNodeIds = new Set<string>();
  const downstreamNodeIds = new Set<string>();
  const directUpstreamNodeIds = new Set<string>();
  const directDownstreamNodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const selectedIsBatch = selectedNodeId.startsWith("batch:");

  const walkUpstream = (nodeId: string) => {
    for (const edge of edges) {
      if (edge.target !== nodeId) continue;
      if (!selectedIsBatch && edge.source.startsWith("batch:")) continue;
      edgeIds.add(edge.id);
      if (nodeId === selectedNodeId) directUpstreamNodeIds.add(edge.source);
      if (!upstreamNodeIds.has(edge.source)) {
        upstreamNodeIds.add(edge.source);
        walkUpstream(edge.source);
      }
    }
  };

  const walkDownstream = (nodeId: string) => {
    for (const edge of edges) {
      if (edge.source !== nodeId) continue;
      edgeIds.add(edge.id);
      if (nodeId === selectedNodeId) directDownstreamNodeIds.add(edge.target);
      if (!downstreamNodeIds.has(edge.target)) {
        downstreamNodeIds.add(edge.target);
        walkDownstream(edge.target);
      }
    }
  };

  walkUpstream(selectedNodeId);
  walkDownstream(selectedNodeId);

  return {
    selectedNodeId,
    nodeIds: new Set([selectedNodeId, ...upstreamNodeIds, ...downstreamNodeIds]),
    edgeIds,
    upstreamNodeIds,
    downstreamNodeIds,
    directUpstreamNodeIds,
    directDownstreamNodeIds,
  };
}

export function applyInvestigationHighlight(
  nodes: Node<GraphNodeData>[],
  edges: Edge<GraphEdgeData>[],
  selectedNodeId: string | null,
  selectedEdgeId: string | null = null,
) {
  const connectedPath = getConnectedPath(edges, selectedNodeId);
  const hasSelection = Boolean(selectedNodeId || selectedEdgeId);
  const selectedEdge = selectedEdgeId
    ? edges.find((edge) => edge.id === selectedEdgeId)
    : undefined;
  const edgeNodeIds = selectedEdge
    ? new Set([selectedEdge.source, selectedEdge.target])
    : new Set<string>();

  const styledNodes = nodes.map((node) => {
    let investigationState: InvestigationState = "default";
    let investigationDirection: GraphDirection | null = null;

    if (selectedNodeId) {
      if (node.id === selectedNodeId) {
        investigationState = "selected";
        investigationDirection = "self";
      } else if (connectedPath.nodeIds.has(node.id)) {
        investigationState = "connected";
        investigationDirection = connectedPath.upstreamNodeIds.has(node.id)
          ? "upstream"
          : connectedPath.downstreamNodeIds.has(node.id)
            ? "downstream"
            : "connected";
      } else {
        investigationState = "dimmed";
      }
    } else if (selectedEdgeId) {
      investigationState = edgeNodeIds.has(node.id) ? "connected" : "dimmed";
      investigationDirection = edgeNodeIds.has(node.id) ? "connected" : null;
    }

    return {
      ...node,
      selected: node.id === selectedNodeId,
      data: {
        ...node.data,
        investigationState,
        investigationDirection,
      },
    };
  });

  const styledEdges = edges.map((edge) => {
    let investigationState: InvestigationState = "default";
    if (selectedEdgeId === edge.id) {
      investigationState = "selected";
    } else if (selectedNodeId) {
      investigationState = connectedPath.edgeIds.has(edge.id) ? "connected" : "dimmed";
    } else if (selectedEdgeId) {
      investigationState = "dimmed";
    }

    const isActive = investigationState === "selected" || investigationState === "connected";
    const isDimmed = hasSelection && investigationState === "dimmed";

    return {
      ...edge,
      animated: isActive,
      style: {
        stroke:
          investigationState === "selected"
            ? "var(--seal-400)"
            : isActive
              ? "var(--seal-500)"
              : "var(--ink-700)",
        strokeWidth: isActive ? 2.5 : 1.2,
        opacity: isDimmed ? 0.18 : 1,
      },
      labelStyle: {
        fill: isDimmed ? "var(--mist-500)" : "var(--mist-300)",
        fontSize: 10,
      },
      data: {
        ...edge.data,
        investigationState,
      },
    };
  });

  return { nodes: styledNodes, edges: styledEdges, connectedPath };
}

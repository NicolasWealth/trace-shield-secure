import { applyInvestigationHighlight, buildSupplyChainGraph, getConnectedPath } from "../graph";
import { calculateInventoryFlow } from "../riskEngine.ts";
import type { Batch, CustodyEvent, Incident, Organization } from "@/types";

const organizations: Organization[] = [
  { organizationId: "MFR-1", name: "Manufacturer A", type: "MANUFACTURER", location: "Ogun" },
  { organizationId: "DIST-1", name: "Distributor", type: "DISTRIBUTOR", location: "Lagos" },
  { organizationId: "WH-1", name: "Warehouse", type: "WAREHOUSE", location: "Ikeja" },
  { organizationId: "RET-LAGOS", name: "Retailer Lagos", type: "RETAILER", location: "Lagos" },
  { organizationId: "RET-ABUJA", name: "Retailer Abuja", type: "RETAILER", location: "Abuja" },
];

const batch: Batch = {
  batchId: "B-5000",
  productName: "Test Batch",
  quantity: 5000,
  productionDate: "2026-09-01T00:00:00Z",
  expiryDate: "2026-12-01T00:00:00Z",
  origin: "Ogun",
  organizationId: "MFR-1",
  status: "IN_TRANSIT",
  createdAt: "2026-09-01T00:00:00Z",
};

const otherBatch: Batch = {
  ...batch,
  batchId: "B-OTHER",
  quantity: 900,
};

const incident: Incident = {
  incidentId: "INC-1",
  batchId: "B-5000",
  type: "CONTAMINATION",
  description: "Confirmed contamination affecting the investigation test batch.",
  status: "OPEN",
  createdAt: "2026-09-05T00:00:00Z",
  createdBy: "USR-1",
};

const event = (
  eventId: string,
  type: CustodyEvent["type"],
  fromOrganization: string,
  toOrganization: string,
  quantity: number,
  timestamp: string,
  previousEventId: string | null,
  batchId = "B-5000",
): CustodyEvent => ({
  eventId,
  batchId,
  type,
  fromOrganization,
  toOrganization,
  location: toOrganization === "RET-ABUJA" ? "Abuja" : "Lagos",
  quantity,
  timestamp,
  previousEventId,
  eventHash: "",
  blockchainTxHash: "",
  verificationStatus: "PENDING_INTEGRATION",
});

const demoScenarioEvents: CustodyEvent[] = [
  event("E1", "PRODUCED", "MFR-1", "MFR-1", 5000, "2026-09-01T01:00:00Z", null),
  event("E2", "SHIPPED", "MFR-1", "DIST-1", 5000, "2026-09-01T02:00:00Z", "E1"),
  event("E3", "RECEIVED", "MFR-1", "DIST-1", 5000, "2026-09-01T03:00:00Z", "E2"),
  event("E4", "STORED", "DIST-1", "WH-1", 5000, "2026-09-01T04:00:00Z", "E3"),
  event("E5", "SHIPPED", "WH-1", "RET-LAGOS", 2500, "2026-09-01T05:00:00Z", "E4"),
  event("E6", "SHIPPED", "WH-1", "RET-ABUJA", 2500, "2026-09-01T06:00:00Z", "E5"),
];

export function runAllGraphTests(): {
  passed: number;
  failed: number;
  results: Array<{ name: string; success: boolean; details?: string }>;
} {
  const results: Array<{ name: string; success: boolean; details?: string }> = [];

  const assert = (name: string, condition: boolean, details?: string) => {
    if (condition) {
      results.push({ name, success: true });
    } else if (details) {
      results.push({ name, success: false, details });
    } else {
      results.push({ name, success: false });
    }
  };

  const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

  try {
    const a = buildSupplyChainGraph(organizations, [batch], demoScenarioEvents);
    const b = buildSupplyChainGraph(organizations, [batch], demoScenarioEvents);
    assert(
      "Graph 1: deterministic organization/node mapping",
      a.nodes.map((node) => node.id).join("|") === b.nodes.map((node) => node.id).join("|"),
      "Repeated graph builds produced different node IDs or order.",
    );
  } catch (err) {
    assert("Graph 1: deterministic organization/node mapping", false, errorMessage(err));
  }

  try {
    const graph = buildSupplyChainGraph(organizations, [batch], demoScenarioEvents);
    const edge = graph.edges.find((item) => item.id === "event:E2");
    assert(
      "Graph 2: correct edge mapping from custody events",
      edge?.source === "org:MFR-1" &&
        edge.target === "org:DIST-1" &&
        edge.data?.event.quantity === 5000,
      `Unexpected edge mapping: ${JSON.stringify(edge)}`,
    );
  } catch (err) {
    assert("Graph 2: correct edge mapping from custody events", false, errorMessage(err));
  }

  try {
    const graph = buildSupplyChainGraph(
      organizations,
      [batch],
      [...demoScenarioEvents.slice(0, 2), demoScenarioEvents[1]!],
    );
    const duplicateEdges = graph.edges.filter((item) => item.id === "event:E2");
    const nodeHasGap = graph.nodes.some((node) =>
      node.data.evidenceItems.some((item) => item.includes("duplicate custody event")),
    );
    assert(
      "Graph 3: duplicate event handling",
      duplicateEdges.length === 1 && nodeHasGap,
      `Expected one E2 edge and visible duplicate gap, got ${duplicateEdges.length}.`,
    );
  } catch (err) {
    assert("Graph 3: duplicate event handling", false, errorMessage(err));
  }

  try {
    const graph = buildSupplyChainGraph(organizations, [batch], demoScenarioEvents);
    const edge = graph.edges.find((item) => item.id === "event:E4");
    assert(
      "Graph 4: previousEventId relationships preserved",
      edge?.data?.previousEventId === "E3",
      `Expected previousEventId E3, got ${edge?.data?.previousEventId}`,
    );
  } catch (err) {
    assert("Graph 4: previousEventId relationships preserved", false, errorMessage(err));
  }

  try {
    const graph = buildSupplyChainGraph(organizations, [batch], demoScenarioEvents);
    const path = getConnectedPath(graph.edges, "org:WH-1");
    assert(
      "Graph 5: connected upstream/downstream detection",
      path.upstreamNodeIds.has("org:MFR-1") &&
        path.upstreamNodeIds.has("org:DIST-1") &&
        path.downstreamNodeIds.has("org:RET-LAGOS") &&
        path.downstreamNodeIds.has("org:RET-ABUJA"),
      "Warehouse path did not include expected upstream and downstream nodes.",
    );
  } catch (err) {
    assert("Graph 5: connected upstream/downstream detection", false, errorMessage(err));
  }

  try {
    const graph = buildSupplyChainGraph(organizations, [batch], demoScenarioEvents);
    const highlighted = applyInvestigationHighlight(graph.nodes, graph.edges, "org:WH-1");
    const selected = highlighted.nodes.find((node) => node.id === "org:WH-1");
    assert(
      "Graph 6: selected-node highlighting logic",
      selected?.data.investigationState === "selected",
      `Expected selected state, got ${selected?.data.investigationState}`,
    );
  } catch (err) {
    assert("Graph 6: selected-node highlighting logic", false, errorMessage(err));
  }

  try {
    const unrelated = event(
      "E-OTHER",
      "SHIPPED",
      "MFR-1",
      "RET-LAGOS",
      900,
      "2026-09-02T01:00:00Z",
      null,
      "B-OTHER",
    );
    const graph = buildSupplyChainGraph(
      organizations,
      [batch, otherBatch],
      [...demoScenarioEvents, unrelated],
    );
    const highlighted = applyInvestigationHighlight(graph.nodes, graph.edges, "org:RET-ABUJA");
    const unrelatedBatch = highlighted.nodes.find((node) => node.id === "batch:B-OTHER");
    assert(
      "Graph 7: unrelated-node dimming logic",
      unrelatedBatch?.data.investigationState === "dimmed",
      `Expected unrelated batch dimmed, got ${unrelatedBatch?.data.investigationState}`,
    );
  } catch (err) {
    assert("Graph 7: unrelated-node dimming logic", false, errorMessage(err));
  }

  try {
    const missingOrgEvent = event(
      "E-MISS",
      "SHIPPED",
      "MFR-1",
      "ORG-MISSING",
      100,
      "2026-09-01T07:00:00Z",
      "E1",
    );
    const graph = buildSupplyChainGraph(
      organizations,
      [batch],
      [demoScenarioEvents[0]!, missingOrgEvent],
    );
    const unknown = graph.nodes.find((node) => node.id === "unknown:ORG-MISSING");
    assert(
      "Graph 8: missing organization handling",
      unknown?.data.kind === "UNKNOWN" && unknown.data.evidenceState === "EVIDENCE_GAP",
      "Missing organization was not represented as an evidence-gap node.",
    );
  } catch (err) {
    assert("Graph 8: missing organization handling", false, errorMessage(err));
  }

  try {
    const broken = event(
      "E-BROKEN",
      "SHIPPED",
      "MFR-1",
      "DIST-1",
      5000,
      "2026-09-01T02:00:00Z",
      "NOPE",
    );
    const graph = buildSupplyChainGraph(organizations, [batch], [demoScenarioEvents[0]!, broken]);
    const edge = graph.edges.find((item) => item.id === "event:E-BROKEN");
    assert(
      "Graph 9: broken chain handling",
      edge?.data?.evidenceState === "EVIDENCE_GAP",
      `Expected evidence gap edge, got ${edge?.data?.evidenceState}`,
    );
  } catch (err) {
    assert("Graph 9: broken chain handling", false, errorMessage(err));
  }

  try {
    const other = event(
      "E-OTHER",
      "SHIPPED",
      "MFR-1",
      "RET-LAGOS",
      900,
      "2026-09-02T01:00:00Z",
      null,
      "B-OTHER",
    );
    const graph = buildSupplyChainGraph(
      organizations,
      [batch, otherBatch],
      [...demoScenarioEvents, other],
      "B-5000",
    );
    assert(
      "Graph 10: batch-specific graph filtering",
      !graph.nodes.some((node) => node.id === "batch:B-OTHER") &&
        !graph.edges.some((edge) => edge.data?.batchId === "B-OTHER"),
      "Selected batch graph leaked unrelated batch data.",
    );
  } catch (err) {
    assert("Graph 10: batch-specific graph filtering", false, errorMessage(err));
  }

  try {
    const graph = buildSupplyChainGraph(organizations, [batch], demoScenarioEvents);
    const flow = calculateInventoryFlow(batch, demoScenarioEvents, organizations);
    assert(
      "Graph 11: inventory values match inventory-flow source of truth",
      graph.flowByBatch["B-5000"]?.affectedQuantity === flow.affectedQuantity,
      `Expected ${flow.affectedQuantity}, got ${graph.flowByBatch["B-5000"]?.affectedQuantity}`,
    );
  } catch (err) {
    assert(
      "Graph 11: inventory values match inventory-flow source of truth",
      false,
      errorMessage(err),
    );
  }

  try {
    const graph = buildSupplyChainGraph(
      organizations,
      [batch],
      demoScenarioEvents,
      "B-5000",
      incident,
    );
    assert(
      "Graph 12: no raw-event quantity double counting",
      graph.flowByBatch["B-5000"]?.affectedQuantity === 5000,
      `Expected 5000 affected units, got ${graph.flowByBatch["B-5000"]?.affectedQuantity}`,
    );
  } catch (err) {
    assert("Graph 12: no raw-event quantity double counting", false, errorMessage(err));
  }

  try {
    const broken = event(
      "E-BROKEN",
      "SHIPPED",
      "MFR-1",
      "DIST-1",
      5000,
      "2026-09-01T02:00:00Z",
      "NOPE",
    );
    const graph = buildSupplyChainGraph(organizations, [batch], [demoScenarioEvents[0]!, broken]);
    const batchNode = graph.nodes.find((node) => node.id === "batch:B-5000");
    assert(
      "Graph 13: evidence gaps remain visible",
      Boolean(batchNode?.data.evidenceItems.some((item) => item.includes("Broken custody link"))),
      "Batch-level evidence gap was not visible on graph data.",
    );
  } catch (err) {
    assert("Graph 13: evidence gaps remain visible", false, errorMessage(err));
  }

  try {
    const graph = buildSupplyChainGraph([], [], []);
    assert(
      "Graph 14: empty graph behavior",
      graph.nodes.length === 0 && graph.edges.length === 0,
      `Expected empty graph, got ${graph.nodes.length} nodes and ${graph.edges.length} edges.`,
    );
  } catch (err) {
    assert("Graph 14: empty graph behavior", false, errorMessage(err));
  }

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return { passed, failed, results };
}

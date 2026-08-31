/**
 * Deterministic, transparent recall-scoring engine.
 * No AI, no external calls — every point is explainable and reproducible.
 * Isolated here so it can be replaced or extended later.
 */
import type {
  AffectedLocation,
  Analysis,
  Batch,
  CustodyEvent,
  Incident,
  Organization,
  Priority,
} from "@/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const TYPE_SEVERITY: Record<Incident["type"], number> = {
  CONTAMINATION: 45,
  COLD_CHAIN_BREAK: 30,
  FOREIGN_BODY: 35,
  LABELLING: 12,
  OTHER: 18,
};

const TYPE_EVIDENCE: Record<Incident["type"], number> = {
  CONTAMINATION: 40,
  COLD_CHAIN_BREAK: 30,
  FOREIGN_BODY: 28,
  LABELLING: 35,
  OTHER: 20,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  IMMEDIATE_RECALL: "Immediate Recall",
  URGENT_INVESTIGATION: "Urgent Investigation",
  MONITOR: "Monitor",
  VERIFY_EVIDENCE: "Verify Evidence",
};

const RECOMMENDED_ACTION: Record<Priority, string> = {
  IMMEDIATE_RECALL:
    "Issue a targeted recall notice to every affected location now, quarantine remaining stock and notify the regulator.",
  URGENT_INVESTIGATION:
    "Hold distribution for the affected locations and close the evidence gaps within 24 hours before deciding on a recall.",
  MONITOR:
    "Keep the batch under active surveillance, sample the next delivery and re-score if new custody events arrive.",
  VERIFY_EVIDENCE:
    "Collect further laboratory and custody evidence; there is not enough signal to justify market action yet.",
};

/** The four documented priority rules. */
export function resolvePriority(exposureRisk: number, evidenceConfidence: number): Priority {
  if (exposureRisk >= 80 && evidenceConfidence >= 80) return "IMMEDIATE_RECALL";
  if (exposureRisk >= 80) return "URGENT_INVESTIGATION";
  if (evidenceConfidence >= 80) return "MONITOR";
  return "VERIFY_EVIDENCE";
}

export interface AnalysisInput {
  incident: Incident;
  batch?: Batch;
  events: CustodyEvent[];
  organizations: Organization[];
}

export function analyseIncident({
  incident,
  batch,
  events,
  organizations,
}: AnalysisInput): Analysis {
  const orgName = (id: string) =>
    organizations.find((o) => o.organizationId === id)?.name ?? id;

  const batchEvents = events
    .filter((e) => e.batchId === incident.batchId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // --- Affected downstream locations -------------------------------------
  const downstream = new Map<string, AffectedLocation>();
  for (const e of batchEvents) {
    const org = organizations.find((o) => o.organizationId === e.toOrganization);
    if (!org || org.type === "MANUFACTURER") continue;
    const key = `${org.organizationId}|${e.location}`;
    const existing = downstream.get(key);
    if (existing) existing.quantity += e.quantity;
    else
      downstream.set(key, {
        location: e.location,
        organization: orgName(e.toOrganization),
        quantity: e.quantity,
      });
  }
  const affectedLocations = [...downstream.values()].sort((a, b) => b.quantity - a.quantity);
  const affectedQuantity = affectedLocations.reduce((s, l) => s + l.quantity, 0);

  const retailReach = affectedLocations.filter((l) =>
    organizations.some(
      (o) => o.name === l.organization && o.type === "RETAILER",
    ),
  ).length;

  const reasons: string[] = [];

  // --- Exposure risk ------------------------------------------------------
  let exposure = TYPE_SEVERITY[incident.type];
  reasons.push(
    `Incident type ${incident.type.replace(/_/g, " ").toLowerCase()} contributes ${TYPE_SEVERITY[incident.type]} exposure points.`,
  );

  const spreadPoints = Math.min(25, affectedLocations.length * 6);
  exposure += spreadPoints;
  reasons.push(
    `${affectedLocations.length} affected location(s) in the custody chain add ${spreadPoints} points.`,
  );

  const retailPoints = Math.min(18, retailReach * 9);
  exposure += retailPoints;
  reasons.push(
    retailReach > 0
      ? `${retailReach} retail endpoint(s) reached by consumers add ${retailPoints} points.`
      : "No retail endpoint reached yet, so no consumer-reach points were added.",
  );

  const volumePoints = affectedQuantity >= 4000 ? 15 : affectedQuantity >= 1500 ? 10 : 4;
  exposure += volumePoints;
  reasons.push(
    `${affectedQuantity.toLocaleString()} affected units add ${volumePoints} volume points.`,
  );

  if (batch) {
    const expiry = new Date(batch.expiryDate).getTime();
    const shelfLifeLeft = expiry - Date.now();
    if (shelfLifeLeft > 0) {
      exposure += 8;
      reasons.push("Product is still within shelf life, so it may still be consumed (+8).");
    } else {
      reasons.push("Product is past its expiry date, reducing further consumer exposure (+0).");
    }
    if (batch.status === "RECALLED" || batch.status === "HELD") {
      exposure -= 12;
      reasons.push(`Batch is already ${batch.status.toLowerCase()}, reducing exposure by 12.`);
    }
  } else {
    reasons.push("No batch record was found, so shelf-life exposure could not be assessed.");
  }

  // --- Evidence confidence ------------------------------------------------
  let confidence = TYPE_EVIDENCE[incident.type];
  reasons.push(
    `Baseline evidence for a ${incident.type.replace(/_/g, " ").toLowerCase()} report is ${TYPE_EVIDENCE[incident.type]} points.`,
  );

  const chainPoints = Math.min(25, batchEvents.length * 4);
  confidence += chainPoints;
  reasons.push(`${batchEvents.length} recorded custody event(s) add ${chainPoints} points.`);

  const linked = batchEvents.filter((e, i) => i === 0 || e.previousEventId !== null).length;
  const chainComplete = batchEvents.length > 0 && linked === batchEvents.length;
  if (chainComplete) {
    confidence += 12;
    reasons.push("Custody chain is unbroken end to end (+12).");
  } else {
    reasons.push("Custody chain has gaps between events, so no continuity points were awarded.");
  }

  const descriptionPoints = incident.description.trim().length >= 120 ? 10 : 3;
  confidence += descriptionPoints;
  reasons.push(`Incident report detail adds ${descriptionPoints} points.`);

  if (incident.status === "INVESTIGATING") {
    confidence += 5;
    reasons.push("Investigation is already under way (+5).");
  }

  const verified = batchEvents.filter((e) => e.verificationStatus === "VERIFIED").length;
  if (verified === 0) {
    reasons.push(
      "No custody event is cryptographically verified — blockchain anchoring is pending integration, so no verification points were awarded.",
    );
  } else {
    confidence += Math.min(10, verified * 2);
    reasons.push(`${verified} verified custody event(s) add confidence.`);
  }

  const exposureRisk = clamp(exposure);
  const evidenceConfidence = clamp(confidence);
  const priority = resolvePriority(exposureRisk, evidenceConfidence);

  return {
    analysisId: `ANL-${incident.incidentId}`,
    incidentId: incident.incidentId,
    batchId: incident.batchId,
    affectedLocations,
    affectedQuantity,
    exposureRisk,
    evidenceConfidence,
    priority,
    reasons,
    recommendedAction: RECOMMENDED_ACTION[priority],
    generatedAt: new Date().toISOString(),
  };
}

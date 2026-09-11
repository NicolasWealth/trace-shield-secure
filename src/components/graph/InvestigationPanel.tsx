import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, titleCase } from "@/lib/format";
import type { GraphEdgeData, GraphEvidenceState, GraphNodeData } from "@/services/graph";
import type { Edge, Node } from "@xyflow/react";

interface Props {
  selectedNode: Node<GraphNodeData> | null;
  selectedEdge: Edge<GraphEdgeData> | null;
  onClose: () => void;
}

const EVIDENCE_LABEL: Record<GraphEvidenceState, string> = {
  VERIFIED: "Verified",
  PENDING_VERIFICATION: "Pending verification",
  EVIDENCE_GAP: "Evidence gap",
  UNKNOWN: "Unknown",
};

const EVIDENCE_TONE: Record<GraphEvidenceState, string> = {
  VERIFIED: "border-ok-500/45 bg-ok-500/12 text-ok-400",
  PENDING_VERIFICATION: "border-seal-500/45 bg-seal-500/12 text-seal-400",
  EVIDENCE_GAP: "border-crit-500/50 bg-crit-500/12 text-crit-400",
  UNKNOWN: "border-mist-500/30 bg-secondary text-mist-400",
};

function EmptyValue({ children }: { children: string | number | null | undefined }) {
  const value =
    children === "" || children === null || children === undefined ? "Not recorded" : children;
  return <span className="text-mist-300">{value}</span>;
}

function EvidencePill({ state }: { state: GraphEvidenceState }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
        EVIDENCE_TONE[state],
      )}
    >
      {EVIDENCE_LABEL[state]}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/70 py-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[62%] text-right font-mono text-mist-300">
        <EmptyValue>{value}</EmptyValue>
      </dd>
    </div>
  );
}

function formatOptionalDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return formatDateTime(value);
}

function formatHash(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

function formatEventVerification(edge: GraphEdgeData) {
  const hasCryptoProof = Boolean(
    edge.event.eventHash?.trim() && edge.event.blockchainTxHash?.trim(),
  );
  if (edge.event.verificationStatus === "VERIFIED" && hasCryptoProof) {
    return "Cryptographically verified";
  }
  if (edge.event.verificationStatus === "VERIFIED") {
    return "Operationally recorded; crypto pending";
  }
  return "Pending verification";
}

export function InvestigationPanel({ selectedNode, selectedEdge, onClose }: Props) {
  const node = selectedNode?.data ?? null;
  const edge = selectedEdge?.data ?? null;

  return (
    <aside className="min-h-[70vh] rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Investigation
          </p>
          <h2 className="mt-1 font-display text-sm font-semibold text-foreground">
            {node?.label ?? edge?.event.eventId ?? "No selection"}
          </h2>
        </div>
        {node || edge ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail panel">
            <X className="size-4" />
          </Button>
        ) : null}
      </header>

      <div className="space-y-5 p-4">
        {node ? (
          <>
            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xs font-semibold text-foreground">Organization</h3>
                <EvidencePill state={node.evidenceState} />
              </div>
              <dl className="mt-2">
                <DetailRow label="Name" value={node.label} />
                <DetailRow label="Type" value={node.organizationType} />
                <DetailRow label="Location" value={node.location} />
              </dl>
            </section>

            <section>
              <h3 className="font-display text-xs font-semibold text-foreground">
                Supply-chain context
              </h3>
              <dl className="mt-2">
                <DetailRow
                  label="Batches handled"
                  value={node.batchIds.length ? node.batchIds.join(", ") : "Not recorded"}
                />
                <DetailRow
                  label="Current inventory"
                  value={
                    node.currentInventory === null
                      ? "Unknown"
                      : `${formatNumber(node.currentInventory)} units`
                  }
                />
                <DetailRow
                  label="Affected quantity"
                  value={
                    node.affectedQuantity === null
                      ? "Unknown"
                      : `${formatNumber(node.affectedQuantity)} units`
                  }
                />
                <DetailRow
                  label="Upstream"
                  value={
                    node.upstreamOrganizationNames.length
                      ? node.upstreamOrganizationNames.join(", ")
                      : "Not recorded"
                  }
                />
                <DetailRow
                  label="Downstream"
                  value={
                    node.downstreamOrganizationNames.length
                      ? node.downstreamOrganizationNames.join(", ")
                      : "Not recorded"
                  }
                />
                <DetailRow label="Last event" value={node.lastEvent?.eventId ?? "Not recorded"} />
                <DetailRow
                  label="Last timestamp"
                  value={formatOptionalDate(node.lastEvent?.timestamp)}
                />
              </dl>
            </section>

            <section>
              <h3 className="font-display text-xs font-semibold text-foreground">
                Incident context
              </h3>
              <dl className="mt-2">
                <DetailRow
                  label="Connected"
                  value={
                    node.connectedToIncident === null
                      ? "No incident selected"
                      : node.connectedToIncident
                        ? "Yes"
                        : "No"
                  }
                />
                <DetailRow
                  label="Exposure relevance"
                  value={node.exposureRisk === null ? "Unknown" : `${node.exposureRisk}/100`}
                />
                <DetailRow
                  label="Evidence relevance"
                  value={
                    node.evidenceConfidence === null ? "Unknown" : `${node.evidenceConfidence}/100`
                  }
                />
                <DetailRow
                  label="Priority"
                  value={node.priority ? titleCase(node.priority) : "Pending verification"}
                />
              </dl>
            </section>

            <section>
              <h3 className="font-display text-xs font-semibold text-foreground">Evidence</h3>
              <ul className="mt-2 space-y-2 text-xs text-mist-300">
                {node.evidenceItems.length ? (
                  node.evidenceItems.map((item) => (
                    <li
                      key={item}
                      className="rounded-sm border border-border/70 bg-secondary/50 p-2"
                    >
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">Pending verification</li>
                )}
              </ul>
            </section>
          </>
        ) : null}

        {edge ? (
          <>
            <section>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xs font-semibold text-foreground">
                  Custody event
                </h3>
                <EvidencePill state={edge.evidenceState} />
              </div>
              <dl className="mt-2">
                <DetailRow label="Event ID" value={edge.event.eventId} />
                <DetailRow label="Batch ID" value={edge.event.batchId} />
                <DetailRow label="Event type" value={titleCase(edge.event.type)} />
                <DetailRow label="Quantity" value={`${formatNumber(edge.event.quantity)} units`} />
                <DetailRow label="From" value={edge.sourceOrganizationName || "Unknown"} />
                <DetailRow label="To" value={edge.targetOrganizationName || "Unknown"} />
                <DetailRow label="Location" value={edge.event.location || "Not recorded"} />
                <DetailRow label="Timestamp" value={formatOptionalDate(edge.event.timestamp)} />
                <DetailRow
                  label="Previous event"
                  value={edge.event.previousEventId ?? "Not recorded"}
                />
                <DetailRow label="Verification" value={formatEventVerification(edge)} />
                <DetailRow
                  label="Event hash"
                  value={formatHash(edge.event.eventHash, "Pending cryptographic hashing")}
                />
                <DetailRow
                  label="Blockchain tx"
                  value={formatHash(edge.event.blockchainTxHash, "Pending blockchain integration")}
                />
              </dl>
            </section>

            <section>
              <h3 className="font-display text-xs font-semibold text-foreground">Evidence</h3>
              <ul className="mt-2 space-y-2 text-xs text-mist-300">
                {edge.evidenceItems.length ? (
                  edge.evidenceItems.map((item) => (
                    <li
                      key={item}
                      className="rounded-sm border border-border/70 bg-secondary/50 p-2"
                    >
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">Pending verification</li>
                )}
              </ul>
            </section>
          </>
        ) : null}

        {!node && !edge ? (
          <p className="text-sm text-muted-foreground">
            No organization, batch or custody edge is selected.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

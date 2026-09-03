import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { VerificationBadge } from "@/components/StatusBadge";
import { useTraceData } from "@/hooks/useTraceData";
import { formatDateTime, formatNumber, titleCase } from "@/lib/format";

export const Route = createFileRoute("/verification")({
  head: () => ({
    meta: [
      { title: "Verification Ledger — TraceShield" },
      {
        name: "description",
        content:
          "Chain-of-custody verification ledger showing which custody events are anchored and which are pending integration.",
      },
      { property: "og:title", content: "Verification ledger — TraceShield" },
      {
        property: "og:description",
        content: "Every custody record with its anchoring status and reserved hash fields.",
      },
    ],
  }),
  component: VerificationPage,
});

function VerificationPage() {
  const { events, organizations } = useTraceData();
  const name = (id: string) =>
    organizations.find((o) => o.organizationId === id)?.name ?? id;

  const verified = events.filter((e) => e.verificationStatus === "VERIFIED").length;
  const pending = events.length - verified;

  return (
    <AppShell
      title="Verification ledger"
      subtitle="Cryptographic anchoring is reserved but not yet integrated in this MVP."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Custody records" value={formatNumber(events.length)} />
        <MetricCard
          label="Verified on chain"
          value={formatNumber(verified)}
          tone={verified ? "ok" : "default"}
          hint="Anchored event hashes"
        />
        <MetricCard
          label="Pending integration"
          value={formatNumber(pending)}
          tone="warn"
          hint="Hash and tx fields reserved"
        />
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-sm font-semibold text-foreground">
          What "pending" means
        </h2>
        <p className="mt-2 text-sm text-mist-400">
          Every custody event already carries <span className="font-mono">eventHash</span>,{" "}
          <span className="font-mono">blockchainTxHash</span> and{" "}
          <span className="font-mono">previousEventId</span> fields so records form a linked
          chain. Until the anchoring service is connected, hashes stay empty and each record
          is marked pending — no record is presented as tamper-proof.
        </p>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Hand-off</th>
              <th className="px-4 py-3">Recorded</th>
              <th className="px-4 py-3">Prev</th>
              <th className="px-4 py-3">Tx hash</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((e) => (
              <tr key={e.eventId} className="hover:bg-secondary/40">
                <td className="px-4 py-3 font-mono text-xs text-mist-300">{e.eventId}</td>
                <td className="px-4 py-3">
                  <Link
                    to="/batches/$batchId"
                    params={{ batchId: e.batchId }}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {e.batchId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{titleCase(e.type)}</td>
                <td className="px-4 py-3 text-xs text-mist-400">
                  {name(e.fromOrganization)} → {name(e.toOrganization)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-mist-400">
                  {formatDateTime(e.timestamp)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-mist-500">
                  {e.previousEventId ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-mist-500">
                  {e.blockchainTxHash || "—"}
                </td>
                <td className="px-4 py-3">
                  <VerificationBadge status={e.verificationStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

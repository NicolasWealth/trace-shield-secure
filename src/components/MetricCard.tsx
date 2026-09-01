import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "critical" | "warn" | "ok";
}

const TONE = {
  default: "text-foreground",
  critical: "text-crit-400",
  warn: "text-seal-400",
  ok: "text-ok-400",
};

export function MetricCard({ label, value, hint, tone = "default" }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 font-display text-2xl font-semibold", TONE[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ScoreBar({ value, tone }: { value: number; tone: "risk" | "confidence" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn("h-full rounded-full", tone === "risk" ? "bg-crit-500" : "bg-ok-500")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

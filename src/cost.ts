import type { ApiJob, PricedJob } from "./types";
import { quoteRunner } from "./runners";

/** GitHub rounds each job up to the next whole minute. A started job is at least 1. */
export function billableMinutes(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  now = Date.now(),
): number {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return 0;
  const end = completedAt ? Date.parse(completedAt) : now;
  if (Number.isNaN(end)) return 0;
  const ms = Math.max(0, end - start);
  return Math.max(1, Math.ceil(ms / 60_000));
}

export function priceJob(job: ApiJob, isPrivate: boolean, now = Date.now()): PricedJob {
  const skipped =
    (job.conclusion ?? "").toLowerCase() === "skipped" || !job.started_at;
  if (skipped) {
    return {
      name: job.name,
      minutes: 0,
      quote: {
        label: (job.labels ?? []).join(", ") || "—",
        sku: "skipped",
        perMinute: 0,
        billed: false,
        kind: "skipped",
        note: "Job did not start",
      },
      costUsd: 0,
      listCostUsd: 0,
      skipped: true,
    };
  }

  const minutes = billableMinutes(job.started_at, job.completed_at, now);
  const quote = quoteRunner(job.labels ?? [], { isPrivate });
  const listCostUsd = roundUsd(minutes * quote.perMinute);
  const costUsd = quote.billed ? listCostUsd : 0;
  return {
    name: job.name,
    minutes,
    quote,
    costUsd,
    listCostUsd,
    skipped: false,
  };
}

export function roundUsd(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function formatUsd(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  if (Math.abs(n) < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

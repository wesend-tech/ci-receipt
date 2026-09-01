import { describe, expect, it } from "vitest";
import { billableMinutes, formatUsd, priceJob } from "../src/cost";

describe("billableMinutes", () => {
  it("rounds partial minutes up", () => {
    expect(
      billableMinutes("2026-09-01T10:00:00Z", "2026-09-01T10:00:01Z"),
    ).toBe(1);
    expect(
      billableMinutes("2026-09-01T10:00:00Z", "2026-09-01T10:01:00Z"),
    ).toBe(1);
    expect(
      billableMinutes("2026-09-01T10:00:00Z", "2026-09-01T10:01:01Z"),
    ).toBe(2);
  });

  it("uses now for in-progress jobs", () => {
    const start = "2026-09-01T10:00:00Z";
    const now = Date.parse("2026-09-01T10:07:30Z");
    expect(billableMinutes(start, null, now)).toBe(8);
  });

  it("returns 0 when the job never started", () => {
    expect(billableMinutes(null, null)).toBe(0);
  });
});

describe("priceJob", () => {
  it("prices private macOS at $0.062 per minute", () => {
    const job = priceJob(
      {
        name: "lint",
        started_at: "2026-09-01T10:00:00Z",
        completed_at: "2026-09-01T10:03:20Z",
        labels: ["macos-latest"],
      },
      true,
    );
    expect(job.minutes).toBe(4);
    expect(job.costUsd).toBe(0.248);
    expect(job.quote.sku).toBe("actions_macos");
  });

  it("waives standard runners on public repos", () => {
    const job = priceJob(
      {
        name: "test",
        started_at: "2026-09-01T10:00:00Z",
        completed_at: "2026-09-01T10:08:00Z",
        labels: ["ubuntu-latest"],
      },
      false,
    );
    expect(job.listCostUsd).toBe(0.048);
    expect(job.costUsd).toBe(0);
    expect(job.quote.billed).toBe(false);
  });

  it("still bills larger runners on public repos", () => {
    const job = priceJob(
      {
        name: "build",
        started_at: "2026-09-01T10:00:00Z",
        completed_at: "2026-09-01T10:10:00Z",
        labels: ["ubuntu-latest-16-cores"],
      },
      false,
    );
    expect(job.quote.kind).toBe("larger");
    expect(job.costUsd).toBe(0.42);
  });

  it("does not charge skipped jobs", () => {
    const job = priceJob(
      { name: "optional", conclusion: "skipped", labels: ["ubuntu-latest"] },
      true,
    );
    expect(job.costUsd).toBe(0);
    expect(job.skipped).toBe(true);
  });
});

describe("formatUsd", () => {
  it("keeps small amounts readable", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.006)).toBe("$0.0060");
    expect(formatUsd(0.248)).toBe("$0.248");
    expect(formatUsd(12.4)).toBe("$12.40");
  });
});

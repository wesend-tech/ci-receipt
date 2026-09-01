import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReceipt } from "../src/receipt";
import { renderMarkdown } from "../src/render";
import type { ApiJob } from "../src/types";

const fixtures = join(__dirname, "fixtures");

const wastefulJobs: ApiJob[] = [
  {
    name: "lint",
    started_at: "2026-09-01T10:00:00Z",
    completed_at: "2026-09-01T10:03:20Z",
    labels: ["macos-latest"],
  },
  {
    name: "test",
    started_at: "2026-09-01T10:00:00Z",
    completed_at: "2026-09-01T10:01:05Z",
    labels: ["ubuntu-latest"],
  },
  {
    name: "build",
    started_at: "2026-09-01T10:00:00Z",
    completed_at: "2026-09-01T10:08:00Z",
    labels: ["ubuntu-latest"],
  },
];

describe("findSmells", () => {
  it("flags macos lint, missing timeouts, cache, artifacts, concurrency", () => {
    const yaml = readFileSync(join(fixtures, "wasteful.yml"), "utf8");
    const receipt = buildReceipt({
      jobs: wastefulJobs,
      workflowYaml: yaml,
      isPrivate: true,
      runsPerMonth: 100,
    });
    const ids = receipt.findings.map((f) => f.id);
    expect(ids).toContain("missing-concurrency");
    expect(ids).toContain("macos:lint");
    expect(ids).toContain("timeout:lint");
    expect(ids).toContain("timeout:test");
    expect(ids).toContain("cache:lint");
    expect(ids).toContain("artifact:build");
    expect(ids).toContain("slim:test");

    const macos = receipt.findings.find((f) => f.id === "macos:lint");
    expect(macos?.thisRunSaveUsd).toBe(0.224);
    expect(macos?.monthlySaveUsd).toBe(22.4);
  });

  it("stays quiet on a tight workflow that actually needs macOS", () => {
    const yaml = readFileSync(join(fixtures, "clean.yml"), "utf8");
    const receipt = buildReceipt({
      jobs: [
        {
          name: "lint",
          started_at: "2026-09-01T10:00:00Z",
          completed_at: "2026-09-01T10:01:00Z",
          labels: ["ubuntu-slim"],
        },
        {
          name: "ios",
          started_at: "2026-09-01T10:00:00Z",
          completed_at: "2026-09-01T10:12:00Z",
          labels: ["macos-latest"],
        },
      ],
      workflowYaml: yaml,
      isPrivate: true,
      runsPerMonth: 100,
    });
    expect(receipt.findings).toEqual([]);
  });
});

describe("receipt totals", () => {
  it("sums private run cost", () => {
    const yaml = readFileSync(join(fixtures, "wasteful.yml"), "utf8");
    const receipt = buildReceipt({
      jobs: wastefulJobs,
      workflowYaml: yaml,
      isPrivate: true,
      runsPerMonth: 100,
      budgetUsd: 0.2,
    });
    // lint 4m * 0.062 = 0.248; test 2m * 0.006 = 0.012; build 8m * 0.006 = 0.048
    expect(receipt.totalUsd).toBe(0.308);
    expect(receipt.overBudget).toBe(true);
    expect(renderMarkdown(receipt)).toContain("Receipt · this run $0.308");
    expect(renderMarkdown(receipt)).toContain("runs-on: ubuntu-latest");
  });
});

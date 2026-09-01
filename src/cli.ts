#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildReceipt } from "./receipt";
import { renderMarkdown } from "./render";
import type { ApiJob } from "./types";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

function usage(): never {
  console.error(`Usage:
  npx tsx src/cli.ts --workflow <yml> --jobs <json> [--private] [--budget 1.00] [--runs-per-month 100]

The jobs file is a GitHub list-jobs payload: { "jobs": [ ... ] } or a raw array.`);
  process.exit(2);
}

function main(): void {
  const workflowPath = arg("--workflow");
  const jobsPath = arg("--jobs");
  if (!workflowPath || !jobsPath) usage();

  const workflowYaml = readFileSync(workflowPath, "utf8");
  const raw = JSON.parse(readFileSync(jobsPath, "utf8")) as { jobs?: ApiJob[] } | ApiJob[];
  const jobs = Array.isArray(raw) ? raw : (raw.jobs ?? []);
  const budget = arg("--budget");
  const runs = arg("--runs-per-month");

  const receipt = buildReceipt({
    jobs,
    workflowYaml,
    workflowPath,
    isPrivate: has("--private"),
    runsPerMonth: runs ? Number(runs) : 100,
    budgetUsd: budget ? Number(budget) : undefined,
  });

  process.stdout.write(renderMarkdown(receipt));
}

main();

import { parse as parseYaml } from "yaml";
import { RATES, isAppleTooling } from "./runners";
import { formatUsd, roundUsd } from "./cost";
import type { Finding, PricedJob } from "./types";

type WorkflowJob = {
  name: string;
  raw: Record<string, unknown>;
  runsOn: string[];
  timeoutMinutes?: number;
  steps: Record<string, unknown>[];
  isReusable: boolean;
  dump: string;
};

const INSTALL_WITHOUT_CACHE =
  /\b(npm ci|npm install|pnpm install|pnpm i\b|yarn install|pip install|pip3 install|bundle install|go mod download)\b/i;

export function findSmells(input: {
  workflowYaml: string;
  pricedJobs: PricedJob[];
  runsPerMonth: number;
}): Finding[] {
  const workflow = parseWorkflow(input.workflowYaml);
  if (!workflow) return [];

  const findings: Finding[] = [];
  const byName = indexPricedJobs(input.pricedJobs);

  if (isPullRequestWorkflow(workflow.on) && workflow.concurrency == null) {
    findings.push({
      id: "missing-concurrency",
      severity: "consider",
      title: "No `concurrency` group on a pull_request workflow",
      body: "Every push to a PR starts a new run while the old one keeps billing. Cancel superseded runs.",
      yaml: `concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true`,
    });
  }

  for (const job of workflow.jobs) {
    const priced = matchPricedJob(job.name, byName);
    const minutes = priced?.minutes ?? 0;
    const perMinute = priced?.quote.perMinute ?? 0;

    if (!job.isReusable && job.timeoutMinutes == null) {
      const cap = roundUsd(360 * (perMinute || RATES.linux));
      findings.push({
        id: `timeout:${job.name}`,
        severity: "risk",
        jobName: job.name,
        title: `**${job.name}** has no \`timeout-minutes\``,
        body: `GitHub’s default is 6 hours. A stuck job on this runner would cost **${formatUsd(cap)}**.`,
        yaml: `jobs:
  ${escapeKey(job.name)}:
    timeout-minutes: 15`,
      });
    }

    if (!job.isReusable && isMacOnly(job.runsOn) && !isAppleTooling(job.dump)) {
      const thisRunSaveUsd =
        priced && /macos/i.test(priced.quote.sku)
          ? roundUsd(minutes * Math.max(0, priced.quote.perMinute - RATES.linux))
          : undefined;
      findings.push({
        id: `macos:${job.name}`,
        severity: "fix",
        jobName: job.name,
        title: `**${job.name}** runs on macOS but does not use Apple tooling`,
        body: `macOS is ${formatUsd(RATES.macos)}/min vs Linux ${formatUsd(RATES.linux)}/min. Switch lint/test jobs that are not Xcode/iOS/Swift.`,
        yaml: `jobs:
  ${escapeKey(job.name)}:
    runs-on: ubuntu-latest`,
        thisRunSaveUsd,
        monthlySaveUsd:
          thisRunSaveUsd != null
            ? roundUsd(thisRunSaveUsd * input.runsPerMonth)
            : undefined,
      });
    }

    if (
      !job.isReusable &&
      isStandardUbuntu(job.runsOn) &&
      minutes > 0 &&
      minutes <= 3 &&
      priced?.quote.sku === "actions_linux" &&
      !usesHeavyLinux(job.dump)
    ) {
      const thisRunSaveUsd = roundUsd(minutes * (RATES.linux - RATES.linux_slim));
      findings.push({
        id: `slim:${job.name}`,
        severity: "consider",
        jobName: job.name,
        title: `**${job.name}** is a short Linux job on \`ubuntu-latest\``,
        body: `\`ubuntu-slim\` is ${formatUsd(RATES.linux_slim)}/min vs ${formatUsd(RATES.linux)}/min. Fine for checkout + lint/format; not for compilers, Docker, or browsers.`,
        yaml: `jobs:
  ${escapeKey(job.name)}:
    runs-on: ubuntu-slim`,
        thisRunSaveUsd,
        monthlySaveUsd: roundUsd(thisRunSaveUsd * input.runsPerMonth),
      });
    }

    if (!job.isReusable && needsCache(job)) {
      findings.push({
        id: `cache:${job.name}`,
        severity: "consider",
        jobName: job.name,
        title: `**${job.name}** installs dependencies without a cache`,
        body: "Caching does not change the per-minute rate, but it usually shortens the job after the first run. Enable the setup action’s built-in cache.",
        yaml: `- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: npm`,
      });
    }

    for (const step of job.steps) {
      const uses = String(step.uses ?? "");
      if (!uses.includes("upload-artifact")) continue;
      const withBlock = asRecord(step.with);
      if (withBlock && withBlock["retention-days"] != null) continue;
      findings.push({
        id: `artifact:${job.name}`,
        severity: "consider",
        jobName: job.name,
        title: `**${job.name}** uploads artifacts with default retention`,
        body: "Artifact storage is $0.25/GB-month and accrues hourly. Set a short retention on CI artifacts you do not need to keep.",
        yaml: `- uses: actions/upload-artifact@v4
  with:
    name: dist
    path: dist/
    retention-days: 3`,
      });
      break;
    }
  }

  return findings;
}

function parseWorkflow(yamlText: string): {
  on: unknown;
  concurrency: unknown;
  jobs: WorkflowJob[];
} | null {
  let doc: unknown;
  try {
    doc = parseYaml(yamlText);
  } catch {
    return null;
  }
  if (!isRecord(doc)) return null;
  const jobsNode = isRecord(doc.jobs) ? doc.jobs : {};
  const jobs: WorkflowJob[] = [];
  for (const [name, value] of Object.entries(jobsNode)) {
    if (!isRecord(value)) continue;
    const steps = Array.isArray(value.steps)
      ? value.steps.filter(isRecord)
      : [];
    jobs.push({
      name,
      raw: value,
      runsOn: normalizeRunsOn(value["runs-on"]),
      timeoutMinutes:
        typeof value["timeout-minutes"] === "number"
          ? value["timeout-minutes"]
          : undefined,
      steps,
      isReusable: typeof value.uses === "string",
      dump: JSON.stringify(value),
    });
  }
  return {
    on: doc.on ?? doc["true"],
    concurrency: doc.concurrency,
    jobs,
  };
}

function normalizeRunsOn(runsOn: unknown): string[] {
  if (typeof runsOn === "string") return [runsOn];
  if (Array.isArray(runsOn) && runsOn.every((x) => typeof x === "string")) {
    return runsOn as string[];
  }
  return [];
}

function isMacOnly(runsOn: string[]): boolean {
  if (runsOn.length === 0) return false;
  if (runsOn.some((r) => r.includes("${{"))) return false;
  const mac = runsOn.filter((r) => /macos/i.test(r));
  const other = runsOn.filter((r) => !/macos/i.test(r));
  return mac.length > 0 && other.length === 0;
}

function isStandardUbuntu(runsOn: string[]): boolean {
  if (runsOn.length !== 1) return false;
  const r = runsOn[0].toLowerCase();
  return (
    r === "ubuntu-latest" ||
    /^ubuntu-\d{2}\.\d{2}$/.test(r)
  );
}

function usesHeavyLinux(dump: string): boolean {
  return /\b(docker|buildx|compose|cypress|playwright|chromium|maven|gradle|gcc|clang|cargo|rustc|webpack|vite build)\b/i.test(
    dump,
  );
}

function needsCache(job: WorkflowJob): boolean {
  const hasSetupCache = job.steps.some((step) => {
    const uses = String(step.uses ?? "");
    if (!/actions\/(?:cache@|setup-(?:node|python|go|dotnet|java|ruby))/i.test(uses)) {
      return false;
    }
    if (/actions\/cache@/i.test(uses)) return true;
    const withBlock = asRecord(step.with);
    return withBlock != null && (withBlock.cache != null || withBlock["cache-dependency-path"] != null);
  });
  if (hasSetupCache) return false;
  return job.steps.some((step) => INSTALL_WITHOUT_CACHE.test(String(step.run ?? "")));
}

function isPullRequestWorkflow(on: unknown): boolean {
  if (on === "pull_request") return true;
  if (Array.isArray(on)) return on.includes("pull_request");
  if (isRecord(on)) return "pull_request" in on || "pull_request_target" in on;
  return false;
}

function indexPricedJobs(jobs: PricedJob[]): Map<string, PricedJob[]> {
  const map = new Map<string, PricedJob[]>();
  for (const job of jobs) {
    const key = normalizeJobName(job.name);
    const list = map.get(key) ?? [];
    list.push(job);
    map.set(key, list);
  }
  return map;
}

function matchPricedJob(
  yamlName: string,
  byName: Map<string, PricedJob[]>,
): PricedJob | undefined {
  const exact = byName.get(normalizeJobName(yamlName));
  if (exact?.[0]) return pickLongest(exact);
  for (const [name, list] of byName) {
    if (name.startsWith(normalizeJobName(yamlName))) return pickLongest(list);
  }
  return undefined;
}

function pickLongest(jobs: PricedJob[]): PricedJob {
  return jobs.reduce((a, b) => (a.minutes >= b.minutes ? a : b));
}

function normalizeJobName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function escapeKey(name: string): string {
  return /[:#{}[\],&*?|<>=!%@`'"\s]/.test(name) ? `"${name.replace(/"/g, '\\"')}"` : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

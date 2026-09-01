import { formatUsd } from "./cost";
import type { Receipt } from "./types";

export const COMMENT_MARKER = "<!-- ci-receipt -->";

export function renderMarkdown(receipt: Receipt): string {
  const lines: string[] = [
    COMMENT_MARKER,
    `## Receipt · this run ${formatUsd(receipt.totalUsd)}`,
    "",
  ];

  if (!receipt.isPrivate && receipt.listTotalUsd > 0 && receipt.totalUsd === 0) {
    lines.push(
      `_Public repository: standard GitHub-hosted runners are free. List price of this run would be ${formatUsd(receipt.listTotalUsd)} on a private repo._`,
      "",
    );
  }

  lines.push(
    "| Job | Runner | Time | Cost |",
    "| --- | --- | ---: | ---: |",
  );

  for (const job of receipt.pricedJobs) {
    const runner = job.quote.label || job.quote.sku;
    const time = job.skipped ? "—" : `${job.minutes}m`;
    const cost = job.skipped
      ? "skipped"
      : job.quote.kind === "unknown"
        ? `${formatUsd(job.costUsd)}*`
        : formatUsd(job.costUsd);
    lines.push(`| ${escapeCell(job.name)} | ${escapeCell(runner)} | ${time} | ${cost} |`);
  }

  lines.push(
    `| **Total** | | | **${formatUsd(receipt.totalUsd)}** |`,
    "",
  );

  if (receipt.budgetUsd != null) {
    if (receipt.overBudget) {
      lines.push(
        `> Over budget: ${formatUsd(receipt.totalUsd)} exceeds ${formatUsd(receipt.budgetUsd)}.`,
        "",
      );
    } else {
      lines.push(
        `> Budget ${formatUsd(receipt.budgetUsd)} · remaining ${formatUsd(receipt.budgetUsd - receipt.totalUsd)}.`,
        "",
      );
    }
  }

  const fixes = receipt.findings.filter((f) => f.severity === "fix");
  const risks = receipt.findings.filter((f) => f.severity === "risk");
  const ideas = receipt.findings.filter((f) => f.severity === "consider");

  const monthly = sum(fixes.map((f) => f.monthlySaveUsd ?? 0));
  if (fixes.length > 0) {
    lines.push("### Fixes that cut this run", "");
    if (monthly > 0) {
      lines.push(
        `_If this workflow runs ${receipt.runsPerMonth} times a month, these runner swaps save about **${formatUsd(monthly)}/mo**._`,
        "",
      );
    }
    for (const finding of [...fixes, ...risks, ...ideas]) {
      lines.push(renderFinding(finding));
    }
  } else if (risks.length + ideas.length > 0) {
    lines.push("### Worth tightening", "");
    for (const finding of [...risks, ...ideas]) {
      lines.push(renderFinding(finding));
    }
  } else {
    lines.push("_No workflow nits on this file. The table above is the bill._", "");
  }

  lines.push(
    "<sub>Costs use GitHub’s Jan 2026 hosted-runner list rates, rounded up per job to the next minute. Self-hosted is $0. Larger runners always bill. Monthly figures assume the `runs-per-month` input.</sub>",
    "",
  );

  return lines.join("\n");
}

function renderFinding(finding: { title: string; body: string; yaml?: string; thisRunSaveUsd?: number }): string {
  const save =
    finding.thisRunSaveUsd != null
      ? ` Save **${formatUsd(finding.thisRunSaveUsd)}** on this run.`
      : "";
  const yaml = finding.yaml
    ? `\n\n\`\`\`yaml\n${finding.yaml}\n\`\`\`\n`
    : "\n";
  return `- ${finding.title} — ${finding.body}${save}${yaml}`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

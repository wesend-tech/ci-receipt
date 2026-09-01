import { priceJob, roundUsd } from "./cost";
import { findSmells } from "./smells";
import type { BuildReceiptInput, Receipt } from "./types";

export function buildReceipt(input: BuildReceiptInput): Receipt {
  const now = input.now ?? Date.now();
  const pricedJobs = input.jobs.map((job) =>
    priceJob(job, input.isPrivate, now),
  );
  const totalUsd = roundUsd(pricedJobs.reduce((sum, job) => sum + job.costUsd, 0));
  const listTotalUsd = roundUsd(
    pricedJobs.reduce((sum, job) => sum + job.listCostUsd, 0),
  );
  const findings = findSmells({
    workflowYaml: input.workflowYaml,
    pricedJobs,
    runsPerMonth: input.runsPerMonth,
  });
  const overBudget =
    input.budgetUsd != null && totalUsd > input.budgetUsd;

  return {
    pricedJobs,
    totalUsd,
    listTotalUsd,
    isPrivate: input.isPrivate,
    findings,
    runsPerMonth: input.runsPerMonth,
    budgetUsd: input.budgetUsd,
    overBudget,
    workflowPath: input.workflowPath,
  };
}

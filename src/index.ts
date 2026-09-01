import * as core from "@actions/core";
import * as github from "@actions/github";
import { buildReceipt } from "./receipt";
import { renderMarkdown } from "./render";
import {
  createOctokit,
  fetchJobs,
  fetchWorkflowYaml,
  prNumberFromContext,
  repoIsPrivate,
  upsertPrComment,
} from "./github";

async function run(): Promise<void> {
  const token = core.getInput("github-token", { required: true });
  const runId = Number(core.getInput("run-id") || github.context.runId);
  const comment = core.getBooleanInput("comment");
  const failOnBudget = core.getBooleanInput("fail-on-budget");
  const runsPerMonth = Number(core.getInput("runs-per-month") || "100");
  const budgetRaw = core.getInput("budget-usd");
  const budgetUsd = budgetRaw ? Number(budgetRaw) : undefined;

  if (!Number.isFinite(runId) || runId <= 0) {
    throw new Error(`Invalid run-id: ${core.getInput("run-id")}`);
  }
  if (!Number.isFinite(runsPerMonth) || runsPerMonth < 0) {
    throw new Error(`Invalid runs-per-month: ${core.getInput("runs-per-month")}`);
  }
  if (budgetUsd != null && !Number.isFinite(budgetUsd)) {
    throw new Error(`Invalid budget-usd: ${budgetRaw}`);
  }

  const octokit = createOctokit(token);
  const { owner, repo } = github.context.repo;
  const isPrivate = repoIsPrivate();

  const [jobs, workflow] = await Promise.all([
    fetchJobs(octokit, owner, repo, runId),
    fetchWorkflowYaml(octokit, owner, repo, runId),
  ]);

  const receipt = buildReceipt({
    jobs,
    workflowYaml: workflow.yaml,
    workflowPath: workflow.path,
    isPrivate,
    runsPerMonth,
    budgetUsd,
  });

  const markdown = renderMarkdown(receipt);
  await core.summary.addRaw(markdown, true).write();

  core.setOutput("total-usd", receipt.totalUsd.toFixed(4));
  core.setOutput("finding-count", String(receipt.findings.length));
  core.setOutput("over-budget", receipt.overBudget ? "true" : "false");

  if (comment) {
    const prNumber = prNumberFromContext();
    if (prNumber) {
      await upsertPrComment(octokit, owner, repo, prNumber, markdown);
    } else {
      core.info("No pull request on this run — skipped comment, wrote job summary.");
    }
  }

  if (receipt.overBudget && failOnBudget) {
    core.setFailed(
      `This run cost $${receipt.totalUsd.toFixed(4)}, over budget $${budgetUsd?.toFixed(2)}.`,
    );
  }
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});

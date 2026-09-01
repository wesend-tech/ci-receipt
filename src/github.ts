import * as github from "@actions/github";
import { COMMENT_MARKER } from "./render";
import type { ApiJob } from "./types";

export type Octokit = ReturnType<typeof github.getOctokit>;

export function createOctokit(token: string): Octokit {
  return github.getOctokit(token);
}

export async function fetchJobs(
  octokit: Octokit,
  owner: string,
  repo: string,
  runId: number,
): Promise<ApiJob[]> {
  const jobs: ApiJob[] = [];
  const iterator = octokit.paginate.iterator(
    octokit.rest.actions.listJobsForWorkflowRun,
    { owner, repo, run_id: runId, per_page: 100 },
  );
  for await (const response of iterator) {
    for (const job of response.data) {
      jobs.push({
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        started_at: job.started_at,
        completed_at: job.completed_at,
        labels: job.labels,
        runner_name: job.runner_name,
      });
    }
  }
  return jobs;
}

export async function fetchWorkflowYaml(
  octokit: Octokit,
  owner: string,
  repo: string,
  runId: number,
): Promise<{ path: string; yaml: string; headSha: string; event: string }> {
  const { data: run } = await octokit.rest.actions.getWorkflowRun({
    owner,
    repo,
    run_id: runId,
  });
  const path = run.path;
  const ref = run.head_sha;
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref,
  });
  if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
    throw new Error(`Could not read workflow file ${path} at ${ref}`);
  }
  const yaml = Buffer.from(data.content, "base64").toString("utf8");
  return { path, yaml, headSha: ref, event: run.event };
}

export async function upsertPrComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });
  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return;
  }
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

export function prNumberFromContext(): number | undefined {
  const payload = github.context.payload;
  if (payload.pull_request?.number) return payload.pull_request.number;
  const wr = payload.workflow_run as
    | { pull_requests?: { number: number }[] }
    | undefined;
  return wr?.pull_requests?.[0]?.number;
}

export function repoIsPrivate(): boolean {
  return Boolean(github.context.payload.repository?.private);
}

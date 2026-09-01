# CI Receipt

A receipt for every GitHub Actions run: dollar cost per job, plus the two-line YAML change that cuts it.

## Problem

Teams see a GitHub Actions bill. They do not see which job caused it, or what to change.

GitHub bills per started minute, rounded up. macOS is ~10× Linux. A job without `timeout-minutes` can sit for six hours. Copilot code review now draws from the same minute pool. Almost nobody sets a timeout; many lint jobs run on `macos-latest` because someone copied a workflow.

Minute-level visibility exists in a few new actions. The missing piece is the **fix**, with dollars attached.

## Who pays

The engineer who owns the workflow. No meeting. They add one job, see a PR comment, merge a two-line change.

Later: the eng manager who got a $400 Actions overage and wants a weekly Slack number. That is the paid dashboard, not the MVP.

## Why this, why now

- January 2026 GitHub cut hosted-runner list prices, but macOS ($0.062/min) and larger runners (always billed, even on public repos) still dominate invoices.
- Copilot code review consumes Actions minutes on private repos.
- AI coding agents open more PRs, which re-run more CI, which hides waste inside “we just ship more.”
- GitHub Marketplace distribution is free. The aha is a PR comment. That is how a $0 action gets adopted, then a $12–$29/mo product sells to the same orgs.

## Product

**CI Receipt** is a GitHub Action. It runs as the last job (or on `workflow_run`), reads the jobs on that run, prices them with GitHub’s 2026 list rates, reads the workflow YAML, and posts one PR comment:

1. Line items (job, runner, billable minutes, cost)
2. This-run total
3. Fixes, each with a YAML snippet and estimated monthly savings at a stated run rate
4. Optional budget fail

Honest about estimates: runner swaps are real dollars on *this* run. Timeouts are a cap (risk), not a this-run saving. Cache/concurrency are directional, not fake precision.

## MVP (this repo)

- Price jobs from the Actions API (round up to whole minutes)
- Map labels → 2026 SKUs (slim, standard, arm, windows, macOS, larger, GPU, self-hosted)
- Public repos: standard runners $0; larger runners still billed
- Smells: missing timeout, macOS without Apple tooling, ubuntu-latest that could be ubuntu-slim, npm/pip/setup-* without cache, upload-artifact without retention-days, pull_request without concurrency
- Job summary + PR comment (upsert, not spam)
- Optional `budget-usd` + `fail-on-budget`
- Local CLI against fixtures so you can demo without GitHub

## Non-goals (v1)

- Replacing Datadog, BuildPulse, or Trunk
- Flaky-test detection
- Auto-opening fix PRs
- Org-wide dashboards, Slack, SSO
- Self-hosted runner hardware cost
- Artifact/cache storage billing (different meter; later)

## Pricing (later)

| Tier | Price | What |
|---|---|---|
| Action | $0 | OSS, Marketplace, unlimited public |
| Team | $12/mo per org | 30-day history, weekly Slack digest, budget alerts |
| Company | $29/mo | Auto-fix PRs, Jira/Linear issues, multiple orgs |

The action stays free. Paid is history + nag + auto-fix — things that need a backend.

## Distribution

1. GitHub Marketplace + public README with a real receipt screenshot
2. Show HN: “I put a dollar amount and a YAML fix on every GitHub Actions run”
3. Comment on expensive public workflows (Next, Deno, etc. already modeled at thousands/month) with a gist, not spam

## Validation (two weeks)

Ship the action. Use it on one of your private repos. Post the README. Success = 10 unrelated repos installed, or 3 people saying they changed `runs-on` because of a comment. If neither, the comment isn’t sharp enough — fix the copy before building a dashboard.

## Competitive notes

- **MinuteMeter** — cost on the PR. No fix. New, little adoption.
- **ci-doctor / gha-budget** — CLI/linters, not a receipt on the PR.
- **BuildPulse / Trunk / Datadog Test Optimization** — flakes and DX suites, sales-led, not a $12 card.

Own the sentence: “this job cost $0.19; this YAML drops it to $0.02.”

## 90-day path

1. Marketplace action, changelog of rates
2. `workflow_run` path + org token docs
3. Storage line items (artifacts $0.25/GB-month, cache $0.07)
4. If 50+ installs: tiny backend for history + Slack, charge $12

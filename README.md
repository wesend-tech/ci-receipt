# CI Receipt

A receipt for every GitHub Actions run: **what it cost**, and **the YAML change that cuts it**.

A 4-minute `macos-latest` lint job on a private repo is **$0.248**. The same job on `ubuntu-latest` is **$0.024**. Receipt posts that on the pull request, with the snippet to switch.

## Add it

A workflow file needs `name` and `on` at the top. Save this as `.github/workflows/ci.yml` (or merge the `receipt` job into a workflow you already have).

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: npm test   # replace with your real checks

  receipt:
    needs: [test]       # names of the jobs you want on the receipt
    if: always()
    runs-on: ubuntu-slim
    timeout-minutes: 5
    permissions:
      actions: read
      contents: read
      pull-requests: write
    steps:
      - uses: wesend-tech/ci-receipt@v1
        with:
          budget-usd: "1.00"
          runs-per-month: "100"
```

If you already have a workflow, add only the `receipt` job. Set `needs` to that file’s job ids (`build`, `lint`, …), not `test` unless you actually have a job named `test`.

`if: always()` still runs the receipt when earlier jobs fail. Replace `npm test` with whatever that repo actually runs — a non-Node app will fail on `npm test`.

On a **pull request** it posts one comment and updates that comment on later runs. On **push** it only writes the job summary (Actions → the run → Summary).

This action does not bill you. It prints GitHub’s hosted-runner list prices for the run it is already on.

## What it flags

| Finding | Why it matters |
| --- | --- |
| macOS without Xcode/iOS/Swift | $0.062/min vs $0.006/min |
| No `timeout-minutes` | GitHub’s default is 6 hours. A stuck macOS job is $22.32 |
| Short Linux job on `ubuntu-latest` | `ubuntu-slim` is $0.002/min |
| `npm ci` / `pip install` with no cache | Same rate, fewer minutes on later runs |
| Artifacts with default retention | Storage is $0.25/GB-month |
| `pull_request` with no `concurrency` | Old runs keep billing after you push again |

Runner swaps show dollars for **this run** and an estimate at `runs-per-month`. Timeouts are a cap (what a stuck job could cost), not a this-run saving.

## How costs are calculated

- Each job is rounded **up to the next whole minute** (GitHub’s billing rule).
- Rates are GitHub’s January 2026 hosted-runner [list prices](https://docs.github.com/en/billing/reference/actions-runner-pricing).
- **Public repos:** standard GitHub-hosted runners are $0. Larger runners still bill.
- **Self-hosted:** $0 (no GitHub minute charge).
- Unknown labels are shown as $0 rather than guessed.

The number is list price for that run, not your invoice after included minutes.

## Inputs

| Input | Default | |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Needs `actions: read` and `pull-requests: write` to comment |
| `run-id` | current run | Set to `${{ github.event.workflow_run.id }}` if you trigger from `workflow_run` |
| `budget-usd` | unset | Flag the receipt when this run exceeds it |
| `fail-on-budget` | `false` | Fail the job when over budget |
| `comment` | `true` | Set `false` for summary only |
| `runs-per-month` | `100` | Used only for monthly savings estimates |

## Permissions

The job needs:

```yaml
permissions:
  actions: read          # list jobs on this run
  contents: read         # read the workflow YAML
  pull-requests: write   # post the receipt comment
```

## Development

```bash
npm install
npm test
npm run build
```

`dist/` is what GitHub runs. Commit it after `npm run build`.

Local receipt from fixtures (no GitHub):

```bash
npx tsx src/cli.ts \
  --workflow tests/fixtures/wasteful.yml \
  --jobs tests/fixtures/jobs.json \
  --private \
  --budget 0.20
```

## License

MIT

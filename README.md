# CI Receipt

A receipt for every GitHub Actions run: **what it cost**, and **the two-line YAML change that cuts it**.

Private `macos-latest` lint job for 4 minutes is **$0.248**. The same job on `ubuntu-latest` is **$0.024**. Receipt says that on the PR.

## Add it

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - run: npm test

  receipt:
    needs: [test]
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

Put `receipt` last and list every job in `needs`. It prices the whole run, including jobs that failed.

On a pull request it posts one comment (updated in place). On `push` it only writes the job summary.

## What it flags

| Finding | Why it matters |
| --- | --- |
| macOS without Xcode/iOS/Swift | $0.062/min vs $0.006/min |
| No `timeout-minutes` | GitHub default is 6 hours. A stuck macOS job is $22.32 |
| Short Linux job on `ubuntu-latest` | `ubuntu-slim` is $0.002/min |
| `npm ci` / `pip install` with no cache | Same rate, fewer minutes next time |
| Artifacts with default retention | Storage is $0.25/GB-month |
| `pull_request` with no `concurrency` | Old runs keep billing after you push again |

Runner swaps show **this-run** and **monthly** dollars. Timeouts are a cap, not a fake saving.

Rates are GitHub’s January 2026 hosted-runner list prices. Public repos: standard runners $0, larger runners still bill. Self-hosted is $0.

## Inputs

| Input | Default | |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Needs `actions: read` + `pull-requests: write` to comment |
| `run-id` | current run | Set to `${{ github.event.workflow_run.id }}` if you trigger from `workflow_run` |
| `budget-usd` | unset | Flag the receipt when this run exceeds it |
| `fail-on-budget` | `false` | Fail the job when over budget |
| `comment` | `true` | Set `false` for summary only |
| `runs-per-month` | `100` | Used only for monthly savings estimates |

## Local demo

```bash
npm install
npx tsx src/cli.ts \
  --workflow tests/fixtures/wasteful.yml \
  --jobs tests/fixtures/jobs.json \
  --private \
  --budget 0.20
```

## Development

```bash
npm test
npm run build
```

`dist/` is the published action. Commit it.

See [PRODUCT.md](PRODUCT.md) for the product spec, pricing, and what is not in v1.

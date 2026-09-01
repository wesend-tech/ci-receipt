export type ApiJob = {
  id?: number;
  name: string;
  status?: string | null;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  labels?: string[] | null;
  runner_name?: string | null;
};

export type RunnerQuote = {
  label: string;
  sku: string;
  perMinute: number;
  billed: boolean;
  kind: "standard" | "larger" | "self-hosted" | "skipped" | "unknown";
  note?: string;
};

export type PricedJob = {
  name: string;
  minutes: number;
  quote: RunnerQuote;
  costUsd: number;
  listCostUsd: number;
  skipped: boolean;
};

export type FindingSeverity = "fix" | "risk" | "consider";

export type Finding = {
  id: string;
  severity: FindingSeverity;
  jobName?: string;
  title: string;
  body: string;
  yaml?: string;
  /** Dollars saved on this run if the fix is applied. Undefined for risk/consider. */
  thisRunSaveUsd?: number;
  /** Dollars saved per month at the stated run rate. */
  monthlySaveUsd?: number;
};

export type Receipt = {
  pricedJobs: PricedJob[];
  totalUsd: number;
  listTotalUsd: number;
  isPrivate: boolean;
  findings: Finding[];
  runsPerMonth: number;
  budgetUsd?: number;
  overBudget: boolean;
  workflowPath?: string;
};

export type BuildReceiptInput = {
  jobs: ApiJob[];
  workflowYaml: string;
  workflowPath?: string;
  isPrivate: boolean;
  runsPerMonth: number;
  budgetUsd?: number;
  now?: number;
};

import type { RunnerQuote } from "./types";

/** GitHub-hosted list prices, January 2026. Larger-runner rates always bill. */
export const RATES = {
  linux_slim: 0.002,
  linux: 0.006,
  linux_arm: 0.005,
  windows: 0.01,
  windows_arm: 0.01,
  macos: 0.062,
  linux_4: 0.012,
  linux_8: 0.022,
  linux_16: 0.042,
  linux_32: 0.082,
  linux_64: 0.162,
  linux_96: 0.252,
  windows_4: 0.022,
  windows_8: 0.042,
  windows_16: 0.082,
  windows_32: 0.162,
  windows_64: 0.322,
  windows_96: 0.552,
  macos_l: 0.077,
  macos_xl: 0.102,
  linux_2_arm: 0.005,
  linux_4_arm: 0.008,
  linux_8_arm: 0.014,
  linux_16_arm: 0.026,
  linux_32_arm: 0.05,
  linux_64_arm: 0.098,
  windows_2_arm: 0.008,
  windows_4_arm: 0.014,
  windows_8_arm: 0.026,
  windows_16_arm: 0.05,
  windows_32_arm: 0.098,
  windows_64_arm: 0.194,
  linux_4_gpu: 0.052,
  windows_4_gpu: 0.102,
} as const;

const CORE_RATES: Record<string, Record<number, number>> = {
  linux: {
    2: RATES.linux,
    4: RATES.linux_4,
    8: RATES.linux_8,
    16: RATES.linux_16,
    32: RATES.linux_32,
    96: RATES.linux_96,
    64: RATES.linux_64,
  },
  linux_arm: {
    2: RATES.linux_2_arm,
    4: RATES.linux_4_arm,
    8: RATES.linux_8_arm,
    16: RATES.linux_16_arm,
    32: RATES.linux_32_arm,
    64: RATES.linux_64_arm,
  },
  windows: {
    2: RATES.windows,
    4: RATES.windows_4,
    8: RATES.windows_8,
    16: RATES.windows_16,
    32: RATES.windows_32,
    96: RATES.windows_96,
    64: RATES.windows_64,
  },
  windows_arm: {
    2: RATES.windows_2_arm,
    4: RATES.windows_4_arm,
    8: RATES.windows_8_arm,
    16: RATES.windows_16_arm,
    32: RATES.windows_32_arm,
    64: RATES.windows_64_arm,
  },
};

export function quoteRunner(
  labels: string[],
  opts: { isPrivate: boolean },
): RunnerQuote {
  const joined = labels.map((l) => l.toLowerCase().trim()).filter(Boolean);
  const blob = joined.join(" ");

  if (joined.length === 0) {
    return unknownQuote("unlabeled");
  }

  if (joined.includes("self-hosted") || blob.includes("self-hosted")) {
    return {
      label: labels.join(", "),
      sku: "self_hosted",
      perMinute: 0,
      billed: false,
      kind: "self-hosted",
      note: "Self-hosted — no GitHub minute charge",
    };
  }

  if (blob.includes("gpu")) {
    const windows = blob.includes("windows");
    const perMinute = windows ? RATES.windows_4_gpu : RATES.linux_4_gpu;
    return billedLarger(labels, windows ? "windows_4_core_gpu" : "linux_4_core_gpu", perMinute);
  }

  const cores = parseCores(blob);
  const arm = /\barm(?:64)?\b/.test(blob);
  const macos = blob.includes("macos") || blob.includes("mac-os") || blob.includes("mac os");
  const windows = blob.includes("windows");
  const slim = blob.includes("ubuntu-slim") || blob.includes("linux-slim");

  if (macos) {
    if (blob.includes("xlarge") || blob.includes("x-large") || cores === 5) {
      return billedLarger(labels, "macos_xl", RATES.macos_xl);
    }
    if (blob.includes("large") || cores === 12) {
      return billedLarger(labels, "macos_l", RATES.macos_l);
    }
    return maybeWaive(labels, "actions_macos", RATES.macos, "standard", opts.isPrivate);
  }

  if (windows) {
    if (cores && cores > 2) {
      const perMinute = (arm ? CORE_RATES.windows_arm : CORE_RATES.windows)[cores];
      if (perMinute != null) {
        return billedLarger(labels, `windows_${cores}_core${arm ? "_arm" : ""}`, perMinute);
      }
    }
    if (arm) {
      return maybeWaive(labels, "actions_windows_arm", RATES.windows_arm, "standard", opts.isPrivate);
    }
    return maybeWaive(labels, "actions_windows", RATES.windows, "standard", opts.isPrivate);
  }

  if (slim) {
    return maybeWaive(labels, "actions_linux_slim", RATES.linux_slim, "standard", opts.isPrivate);
  }

  if (cores && cores > 2) {
    const table = arm ? CORE_RATES.linux_arm : CORE_RATES.linux;
    const perMinute = table[cores];
    if (perMinute != null) {
      return billedLarger(labels, `linux_${cores}_core${arm ? "_arm" : ""}`, perMinute);
    }
  }

  if (blob.includes("ubuntu") || blob.includes("linux")) {
    if (arm) {
      return maybeWaive(labels, "actions_linux_arm", RATES.linux_arm, "standard", opts.isPrivate);
    }
    return maybeWaive(labels, "actions_linux", RATES.linux, "standard", opts.isPrivate);
  }

  return unknownQuote(labels.join(", "));
}

function parseCores(blob: string): number | undefined {
  const match = blob.match(/(\d+)\s*-?\s*cores?/) ?? blob.match(/\b(\d+)\s*vcpu\b/);
  if (!match) return undefined;
  return Number(match[1]);
}

function billedLarger(labels: string[], sku: string, perMinute: number): RunnerQuote {
  return {
    label: labels.join(", "),
    sku,
    perMinute,
    billed: true,
    kind: "larger",
    note: "Larger runners are billed even on public repos",
  };
}

function maybeWaive(
  labels: string[],
  sku: string,
  perMinute: number,
  kind: "standard",
  isPrivate: boolean,
): RunnerQuote {
  return {
    label: labels.join(", "),
    sku,
    perMinute,
    billed: isPrivate,
    kind,
    note: isPrivate ? undefined : "Public repo — standard runners are free",
  };
}

function unknownQuote(label: string): RunnerQuote {
  return {
    label,
    sku: "unknown",
    perMinute: RATES.linux,
    billed: false,
    kind: "unknown",
    note: "Unknown runner label — treated as $0 rather than guessing",
  };
}

export function isAppleTooling(text: string): boolean {
  return /\b(xcode|xcrun|swift\b|swiftpm|ios|ipad|iphone|ipados|cocoapods|\bpod\s+install|fastlane|gym\b|match\b|codesign|provisioning|metal\b|macos-sdk|watchos|tvos|visionos|app.?store)\b/i.test(
    text,
  );
}

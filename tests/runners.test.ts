import { describe, expect, it } from "vitest";
import { RATES, quoteRunner } from "../src/runners";

describe("quoteRunner", () => {
  it("maps common labels", () => {
    expect(quoteRunner(["ubuntu-slim"], { isPrivate: true }).perMinute).toBe(
      RATES.linux_slim,
    );
    expect(quoteRunner(["ubuntu-latest"], { isPrivate: true }).perMinute).toBe(
      RATES.linux,
    );
    expect(quoteRunner(["ubuntu-24.04-arm"], { isPrivate: true }).perMinute).toBe(
      RATES.linux_arm,
    );
    expect(quoteRunner(["windows-latest"], { isPrivate: true }).perMinute).toBe(
      RATES.windows,
    );
    expect(quoteRunner(["macos-latest"], { isPrivate: true }).perMinute).toBe(
      RATES.macos,
    );
    expect(quoteRunner(["macos-latest-large"], { isPrivate: true }).perMinute).toBe(
      RATES.macos_l,
    );
    expect(
      quoteRunner(["macos-latest-xlarge"], { isPrivate: true }).perMinute,
    ).toBe(RATES.macos_xl);
  });

  it("treats self-hosted as free", () => {
    const q = quoteRunner(["self-hosted", "linux", "x64"], { isPrivate: true });
    expect(q.billed).toBe(false);
    expect(q.kind).toBe("self-hosted");
  });

  it("does not guess unknown labels", () => {
    const q = quoteRunner(["my-corp-runner"], { isPrivate: true });
    expect(q.kind).toBe("unknown");
    expect(q.billed).toBe(false);
  });
});

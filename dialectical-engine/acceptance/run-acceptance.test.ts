import { describe, expect, it } from "vitest";
import { announceAbsentMakers, parseAcceptanceArguments } from "./run-acceptance.js";

describe("ACC-01 one-shot ceremony arguments", () => {
  const serviceCredential = "s".repeat(43);

  it("requires the service credential", () => {
    expect(() => parseAcceptanceArguments([])).toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
  });

  it("documents and applies only asker-input defaults — the default question is self-contained (ACC-01 N1)", () => {
    const parsed = parseAcceptanceArguments(["--service-credential", serviceCredential], new Date("2026-08-09T00:00:00.000Z"));
    expect(parsed.serviceCredential).toBe(serviceCredential);
    expect(parsed.serve).toBe(false);
    expect(parsed.ask).toEqual({
      question_line: "What is the strongest case for adopting a four-day workweek at a software company?",
      risk_tier: "standard",
      tier_source: "ASKER",
      tier_provenance_ref: "acceptance:cli-default",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      decision_scope: "prototype-acceptance",
      as_of: "2026-08-09T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    });
  });

  it("rejects unknown arguments rather than silently ignoring them", () => {
    expect(() => parseAcceptanceArguments(["--service-credential", serviceCredential, "--mystery", "value"]))
      .toThrow("UNKNOWN_ACCEPTANCE_ARGUMENT:--mystery");
  });

  it.each(["--decision-owner", "--action-owner"])(
    "rejects retired ownership input %s instead of silently dropping it",
    (argument) => {
      expect(() => parseAcceptanceArguments(["--service-credential", serviceCredential, argument, "acceptance-user"]))
        .toThrow(`UNKNOWN_ACCEPTANCE_ARGUMENT:${argument}`);
    }
  );

  it("parses the --serve standing flag anywhere in the argument list", () => {
    expect(parseAcceptanceArguments(["--serve", "--service-credential", serviceCredential]).serve).toBe(true);
    expect(parseAcceptanceArguments(["--service-credential", serviceCredential, "--serve"]).serve).toBe(true);
    const withValueArguments = parseAcceptanceArguments(["--service-credential", serviceCredential, "--serve", "--risk-tier", "casual"]);
    expect(withValueArguments.serve).toBe(true);
    expect(withValueArguments.ask.risk_tier).toBe("casual");
  });

  it("rejects a duplicated --serve flag", () => {
    expect(() => parseAcceptanceArguments(["--serve", "--serve", "--service-credential", serviceCredential]))
      .toThrow("DUPLICATE_ACCEPTANCE_ARGUMENT:--serve");
  });
});

/**
 * F-GROK-SANDBOX-PROFILE outcome (1). The closing run (2026-09-08, run
 * d90ec684) debated on two of three configured makers and its own log could not
 * say so: a rejected relay start was recorded as an ABSENT provider probe in a
 * TEMPORARY database and printed nothing. These assertions pin the announcement
 * that now rides with that record, and the record's own derivation, so the
 * ceremony's stdout carries the absence whether or not the database survives.
 */
describe("ACC-01 an absent configured maker is LOUD before the debate starts", () => {
  const providers = [
    { providerRef: "acceptance:codex-cli", maker: "OpenAI" },
    { providerRef: "acceptance:claude-cli", maker: "Anthropic" },
    { providerRef: "acceptance:grok-cli", maker: "xAI" }
  ] as const;

  it("emits one exact MAKER ABSENT line per rejected relay start, naming maker and failure code", () => {
    const emitted: string[] = [];
    // TOOLING-TRAPS `:5161`/`:5438`: without this label the RED frame reads
    // "announceAbsentMakers is not a function" and describes the plumbing
    // rather than the absence the ceremony's log could not show.
    expect(
      typeof announceAbsentMakers,
      "the ceremony must print a configured maker's absence to stdout before the debate starts (F-GROK-SANDBOX-PROFILE outcome 1)"
    ).toBe("function");
    const absent = announceAbsentMakers(
      [
        { status: "fulfilled", value: {} },
        { status: "rejected", reason: new Error("CLAUDE_CLI_FAILED") },
        { status: "rejected", reason: new Error("GROK_CLI_FAILED") }
      ],
      providers,
      (line) => { emitted.push(line); }
    );

    expect(emitted).toEqual([
      "MAKER ABSENT Anthropic CLAUDE_CLI_FAILED",
      "MAKER ABSENT xAI GROK_CLI_FAILED"
    ]);
    // The SAME call yields the ABSENT probe records, so the print cannot be
    // dropped from the ceremony without dropping the provider probe with it.
    expect(absent.map((entry) => [entry.providerRef, entry.maker, entry.failureCode])).toEqual([
      ["acceptance:claude-cli", "Anthropic", "CLAUDE_CLI_FAILED"],
      ["acceptance:grok-cli", "xAI", "GROK_CLI_FAILED"]
    ]);
  });

  it("says nothing at all when every configured relay started (the admitted boundary)", () => {
    const emitted: string[] = [];
    const absent = announceAbsentMakers(
      providers.map(() => ({ status: "fulfilled", value: {} }) as const),
      providers,
      (line) => { emitted.push(line); }
    );

    expect(emitted).toEqual([]);
    expect(absent).toEqual([]);
  });

  it("keeps the ceremony's own failure-code derivation for a reason that names nothing", () => {
    const emitted: string[] = [];
    announceAbsentMakers(
      [
        { status: "rejected", reason: new Error("   ") },
        { status: "rejected", reason: "not an Error" },
        { status: "fulfilled", value: {} }
      ],
      providers,
      (line) => { emitted.push(line); }
    );

    expect(emitted).toEqual([
      "MAKER ABSENT OpenAI PROVIDER_RELAY_START_FAILED",
      "MAKER ABSENT Anthropic PROVIDER_RELAY_START_FAILED"
    ]);
  });

  it("writes to the process's real stdout when no sink is supplied", () => {
    const original = process.stdout.write;
    const written: string[] = [];
    process.stdout.write = function patched(this: unknown, chunk: unknown, ...rest: readonly unknown[]): boolean {
      written.push(typeof chunk === "string" ? chunk : String(chunk));
      return (original as (...args: readonly unknown[]) => boolean).call(process.stdout, chunk, ...rest);
    } as typeof process.stdout.write;
    try {
      announceAbsentMakers(
        [{ status: "rejected", reason: new Error("GROK_CLI_FAILED") }],
        [{ providerRef: "acceptance:grok-cli", maker: "xAI" }]
      );
    } finally {
      process.stdout.write = original;
    }

    expect(written.join("")).toContain("MAKER ABSENT xAI GROK_CLI_FAILED\n");
  });

  it("ignores a settled result that no configured provider row explains", () => {
    const emitted: string[] = [];
    const absent = announceAbsentMakers(
      [
        { status: "rejected", reason: new Error("GROK_CLI_FAILED") },
        { status: "rejected", reason: new Error("UNCONFIGURED_CLI_FAILED") }
      ],
      [{ providerRef: "acceptance:grok-cli", maker: "xAI" }],
      (line) => { emitted.push(line); }
    );

    expect(emitted).toEqual(["MAKER ABSENT xAI GROK_CLI_FAILED"]);
    expect(absent).toHaveLength(1);
  });
});

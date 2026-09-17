import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseAcceptanceArguments } from "./run-acceptance.js";
import { announceAbsentMakers } from "./absent-makers.js";
import { DEFINITION_OF_DONE_TOKENS } from "./dod-facts.js";

/**
 * F-CREDENTIAL-ON-ARGV. The service credential is read from the ceremony
 * process's ENVIRONMENT and from nowhere else, and an operator who still offers
 * it on the command line is refused by name. A process's arguments are readable
 * by every user of the machine through the process list for the whole of the
 * run; its environment is not.
 *
 * Every case below hands the parser an explicit third argument, so no test in
 * this file ever reads — or depends on — the real `process.env`. The values used
 * here are fabricated 43-character strings.
 */
describe("ACC-01 one-shot ceremony arguments", () => {
  const serviceCredential = "s".repeat(43);
  const environment: NodeJS.ProcessEnv = { ACCEPTANCE_SERVICE_CREDENTIAL: serviceCredential };
  const asOf = new Date("2026-08-09T00:00:00.000Z");
  /** A credential an operator might still type on the command line. Never real. */
  const offeredOnArgv = "z".repeat(43);

  it("reads the service credential from the environment and returns it", () => {
    expect(parseAcceptanceArguments([], asOf, environment).serviceCredential).toBe(serviceCredential);
  });

  it("requires the service credential when the environment does not carry it", () => {
    expect(() => parseAcceptanceArguments([], asOf, {})).toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
  });

  it("requires the service credential when the environment carries only blanks", () => {
    expect(() => parseAcceptanceArguments([], asOf, { ACCEPTANCE_SERVICE_CREDENTIAL: "   " }))
      .toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED");
  });

  it("refuses an environment credential of 42 characters", () => {
    expect(() => parseAcceptanceArguments([], asOf, { ACCEPTANCE_SERVICE_CREDENTIAL: "s".repeat(42) }))
      .toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_INVALID");
  });

  /**
   * The old shape must not survive by habit. The refusal is decided BEFORE the
   * unknown-argument and missing-value checks, so `--service-credential` alone
   * reads as the credential refusal and not as `ACCEPTANCE_ARGUMENT_VALUE_REQUIRED`.
   */
  it.each([
    { position: "alone", argv: ["--service-credential"] },
    { position: "with a value", argv: ["--service-credential", offeredOnArgv] },
    { position: "before other arguments", argv: ["--service-credential", offeredOnArgv, "--risk-tier", "casual"] },
    { position: "after --serve", argv: ["--serve", "--service-credential", offeredOnArgv] }
  ])("refuses a credential offered on argv, $position", ({ argv }) => {
    expect(() => parseAcceptanceArguments(argv, asOf, environment))
      .toThrow("ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED");
  });

  it("never repeats the offered value in the argv refusal", () => {
    let message = "";
    try {
      parseAcceptanceArguments(["--service-credential", offeredOnArgv], asOf, environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED");
    expect(message).not.toContain(offeredOnArgv);
  });

  it("documents and applies only asker-input defaults — the default question is self-contained (ACC-01 N1)", () => {
    const parsed = parseAcceptanceArguments([], asOf, environment);
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
    expect(() => parseAcceptanceArguments(["--mystery", "value"], asOf, environment))
      .toThrow("UNKNOWN_ACCEPTANCE_ARGUMENT:--mystery");
  });

  it.each(["--decision-owner", "--action-owner"])(
    "rejects retired ownership input %s instead of silently dropping it",
    (argument) => {
      expect(() => parseAcceptanceArguments([argument, "acceptance-user"], asOf, environment))
        .toThrow(`UNKNOWN_ACCEPTANCE_ARGUMENT:${argument}`);
    }
  );

  it("parses the --serve standing flag anywhere in the argument list", () => {
    expect(parseAcceptanceArguments(["--serve"], asOf, environment).serve).toBe(true);
    expect(parseAcceptanceArguments(["--risk-tier", "casual", "--serve"], asOf, environment).serve).toBe(true);
    const withValueArguments = parseAcceptanceArguments(["--serve", "--risk-tier", "casual"], asOf, environment);
    expect(withValueArguments.serve).toBe(true);
    expect(withValueArguments.ask.risk_tier).toBe("casual");
  });

  it("rejects a duplicated --serve flag", () => {
    expect(() => parseAcceptanceArguments(["--serve", "--serve"], asOf, environment))
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
        { providerRef: "acceptance:codex-cli", start: { status: "fulfilled", value: {} } },
        { providerRef: "acceptance:claude-cli", start: { status: "rejected", reason: new Error("CLAUDE_CLI_FAILED") } },
        { providerRef: "acceptance:grok-cli", start: { status: "rejected", reason: new Error("GROK_CLI_FAILED") } }
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
      providers.map((provider) => ({
        providerRef: provider.providerRef,
        start: { status: "fulfilled", value: {} } as const
      })),
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
        { providerRef: "acceptance:codex-cli", start: { status: "rejected", reason: new Error("   ") } },
        { providerRef: "acceptance:claude-cli", start: { status: "rejected", reason: "not an Error" } },
        { providerRef: "acceptance:grok-cli", start: { status: "fulfilled", value: {} } }
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
        [{ providerRef: "acceptance:grok-cli", start: { status: "rejected", reason: new Error("GROK_CLI_FAILED") } }],
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
        { providerRef: "acceptance:grok-cli", start: { status: "rejected", reason: new Error("GROK_CLI_FAILED") } },
        { providerRef: "acceptance:mystery-cli", start: { status: "rejected", reason: new Error("UNCONFIGURED_CLI_FAILED") } }
      ],
      [{ providerRef: "acceptance:grok-cli", maker: "xAI" }],
      (line) => { emitted.push(line); }
    );

    expect(emitted).toEqual(["MAKER ABSENT xAI GROK_CLI_FAILED"]);
    expect(absent).toHaveLength(1);
  });

  /**
   * F-GROK-SANDBOX-PROFILE fix round 1 / F2. "Before the debate starts" was
   * UNVERIFIED in round 0: the only end-to-end witness is
   * `runAcceptanceCeremony`, which starts an embedded PostgreSQL, an API and
   * three real vendor CLIs, and it offers no injection seam for the runtime
   * (`AcceptanceCeremonyOptions` carries `databaseDataDirectory` and nothing
   * else), so a recorded-sequence assertion is not reachable here.
   *
   * This is the floor and it is named as such: a SOURCE-ORDER pin, anchored on
   * the two SYMBOLS and never on line numbers (TOOLING-TRAPS `:329`), scoped to
   * the ceremony function's own body so the import list cannot satisfy it. Both
   * anchors are asserted PRESENT first, because an ordering assertion over a
   * symbol that is absent would pass vacuously.
   */
  it("calls the announcer before it builds the runtime, inside runAcceptanceCeremony", async () => {
    const source = await readFile(new URL("./run-acceptance.ts", import.meta.url), "utf8");
    const ceremonyAt = source.indexOf("export async function runAcceptanceCeremony(");
    expect(ceremonyAt, "runAcceptanceCeremony must exist to have an order at all").toBeGreaterThan(-1);
    const body = source.slice(ceremonyAt);

    const announcerAt = body.indexOf("announceAbsentMakers(");
    const runtimeAt = body.indexOf("createAcceptanceRuntime(");
    expect(announcerAt, "the ceremony must CALL the announcer").toBeGreaterThan(-1);
    expect(runtimeAt, "the ceremony must build the runtime").toBeGreaterThan(-1);
    expect(
      announcerAt,
      "a configured maker's absence is announced BEFORE the runtime that runs the debate is built"
    ).toBeLessThan(runtimeAt);
  });

  /**
   * The SOURCE-ORDER floor for the Global-DoD facts. The only end-to-end witness
   * is `runAcceptanceCeremony` itself (embedded PostgreSQL, an API and three
   * vendor CLIs), so what is reachable here is the ORDER of the statements
   * inside the ceremony's own body, anchored on symbols and printed literals,
   * never on line numbers (TOOLING-TRAPS `:329`).
   *
   * THE THING THIS TEST EXISTS FOR (fix round 1, C-1). The reader issues three
   * queries and can refuse by a typed code. Whatever it does, it must not be
   * able to cost the closing run the report the 2026-09-08 run already produced:
   * a throw inside it reaches the ceremony's `catch`, which closes the stack and
   * rethrows, so anything not yet printed is lost. Every established line is
   * therefore printed FIRST, and the reader runs after the last of them. That
   * order is the assertion below — not a style preference.
   *
   * Each of the other two halves is anchored so that it can FAIL:
   *   · the render call's OWN statement must print each line, so a loop that
   *     renders and discards cannot satisfy it (review mutant MX1);
   *   · the returned object literal — not the whole body before it — must carry
   *     the block, so the local `const definitionOfDone` cannot satisfy it
   *     (review mutant MX2).
   */
  it("prints every established report line before the DoD reader can throw, then prints and returns the facts", async () => {
    const source = await readFile(new URL("./run-acceptance.ts", import.meta.url), "utf8");
    const ceremonyAt = source.indexOf("export async function runAcceptanceCeremony(");
    expect(ceremonyAt, "runAcceptanceCeremony must exist to have an order at all").toBeGreaterThan(-1);
    const body = source.slice(ceremonyAt);

    const readerAt = body.indexOf("readDefinitionOfDoneFacts(");
    const renderAt = body.indexOf("renderDefinitionOfDoneLines(");
    const returnAt = body.indexOf("return Object.freeze({");
    expect(readerAt, "the ceremony must CALL the DoD reader").toBeGreaterThan(-1);
    expect(renderAt, "the ceremony must render the DoD lines").toBeGreaterThan(-1);
    expect(returnAt, "the ceremony must return a report to have an order against").toBeGreaterThan(-1);

    /**
     * C-1. Every report line that existed at base `5c9c4678`, by the literal it
     * prints. All ten are asserted PRESENT first: an ordering claim over a line
     * that has been deleted would pass vacuously and would quietly bless the
     * very loss this test is about.
     */
    const establishedReportLines = [
      "`ACC-01 run id: ",
      "`ACC-01 answer id: ",
      "`FAIR-01 graph: ",
      "`FAIR-01 makers: ",
      "`PRO-01 model calls (all outcomes): ",
      "`DISC-01 panel/ceiling/probe evidence: ",
      "`T17 envelope at terminal: ",
      "`PRO-01 per-node maker lineage: ",
      "`XREV-01 per-node review lineage: ",
      "`ACC-01 UI: "
    ] as const;
    for (const printed of establishedReportLines) {
      const printedAt = body.indexOf(printed);
      expect(printedAt, `the ceremony still prints ${printed.trim()}`).toBeGreaterThan(-1);
      expect(
        printedAt,
        `${printed.trim()} is printed BEFORE the DoD reader, which can refuse and lose the log`
      ).toBeLessThan(readerAt);
    }

    expect(readerAt, "the facts are read before they are rendered").toBeLessThan(renderAt);
    expect(renderAt, "the lines are printed BEFORE the ceremony returns its report").toBeLessThan(returnAt);

    // I-1. The statement that renders must itself print. A slice that runs to
    // the return is satisfied by any later `console.info` in the report.
    const renderStatement = body.slice(renderAt, body.indexOf(";", renderAt) + 1);
    expect(
      renderStatement,
      "the statement that renders the DoD lines is the statement that prints them"
    ).toContain("console.info(line)");

    // I-2. The RETURNED OBJECT carries the block — not merely the body above it,
    // where the local declaration already spells the name.
    const returnedObject = body.slice(returnAt, body.indexOf("});", returnAt));
    expect(
      returnedObject,
      "the typed facts block rides the RETURNED report, not just a local const"
    ).toContain("definitionOfDone");

    const { renderDefinitionOfDoneLines, deriveDefinitionOfDoneFacts } = await import("./dod-facts.js");
    const lines = renderDefinitionOfDoneLines(deriveDefinitionOfDoneFacts({
      nodes: [{ nodeId: "n1", depth: 0, tau: 0.5, finalStrength: 0.7, panel: { voiceCount: 2, nonAuthorVoiceCount: 1 } }],
      edges: [{ sourceNodeId: "n1", polarity: "support", targetKind: "NODE", magnitudeStatus: "MEASURED" }],
      loopRounds: [{ round: 1, synthesizerStage: "INITIAL", evaluatorSatisfied: true }],
      sealedEvaluatorLoopMaxRounds: 3,
      conditionMarks: [],
      verdictState: "CONTESTED",
      verdictUnavailableReasonRef: null,
      terminal: "SERVED",
      serveState: "COMPOSED",
      confidenceBand: "FULL",
      bandCeiling: { basis: { LOOKED_UP: 0, RAN: 0, REASONING: 1 }, registerRowKey: "wayOfKnowingCeiling" }
    }));
    for (const token of Object.values(DEFINITION_OF_DONE_TOKENS)) {
      expect(lines.filter((line) => line.startsWith(`${token}:`))).toHaveLength(1);
    }
  });
});

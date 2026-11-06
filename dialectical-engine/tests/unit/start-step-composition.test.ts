import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * V4 start step, Task 31 (spec 2026-11-03 §3 and §4.1; the plan's Global Constraints): THE COMPOSITION in apps/api/src/main.ts.
 * The calls before Start go out only where a preview gate is configured AND 0157's pre-Start charge writer answers for the
 * API's own login, never keyed on the deployment mode (the test site runs in hosted mode). The step signs its references
 * with a key derived from the blind-index key, and buildApi gets the step and that same key together: without the key the
 * four routes answer none OFF (Task 30). A source pin: main.ts boots only against a real database and gate.
 */
const MAIN = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");

/** Where `text` stands in main.ts; it must stand there exactly once. */
function onlyAt(text: string): number {
  const at = MAIN.indexOf(text);
  expect(at, text).toBeGreaterThan(-1);
  expect(MAIN.indexOf(text, at + 1), `${text} (twice)`).toBe(-1);
  return at;
}

/** The statement that begins with `head`, up to the first line at column 0 that is `close`. */
function statementOf(head: string, close: string): string {
  const at = onlyAt(head);
  const end = MAIN.indexOf(`\n${close}\n`, at);
  expect(end, `${head} … ${close}`).toBeGreaterThan(at);
  return MAIN.slice(at, end + close.length + 1);
}

const WRITER = 'const preStartWriter = await boot.run("pre-start-writer", () => onOwnConnections(() => preStartChargeWriterPresent(pool)));';
const KEY = "const startStepKey = startStepKeyFrom(blindIndexKey);";
const ROUTE = "const startStepRoute = startStepRouteOf({ previewGate, writerPresent: preStartWriter });";

describe("V4 start step: main.ts composes the step on the preview route", () => {
  it("probes 0157's writer under the boot ledger for the login's own connections, and keys the route on the gate and the writer", () => {
    const writer = onlyAt(WRITER);
    // One probe, never a second spelling elsewhere (the import is the only other mention).
    expect(MAIN.split("preStartChargeWriterPresent(").length - 1).toBe(1);
    expect(onlyAt(KEY)).toBeGreaterThan(writer);
    expect(onlyAt(ROUTE)).toBeGreaterThan(writer);
    expect(MAIN).toContain("startStepRouteOf({ previewGate, writerPresent: preStartWriter })");
    expect(MAIN).toContain("startStepKeyFrom(blindIndexKey)");
    // The probe is a boot stage: it runs before the boot hands over.
    expect(writer).toBeLessThan(onlyAt("boot.release();"));
  });

  it("builds one step over the route, the key, the version's settings, the question check, the gate's transport and the person's charge", () => {
    const step = statementOf("const startStep = createStartStep({", "});");
    expect(MAIN.split("createStartStep(").length - 1).toBe(1);
    // Its members, in order (Task 86's drift test compares these keys with r22-world's).
    expect([...step.matchAll(/^ {2}(\w+)\b/gmu)].map(([, key]) => key))
      .toEqual(["route", "key", "settingsFor", "questionCheck", "transport", "charges", "report"]);
    expect(step).toContain("  route: startStepRoute,\n  key: startStepKey,\n");
    // Every version's settings from the one admission cache: the switch, the line-up and the language port of that version.
    expect(step).toContain("  settingsFor: (version) => admissionCache.admissionSettingsFor(version),\n");
    expect(step).toContain("  questionCheck,\n");
    // A transport only on the preview route, through the gate's guarded fetch, over the declared targets.
    expect(step).toContain("  transport: startStepRoute === \"PREVIEW\" && previewFetch !== undefined\n"
      + "    ? createStartTransport({ fetch: previewFetch, targets: declaredProviderTargets }) : null,\n");
    // Each call charged to the person through 0157's writer, at the price the runner charges the same target at.
    expect(step).toContain("    record: (entry) => recordPreStartCharge(pool, entry),\n");
    expect(step).toContain("previewTargetChargePrice(previewGate !== undefined, target, providerTargetPrice(target))");
    expect(step).toContain("declaredProviderTargets.find((declared) => declared.providerRef === providerRef)");
    expect(step).toContain("    clock: () => new Date(),\n");
    // Never keyed on the deployment mode; no pool of its own (one Pool: main's runtime pool).
    for (const part of [step, MAIN.slice(onlyAt(WRITER), onlyAt(ROUTE) + ROUTE.length)]) {
      expect(part).not.toContain("DEPLOYMENT_MODE");
      expect(part).not.toMatch(/new Pool\(|createPool\(/u);
    }
    // Built once everything it reads exists: the cache, the question check and the route; before the API that serves it.
    const at = MAIN.indexOf(step);
    for (const before of ["const admissionCache = createAdmissionSettingsCache({", 'const questionCheck = await boot.run("question-check",', KEY, ROUTE]) {
      expect(onlyAt(before), before).toBeLessThan(at);
    }
    expect(at).toBeLessThan(onlyAt("const api = buildApi({"));
  });

  it("hands buildApi the step and the same key together, and no shortened stream timing", () => {
    const api = statementOf("const api = buildApi({", "});");
    expect(api).toMatch(/^ {2}startStep,\n {2}startStepKey,\n/mu);
    // Production streams use START_STEP_TIMING's heartbeat and longest life (Task 30): tests alone shorten them.
    expect(api).not.toContain("startStepTiming");
  });
});

// V4 start step, Task 86: THE R22 WORLD'S API IS COMPOSED AS apps/api/src/main.ts COMPOSES IT, for the step before Start and
// the chosen paths (tests/integration/r22-end-to-end.test.ts and the start-step end-to-end files run on that world). This test
// reads both sides and fails when they stop matching: the step's members (createStartStep and its charges), its route (a
// preview gate AND 0156's pre-Start charge writer), the three things buildApi gets with it (the step, its key and the chosen
// paths store; Task 56b adds a fourth, the person's own closings reader), and the settings PostgresAskApplication gets (the chosen paths store and the purpose lines among them:
// without them every v2 ask is refused START_PATHS_STORE_UNAVAILABLE). The world's runner is the practice's composition,
// which tests/unit/preview-practice-wiring-drift.test.ts keeps equal to apps/runner/src/main.ts; here only the parts the
// path debates add (Task 53: the paths, their results, each path's progress and the final writers' terms). A control proves
// the reader sees a missing key.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { R22World, R22WorldOptions } from "../support/r22-world.js";
import { group, objectAfter, withoutComments } from "../support/source-text.js";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
const API_MAIN = read("apps/api/src/main.ts");
const R22_WORLD = read("tests/support/r22-world.ts");
const RUNNER_MAIN = read("apps/runner/src/main.ts");
const PRACTICE_RUNNER = read("tools/preview-practice/practice-runner-composition.ts");
/** Without comments, every run of white space one space: a statement reads the same however it is wrapped. */
const flat = (source: string) => withoutComments(source).replace(/\s+/gu, " ");

const ASK_APPLICATION = "new PostgresAskApplication(pool, dispatcher, {";
const WORLD_RUN_SETTINGS = "const runSettings = {";
const RUNNER_SETTINGS = "new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {";
const sorted = (keys: Set<string>) => [...keys].sort();

describe("r22-world composes the step before Start as apps/api/src/main.ts composes it (drift guard)", () => {
  it("createStartStep({ … }) and its createStartCharges({ … }) set the same keys on both sides", () => {
    const step = objectAfter(API_MAIN, "createStartStep({");
    expect(sorted(step)).toEqual(["charges", "key", "questionCheck", "report", "route", "settingsFor", "transport"]);
    expect(sorted(objectAfter(R22_WORLD, "createStartStep({"))).toEqual(sorted(step));
    const charges = objectAfter(API_MAIN, "createStartCharges({");
    expect(sorted(charges)).toEqual(["clock", "priceOf", "record", "report"]);
    expect(sorted(objectAfter(R22_WORLD, "createStartCharges({"))).toEqual(sorted(charges));
  });

  it("both key the route on the preview gate and 0156's writer, sign with the step's key and charge each call at the runner's price", () => {
    for (const [name, source] of [["main.ts", API_MAIN], ["r22-world.ts", R22_WORLD]] as const) {
      const code = flat(source);
      for (const statement of [
        "const previewGate = environment.PREVIEW_GATE_SETTINGS;",
        "startStepRouteOf({ previewGate, writerPresent: preStartWriter })",
        "preStartChargeWriterPresent(",
        "route: startStepRoute, key: startStepKey,",
        "settingsFor: (version) => admissionCache.admissionSettingsFor(version),",
        "transport: startStepRoute === \"PREVIEW\" && previewFetch !== undefined ? createStartTransport({ fetch: previewFetch, targets: declaredProviderTargets }) : null,",
        "record: (entry) => recordPreStartCharge(",
        "const target = declaredProviderTargets.find((declared) => declared.providerRef === providerRef);",
        "return target === undefined ? null : previewTargetChargePrice(previewGate !== undefined, target, providerTargetPrice(target));"
      ]) expect(code, `${name}: ${statement}`).toContain(statement);
      // One step, built once; never keyed on the deployment mode.
      expect(code.split("createStartStep(").length - 1, name).toBe(1);
      const clean = withoutComments(source);
      expect(group(clean, clean.indexOf("(", clean.indexOf("createStartStep({"))), name).not.toContain("DEPLOYMENT_MODE");
    }
  });

  it("both hand buildApi the step, its key, the chosen paths store and (Task 56b) the person's own closings reader", () => {
    for (const [name, source] of [["main.ts", API_MAIN], ["r22-world.ts", R22_WORLD]] as const) {
      const api = objectAfter(source, "buildApi({");
      for (const key of ["startStep", "startStepKey", "startPaths", "ownClosings"]) expect(api.has(key), `${name}: ${key}`).toBe(true);
      // Task 53a's counts, read on the API's own pool (the one login 0159 grants identity.count_public_reports).
      expect(flat(source), name).toContain("ownClosings: new PostgresOwnClosingsReader(");
    }
  });

  it("r22-world's runSettings hands PostgresAskApplication the keys main.ts hands it, the chosen paths and the purpose lines among them", () => {
    const shipped = objectAfter(API_MAIN, ASK_APPLICATION);
    const world = objectAfter(R22_WORLD, WORLD_RUN_SETTINGS);
    for (const key of ["startPaths", "purposeLines"]) {
      expect(shipped.has(key), `main.ts ${key}`).toBe(true);
      expect(world.has(key), `r22-world.ts ${key}`).toBe(true);
    }
    expect(sorted(world)).toEqual(sorted(shipped));
    // The ONE chosen paths store, on the API's runtime pool: the AskApplication and buildApi hold the same object.
    for (const source of [API_MAIN, R22_WORLD]) {
      const code = flat(source);
      expect(code.split("new PostgresStartPathsStore(").length - 1).toBe(1);
      expect(code).toContain("purposeLines: postgresPurposeLines(");
    }
  });

  it("Task 53: the world's runner is the practice's composition, which carries the paths, their results, each path's progress and the final writers' terms as the runner's main.ts does", () => {
    expect(flat(R22_WORLD)).toContain("const composed = await composePracticeRunner({");
    const shipped = objectAfter(RUNNER_MAIN, RUNNER_SETTINGS);
    const practice = objectAfter(PRACTICE_RUNNER, RUNNER_SETTINGS);
    for (const key of ["startPaths", "pathResults", "pathProgress", "runFinalWriterTerms"]) {
      expect(shipped.has(key), `runner main.ts ${key}`).toBe(true);
      expect(practice.has(key), `practice ${key}`).toBe(true);
    }
    for (const source of [RUNNER_MAIN, PRACTICE_RUNNER]) {
      const code = flat(source);
      expect(code).toContain("const runFinalWriterTerms = createRunFinalWriterTerms();");
      expect(code).toContain("finalWriterTermsOf: finalWriterTermsResolver(runFinalWriterTerms)");
    }
  });

  it("control: the reader sees a key the world leaves out", () => {
    const trimmed = objectAfter(R22_WORLD.replace(/\bpurposeLines: postgresPurposeLines\(apiPool\),?/u, ""), WORLD_RUN_SETTINGS);
    expect(trimmed.has("purposeLines")).toBe(false);
    expect(sorted(trimmed)).not.toEqual(sorted(objectAfter(API_MAIN, ASK_APPLICATION)));
  });
});

describe("the world's options (Task 86's interface)", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("takes the switch, the register, the falling pot and the concurrency refusal, and gives the step's key and the gate delays", () => {
    expectTypeOf<R22WorldOptions>().toEqualTypeOf<Readonly<{ log?: (line: string) => void; startStep?: "ON" | "OFF";
      register?: "MADE_UP" | "PRIVATE"; spendLowersRemaining?: boolean; refuseOverConcurrency?: boolean }>>();
    expectTypeOf<R22World>().toHaveProperty("startStepKey");
    expectTypeOf<R22World>().toHaveProperty("setDelays");
  });

  it("the release's register without the owner's private files refuses PRIVATE_FILES_ABSENT before anything starts", async () => {
    // A world that does not know the refusal would start its databases: this file never starts one.
    expect(withoutComments(R22_WORLD)).toContain("\"PRIVATE_FILES_ABSENT\"");
    vi.stubEnv("DEBATEAI_PRIVATE_GATE_FIGURES", "");
    vi.stubEnv("DEBATEAI_PRIVATE_REGISTER_EXPORT", "");
    const { startR22World } = await import("../support/r22-world.js");
    await expect(startR22World({ register: "PRIVATE" })).rejects.toThrow("PRIVATE_FILES_ABSENT");
  });
});

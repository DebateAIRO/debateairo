// tests/unit/content-checks-composition.test.ts
// The content checks' route in main.ts, one test per row of the table in apps/api/src/publication-check/gate-transport.ts:
//   preview + the guarded fetch + the Anthropic gate's socket  → the publication judge and the synthesis check go through the
//                                                               gate; the support target (SUPPORT_MODEL_TARGET_JSON) and any
//                                                               key file are never read;
//   preview without the socket                                → no judge and no synthesis check, never the support target;
//   no preview (local, or a hosted server with no gate)        → the support target's transports, exactly as before.
// main.ts's own expressions are evaluated here with the shipped transports, then the composed checks are run. Data is made up.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicDebate } from "@debateai/contract";
import { createPreviewGuardedFetch, previewModelRow, type PreviewBudgetPort } from "@debateai/providers";
import { createPublicationContentCheck } from "../../apps/api/src/publication-check/check.js";
import { contentCheckRouteFor, createPreviewPublicationJudgeTransport } from "../../apps/api/src/publication-check/gate-transport.js";
import { createLocalOffFlagSwitch, createPublicationJudgeSwitch, createPublicationJudgeTransport } from "../../apps/api/src/publication-check/judge-transport.js";
import { runSynthesisCheck } from "../../apps/api/src/synthesis-check/check.js";
import { createPreviewSynthesisCheckTransport, createSynthesisCheckTransport, type SynthesisCheckPort } from "../../apps/api/src/synthesis-check/transport.js";
import type { SupportModelTarget } from "../../apps/api/src/support/model.js";

const main = readFileSync("apps/api/src/main.ts", "utf8");
const SOCKET = "/run/debateai-v3-preview/anthropic-budget-v1.sock";
const MARKER = /DEBATEAI-FENCE-([0-9a-f]{32})/u;
const D = 60_000;
const RUN = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT = { question: "Should Harbour Town build a second ferry pier?", answer: { summary_segments: [{ text: "Yes, on balance." }] } } as unknown as PublicDebate;
/** Made up, in the shape the support adapter checks. */
const KEY = ["sk", "ant", "api03", "ABCDEFGH12345678"].join("-");

/** main.ts's expression for `name`, from its `const` to the end marker (inclusive), as plain JavaScript. */
function expression(name: string, end: string): string {
  const start = main.indexOf(`const ${name} = `);
  const stop = main.indexOf(end, start);
  if (start < 0 || stop < 0) throw new Error(`main.ts has no ${name}`);
  return main.slice(start + `const ${name} = `.length, stop + end.length - 1);
}
function evaluate<T>(source: string, bindings: Record<string, unknown>): T {
  return new Function(...Object.keys(bindings), `return (${source});`)(...Object.values(bindings)) as T;
}

/** The Anthropic gate behind the real guarded fetch, answering every call for the vendor. */
function gate() {
  const bodies: string[] = [];
  const port: PreviewBudgetPort = { async execute(input) {
    bodies.push(input.requestBody);
    const call = MARKER.exec(input.requestBody)![1];
    const text = input.requestBody.includes("SUICIDE_OR_HARM_TO_OTHERS")
      ? JSON.stringify({ call, TERRORISM: 0, HATE_SPEECH: 0, SUICIDE_OR_HARM_TO_OTHERS: 0, WEAPONS_OR_DRUGS: 0 })
      : JSON.stringify({ call, verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false });
    return { status: 200, body: JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn",
      content: [{ type: "text", text }], usage: { input_tokens: 700, output_tokens: 30 } }) };
  } };
  return { fetch: createPreviewGuardedFetch({ anthropic: port }), bodies };
}

/** The site's setup, counted: every read of the support target, every key-file read, every support transport built. */
function site(route: ReturnType<typeof contentCheckRouteFor>) {
  const counts = { targetReads: 0, keyReads: 0, supportJudges: 0, supportSyntheses: 0 };
  const target: SupportModelTarget = { providerRef: "anthropic-support", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5",
    adapterKind: "anthropic-messages-http", authorizationFile: "/made/up/key" } as SupportModelTarget;
  const watched = new Proxy(target, { get: (object, key, receiver) => { counts.targetReads += 1; return Reflect.get(object, key, receiver); } });
  const bindings = {
    contentCheckRoute: route,
    supportModelTarget: watched,
    readCustodyAuthorizationHeader: (_path: string) => { counts.keyReads += 1; return KEY; },
    reportSupportDiagnostic: () => undefined,
    publicationCheckPolicy: { deadlineMs: D },
    publicationJudgeOffFlag: null,
    synthesisCheckOffFlag: null,
    createPublicationJudgeSwitch,
    createLocalOffFlagSwitch,
    createPreviewPublicationJudgeTransport,
    createPreviewSynthesisCheckTransport,
    createPublicationJudgeTransport: (...args: Parameters<typeof createPublicationJudgeTransport>) => { counts.supportJudges += 1; return createPublicationJudgeTransport(...args); },
    createSynthesisCheckTransport: (...args: Parameters<typeof createSynthesisCheckTransport>) => { counts.supportSyntheses += 1; return createSynthesisCheckTransport(...args); }
  };
  const judge = evaluate<ReturnType<typeof createPublicationJudgeSwitch>>(expression("publicationJudgeSwitch", "{ offFlagPath: publicationJudgeOffFlag });"), bindings);
  const synthesis = evaluate<{ current(): SynthesisCheckPort | null }>(expression("synthesisCheckSwitch", "{ offFlagPath: synthesisCheckOffFlag });"), bindings);
  const publish = () => createPublicationContentCheck({ judge: judge.current, recorder: { record: async () => undefined }, clock: () => new Date(), deadlineMs: D })
    .check({ runId: RUN, snapshot: SNAPSHOT });
  const synthesize = () => runSynthesisCheck({ port: synthesis.current, deadlineMs: D, recordSpend: async () => undefined,
    priceOf: (model) => previewModelRow(model) ?? null, clock: () => new Date(), log: () => undefined },
    { runId: RUN, answerId: RUN, answerVersion: 1, synthesisText: "Build the pier.", deadlineAt: new Date(Date.now() + D) });
  return { counts, judge, synthesis, publish, synthesize };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("the content checks' route, as main.ts composes it", () => {
  it("on a preview with the Anthropic gate: both checks go through the gate, and neither reads the support target or a key file", async () => {
    const { fetch, bodies } = gate();
    const vendor = vi.fn();
    vi.stubGlobal("fetch", vendor);
    const composed = site(contentCheckRouteFor({ fetch, anthropicSocket: SOCKET }));
    expect([composed.judge.current()?.providerRef, composed.judge.current()?.modelId]).toEqual(["anthropic", "claude-haiku-5-5"]);
    expect(await composed.publish()).toEqual({ outcome: "ALLOW" });
    expect(await composed.synthesize()).toMatchObject({ outcome: { verdict: "CLEAR" }, modelProviderRef: "anthropic" });
    expect(bodies).toHaveLength(3);
    expect(composed.counts).toEqual({ targetReads: 0, keyReads: 0, supportJudges: 0, supportSyntheses: 0 });
    expect(vendor).not.toHaveBeenCalled();
  });

  it("on a preview without the Anthropic gate's socket: no judge and no synthesis check, and still never the support target", async () => {
    const { fetch, bodies } = gate();
    const composed = site(contentCheckRouteFor({ fetch, anthropicSocket: undefined }));
    expect(composed.judge.current()).toBeNull();
    expect(composed.synthesis.current()).toBeNull();
    expect(await composed.publish()).toEqual({ outcome: "UNAVAILABLE", cause: "JUDGE_NOT_CONFIGURED" });
    expect(await composed.synthesize()).toMatchObject({ outcome: { verdict: "UNAVAILABLE", failureCode: "NOT_CONFIGURED" }, callCount: 0 });
    expect(bodies).toEqual([]);
    expect(composed.counts).toEqual({ targetReads: 0, keyReads: 0, supportJudges: 0, supportSyntheses: 0 });
  });

  it("with no preview: the support target's own transports, its key and the vendor's URL, as before", async () => {
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push(String(url));
      const body = String(init.body);
      const call = MARKER.exec(body)![1];
      const text = body.includes("SUICIDE_OR_HARM_TO_OTHERS")
        ? JSON.stringify({ call, TERRORISM: 0, HATE_SPEECH: 0, SUICIDE_OR_HARM_TO_OTHERS: 0, WEAPONS_OR_DRUGS: 0 })
        : JSON.stringify({ call, verdict: "ALLOW", rules: [], parts: [], possibly_illegal: false });
      return new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn",
        content: [{ type: "text", text }], usage: { input_tokens: 700, output_tokens: 30 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const composed = site(contentCheckRouteFor(null));
    expect([composed.judge.current()?.providerRef, composed.synthesis.current()?.providerRef]).toEqual(["anthropic-support", "anthropic-support"]);
    expect(await composed.publish()).toEqual({ outcome: "ALLOW" });
    expect(await composed.synthesize()).toMatchObject({ outcome: { verdict: "CLEAR" }, modelProviderRef: "anthropic-support" });
    // The support transports read the key file at each call: two judge calls (the question, the summary) and one synthesis call.
    expect(composed.counts).toMatchObject({ supportJudges: 1, supportSyntheses: 1, keyReads: 3 });
    expect(sent).toEqual(Array.from({ length: 3 }, () => "https://api.anthropic.com/v1/messages"));
  });
});

describe("main.ts wires the route, the times, the calls at once and the sweeps' turn", () => {
  it("takes the route from the env's preview gate part, with the guarded fetch whose gate ports half-close on an abort", () => {
    expect(main).toContain('const contentCheckRoute = contentCheckRouteFor(previewGate === undefined ? null\n  : { fetch: previewLanguageCheckFetch, anthropicSocket: previewProviderSocket(previewGate, "anthropic") });');
    expect(main).toContain('const previewLanguageCheckFetch = previewGate === undefined ? undefined\n  : createPreviewGuardedFetch(createPreviewBudgetRpcPorts(previewGate, { onAbort: "HALF_CLOSE" }));');
    expect(main.split("contentCheckRouteFor(").length - 1).toBe(1);
    expect(main.split("createPreviewPublicationJudgeTransport(").length - 1).toBe(1);
    expect(main.split("createPreviewSynthesisCheckTransport(").length - 1).toBe(1);
  });

  it("an owner's Publish keeps D; the sweeps' checks and the synthesis check's worker may also wait out the gate's queue", () => {
    expect(main).toContain("const backgroundCheckDeadlineMs = contentCheckBackgroundDeadlineMs(contentCheckRoute, publicationCheckPolicy.deadlineMs);");
    const check = (name: string) => expression(name, "\n});");
    expect(check("publicationContentCheck")).toContain("deadlineMs: publicationCheckPolicy.deadlineMs,\n");
    expect(check("sweepPublicationContentCheck")).toContain("deadlineMs: backgroundCheckDeadlineMs,\n");
    expect(check("publicReportContentCheck")).toContain("deadlineMs: backgroundCheckDeadlineMs,\n");
    // The owner's Publish takes the D check; the sweep the background ones.
    const api = main.slice(main.indexOf("const api = buildApi({"), main.indexOf("\n});", main.indexOf("const api = buildApi({")));
    expect(api).toMatch(/^\s+publicationContentCheck,$/mu);
    expect(main).toContain(": sweepPublicationContentCheck.check(request) });");
    expect(main).toContain("? publicReportContentCheck.check({ runId: request.runId.slice(REPORT_CHECK_PREFIX.length), snapshot: request.snapshot })");
    // The synthesis check: its publish gate keeps D, and waits for a worker's check that may run for the check's window; its
    // worker and the answer's hold take that window, which with the seal margin fits in the background time.
    expect(main).toContain("const synthesisCheckWindow = synthesisCheckWindowMs(backgroundCheckDeadlineMs);");
    expect(check("synthesisPublishGate")).toContain("check: synthesisCheckDeps, deadlineMs: publicationCheckPolicy.deadlineMs, inFlightWindowMs: synthesisCheckWindow,");
    expect(check("synthesisCheckWorker")).toContain("check: { ...synthesisCheckDeps, deadlineMs: synthesisCheckWindow },\n  deadlineMs: synthesisCheckWindow,");
    expect(main).toContain("createSynthesisAnswerAccess({ repository: synthesisCheckRepository, deadlineMs: synthesisCheckWindow })");
    // Its day-pot read and its spend record stay as they were, for both.
    const deps = main.slice(main.indexOf("const synthesisCheckDeps: SynthesisCheckDeps = {"), main.indexOf("\n};", main.indexOf("const synthesisCheckDeps: SynthesisCheckDeps = {")));
    expect(deps).toContain("deadlineMs: publicationCheckPolicy.deadlineMs,");
    expect(deps).toContain("spentMicros: (day: string) => new PostgresModelSpendStore(pool).readDaySpentMicros(day)");
    expect(deps).toContain('new PostgresModelSpendStore(crossAccountPool(pool, "X33")).recordSpend({ ...entry, spendId: randomUUID() })');
  });

  it("on the gate a check sends a few calls at once: the sweeps' one at a time, the end-of-debate check's worker one debate at a time, an owner's Publish two", () => {
    const check = (name: string) => expression(name, "\n});");
    expect(check("publicationContentCheck")).toContain('\n  ...contentCheckCallsAtOnce(contentCheckRoute, "PUBLISH")\n');
    expect(check("sweepPublicationContentCheck")).toContain('\n  ...contentCheckCallsAtOnce(contentCheckRoute, "BACKGROUND")\n');
    expect(check("publicReportContentCheck")).toContain('\n  ...contentCheckCallsAtOnce(contentCheckRoute, "BACKGROUND")\n');
    expect(check("synthesisCheckWorker")).toContain('\n  ...contentCheckCallsAtOnce(contentCheckRoute, "BACKGROUND"),\n');
    expect(main.split("contentCheckCallsAtOnce(").length - 1).toBe(4);
  });

  it("the Report button keeps the one judge switch, and every check of a sweep pass goes through the one turn", () => {
    expect(main).toMatch(/publicFlags: \{\n\s+limits: abuseLimits\.publicFlag,\n\s+repository: publicFlagRepository, judge: publicationJudgeSwitch\.current,/u);
    expect(main).toContain("const inTurn = checksInTurn(judgeGate);");
    expect(main).toContain("const sweepContentCheck = inTurn.check;");
    expect(main).toContain("judgeGate.check>[0]) => inTurn.check.check({ runId: `${REPORT_CHECK_PREFIX}${request.runId}`, snapshot: request.snapshot }) };");
    expect(main).toContain("const triggerPublicPage = createSingleFlightErasureReconciler(() => inTurn.pass(async () => {");
    expect(main).toContain("contentCheck: sweepContentCheck, reportContentCheck: sweepReportCheck,");
    expect(main).toContain("purposeLines: lines, contentCheck: sweepContentCheck,");
    // Nothing else asks the shared wait directly.
    expect(main.split("judgeGate.check(").length - 1).toBe(0);
  });
});

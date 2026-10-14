/**
 * The question-language boot (question-language spec 2026-10-13, P2L Task 12): the row, eld, the transport choice
 * (ruling L-ROUTE, the route table) and the decider. The transport cannot tell the guarded fetch from the global fetch,
 * and the preview and hosted URLs are the same string, so the BOOT enforces the table. One test per row:
 *   preview + Anthropic gate socket → the guarded fetch, no key, no spend record (the gate settles preview money);
 *   preview without that socket      → NO transport, the fast check off, reason NO_GATE (never the hosted route);
 *   hosted, 0117's writer absent     → NO transport, reason HOSTED_BEFORE_SPEND_RECORD (never spend unrecorded);
 *   hosted, no Anthropic support key → NO transport, reason NO_HOSTED_KEY;
 *   hosted (Task 19)                 → the support target's key, the exact Anthropic URL, its run-less spend record;
 *   local mode                       → NO transport, reason LOCAL_MODE;
 *   the row's fastCheck: null        → NO transport, reason POLICY_OFF.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL } from "@debateai/providers";
import { questionLanguagePolicyStartValues } from "@debateai/register";
import { languageCheckChargeMicros, type LanguageCheckSpendEntry } from "@debateai/budget";
import {
  assertQuestionLanguagePolicyBootable, composeQuestionLanguage, hostedLanguageCheckPrice, hostedQuestionLanguageRoute, questionLanguageRouteFor,
  type QuestionLanguagePaidRoute
} from "../../apps/api/src/question-language/boot.js";
import { newQuestionLanguageReferenceKey } from "../../apps/api/src/question-language/reference.js";

const start = questionLanguagePolicyStartValues();
const previewRoute = { kind: "PREVIEW" as const, fetch: (async () => new Response("{}", { status: 500 })) as typeof fetch };
const MIX_Q = "Ar trebui România să adopte euro, or should it wait until wages catch up?";
const askOf = (question_line: string, site_language: string) => ({ question_line, site_language }) as never;

/** A fetch that records every call (URL and headers) and answers with a refusal: the fast check then falls back. */
function recordingFetch() {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const spy = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string> | undefined) } });
    return new Response("{}", { status: 500 });
  });
  return { fetch: spy as unknown as typeof fetch, spy, calls };
}

const compose = (policy: Parameters<typeof composeQuestionLanguage>[0]["policy"], route: QuestionLanguagePaidRoute) =>
  composeQuestionLanguage({ policy, route, clock: () => new Date(), maxQuestionBytes: 8192, referenceKey: newQuestionLanguageReferenceKey() });

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The hosted route's seams, counted: the writer probe, the key read, the records written and the codes reported. */
function hostedDeps(over: Readonly<{ mode?: "hosted" | "local"; fastCheck?: typeof start.fastCheck; writerPresent?: boolean;
  key?: string | undefined; recordFails?: Error }>) {
  const state = { probes: 0, keyReads: 0, records: [] as LanguageCheckSpendEntry[], reports: [] as unknown[], ids: [] as string[] };
  let n = 0;
  const input = {
    mode: over.mode ?? "hosted",
    fastCheck: "fastCheck" in over ? over.fastCheck! : start.fastCheck,
    readCredential: () => { state.keyReads += 1; return "key" in over ? over.key : "sk-ant-test-key"; },
    spend: {
      writerPresent: async () => { state.probes += 1; return over.writerPresent ?? true; },
      record: async (entry: LanguageCheckSpendEntry) => { if (over.recordFails !== undefined) throw over.recordFails; state.records.push(entry); }
    },
    clock: () => new Date("2026-10-13T23:59:59.000Z"),
    newSpendId: () => { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; state.ids.push(id); return id; },
    report: (line: unknown) => { state.reports.push(line); }
  } as const;
  return Object.assign(state, { input });
}

describe("the question-language boot (question-language spec 2026-10-13)", () => {
  it("the start values boot on the preview (Haiku is a reviewed row and 'low' is on its menu)", () => {
    expect(() => assertQuestionLanguagePolicyBootable(start, previewRoute)).not.toThrow();
  });

  it("ruling L-ROUTE: a preview with no Anthropic gate socket has NO fast check, never the hosted route", () => {
    const never = (): QuestionLanguagePaidRoute => { throw new Error("never asked on the preview"); };
    expect(questionLanguageRouteFor({ previewConfigured: true, previewFetch: previewRoute.fetch, anthropicSocket: undefined, hosted: never }))
      .toEqual({ kind: "NONE", reason: "NO_GATE" });
    expect(questionLanguageRouteFor({ previewConfigured: true, previewFetch: undefined, anthropicSocket: "/run/gate.sock", hosted: never }))
      .toEqual({ kind: "NONE", reason: "NO_GATE" });
    expect(questionLanguageRouteFor({ previewConfigured: true, previewFetch: previewRoute.fetch, anthropicSocket: "/run/gate.sock",
      hosted: never })).toEqual({ kind: "PREVIEW", fetch: previewRoute.fetch });
  });

  it("with no preview configuration the hosted side decides: local, the check off, or 0117's writer absent build no transport", async () => {
    const local = hostedDeps({ mode: "local" });
    expect(await hostedQuestionLanguageRoute(local.input)).toEqual({ kind: "NONE", reason: "LOCAL_MODE" });
    const off = hostedDeps({ fastCheck: null });
    expect(await hostedQuestionLanguageRoute(off.input)).toEqual({ kind: "NONE", reason: "POLICY_OFF" });
    // Never spend unrecorded: until 0117's writer exists the hosted API keeps the fast check off, and never reads the key.
    const before = hostedDeps({ writerPresent: false });
    expect(await hostedQuestionLanguageRoute(before.input)).toEqual({ kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" });
    for (const deps of [local, off]) expect(deps.probes).toBe(0);
    for (const deps of [local, off, before]) expect(deps.keyReads).toBe(0);
    expect(before.probes).toBe(1);
    // The writer exists but the support chat has no Anthropic Messages target: no key, so no fast check.
    const keyless = hostedDeps({ key: undefined });
    expect(await hostedQuestionLanguageRoute(keyless.input)).toEqual({ kind: "NONE", reason: "NO_HOSTED_KEY" });
    const route = await hostedQuestionLanguageRoute(hostedDeps({ mode: "hosted" }).input);
    expect(questionLanguageRouteFor({ previewConfigured: false, previewFetch: undefined, anthropicSocket: undefined, hosted: () => route }))
      .toBe(route);
    // A guarded fetch never leaks into the hosted side: without a preview configuration the hosted answer stands.
    const localRoute = await hostedQuestionLanguageRoute(local.input);
    expect(questionLanguageRouteFor({ previewConfigured: false, previewFetch: previewRoute.fetch, anthropicSocket: "/run/gate.sock",
      hosted: () => localRoute })).toEqual({ kind: "NONE", reason: "LOCAL_MODE" });
  });

  it("Task 19: with 0117's writer and the support target's key the route is HOSTED, and each check is one run-less site cost", async () => {
    const deps = hostedDeps({});
    const route = await hostedQuestionLanguageRoute(deps.input);
    expect(route).toMatchObject({ kind: "HOSTED", credential: "sk-ant-test-key" });
    expect(deps.keyReads).toBe(1);
    if (route.kind !== "HOSTED") throw new Error("unreachable");
    await route.recordSpend({ inputTokens: 310, outputTokens: 28, projected: false });
    // A projected record (no usage named, an abort after sending) is written the same way, at the projected maximum.
    await route.recordSpend({ inputTokens: 7300, outputTokens: 600, projected: true });
    const price = hostedLanguageCheckPrice(start.fastCheck!.priceMicrosUsdPerMillionTokens, start.fastCheck!.model, 310);
    expect(deps.records).toEqual([
      { spendId: deps.ids[0], providerRef: "language-check:anthropic:claude-haiku-5-5", chargedOn: "2026-10-13",
        chargeMicros: languageCheckChargeMicros({ inputTokens: 310, outputTokens: 28 }, price), inputTokens: 310, outputTokens: 28 },
      { spendId: deps.ids[1], providerRef: "language-check:anthropic:claude-haiku-5-5", chargedOn: "2026-10-13",
        chargeMicros: languageCheckChargeMicros({ inputTokens: 7300, outputTokens: 600 },
          hostedLanguageCheckPrice(start.fastCheck!.priceMicrosUsdPerMillionTokens, start.fastCheck!.model, 7300)),
        inputTokens: 7300, outputTokens: 600 }
    ]);
    // Haiku's cache-write input (0.125 USD/M = 125,000 micros/M) and output (500,000): 310 x 125,000 + 28 x 500,000 → 53.
    expect(deps.records[0]!.chargeMicros).toBe(53);
    expect(deps.reports).toEqual([]);
  });

  it("a failed record is logged by code only and never fails the ask (the call already happened)", async () => {
    const deps = hostedDeps({ recordFails: Object.assign(new Error("relation \"Ar trebui România\" is broken"), { code: "23514" }) });
    const route = await hostedQuestionLanguageRoute(deps.input);
    if (route.kind !== "HOSTED") throw new Error("unreachable");
    await expect(route.recordSpend({ inputTokens: 310, outputTokens: 28, projected: false })).resolves.toBeUndefined();
    expect(deps.reports).toEqual([{ event: "api.question_language.spend_unrecorded", code: "23514" }]);
    const plain = hostedDeps({ recordFails: new Error("question text here") });
    const second = await hostedQuestionLanguageRoute(plain.input);
    if (second.kind !== "HOSTED") throw new Error("unreachable");
    await second.recordSpend({ inputTokens: 1, outputTokens: 1, projected: true });
    expect(plain.reports).toEqual([{ event: "api.question_language.spend_unrecorded", code: "QUESTION_LANGUAGE_SPEND_RECORD_FAILED" }]);
    expect(JSON.stringify([...deps.reports, ...plain.reports])).not.toMatch(/România|question text/u);
  });

  it("never under-counts: the larger of the row's and the provider table's price, input at the cache-write rate", () => {
    // The row below the table: the table's Haiku prices (cache-write 0.125, output 0.50 USD/M).
    expect(hostedLanguageCheckPrice({ input: 1, output: 1 }, "claude-haiku-5-5", 310)).toEqual({ input: 125_000, output: 500_000 });
    // The row above the table: the row's, its input at 1.25x (rounded up).
    expect(hostedLanguageCheckPrice({ input: 900_001, output: 4_000_000 }, "claude-haiku-5-5", 310)).toEqual({ input: 1_125_002, output: 4_000_000 });
    // A model the table does not review still never prices under Haiku's row.
    expect(hostedLanguageCheckPrice({ input: 0, output: 0 }, "claude-opus-5-5", 310)).toEqual({ input: 125_000, output: 500_000 });
    // Above the vendor's upper step (more than 100,000 input tokens): the upper step's cache-write and output prices.
    expect(hostedLanguageCheckPrice({ input: 100_000, output: 500_000 }, "claude-haiku-5-5", 100_001)).toEqual({ input: 625_000, output: 2_500_000 });
    expect(hostedLanguageCheckPrice({ input: 100_000, output: 500_000 }, "claude-haiku-5-5", 100_000)).toEqual({ input: 125_000, output: 500_000 });
  });

  it("refuses, at boot, a preview model the gate does not review, or a model of another provider", () => {
    expect(() => assertQuestionLanguagePolicyBootable({ ...start, fastCheck: { ...start.fastCheck!, model: "claude-opus-5-5" } }, previewRoute))
      .toThrow("QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW");
    expect(() => assertQuestionLanguagePolicyBootable({ ...start, fastCheck: { ...start.fastCheck!, model: "zai-org/GLM-5.3-Flash" } }, previewRoute))
      .toThrow("QUESTION_LANGUAGE_FAST_CHECK_MODEL_NOT_ON_PREVIEW");
    // Off the preview (no transport) the model is not the gate's to review.
    expect(() => assertQuestionLanguagePolicyBootable({ ...start, fastCheck: { ...start.fastCheck!, model: "claude-opus-5-5" } },
      { kind: "NONE", reason: "LOCAL_MODE" })).not.toThrow();
  });

  it("refuses an owner instruction carrying a frame token", () => {
    expect(() => assertQuestionLanguagePolicyBootable({ ...start, instruction: "Name it. --- SAFETY FRAME" }, { kind: "NONE", reason: "LOCAL_MODE" }))
      .toThrow("QUESTION_LANGUAGE_INSTRUCTION_RESERVED_TOKEN");
  });

  it("with no paid route, or the check switched off, the decider is built without a fast check (eld + site language)", async () => {
    const cases = [
      [start, { kind: "NONE", reason: "NO_GATE" }, "NO_GATE"],
      [start, { kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" }, "HOSTED_BEFORE_SPEND_RECORD"],
      [start, { kind: "NONE", reason: "LOCAL_MODE" }, "LOCAL_MODE"],
      [{ ...start, fastCheck: null }, previewRoute, "POLICY_OFF"]
    ] as const;
    for (const [policy, route, reason] of cases) {
      const decider = await compose(policy, route);
      const lock = await decider.decide({ ask: askOf(MIX_Q, "ro"), ownerScope: "owner:a", fastCheckAllowed: true });
      expect(lock.source === "LOCAL_SITE" || lock.source === "LOCAL_ELD" || lock.source === "ELD_SITE").toBe(true);
      if (lock.source !== "ELD_SITE") expect(lock.localReason).toBe(reason);
    }
  });

  it("route row 'preview without a gate': the guarded fetch is never called, whatever the question", async () => {
    const recorded = recordingFetch();
    const route = questionLanguageRouteFor({ previewConfigured: true, previewFetch: recorded.fetch, anthropicSocket: undefined,
      hosted: () => { throw new Error("never asked on the preview"); } });
    const decider = await compose(null, route);
    for (const [question, site] of [[MIX_Q, "ro"], ["Should cities price congestion?", "en"], ["Ar trebui orașele să taxeze traficul?", "ro"]]) {
      const lock = await decider.decide({ ask: askOf(question!, site!), ownerScope: "owner:a", fastCheckAllowed: true });
      expect(lock.source === "ELD_SITE" || lock.localReason === "NO_GATE").toBe(true);
    }
    expect(recorded.spy).not.toHaveBeenCalled();
  });

  it("route row 'preview with the gate': the guarded fetch, the preview URL, no vendor key, and a failing gate is the fallback", async () => {
    const recorded = recordingFetch();
    const global = vi.fn(async () => { throw new Error("the global fetch is never used on the preview"); });
    vi.stubGlobal("fetch", global);
    const decider = await compose(null, { kind: "PREVIEW", fetch: recorded.fetch });
    const lock = await decider.decide({ ask: askOf(MIX_Q, "ro"), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(["FALLBACK_SITE", "FALLBACK_ELD", "ELD_SITE"]).toContain(lock.source);
    expect(recorded.calls.length).toBe(1);
    expect(recorded.calls[0]!.url).toBe(PREVIEW_ANTHROPIC_MESSAGES_URL);
    const headerNames = Object.keys(recorded.calls[0]!.headers).map((name) => name.toLowerCase());
    expect(headerNames).not.toContain("x-api-key");
    expect(headerNames).not.toContain("authorization");
    expect(global).not.toHaveBeenCalled();
  });

  it("the preview route: a failing gate is the fallback, never a refusal of the ask", async () => {
    const decider = await compose(null, previewRoute);
    const lock = await decider.decide({ ask: askOf(MIX_Q, "ro"), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(["FALLBACK_SITE", "FALLBACK_ELD", "ELD_SITE"]).toContain(lock.source);
  });

  it("route row 'hosted', end to end: a billed reply is recorded once through 0117's writer, at the cache-write price the frame asks for", async () => {
    const bodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5",
        content: [{ type: "text", text: '{"main_language":"ro"}' }], stop_reason: "end_turn", usage: { input_tokens: 1300, output_tokens: 20 } }), { status: 200 });
    }));
    const deps = hostedDeps({});
    const decider = await compose(null, await hostedQuestionLanguageRoute(deps.input));
    await decider.decide({ ask: askOf(MIX_Q, "ro"), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(bodies).toHaveLength(1);
    // The frame is cacheable: the system goes as the two-block form whose first block carries the cache mark, so the
    // vendor may bill the input at its cache-write rate, which is the rate recorded.
    const system = JSON.parse(bodies[0]!).system;
    expect(Array.isArray(system) && system[0]?.cache_control?.type === "ephemeral").toBe(true);
    expect(deps.records).toHaveLength(1);
    expect(deps.records[0]).toMatchObject({ providerRef: "language-check:anthropic:claude-haiku-5-5", inputTokens: 1300, outputTokens: 20,
      chargeMicros: Math.ceil((1300 * 125_000 + 20 * 500_000) / 1_000_000) });
    // No question text in the ledger row.
    expect(JSON.stringify(deps.records)).not.toMatch(/România|wages/u);
  });

  it("route row 'hosted' (the shape Task 19 turns on): the support target's key, the exact Anthropic URL, its spend record", async () => {
    const recorded = recordingFetch();
    vi.stubGlobal("fetch", recorded.fetch);
    const recordSpend = vi.fn(async () => undefined);
    const decider = await compose(null, { kind: "HOSTED", credential: "sk-ant-test-key", recordSpend });
    const lock = await decider.decide({ ask: askOf(MIX_Q, "ro"), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(["FALLBACK_SITE", "FALLBACK_ELD", "ELD_SITE"]).toContain(lock.source);
    expect(recorded.calls.length).toBe(1);
    expect(recorded.calls[0]!.url).toBe(`${ANTHROPIC_MESSAGES_BASE_URL}${ANTHROPIC_MESSAGES_PATH}`);
    expect(recorded.calls[0]!.headers["x-api-key"]).toBe("sk-ant-test-key");
    // A refused request (HTTP 500) costs nothing: the transport records no spend for it.
    expect(recordSpend).not.toHaveBeenCalled();
    // A key of the wrong shape refuses the boot (the transport's own construction check).
    await expect(compose(null, { kind: "HOSTED", credential: "Bearer sk-ant-test-key", recordSpend })).rejects.toThrow();
  });

  it("onDecided receives each lock (the practice report's hook)", async () => {
    const seen: string[] = [];
    const decider = await composeQuestionLanguage({ policy: null, route: { kind: "NONE", reason: "NO_GATE" }, clock: () => new Date(),
      maxQuestionBytes: 8192, referenceKey: newQuestionLanguageReferenceKey(), onDecided: (outcome) => seen.push("source" in outcome ? outcome.source : "OFFER") });
    const lock = await decider.decide({ ask: askOf(MIX_Q, "ro"), ownerScope: "owner:a", fastCheckAllowed: true });
    expect(seen).toEqual([lock.source]);
  });
});

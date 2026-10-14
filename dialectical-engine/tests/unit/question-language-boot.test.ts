/**
 * The question-language boot (question-language spec 2026-10-13, P2L Task 12): the row, eld, the transport choice
 * (ruling L-ROUTE, the route table) and the decider. The transport cannot tell the guarded fetch from the global fetch,
 * and the preview and hosted URLs are the same string, so the BOOT enforces the table. One test per row:
 *   preview + Anthropic gate socket → the guarded fetch, no key, no spend record (the gate settles preview money);
 *   preview without that socket      → NO transport, the fast check off, reason NO_GATE (never the hosted route);
 *   hosted (before Task 19)          → NO transport, reason HOSTED_BEFORE_SPEND_RECORD;
 *   hosted (Task 19's route shape)   → the support target's key, the exact Anthropic URL, its spend record;
 *   local mode                       → NO transport, reason LOCAL_MODE;
 *   the row's fastCheck: null        → NO transport, reason POLICY_OFF.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANTHROPIC_MESSAGES_BASE_URL, ANTHROPIC_MESSAGES_PATH, PREVIEW_ANTHROPIC_MESSAGES_URL } from "@debateai/providers";
import { questionLanguagePolicyStartValues } from "@debateai/register";
import {
  assertQuestionLanguagePolicyBootable, composeQuestionLanguage, hostedQuestionLanguageRoute, questionLanguageRouteFor,
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

  it("with no preview configuration the hosted side decides: before Task 19 hosted and local build no transport", () => {
    expect(hostedQuestionLanguageRoute("hosted")).toEqual({ kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" });
    expect(hostedQuestionLanguageRoute("local")).toEqual({ kind: "NONE", reason: "LOCAL_MODE" });
    expect(questionLanguageRouteFor({ previewConfigured: false, previewFetch: undefined, anthropicSocket: undefined,
      hosted: () => hostedQuestionLanguageRoute("hosted") })).toEqual({ kind: "NONE", reason: "HOSTED_BEFORE_SPEND_RECORD" });
    // A guarded fetch never leaks into the hosted side: without a preview configuration the hosted answer stands.
    expect(questionLanguageRouteFor({ previewConfigured: false, previewFetch: previewRoute.fetch, anthropicSocket: "/run/gate.sock",
      hosted: () => hostedQuestionLanguageRoute("local") })).toEqual({ kind: "NONE", reason: "LOCAL_MODE" });
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

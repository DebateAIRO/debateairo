// tests/unit/question-check-preview-route.test.ts
// R22's first debate on the test site (2 Nov): the site has the Anthropic gate and no support target, so the question check
// was never on and every ask was refused (503 QUESTION_CHECK_UNAVAILABLE, code QUESTION_CHECK_NOT_CONFIGURED). Ruling L-ROUTE:
// a deployment with a preview configuration never takes the hosted route; the check goes through the Anthropic gate, with no
// key, and the gate settles its money (the route table in question-language/boot.ts: no spend record on the preview).
// Each test builds the check the way main.ts does, from the site's setup, and runs it. On the preview the fetch is the real
// guarded fetch (the body the gate must accept), with a stand-in for the gate behind it. Data is made up.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewGuardedFetch, PREVIEW_GATE_SLOT_WAIT_MS, type PreviewBudgetExecution, type PreviewBudgetPort } from "@debateai/providers";
import type { QuestionCheckSpendEntry } from "../../apps/api/src/question-check/check.js";
import { composeQuestionCheck } from "../../apps/api/src/question-check/compose.js";
import { readQuestionSubjects } from "../../apps/api/src/question-check/subjects.js";
import type { SupportModelTarget } from "../../apps/api/src/support/model.js";

const SOCKET = "/run/debateai-v3-preview/anthropic-budget.sock";
const MARKER = /DEBATEAI-FENCE-([0-9a-f]{32})/u;
const QUESTION = "Should the town build a second pier?";
const SUPPORT_TARGET: SupportModelTarget = {
  providerRef: "anthropic-support", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5",
  adapterKind: "anthropic-messages-http", authorizationFile: "/made/up/key"
};
/** Made up, in the shape the adapter checks. */
const HOSTED_KEY = "sk-ant-api03-ABCDEFGH12345678";

type Answer = { subject: string; healthy: boolean };

/** The vendor's reply to one framed check: the call marker echoed, the subject and health given. */
function vendorReply(requestBody: string, answer: Answer): string {
  const call = requestBody.match(MARKER)![1];
  return JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ call, subject: answer.subject, healthy: answer.healthy }) }],
    usage: { input_tokens: 700, output_tokens: 20 } });
}

/**
 * The Anthropic gate behind the real guarded fetch: it answers for the vendor, passes a vendor status through, or refuses
 * (the real port rejects on a refusal: halted, day pot used up, socket down).
 */
function gate(behaviour: Answer | { vendorStatus: number } | { refuses: Error }, answersAfterMs = 0) {
  const executed: PreviewBudgetExecution[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const port: PreviewBudgetPort = {
    async execute(input, signal) {
      executed.push(input);
      signals.push(signal);
      if (answersAfterMs > 0) await new Promise((resolve) => setTimeout(resolve, answersAfterMs));
      if ("refuses" in behaviour) throw behaviour.refuses;
      if ("vendorStatus" in behaviour) return { status: behaviour.vendorStatus, body: "{}" };
      return { status: 200, body: vendorReply(input.requestBody, behaviour) };
    }
  };
  return { fetch: createPreviewGuardedFetch({ anthropic: port }), executed, signals };
}

async function siteCheck(setup: Readonly<{ preview: { fetch: typeof fetch | undefined; anthropicSocket: string | undefined } | null;
  target?: SupportModelTarget; writerPresent?: boolean; deadlineMs?: number }>) {
  const entries: QuestionCheckSpendEntry[] = [];
  const reports: { event: string; code: string }[] = [];
  const keyReads: string[] = [];
  let potReads = 0;
  const check = await composeQuestionCheck({
    mode: "hosted", apiPort: 3101, target: setup.target,
    readAuthorizationHeader: (path) => { keyReads.push(path); return HOSTED_KEY; },
    reportDiagnostic: () => undefined,
    policy: { deadlineMs: setup.deadlineMs ?? 5_000 },
    subjects: readQuestionSubjects(),
    spend: { writerPresent: async () => setup.writerPresent ?? true, record: async (entry) => { entries.push(entry); } },
    dayPot: { ceilingMicros: 1_000_000, spentMicros: async () => { potReads += 1; return 0; } },
    clock: () => new Date(),
    report: (line) => { reports.push({ ...line }); },
    preview: setup.preview
  });
  return { check, entries, reports, keyReads, potReads: () => potReads };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("the question check on a site with the Anthropic gate (the test site)", () => {
  it("is on with no support target: one call the real guard lets through to the gate, no key, the check's model; nothing recorded", async () => {
    const { fetch, executed } = gate({ subject: "NONE", healthy: true });
    const site = await siteCheck({ preview: { fetch, anthropicSocket: SOCKET } });
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "PASS" });
    expect(executed).toHaveLength(1);
    const body = JSON.parse(executed[0]!.requestBody) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 16_000, output_config: { effort: "low" } });
    expect(executed[0]!.requestBody).not.toMatch(/sk-ant-|x-api-key/u);
    expect(Number(executed[0]!.reservedUsd)).toBeGreaterThan(0);
    // The route table: the gate reserved and settles this call; a ledger row would count it twice.
    expect(site.entries).toEqual([]);
    expect(site.potReads()).toBe(0);
    expect(site.keyReads).toEqual([]);
    expect(site.reports).toEqual([]);
  });

  it("refuses through the gate as it would anywhere: the subject's own answer, not an outage", async () => {
    const { fetch } = gate({ subject: "DRUGS", healthy: false });
    const site = await siteCheck({ preview: { fetch, anthropicSocket: SOCKET } });
    expect(await site.check.check("A question about making drugs?")).toEqual({ outcome: "REFUSE", kind: "DRUGS", screen: "REFUSE", emergencyNumber: false });
  });

  it("a gate that refuses (halted, day pot used up) makes the check unavailable and records no cost, since nothing was paid", async () => {
    const { fetch, executed } = gate({ refuses: new Error("PREVIEW_GATE_UNAVAILABLE") });
    const site = await siteCheck({ preview: { fetch, anthropicSocket: SOCKET } });
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_TRANSPORT_FAILED" });
    expect(executed).toHaveLength(1);
    expect(site.entries).toEqual([]);
    expect(site.reports).toContainEqual({ event: "api.question_check.unavailable", code: "QUESTION_CHECK_TRANSPORT_FAILED" });
  });

  it("a vendor status the gate passes on is named by its kind (HTTP status)", async () => {
    const { fetch } = gate({ vendorStatus: 529 });
    const site = await siteCheck({ preview: { fetch, anthropicSocket: SOCKET } });
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_HTTP_STATUS" });
    expect(site.entries).toEqual([]);
  });

  it("does not depend on the site's spend writer, which records nothing here", async () => {
    const { fetch } = gate({ subject: "NONE", healthy: true });
    const site = await siteCheck({ preview: { fetch, anthropicSocket: SOCKET }, writerPresent: false });
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "PASS" });
    expect(site.reports).toEqual([]);
  });

  // 2026-11-02 review: running debates can hold both of the gate's slots; the gate queues a call up to its slot wait. A Start
  // waits that out instead of being refused, and the gate's socket is never closed under a call (a lost reply halts the gate).
  it("a Start waits out the gate's slot queue past the policy's time limit, and the gate's line is never cut", async () => {
    const { fetch, signals } = gate({ subject: "NONE", healthy: true }, 80);
    const site = await siteCheck({ preview: { fetch, anthropicSocket: SOCKET }, deadlineMs: 20 });
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "PASS" });
    expect(signals[0]?.aborted ?? false).toBe(false);
  });

  it("the slot wait it allows is the gate's own (preview_budget_authority.py SLOT_WAIT_SECONDS)", () => {
    const gateSource = readFileSync("packages/providers/ops/preview_budget_authority.py", "utf8");
    expect(Number(gateSource.match(/^SLOT_WAIT_SECONDS = (\d+)$/mu)![1]) * 1000).toBe(PREVIEW_GATE_SLOT_WAIT_MS);
  });

  it("never falls back to a support target on a preview without the gate's socket, and says so once at boot", async () => {
    const { fetch, executed } = gate({ subject: "NONE", healthy: true });
    const site = await siteCheck({ preview: { fetch, anthropicSocket: undefined }, target: SUPPORT_TARGET });
    expect(site.reports).toEqual([{ event: "api.question_check.not_configured", code: "QUESTION_CHECK_NOT_CONFIGURED" }]);
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_NOT_CONFIGURED" });
    expect(executed).toEqual([]);
    expect(site.keyReads).toEqual([]);
  });
});

describe("the question check on a site with no preview gate", () => {
  it("with no support target it is off, and says so once at boot (not first at a person's ask)", async () => {
    const site = await siteCheck({ preview: null });
    expect(site.reports).toEqual([{ event: "api.question_check.not_configured", code: "QUESTION_CHECK_NOT_CONFIGURED" }]);
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_NOT_CONFIGURED" });
  });

  it("hosted keeps the policy's time limit: a vendor slower than it is a deadline, as before", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return new Response(vendorReply(String(init.body), { subject: "NONE", healthy: true }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const site = await siteCheck({ preview: null, target: SUPPORT_TARGET, deadlineMs: 20 });
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "UNAVAILABLE", code: "QUESTION_CHECK_DEADLINE" });
  });

  it("with the support target (hosted): its key, the vendor's URL, and the call's real tokens recorded as a site cost, as before", async () => {
    const sent: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: String(init.body) });
      return new Response(vendorReply(String(init.body), { subject: "NONE", healthy: true }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const site = await siteCheck({ preview: null, target: SUPPORT_TARGET });
    expect(await site.check.check(QUESTION)).toEqual({ outcome: "PASS" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url.startsWith("https://api.anthropic.com/v1")).toBe(true);
    expect(site.keyReads).toEqual(["/made/up/key"]);
    expect(site.potReads()).toBe(1);
    expect(site.entries).toEqual([expect.objectContaining({
      providerRef: "question-check:anthropic-support:claude-haiku-5-5", inputTokens: 700, outputTokens: 20 })]);
    expect(site.entries[0]!.chargeMicros).toBeGreaterThan(0);
  });
});

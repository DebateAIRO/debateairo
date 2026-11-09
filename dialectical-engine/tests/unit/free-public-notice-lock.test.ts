// tests/unit/free-public-notice-lock.test.ts
// V4 start step, Task 36 (spec 2026-11-03 §4.2; ask-f2; owner answer Q14 of 4 Nov): THE FREE NOTICE LOCK. On a version where the start
// step runs, a new question from a signed-in person on the Free plan that arrives without the notice flag ("On the Free plan your
// question and its debate are public. Don't include personal details.") is refused with a plain code, before the question check, the
// room or any charge; the page then shows the notice and sends again. Digs and public digs are contributions and are never held; an
// internal grant decides premium; a site with no plans is never held; a paid plan's flag still means nothing. On a version without the
// step, an old page's Free question goes through as today. The plan is decided once per ask, for the lock and the record after submit.
// Every figure here is made up.
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AdmissionView, type AskApplication } from "@debateai/api";
import { FREE_PUBLIC_NOTICE_REQUIRED, type AskRequest } from "@debateai/contract";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, debateShapePolicyStartValues, debateShapeStartStepStartValues,
  engineVersionPolicyStartValues, type DebateShapePolicy, type PlanId
} from "@debateai/register";
import type { AskBilling } from "../../apps/api/src/ask-billing.js";
import type { QuestionLanguageLock } from "../../apps/api/src/question-language/decider.js";
import { freeNoticeMissing } from "../../apps/api/src/start-paths-at-ask.js";
import { newStartStepKey, signStartCheck } from "../../apps/api/src/start-step/signing.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const IDENTITY = testHttpIdentity("free-public-notice-lock");
const OWNER = IDENTITY.authenticated.ownerRef;
const HEADERS = testSessionHeaders(IDENTITY, true);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_RUN_ID = "22222222-2222-4222-8222-222222222222";
const PUBLIC_REF = "33333333-3333-4333-8333-333333333333";
const KEY = newStartStepKey();
const Q = "Should the town build a second ferry pier?";
const REFUSED = Object.freeze({ error: "FREE_PUBLIC_NOTICE_REQUIRED", message: "FREE_PUBLIC_NOTICE_REQUIRED" });
const LOCK: QuestionLanguageLock = Object.freeze({
  language: Object.freeze({ code: "en", name: "English" }), source: "ELD_SITE", siteLanguage: "en", rewriteAccepted: false,
  originalQuestionLine: null, trace: Object.freeze({ eld: null, fast: null, contractHash: null }), recordCode: "ELD_SITE", localReason: null
});

const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };
const viewOf = (policy: DebateShapePolicy): AdmissionView => Object.freeze({ registerVersion: 31, debateShapePolicy: policy,
  engineVersionPolicy: engineVersionPolicyStartValues(), modelScorecardInForce: false });
const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);

const baseAsk = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: Q, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:free-notice", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "the Free notice lock",
  as_of: "2026-11-04T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [], ...extra });
const NOTICE = { free_public_notice: true } as const;

type Plan = PlanId | "INTERNAL" | "NO_PLANS";
function apiOver(input: Readonly<{ plan: Plan; view?: "ON" | "OFF"; publicTree?: boolean }>) {
  const checked: string[] = [];
  const submitted: unknown[][] = [];
  let planReads = 0;
  const recordFreeNotice = vi.fn(async (_ownerRef: string, _runId: string) => "RECORDED");
  const application = {
    submit: async (...args: unknown[]) => { submitted.push(args); return { run_ref: RUN_ID, status: "QUEUED" as const }; }
  } as unknown as AskApplication;
  const billing: AskBilling | undefined = input.plan === "NO_PLANS" ? undefined : Object.freeze({
    plans: PLANS, coarseFit: {} as never, clock: () => new Date("2026-11-04T10:00:00.000Z"),
    entitlements: { current: async () => {
      planReads += 1;
      return { planId: input.plan === "INTERNAL" ? "FREE" as const : input.plan as PlanId, eventId: "3c1d5e7f-9a2b-4c6d-8e0f-1a3b5c7d9e2f" };
    } },
    ...(input.plan === "INTERNAL" ? { funding: { resolveAskFunding: async () => {
      planReads += 1;
      return { kind: "INTERNAL" as const, grantId: "0b5e1c8a-3f4d-4e2a-9c71-6d8f2a4b9e10", grantEventId: "7e2d4f6a-1b3c-4d5e-8f9a-0b1c2d3e4f5a" } as never;
    } } } : {})
  });
  const api = buildApi({
    application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN, startStepKey: KEY,
    questionCheck: { check: async (text: string) => { checked.push(text); return { outcome: "PASS" as const }; } },
    admissionView: async () => viewOf(input.view === "OFF" ? debateShapePolicyStartValues() : POLICY_ON),
    ...(billing === undefined ? {} : { askBilling: billing }),
    ...(input.publicTree === false ? {} : { publicTree: { pool: {} as never, tree: { readTreeOfRun: async () => null } as never,
      contributions: { recordFreeNotice } as never, readPublicDebate: async () => null } })
  } as never);
  const post = (payload: AskRequest, headers: Readonly<Record<string, string>> = HEADERS) =>
    api.inject({ method: "POST", url: "/v1/asks", headers, payload });
  return { api, post, checked, submitted, recordFreeNotice, planReads: () => planReads };
}

describe("the Free notice lock, where the start step runs", () => {
  it("a Free new question (here with its check from Next) without the notice: 403, before the check, submit, any charge or record", async () => {
    const h = apiOver({ plan: "FREE" });
    const checkRef = signStartCheck(KEY, { ownerScope: `owner:${OWNER}`, questionLine: Q, planKey: "free", settingsVersion: 31, lock: LOCK,
      originalQuestionLine: null });
    const response = await h.post(baseAsk({ start_check: { ref: checkRef } }));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(REFUSED);
    expect(FREE_PUBLIC_NOTICE_REQUIRED).toBe("FREE_PUBLIC_NOTICE_REQUIRED");
    expect([h.checked.length, h.submitted.length]).toEqual([0, 0]);
    expect(h.recordFreeNotice).not.toHaveBeenCalled();
    await h.api.close();
  });

  it("a Free \"Just answer it\" ask (no start members) without the notice: the same 403", async () => {
    const h = apiOver({ plan: "FREE" });
    expect((await h.post(baseAsk())).json()).toEqual(REFUSED);
    expect([h.checked.length, h.submitted.length]).toEqual([0, 0]);
    await h.api.close();
  });

  it("with the notice: 202, the Free notice recorded once, and the plan decided once for the lock and the record", async () => {
    const h = apiOver({ plan: "FREE" });
    expect((await h.post(baseAsk(NOTICE))).statusCode).toBe(202);
    expect(h.checked).toEqual([Q]);
    expect(h.submitted).toHaveLength(1);
    expect(h.recordFreeNotice).toHaveBeenCalledOnce();
    expect(h.recordFreeNotice).toHaveBeenCalledWith(OWNER, RUN_ID);
    expect(h.planReads()).toBe(1);
    await h.api.close();
  });

  it("a paid plan, without the notice or with it: 202 and nothing recorded (its flag means nothing), the plan read once each", async () => {
    const h = apiOver({ plan: "PLUS" });
    expect((await h.post(baseAsk())).statusCode).toBe(202);
    expect(h.planReads()).toBe(1);
    expect((await h.post(baseAsk(NOTICE))).statusCode).toBe(202);
    expect(h.planReads()).toBe(2);
    expect(h.submitted).toHaveLength(2);
    expect(h.recordFreeNotice).not.toHaveBeenCalled();
    await h.api.close();
  });

  it("an internal grant decides premium: never held", async () => {
    const h = apiOver({ plan: "INTERNAL" });
    expect((await h.post(baseAsk())).statusCode).toBe(202);
    expect(h.recordFreeNotice).not.toHaveBeenCalled();
    await h.api.close();
  });

  it("a Free dig and a Free public dig are contributions: never held", async () => {
    const h = apiOver({ plan: "FREE" });
    const dig = await h.post(baseAsk({ question_line: `${Q} Dig: the winters.`, parent: { parent_run_id: PARENT_RUN_ID, places: [], mode: "quick" } }));
    expect(dig.statusCode).toBe(202);
    await h.api.close();
    // Without the public tree the page is not read (as today): this pins only that the lock lets a public dig through.
    const p = apiOver({ plan: "FREE", publicTree: false });
    const publicDig = await p.post(baseAsk({ question_line: `${Q} Dig: the winters.`, public_parent: { public_ref: PUBLIC_REF, places: [], mode: "quick" } }));
    expect(publicDig.statusCode).toBe(202);
    expect(p.submitted).toHaveLength(1);
    await p.api.close();
  });

  it("a site with no plans (no billing): never held", async () => {
    const h = apiOver({ plan: "NO_PLANS" });
    expect((await h.post(baseAsk())).statusCode).toBe(202);
    expect(h.submitted).toHaveLength(1);
    await h.api.close();
  });

  it("a signed-out ask: today's answer (401 SESSION_REQUIRED), nothing read, checked or submitted", async () => {
    const h = apiOver({ plan: "FREE" });
    const response = await h.post(baseAsk(), { origin: TEST_APP_ORIGIN });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect([h.planReads(), h.checked.length, h.submitted.length]).toEqual([0, 0, 0]);
    await h.api.close();
  });
});

describe("owner answer Q14: on a version without the start step, today's Free ask", () => {
  it("a Free new question without the notice: 202, the plan not read for a lock", async () => {
    const h = apiOver({ plan: "FREE", view: "OFF" });
    expect((await h.post(baseAsk())).statusCode).toBe(202);
    expect(h.submitted).toHaveLength(1);
    expect(h.planReads()).toBe(0);
    expect(h.recordFreeNotice).not.toHaveBeenCalled();
    await h.api.close();
  });

  it("with the notice: recorded once, as today", async () => {
    const h = apiOver({ plan: "FREE", view: "OFF" });
    expect((await h.post(baseAsk(NOTICE))).statusCode).toBe(202);
    expect(h.recordFreeNotice).toHaveBeenCalledOnce();
    expect(h.planReads()).toBe(1);
    await h.api.close();
  });

  it("a Free ask carrying a check from Next: no plan read at all (neither a lock nor a binding), the whole line checked", async () => {
    const h = apiOver({ plan: "FREE", view: "OFF" });
    const checkRef = signStartCheck(KEY, { ownerScope: `owner:${OWNER}`, questionLine: Q, planKey: "free", settingsVersion: 31, lock: LOCK,
      originalQuestionLine: null });
    expect((await h.post(baseAsk({ start_check: { ref: checkRef } }))).statusCode).toBe(202);
    expect(h.planReads()).toBe(0);
    expect(h.checked).toEqual([Q]);
    expect(h.submitted[0]).toHaveLength(3);
    await h.api.close();
  });
});

describe("freeNoticeMissing", () => {
  const FREE = Object.freeze({ planTier: "free", planId: "FREE" as PlanId });
  const of = (over: Partial<Parameters<typeof freeNoticeMissing>[0]> = {}) =>
    freeNoticeMissing({ ask: baseAsk(), signedIn: true, decided: FREE, switchOn: true, ...over });

  it("holds a signed-in Free new question without the flag, where the switch is on", () => {
    expect(of()).toBe(true);
  });

  it.each([
    ["the flag sent", { ask: baseAsk(NOTICE) }],
    ["a dig", { ask: baseAsk({ parent: { parent_run_id: PARENT_RUN_ID, places: [], mode: "quick" } }) }],
    ["a public dig", { ask: baseAsk({ public_parent: { public_ref: PUBLIC_REF, places: [], mode: "quick" } }) }],
    ["signed out", { signedIn: false }],
    ["a paid plan", { decided: { planTier: "premium", planId: "PLUS" as PlanId } }],
    ["no plans (no plan id)", { decided: { planTier: "free", planId: null } }],
    ["the switch off", { switchOn: false }]
  ] as const)("never holds %s", (_name, over) => {
    expect(of(over)).toBe(false);
  });
});

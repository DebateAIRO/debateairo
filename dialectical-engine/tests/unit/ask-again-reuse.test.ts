// V4 start step, Task 57e (the owner's 6 Nov rule: "we should re-use what we already paid for"; confirmed plan, card "Build this
// (Recommended)"): "ASK THIS AGAIN" RE-USES WHAT WAS ALREADY PAID FOR. On the person's own FAILED first question that keeps the paths
// chosen from the list, POST /v1/asks with `again_of` starts the question again from what the debate stored: its whole line (the
// person's words and the clarifying answers the page wrote into it), its place, time and purpose lines, its depth and reading level,
// its carry-on box and its chosen paths, handed to `submit` as they were. No clarifying call, no list, no charge before Start, no try
// linked: only the debate itself runs again. On a run that is not the person's, not FAILED, erased, a dig, or one that keeps no paths
// from the list, and on changed words, the link is ignored: today's ask. The FAILED run read says `reusable: true` exactly when the
// link would re-use something. Every question, path and id here is made up.
import { describe, expect, it } from "vitest";
import { buildApi, type AdmissionView, type AskApplication } from "@debateai/api";
import { AskRequestSchema, RunProjectionSchema, type AskRequest, type PurposeLines, type RunProjection } from "@debateai/contract";
import type { Pool, StartPathsStore, StoredAsk, StoredStartPath, StoredStartPathSet } from "@debateai/db";
import {
  debateShapePolicyStartValues, debateShapeStartStepStartValues, engineVersionPolicyStartValues, type DebateShapePolicy
} from "@debateai/register";
import { askAgainOf, readAskAgainSource, type AskAgainSource } from "../../apps/api/src/ask-again.js";
import type { AskStartHandOver } from "../../apps/api/src/start-paths-at-ask.js";
import { newStartStepKey } from "../../apps/api/src/start-step/signing.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const KEY = newStartStepKey();
const IDENTITY = testHttpIdentity("ask-again-reuse");
const HEADERS = testSessionHeaders(IDENTITY, true);
const FAILED_RUN = "55555555-5555-4555-8555-555555555555";
const NEW_RUN = "66666666-6666-4666-8666-666666666666";
const ACTIVE = 31;

const OWN = "Should Harbour Town build a second ferry pier?";
/** The whole line as the debate stored it: the person's words, then the clarifying answer the page wrote into it. */
const LINE = `${OWN}\n\nLooking at Harbour Town.`;
const PURPOSE: PurposeLines = Object.freeze({ answers: [{ question: "Which town is this about?", answer: "Harbour Town" }], matters: "the cost" });

const pathOf = (no: number, title: string, question: string, author: StoredStartPath["author"] = "AI_SUGGESTION"): StoredStartPath => Object.freeze({
  pathId: `b${String(no)}` as StoredStartPath["pathId"], pathNo: no, author, title, question,
  viewpoints: Object.freeze([{ viewpointId: `pt${String(no)}1`, pickNo: null, title, question, own: false }]),
  ownWords: author === "PERSON_EDITED" ? Object.freeze([title, question]) : Object.freeze([])
});
const KEPT: StoredStartPathSet = Object.freeze({
  runId: FAILED_RUN, source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: true,
  paths: Object.freeze([pathOf(1, "Ferry queues", "How long do people wait for the ferry today?"),
    pathOf(2, "Cost of the pier", "What would a second pier cost the town?"),
    pathOf(3, "Harbour wildlife", "What would building it do to the seals in the harbour?", "PERSON_EDITED")]),
  menu: null
});
const SOURCE: AskAgainSource = Object.freeze({ runId: FAILED_RUN, questionLine: LINE, purposeLines: PURPOSE,
  depthParams: Object.freeze({ depth: 2, readingLevel: "plain" as const }), set: KEPT });

const FAILED: RunProjection = Object.freeze({ run_ref: FAILED_RUN, question_line: LINE, state: "FAILED",
  terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", hold_until: null });

const askOf = (extra: Partial<AskRequest> = {}): AskRequest => ({ question_line: LINE, risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:again", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "ask this again",
  as_of: "2026-11-06T00:00:00.000Z", steering_presets: [], plan_tier: "premium", steering_annotations: [], ...extra });

const POLICY_ON: DebateShapePolicy = { ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() };
const viewOf = (policy: DebateShapePolicy): AdmissionView => Object.freeze({ registerVersion: ACTIVE, debateShapePolicy: policy,
  engineVersionPolicy: engineVersionPolicyStartValues(), modelScorecardInForce: false });

type Over = Readonly<{ run?: RunProjection | null; source?: AskAgainSource | null; readThrows?: boolean; view?: AdmissionView }>;
function apiOver(over: Over = {}) {
  const checked: string[] = [];
  const submitted: unknown[][] = [];
  const linked: unknown[][] = [];
  const againReads: string[] = [];
  const application = {
    submit: async (...args: unknown[]) => { submitted.push(args); return { run_ref: NEW_RUN, status: "QUEUED" as const }; },
    readRunAnswer: async () => null,
    readRun: async () => over.run === undefined ? FAILED : over.run,
    readRunQuotaUsed: async () => "SOME" as const,
    readAskAgain: async (ownerRef: string, runId: string) => {
      againReads.push(`${ownerRef}:${runId}`);
      if (over.readThrows === true) throw Object.assign(new Error("database down"), { code: "57P01" });
      return over.source === undefined ? SOURCE : over.source;
    },
    linkPreStartTry: async (...args: unknown[]) => { linked.push(args); return 0; }
  } as unknown as AskApplication;
  const sessions = { ...testSessionApplication([IDENTITY]), readSensitiveDataConsent: async () => "given" as const };
  const api = buildApi({
    application, sessions, allowedOrigin: TEST_APP_ORIGIN, startStepKey: KEY,
    questionCheck: { check: async (text: string) => { checked.push(text); return { outcome: "PASS" as const }; } },
    admissionView: async () => over.view ?? viewOf(POLICY_ON)
  } as never);
  const post = (payload: AskRequest) => api.inject({ method: "POST", url: "/v1/asks", payload, headers: HEADERS });
  const read = () => api.inject({ method: "GET", url: `/v1/runs/${FAILED_RUN}`, headers: testSessionHeaders(IDENTITY) });
  return { api, post, read, checked, submitted, linked, againReads };
}
const handOverOf = (submitted: unknown[][]): AskStartHandOver | undefined => submitted[0]![3] as AskStartHandOver | undefined;

describe("the contract: a re-use link on the ask, and the FAILED read's re-use field", () => {
  it("again_of is a run id, last and optional; reusable is true on a FAILED run only, last and optional", () => {
    expect(AskRequestSchema.safeParse(askOf({ again_of: FAILED_RUN })).success).toBe(true);
    expect(AskRequestSchema.safeParse(askOf({ again_of: "not-a-run" as never })).success).toBe(false);
    expect(Object.keys(AskRequestSchema.shape).at(-1)).toBe("again_of");
    expect(RunProjectionSchema.safeParse({ ...FAILED, quota_used: "SOME", reusable: true }).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...FAILED, reusable: false }).success).toBe(false);
    const running = RunProjectionSchema.safeParse({ ...FAILED, state: "RUNNING", terminal_reason: null, reusable: true });
    expect(running.success ? [] : running.error.issues.map((issue) => issue.message)).toEqual(["only a failed debate keeps what ran for the next try"]);
    expect(Object.keys(RunProjectionSchema.shape).slice(-2)).toEqual(["quota_used", "reusable"]);
  });
});

describe("askAgainOf: what a re-used Start sends submit", () => {
  it("the stored line, purpose lines, depth and carry-on, and the kept paths as they were", () => {
    const again = askAgainOf(askOf({ purpose_lines: { matters: "something else" }, depth_params: { depth: 3 } }), SOURCE);
    expect(again).not.toBeNull();
    expect(again!.ask).toMatchObject({ question_line: LINE, purpose_lines: PURPOSE, depth_params: { depth: 2, readingLevel: "plain" }, carry_on_to_report: true });
    expect(again!.verified).toEqual({ source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: true, questionSwap: null, paths: KEPT.paths,
      menu: null, ownWords: ["Harbour wildlife", "What would building it do to the seals in the harbour?"], questionEdited: false });
  });

  it("nothing to re-use, or a question that is not the same one: null (today's ask)", () => {
    expect(askAgainOf(askOf(), null)).toBeNull();
    for (const source of ["RUN_BUILT", "DIG_PICKS"] as const) expect(askAgainOf(askOf(), { ...SOURCE, set: { ...KEPT, source } }), source).toBeNull();
    expect(askAgainOf(askOf({ question_line: `${OWN}\n\nLooking at another town.` }), SOURCE)).toBeNull();
    expect(askAgainOf(askOf({ start_check: { ref: "made-up-check" } }), SOURCE)).toBeNull();
    expect(askAgainOf(askOf({ start_paths: { source: "MENU" } as never }), SOURCE)).toBeNull();
    expect(askAgainOf(askOf({ parent: { parent_run_id: FAILED_RUN, places: ["w"] } as never }), SOURCE)).toBeNull();
  });
});

// Independent review of wave 15: the route cases above fake the application's read, yet that read alone decides when the FAILED run read
// says `reusable` (askAgainOf's own check never runs for the read). So the read itself: a kept set from the list, a stored first question
// whose content is live and whose depth parses, or nothing.
describe("readAskAgainSource: what the application's read finds a failed first question kept", () => {
  const STORED = Object.freeze({ runId: FAILED_RUN, questionLine: LINE, askContract: Object.freeze({ decision_scope: "ask this again" }),
    depthParams: Object.freeze({ depth: 2, readingLevel: "plain" }), contentEncrypted: true }) as unknown as StoredAsk;
  /** A pool that answers nothing: the purpose lines' read fails quietly, so none are kept. */
  const NO_POOL = { query: async () => { throw Object.assign(new Error("no database here"), { code: "57P01" }); } } as unknown as Pool;
  type Read = Readonly<{ set?: StoredStartPathSet | null; stored?: StoredAsk | null; setThrows?: boolean; storedThrows?: boolean; noStore?: boolean }>;
  const readWith = (over: Read = {}) => readAskAgainSource({ pool: NO_POOL, ownerRef: IDENTITY.authenticated.ownerRef, runId: FAILED_RUN,
    readStoredAsk: async () => {
      if (over.storedThrows === true) throw Object.assign(new Error("content key gone"), { code: "PRIVATE_CONTENT_ERASED" });
      return over.stored === undefined ? STORED : over.stored;
    },
    startPaths: over.noStore === true ? undefined : { readStartPaths: async () => {
      if (over.setThrows === true) throw Object.assign(new Error("database down"), { code: "57P01" });
      return over.set === undefined ? KEPT : over.set;
    } } as unknown as StartPathsStore });

  it("paths chosen from the list and a readable stored first question: its whole line, depth and paths (lines it cannot read: none)", async () => {
    expect(await readWith()).toEqual({ runId: FAILED_RUN, questionLine: LINE, purposeLines: null, depthParams: { depth: 2, readingLevel: "plain" }, set: KEPT });
  });

  it("nothing kept for the person: paths it built or a dig's picks, no set (none, or erased), no store, a stored ask it cannot use, any failure", async () => {
    for (const source of ["RUN_BUILT", "DIG_PICKS"] as const) expect(await readWith({ set: { ...KEPT, source } }), source).toBeNull();
    const cases: readonly [string, Read][] = [
      ["no set", { set: null }], ["no store", { noStore: true }], ["no stored ask", { stored: null }],
      ["content in the clear", { stored: { ...STORED, contentEncrypted: false } }],
      ["a depth that does not parse", { stored: { ...STORED, depthParams: { depth: 2, extra: true } } }],
      ["an empty line", { stored: { ...STORED, questionLine: "  " } }],
      ["the set cannot be read", { setThrows: true }], ["the stored ask cannot be read", { storedThrows: true }]
    ];
    for (const [label, over] of cases) expect(await readWith(over), label).toBeNull();
  });
});

describe("POST /v1/asks with again_of: only the debate itself runs again", () => {
  it("Ask again on the person's own failed question: the stored answers and paths go to submit; nothing before Start is called or linked", async () => {
    const h = apiOver();
    const response = await h.post(askOf({ again_of: FAILED_RUN }));
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ run_ref: NEW_RUN });
    expect(h.againReads).toEqual([`${IDENTITY.authenticated.ownerRef}:${FAILED_RUN}`]);
    expect(h.submitted).toHaveLength(1);
    const sent = h.submitted[0]![0] as AskRequest;
    expect(sent).toMatchObject({ question_line: LINE, purpose_lines: PURPOSE, depth_params: { depth: 2, readingLevel: "plain" }, carry_on_to_report: true });
    // The link is read here and never stored with the run.
    expect(sent).not.toHaveProperty("again_of");
    const handOver = handOverOf(h.submitted)!;
    expect(handOver).toEqual({ binding: { planKey: "premium", settingsVersion: ACTIVE }, lock: null, verified: expect.any(Object) });
    expect(handOver.verified!.paths).toEqual(KEPT.paths);
    expect(handOver.verified).toMatchObject({ source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: true, questionEdited: false });
    // No try is linked: the failed debate keeps its own charges before Start, which bought these paths.
    expect(h.linked).toEqual([]);
    // The site's question check (never the person's quota) reads the whole line and the person's own words, once.
    expect(h.checked).toHaveLength(1);
    expect(h.checked[0]).toContain(LINE);
    expect(h.checked[0]!.endsWith("\n\nHarbour wildlife\nWhat would building it do to the seals in the harbour?")).toBe(true);
    await h.api.close();
  });

  it("today's ask when the run is not the person's, not FAILED, erased or unreadable, keeps no paths from the list, or the words changed", async () => {
    const cases: readonly [string, Over, AskRequest][] = [
      ["not the person's", { run: null }, askOf({ again_of: FAILED_RUN })],
      ["not FAILED", { run: { ...FAILED, state: "SETTLED", terminal_reason: null } }, askOf({ again_of: FAILED_RUN })],
      ["erased or keeps nothing", { source: null }, askOf({ again_of: FAILED_RUN })],
      ["unreadable", { readThrows: true }, askOf({ again_of: FAILED_RUN })],
      ["the words changed", {}, askOf({ again_of: FAILED_RUN, question_line: OWN })]
    ];
    for (const [label, over, ask] of cases) {
      const h = apiOver(over);
      const response = await h.post(ask);
      expect(response.statusCode, label).toBe(202);
      expect(h.submitted, label).toHaveLength(1);
      const sent = h.submitted[0]![0] as AskRequest;
      expect(sent, label).not.toHaveProperty("again_of");
      expect(sent.question_line, label).toBe(ask.question_line);
      expect(sent.depth_params, label).toEqual({ depth: 1 });
      expect(handOverOf(h.submitted), label).toBeUndefined();
      await h.api.close();
    }
  });
});

describe("GET /v1/runs/{id}: the FAILED read says whether what ran is kept for the next try", () => {
  it("reusable: true when Ask again would re-use it; absent when nothing is kept or it cannot be read; never on a run that did not fail", async () => {
    const kept = apiOver();
    expect((await kept.read()).json()).toEqual({ ...FAILED, quota_used: "SOME", reusable: true });
    await kept.api.close();
    for (const over of [{ source: null }, { readThrows: true }] as const) {
      const none = apiOver(over);
      expect((await none.read()).json()).toEqual({ ...FAILED, quota_used: "SOME" });
      await none.api.close();
    }
    const running = apiOver({ run: { ...FAILED, state: "RUNNING", terminal_reason: null } });
    expect((await running.read()).json()).toEqual({ ...FAILED, state: "RUNNING", terminal_reason: null });
    expect(running.againReads).toEqual([]);
    await running.api.close();
  });
});

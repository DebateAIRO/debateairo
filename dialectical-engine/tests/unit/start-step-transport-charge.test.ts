/**
 * V4 start step, Task 27 (spec 2026-11-03 §4.1 "Allowance"): THE PREVIEW TRANSPORT AND THE PER-PERSON CHARGE. Every
 * call before Start goes through one fresh preview gateway (the gates, the preview call policy), with no debate and
 * nothing written but the money rows. Each call is charged to the person (0155's writer) from the vendor's real counts
 * only: on the preview the gate settles the money, so a call with no readable counts costs the person nothing. A
 * record that cannot be written stops the calls until a restart (never spend unrecorded). A busy model's call ends at
 * once and the model sits out the next two minutes.
 */
import { describe, expect, it, vi } from "vitest";
import type { PreStartChargeEntry } from "@debateai/budget";
import { START_STEP_TIMING, type MapCallRequest, type MapStepSpec } from "@debateai/map";
import {
  PREVIEW_GLM_DEADLINE_MS, PREVIEW_GLM_GENERATION_TOKEN_FLOOR, PREVIEW_REVIEWED_PROVIDER_REFS, PreviewVendorRefusedUnbilled, createPreviewGuardedFetch,
  parsePreviewProviderTestConfig, parseProviderDiscoveryTargets, previewModelRow, previewTargetJsonRow, type PreviewBudgetExecution, type ProviderDiscoveryTarget
} from "@debateai/providers";
import { createStartCharges } from "../../apps/api/src/start-step/charge.js";
import { createStartBusyBook, startSeatsFor } from "../../apps/api/src/start-step/seats.js";
import {
  START_STEP_CALL_BOUNDS, createStartTransport, preStartKindOfCallSite, type StartCallEnd
} from "../../apps/api/src/start-step/transport.js";

const GLM = "zai-org/GLM-5.3-Flash";
const QWEN = "Qwen/Qwen3.8-Flash";
const NOW = new Date("2026-11-03T10:00:00.000Z");
const OWNER = "4c7b1a64-8f2e-4d55-9a3b-0e6f2d1c9b77";
const GRANT = { kind: "INTERNAL", grantId: "0b5e1c8a-3f4d-4e2a-9c71-6d8f2a4b9e10", grantEventId: "7e2d4f6a-1b3c-4d5e-8f9a-0b1c2d3e4f5a" } as const;
/** Made-up prices (micro-units per million tokens): never a real figure. */
const PRICE = Object.freeze({ inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 2_000_000 });

const TARGETS: readonly ProviderDiscoveryTarget[] = parseProviderDiscoveryTargets(
  JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow)),
  PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  }));
const GLM_TARGET = TARGETS.find((target) => target.model === GLM)!;
const CONFIG = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", requested_thinking_level: "high", scope_id: "start-step-transport-fixture",
  budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock",
  free_model_ids: [GLM, "claude-haiku-5-5"], premium_model_ids: [GLM, QWEN, "claude-haiku-5-5"]
}))!;

function charges(record: (entry: PreStartChargeEntry) => Promise<void> = async () => undefined, priced = true) {
  const entries: PreStartChargeEntry[] = [];
  const reports: Readonly<{ event: string; code: string }>[] = [];
  let ids = 0;
  const book = createStartCharges({
    record: async (entry) => { await record(entry); entries.push(entry); },
    priceOf: () => priced ? PRICE : null, clock: () => NOW, report: (line) => { reports.push(line); },
    newId: () => `0000000${String(++ids)}-0000-4000-8000-000000000000`
  });
  return { book, entries, reports };
}
const PROJECTION = Object.freeze({ requestBytes: 4_000, completionTokenCeiling: 8_192 });
const codeOf = async (run: () => unknown): Promise<string> => {
  try { await run(); } catch (error) { return String((error as { code?: unknown }).code); }
  return "NO_THROW";
};

describe("the start step's call sites and bounds", () => {
  it("each START key names its charge kind; any other key none", () => {
    expect(["START:angles", "START:list:3", "START:merge", "START:merge-late", "START:combine", "START:fit", "MAP:merge"].map(preStartKindOfCallSite))
      .toEqual(["ANGLES", "LIST", "MERGE", "MERGE_LATE", "COMBINE", "FIT", null]);
    expect(["START:list:1", "START:list:9", "START:list:0", "START:list:10", "START:list:", "START:merge-later", "start:merge"].map(preStartKindOfCallSite))
      .toEqual(["LIST", "LIST", null, null, null, null, null]);
  });

  it("the bounds the transport hands the policy: two attempts each, the token rooms of the plan, the deadlines of START_STEP_TIMING", () => {
    // What reaches the call on the preview is pinned in the transport's own test below (the policy raises these).
    const bound = (tokenCeiling: number, deadlineMs: number) => ({ maxAttempts: 2, tokenCeiling, deadlineMs });
    expect(START_STEP_CALL_BOUNDS).toEqual({
      ANGLES: bound(8_192, START_STEP_TIMING.plannerDeadlineMs), LIST: bound(8_192, START_STEP_TIMING.listsHardCapMs),
      MERGE: bound(16_384, START_STEP_TIMING.mergeDeadlineMs), MERGE_LATE: bound(8_192, START_STEP_TIMING.lateMergeDeadlineMs),
      COMBINE: bound(4_096, START_STEP_TIMING.combineDeadlineMs), FIT: bound(4_096, START_STEP_TIMING.fitDeadlineMs)
    });
  });
});

describe("the per-person charge (0155)", () => {
  it("charges one call from the vendor's counts, named by kind, provider and model, with a team member's grant", async () => {
    const { book, entries } = charges();
    const seam = book.seamFor({ ownerRef: OWNER, funding: GRANT, kind: "LIST", target: GLM_TARGET });
    await seam.assertCallAllowed(PROJECTION);
    await seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage: { prompt_tokens: 1_000, completion_tokens: 500 }, projection: PROJECTION });
    expect(entries).toEqual([{ spendId: "00000001-0000-4000-8000-000000000000", ownerRef: OWNER, kind: "LIST",
      providerRef: "pre-start:list:deepinfra:zai-org/GLM-5.3-Flash", chargedOn: "2026-11-03", chargeMicros: 2_000, inputTokens: 1_000, outputTokens: 500,
      grant: { grantId: GRANT.grantId, grantEventId: GRANT.grantEventId } }]);
  });

  it("the person's own plan names no grant; a merge-late is its own kind", async () => {
    const { book, entries } = charges();
    const seam = book.seamFor({ ownerRef: OWNER, funding: { kind: "SUBSCRIPTION", planId: "PLUS", entitlementEventId: GRANT.grantEventId },
      kind: "MERGE_LATE", target: GLM_TARGET });
    await seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage: { prompt_tokens: 10, completion_tokens: 0 }, projection: PROJECTION });
    expect(entries).toMatchObject([{ providerRef: "pre-start:merge-late:deepinfra:zai-org/GLM-5.3-Flash", grant: null, chargeMicros: 10 }]);
  });

  it.each([
    ["no usage at all", undefined],
    ["an empty usage block", {}],
    ["unreadable counts (the gate settles the projection)", { prompt_tokens: "many", completion_tokens: 3 }]
  ])("a call with %s charges the person nothing", async (_name, usage) => {
    const { book, entries } = charges();
    const seam = book.seamFor({ ownerRef: OWNER, funding: null, kind: "FIT", target: GLM_TARGET });
    await seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage, projection: PROJECTION });
    expect(entries).toEqual([]);
  });

  it("a refused record (42501) latches at once: one code line, nothing thrown, every later call refused before it is sent", async () => {
    const { book, reports } = charges(async () => { throw Object.assign(new Error("permission denied"), { code: "42501" }); });
    const seam = book.seamFor({ ownerRef: OWNER, funding: null, kind: "MERGE", target: GLM_TARGET });
    expect(book.recordDown()).toBe(false);
    await expect(seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage: { prompt_tokens: 1, completion_tokens: 1 }, projection: PROJECTION }))
      .resolves.toBeUndefined();
    expect(book.recordDown()).toBe(true);
    expect(reports).toEqual([{ event: "api.start_step.charge_unrecorded", code: "RECORD_DOWN" }]);
    expect(await codeOf(() => seam.assertCallAllowed(PROJECTION))).toBe("START_STEP_RECORD_DOWN");
    expect(await codeOf(() => book.seamFor({ ownerRef: OWNER, funding: null, kind: "LIST", target: GLM_TARGET }).assertCallAllowed(PROJECTION)))
      .toBe("START_STEP_RECORD_DOWN");
  });

  it.each(["42883", "23514"])("a refused record (%s) latches at once too, as 42501 does", async (code) => {
    // Wave 2 review fix (Task 27): each latching code by its own test (23514, a check the row breaks, was untested).
    const { book, reports } = charges(async () => { throw Object.assign(new Error("refused"), { code }); });
    const seam = book.seamFor({ ownerRef: OWNER, funding: null, kind: "LIST", target: GLM_TARGET });
    await seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage: { prompt_tokens: 1, completion_tokens: 1 }, projection: PROJECTION });
    expect(book.recordDown()).toBe(true);
    expect(reports).toEqual([{ event: "api.start_step.charge_unrecorded", code: "RECORD_DOWN" }]);
    expect(await codeOf(() => seam.assertCallAllowed(PROJECTION))).toBe("START_STEP_RECORD_DOWN");
  });

  it("never throws even when its one report line cannot be written; the breaker still counts, each failure reported once", async () => {
    // Wave 2 review fix (Task 27): a report that throws escaped recordCall, breaking the seam's promise never to throw.
    const reported: string[] = [];
    let pricesThrow = false;
    const book = createStartCharges({
      record: async () => { throw Object.assign(new Error("check violation"), { code: "23514" }); },
      priceOf: () => { if (pricesThrow) throw new Error("price table unreadable"); return PRICE; }, clock: () => NOW,
      report: (line) => { reported.push(line.code); throw new Error("logger down"); }
    });
    const seam = book.seamFor({ ownerRef: OWNER, funding: null, kind: "LIST", target: GLM_TARGET });
    const usage = { prompt_tokens: 1, completion_tokens: 1 };
    await expect(seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage, projection: PROJECTION })).resolves.toBeUndefined();
    expect(reported).toEqual(["RECORD_DOWN"]);
    expect(book.recordDown()).toBe(true);
    // A charge that cannot be computed (here the price read throws) is the other unrecorded path: it too never throws.
    pricesThrow = true;
    await expect(seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage, projection: PROJECTION })).resolves.toBeUndefined();
    expect(reported).toEqual(["RECORD_DOWN", "RECORD_DOWN"]);
  });

  it("any other failure latches only on the third in a row; a success resets the count", async () => {
    let fail = true;
    const { book } = charges(async () => { if (fail) throw Object.assign(new Error("timeout"), { code: "57014" }); });
    const seam = book.seamFor({ ownerRef: OWNER, funding: null, kind: "LIST", target: GLM_TARGET });
    const call = () => seam.recordCall({ providerRef: GLM_TARGET.providerRef, usage: { prompt_tokens: 1, completion_tokens: 1 }, projection: PROJECTION });
    await call(); await call();
    fail = false; await call();
    fail = true; await call(); await call();
    expect(book.recordDown()).toBe(false);
    await call();
    expect(book.recordDown()).toBe(true);
  });

  it("a target with no price is refused before it is sent", async () => {
    const { book } = charges(undefined, false);
    expect(await codeOf(() => book.seamFor({ ownerRef: OWNER, funding: null, kind: "COMBINE", target: GLM_TARGET }).assertCallAllowed(PROJECTION)))
      .toBe("START_STEP_UNPRICED");
  });
});

describe("the preview transport", () => {
  const spec: MapStepSpec<Readonly<{ paths: readonly string[] }>> = Object.freeze({
    step: "START_LIST", guidedWords: null, replyWordsCeiling: null,
    contract: Object.freeze({ contractId: "fixture.start-list.v1", instruction: "Write the synthetic list.", answerForm: "Return one JSON object." }),
    material: Object.freeze([Object.freeze({ name: "question_line", content: "Synthetic question about bus fares; no personal data." })]),
    classify: (content: string) => {
      try { JSON.parse(content); return { parseStatus: "PARSED", parseError: null } as const; }
      catch { return { parseStatus: "PARSE_FAILED", parseError: "not JSON" } as const; }
    },
    read: (content: string) => JSON.parse(content) as { paths: string[] }
  });
  const request = (callSiteKey: string, aiRef: string, maker: string): MapCallRequest<Readonly<{ paths: readonly string[] }>> =>
    Object.freeze({ step: "START_LIST", callSiteKey, seat: Object.freeze({ aiRef, maker }), order: 1, shown: "BLIND", spec });

  function world(hook?: (end: StartCallEnd) => void) {
    const executions: PreviewBudgetExecution[] = [];
    const port = { execute: async (input: PreviewBudgetExecution) => {
      executions.push(input);
      const model = (JSON.parse(input.requestBody) as { model: string }).model;
      // The gate's proven-unbilled refusal of a vendor 429 (createPreviewBudgetRpcPorts raises it): nothing was billed.
      if (model === QWEN) throw new PreviewVendorRefusedUnbilled();
      return { status: 200, body: JSON.stringify({ id: "fixture", model, choices: [{ message: { content: '{"paths":["a"]}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 20 } }) };
    } };
    let clock = 0;
    const transport = createStartTransport({ fetch: createPreviewGuardedFetch({ deepinfra: port, anthropic: port }), targets: TARGETS,
      now: () => (clock += 250) });
    const busy = createStartBusyBook();
    const money = charges();
    const ends: StartCallEnd[] = [];
    const seamKinds: string[] = [];
    const caller = transport.callerFor({ config: CONFIG, busy, onCallEnd: (end) => { ends.push(end); hook?.(end); },
      seamFor: (kind, target) => { seamKinds.push(`${kind}:${target.model}`); return money.book.seamFor({ ownerRef: OWNER, funding: null, kind, target }); } });
    return { executions, transport, busy, money, ends, seamKinds, caller };
  }

  it("finds a declared target by its model, none for a model not declared", () => {
    const { transport } = world();
    expect(transport.targetOf(GLM)).toBe(GLM_TARGET);
    expect(transport.targetOf("no-such/model")).toBeNull();
  });

  it("books a vendor's 429 as busy at once (no resend), and sends the second seat without its #2", async () => {
    const { executions, busy, money, ends, seamKinds, caller } = world();
    const refused = await caller.call(request("START:list:3", QWEN, "Alibaba"));
    expect(refused.kind).toBe("BUSY");
    expect(executions).toHaveLength(1);
    expect([...busy.busy()]).toEqual([QWEN]);
    const answered = await caller.call(request("START:list:6", `${GLM}#2`, "Z.AI"));
    expect(answered).toEqual({ kind: "OK", value: { paths: ["a"] } });
    expect(executions).toHaveLength(2);
    expect((JSON.parse(executions[1]!.requestBody) as { model: string }).model).toBe(GLM);
    expect(executions[1]!.requestBody).not.toContain("#2");
    expect(seamKinds).toEqual([`LIST:${QWEN}`, `LIST:${GLM}`]);
    expect(money.entries.map((entry) => [entry.providerRef, entry.inputTokens, entry.outputTokens]))
      .toEqual([["pre-start:list:deepinfra:zai-org/GLM-5.3-Flash", 100, 20]]);
    expect(ends).toEqual([{ callSiteKey: "START:list:3", model: QWEN, outcome: "BUSY", ms: 250 },
      { callSiteKey: "START:list:6", model: GLM, outcome: "OK", ms: 250 }]);
  });

  it("hands each kind's own bound to the preview call policy, which raises it on the preview (at least 8,192 tokens, the gate's deadline)", async () => {
    // Wave 2 review fix (Task 27): the pin above alone passed whatever bound the transport sent. A merge keeps its own 16,384
    // (above the preview's floor, so only the transport's bound can give it); a fit's 4,096 reaches the vendor as 8,192; and
    // every call's deadline is the gate's PREVIEW_GLM_DEADLINE_MS, never START_STEP_TIMING's (owner 3 Nov: a call already
    // started runs to its end and counts; the step's own clocks stop the waiting).
    const deadlines = vi.spyOn(AbortSignal, "timeout");
    try {
      const { executions, caller } = world();
      expect(await caller.call(request("START:merge", GLM, "Z.AI"))).toMatchObject({ kind: "OK" });
      expect(await caller.call(request("START:fit", GLM, "Z.AI"))).toMatchObject({ kind: "OK" });
      expect(START_STEP_CALL_BOUNDS.MERGE.tokenCeiling).toBeGreaterThan(PREVIEW_GLM_GENERATION_TOKEN_FLOOR);
      expect(START_STEP_CALL_BOUNDS.FIT.tokenCeiling).toBeLessThan(PREVIEW_GLM_GENERATION_TOKEN_FLOOR);
      expect(executions.map((one) => (JSON.parse(one.requestBody) as { max_tokens: unknown }).max_tokens))
        .toEqual([START_STEP_CALL_BOUNDS.MERGE.tokenCeiling, PREVIEW_GLM_GENERATION_TOKEN_FLOOR]);
      expect(deadlines.mock.calls.map(([ms]) => ms)).toEqual([PREVIEW_GLM_DEADLINE_MS, PREVIEW_GLM_DEADLINE_MS]);
    } finally {
      deadlines.mockRestore();
    }
  });

  it("a busy refusal on a company's second seat books the model itself, so the next seats skip it", async () => {
    // Wave 2 review fix (Task 27): the seat's "#2" is stripped before the book is marked; "model#2" would never be skipped.
    const { busy, ends, caller } = world();
    expect(await caller.call(request("START:list:6", `${QWEN}#2`, "Alibaba"))).toMatchObject({ kind: "BUSY" });
    expect([...busy.busy()]).toEqual([QWEN]);
    expect(ends).toEqual([{ callSiteKey: "START:list:6", model: QWEN, outcome: "BUSY", ms: 250 }]);
    const declared = (model: string) => TARGETS.find((target) => target.model === model) ?? null;
    expect(startSeatsFor({ roster: [GLM, QWEN], targetOf: declared, count: 4, busy: new Set() }).seats.map((seat) => seat.aiRef))
      .toEqual([GLM, QWEN, `${GLM}#2`, `${QWEN}#2`]);
    expect(startSeatsFor({ roster: [GLM, QWEN], targetOf: declared, count: 4, busy: busy.busy() }).seats.map((seat) => seat.aiRef))
      .toEqual([GLM, `${GLM}#2`]);
  });

  it("a target with no price stops the call before it is sent (STOPPED, START_STEP_UNPRICED)", async () => {
    const executions: PreviewBudgetExecution[] = [];
    const transport = createStartTransport({ fetch: createPreviewGuardedFetch({ execute: async (input) => { executions.push(input); throw new Error("unreached"); } }),
      targets: TARGETS });
    const unpriced = charges(undefined, false);
    const ends: StartCallEnd[] = [];
    const caller = transport.callerFor({ config: CONFIG, busy: createStartBusyBook(), onCallEnd: (end) => { ends.push(end); },
      seamFor: (kind, target) => unpriced.book.seamFor({ ownerRef: OWNER, funding: null, kind, target }) });
    expect(await caller.call(request("START:fit", GLM, "Z.AI"))).toEqual({ kind: "STOPPED", code: "START_STEP_UNPRICED" });
    expect(executions).toEqual([]);
    expect(ends.map((end) => end.outcome)).toEqual(["STOPPED"]);
  });

  it("tells each call's end exactly once; a hook that throws changes neither the outcome nor the telling", async () => {
    // Wave 2 review fix (Task 27): a throwing hook on an answered call landed in the call's catch, which told it again, FAILED.
    const { executions, ends, caller } = world(() => { throw new Error("logger down"); });
    await expect(caller.call(request("START:list:1", GLM, "Z.AI"))).resolves.toEqual({ kind: "OK", value: { paths: ["a"] } });
    await expect(caller.call(request("START:list:2", QWEN, "Alibaba"))).resolves.toMatchObject({ kind: "BUSY" });
    await expect(caller.call(request("MAP:list:1", GLM, "Z.AI"))).resolves.toEqual({ kind: "FAILED", code: "START_STEP_CALL_SITE_UNKNOWN" });
    expect(executions).toHaveLength(2);
    expect(ends.map((end) => [end.callSiteKey, end.outcome])).toEqual([["START:list:1", "OK"], ["START:list:2", "BUSY"], ["MAP:list:1", "FAILED"]]);
  });

  it("a seat with no declared target, or a key that is not the start step's, fails with nothing sent", async () => {
    const { executions, ends, caller } = world();
    expect(await caller.call(request("START:list:1", "no-such/model", "Nobody"))).toEqual({ kind: "FAILED", code: "START_STEP_SEAT_UNKNOWN" });
    expect(await caller.call(request("MAP:list:1", GLM, "Z.AI"))).toEqual({ kind: "FAILED", code: "START_STEP_CALL_SITE_UNKNOWN" });
    expect(executions).toEqual([]);
    expect(ends.map((end) => end.outcome)).toEqual(["FAILED", "FAILED"]);
  });

  it("a record that is down stops the call before it is sent", async () => {
    const executions: PreviewBudgetExecution[] = [];
    const transport = createStartTransport({ fetch: createPreviewGuardedFetch({ execute: async (input) => { executions.push(input); throw new Error("unreached"); } }),
      targets: TARGETS });
    const down = charges(async () => { throw Object.assign(new Error("no function"), { code: "42883" }); });
    await down.book.seamFor({ ownerRef: OWNER, funding: null, kind: "LIST", target: GLM_TARGET })
      .recordCall({ providerRef: GLM_TARGET.providerRef, usage: { prompt_tokens: 1, completion_tokens: 1 }, projection: PROJECTION });
    const caller = transport.callerFor({ config: CONFIG, busy: createStartBusyBook(), onCallEnd: () => undefined,
      seamFor: (kind, target) => down.book.seamFor({ ownerRef: OWNER, funding: null, kind, target }) });
    expect(await caller.call(request("START:list:1", GLM, "Z.AI"))).toEqual({ kind: "STOPPED", code: "START_STEP_RECORD_DOWN" });
    expect(executions).toEqual([]);
  });
});

// Parallel AI calls (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md §2): a debate's independent calls
// run at the same time, and what it SAVES is the same whatever order the answers come back in, and the same as the
// serial run's (the register's `callConcurrencyPolicy` row absent: one call at a time per debate).
//
// The REAL WalkingSkeletonRunner, composed as apps/runner/src/main.ts composes it on the preview
// (tests/support/preview-debate-harness.ts: the busy coordinator, the attempt counter and the call scheduler with the
// register row), drives four-maker debates over the two preview gates' unix-socket doubles
// (tests/support/preview-gate-stubs.ts), on a migrated embedded PostgreSQL. The doubles hold each call for a while
// before they answer, so calls overlap. Integration suites are skipped by the CI gate: run this file by hand.
//
// Task 10 (pipeline, part 1 of 3): the opening positions, their panels and their reviews run together and are saved
// in today's order. Task 11 (part 2 of 3): the support/attack replies and the cross-exchanges start as soon as the
// positions they answer exist, and a reply beyond a round boundary waits for that boundary's freeze/stop decision.
// Task 12 (part 3 of 3): stops and failures while calls are in flight (spec §2.3).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createPool, migrate, type Pool } from "@debateai/db";
import { JudgementRepository } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { PREVIEW_PROVIDER_REF_MODELS, readPromptFrame } from "@debateai/providers";
import {
  DEEPSEEK,
  FIVE_MAKER_REFS,
  HAIKU,
  INCIDENT_PIN,
  MIMO,
  OWNER_CALL_CONCURRENCY,
  PANEL_REFS,
  QWEN,
  RUN_RESILIENCE,
  previewDebateHarness,
  type AdmittedRun
} from "../support/preview-debate-harness.js";
import { expansionPhaseStop } from "@debateai/runner";
import type { GateArrival, GateOverride, GateRequest } from "../support/preview-gate-stubs.js";
import { framedField, readFramedMaterial, wirePacket } from "../support/framed-packet.js";
import { requestedReviewEdges, reviewArtifact, withRequestDerivedBearings } from "../support/reviewBearings.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
/** A connection to the cluster's maintenance database, for making and dropping the per-run copies below. */
let admin: Pool;
const stubClosers: (() => Promise<void>)[] = [];
const harness = previewDebateHarness({ pool: () => database.pool, stubClosers });

/** The migrated database every per-run copy is made from (nothing but the migrations in it). */
const MIGRATED_COPY = "parallel_calls_migrated";
const databaseUrl = (name: string): string => database.connectionString.replace(/\/[^/?]+(?=\?|$)/u, `/${name}`);

/** Waits until no session is connected to `name` (a template must have none), within a deadline. */
async function untilUnused(name: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    const { rows } = await admin.query<{ sessions: string }>(
      `SELECT count(*)::text AS sessions FROM pg_stat_activity WHERE datname=$1`, [name]);
    if (rows[0]?.sessions === "0") return;
    if (Date.now() > deadline) throw new Error(`test: database ${name} still has ${rows[0]?.sessions ?? "?"} sessions`);
    await new Promise((resolve) => { setTimeout(resolve, 250); });
  }
}

/** A copy of database `from` (PostgreSQL's CREATE DATABASE … TEMPLATE: the same rows, ids included). */
async function copyDatabase(from: string, to: string): Promise<void> {
  await untilUnused(from, 60_000);
  await admin.query(`CREATE DATABASE "${to}" TEMPLATE "${from}"`);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  admin = createPool(databaseUrl("postgres"), { max: 1 });
  // The shared pool's idle sessions close after node-postgres's ten idle seconds; then the migrated database is copied.
  await copyDatabase("debateai_s00", MIGRATED_COPY);
}, 600_000);
afterEach(async () => {
  await Promise.all(stubClosers.splice(0).map((close) => close()));
});
afterAll(async () => {
  await admin?.end();
  await database?.stop();
});

/** Every non-probe call is held `ms(request)` before its gate answers it; probes are answered at once. */
const heldCalls = (ms: (request: GateRequest) => number) => (request: GateRequest): number => request.kind === "PROBE" ? 0 : ms(request);

/** The arrivals of one kind, in arrival order. */
const arrivalsOf = (arrivals: readonly GateArrival[], kind: GateArrival["kind"]) => arrivals.filter((arrival) => arrival.kind === kind);

describe("parallel calls: the opening positions (Task 10)", () => {
  it("roots and their panels run together: roots 1-3's author calls and root 0's panel all start before any of them is answered", async () => {
    const debate = await harness.admittedRun("roots-together", { panelRefs: PANEL_REFS, depth: 1 });
    const gates = await harness.startGates({}, undefined, undefined, heldCalls(() => 300));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    const result = await harness.completedRun(composed, debate, gates);

    // Root 0's author call goes first and alone (today's seat swap); it is the first author call to arrive.
    const authors = arrivalsOf(gates.arrivals, "JUDGE");
    const panels = arrivalsOf(gates.arrivals, "PANEL");
    const root0 = authors[0]!;
    expect(gates.arrivals.filter((arrival) => arrival.kind !== "PROBE" && arrival.at < root0.answeredAt!)).toEqual([root0]);
    // Then, together: the author calls of roots 1-3 and the three members of root 0's panel.
    const together = [...authors.slice(1, 4), ...panels.slice(0, 3)];
    expect(together).toHaveLength(6);
    const lastStart = Math.max(...together.map((arrival) => arrival.at));
    const firstAnswer = Math.min(...together.map((arrival) => arrival.answeredAt!));
    expect(lastStart, `arrivals ${JSON.stringify(together)}`).toBeLessThan(firstAnswer);

    const { answer, workItem } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    // All four positions authored, one each, by the four members.
    const calls = await harness.modelCalls(debate.runId);
    const rootKeys = ["JUDGE", "JUDGE:root:secondary", "JUDGE:root:2", "JUDGE:root:3"];
    const rootWriters = rootKeys.map((key) => calls.filter((call) => call.call_site_key === key && call.outcome === "OK").map((call) => call.actor_ref));
    expect(rootWriters.map((writers) => writers.length)).toEqual([1, 1, 1, 1]);
    expect(new Set(rootWriters.flat())).toEqual(new Set(PANEL_REFS));
    expect(composed.holdWaits).toEqual([]);
  }, 300_000);

  /**
   * Spec §2.2 (O7), the test of record: the same scripted answers delivered in random finish orders save the same
   * debate, and the same debate as the serial run. ONE admitted run is copied into a fresh database per variant (the
   * reviewer turn is hashed off the run id, so the runs must share it); each copy is argued with the row SET to the
   * owner's values and a different seeded random hold per call (5-200 ms), and once with the row ABSENT.
   */
  it("same answers, any finish order: three random finish orders and the serial run save the same debate", async () => {
    const variants = [
      { name: "parallel-1", seed: 11, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-2", seed: 22, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-3", seed: 33, row: OWNER_CALL_CONCURRENCY },
      { name: "serial", seed: 44, row: undefined }
    ] as const;
    const runs = await savedAcrossVariants("same_answers", { panelRefs: PANEL_REFS, depth: 1 }, variants, {});

    for (const [index, run] of runs.entries()) {
      const variant = variants[index]!;
      // The row decides how many calls overlap: several with it, never two without it.
      if (variant.row === undefined) {
        expect(run.concurrencyMost, variant.name).toBe(1);
        continue;
      }
      expect(run.concurrencyMost, variant.name).toBeGreaterThan(1);
      // Task 11: EVERY phase runs together — a reply and a cross-exchange were each in flight with another call.
      for (const leg of ["support", "attack", "cross-root"] as const) {
        expect(run.legsInFlightWithAnother(leg), `${variant.name} ${leg}`).toBeGreaterThan(0);
      }
    }
    const [first, ...rest] = runs.map((run) => run.saved);
    // A real debate was saved: four roots, their depth-1 replies and the cross-exchanges, each reviewed.
    expect(first!.nodes.length).toBeGreaterThanOrEqual(4 + 8 + 12);
    expect(first!.reviews.length).toBe(first!.nodes.length);
    expect(first!.reduced.length).toBe(first!.nodes.length);
    expect(first!.edges.length).toBeGreaterThan(0);
    for (const [index, other] of rest.entries()) {
      expect(other, variants[index + 1]!.name).toEqual(first);
    }
  }, 900_000);

  /**
   * Fix (d), kept (Task 10 item 5): a review whose reviewer sits out during it is offered again, to another reviewer,
   * once the first choice pass of the batch is over. Haiku answers its own root and panel seats, then every review it is
   * asked for is a gate-proven unbilled refusal: its one review call (the POST and its one resend) makes it sit out, and
   * the root it was reviewing is reviewed by another maker.
   */
  it("a reviewer that sits out during a root's review: the root is offered to another reviewer", async () => {
    const debate = await harness.admittedRun("reviewer-sits-out", { panelRefs: PANEL_REFS, depth: 1 });
    const gates = await harness.startGates({}, { unbilled: [] },
      (request) => request.model === HAIKU && request.kind === "REVIEW" ? { unbilled: true } : null, heldCalls(() => 50));
    const composed = await harness.previewRunner(gates, "resend", { resilience: RUN_RESILIENCE, callConcurrency: OWNER_CALL_CONCURRENCY });
    const result = await harness.completedRun(composed, debate, gates);

    // Haiku was asked for one review: the POST and its one resend, both refused; then it sat out.
    expect(gates.requests.filter((request) => request.model === HAIKU && request.kind === "REVIEW")
      .map((request) => request.answer)).toEqual(["UNBILLED", "UNBILLED"]);
    const calls = await harness.modelCalls(debate.runId);
    const haikuRef = PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === HAIKU)!;
    const refusedReview = calls.find((call) => call.actor_ref === haikuRef && call.call_site_key.startsWith("JUDGE:review:"));
    expect(refusedReview).toBeDefined();
    // The same node's review was then answered by another member, and saved.
    const reviewKey = refusedReview!.call_site_key;
    const answered = calls.filter((call) => call.call_site_key.startsWith(`${reviewKey.replace(/:seat:.*$/u, "")}`) && call.outcome === "OK");
    expect(answered).toHaveLength(1);
    expect(answered[0]!.actor_ref).not.toBe(haikuRef);
    const nodeId = reviewKey.slice("JUDGE:review:".length).replace(/:seat:.*$/u, "");
    const review = await database.pool.query<{ reviewer: string }>(
      `SELECT reviewer.maker AS reviewer FROM ledger.node_review AS review
         JOIN ledger.raw_artifact AS reviewer ON reviewer.raw_artifact_id = review.review_raw_artifact_ref
        WHERE review.node_id = $1`, [nodeId]);
    expect(review.rows).toHaveLength(1);
    const { answer, workItem } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    // Every root is reviewed: none is left without its review because its reviewer sat out.
    const roots = await database.pool.query<{ reviewed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ledger.node_review AS review WHERE review.node_id = node.node_id) AS reviewed
         FROM core.node AS node WHERE node.run_id = $1 AND node.parent_node_id IS NULL`, [debate.runId]);
    expect(roots.rows.map((row) => row.reviewed)).toEqual([true, true, true, true]);
  }, 300_000);

  /**
   * Spec §2.3 / Task 10 item 4: a root halted by a billed failure still ends the debate (MAKER_POSITION_UNAVAILABLE),
   * as today — but now with the other roots' calls in flight. Qwen's root (root 2 in the incident pin's order) is
   * answered with a billed vendor 500 every time: the judge bound's attempts, the cooldown hold, the final retry, then
   * the halt. The lane is stopped, every other chain is awaited — every call the gates received was answered before
   * the run ended — and only then is the error thrown, with no unhandled rejection (vitest fails on one).
   */
  it("a root halted by a billed failure ends the debate once the other chains have settled", async () => {
    const debate = await harness.admittedRun("root-halts", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN, depth: 1 });
    const holds = legRecordingHolds(() => 50);
    const gates = await harness.startGates({}, { unbilled: [] },
      (request) => request.model === QWEN && request.kind === "JUDGE" ? { vendorStatus: 500 } : null, holds.delayMs);
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    await expect(composed.runner.executeWorkItem(debate.workItemId)).rejects.toMatchObject({ code: "MAKER_POSITION_UNAVAILABLE" });
    const endedAt = performance.now();
    // Everything that reached a gate was answered before the run ended: nothing was left in flight.
    expect(gates.arrivals.filter((arrival) => arrival.answeredAt === null || arrival.answeredAt > endedAt)).toEqual([]);
    // Qwen's root: every attempt failed (the judge bound's, then the final retry after the one hold).
    const calls = await harness.modelCalls(debate.runId);
    const qwenRoot = calls.filter((call) => call.call_site_key === "JUDGE:root:2").map((call) => call.outcome);
    expect(qwenRoot.length).toBeGreaterThan(1);
    expect(qwenRoot.every((outcome) => outcome === "FAILED")).toBe(true);
    // Qwen's root took one cooldown hold. Since Task 11 the replies to root 0 (its text exists from the start) are asked
    // together with the roots: a reply Qwen writes fails the same way and may take the run's other hold (the cap is
    // two per run, DEVELOPMENT_RUN_DEATH_POLICY) — never a third.
    const qwenReplySites = new Set(calls.filter((call) => /^JUDGE:(defender|critic|cross-root)/u.test(call.call_site_key)
      && call.actor_ref === "preview:qwen-3-8-flash" && call.outcome === "FAILED").map((call) => call.call_site_key));
    expect(composed.holdWaits.length).toBeGreaterThanOrEqual(1);
    expect(composed.holdWaits.length).toBeLessThanOrEqual(Math.min(2, 1 + qwenReplySites.size));
    // The other roots were asked together with it: their author calls arrived before Qwen's first one was answered.
    const rootAuthors = gates.arrivals.filter((_arrival, index) => holds.legs[index] === "root");
    const qwenFirst = rootAuthors.find((arrival) => arrival.model === QWEN)!;
    expect(rootAuthors.slice(1).filter((arrival) => arrival.model !== QWEN && arrival.at < qwenFirst.answeredAt!)).toHaveLength(3);
  }, 300_000);
});

describe("parallel calls: replies and cross-exchanges (Task 11)", () => {
  /**
   * Spec §2.1: a support/attack reply's author call starts once its PARENT's author call has returned — it needs only
   * the parent's text — never after the other positions' panels. Every panel call is held 800 ms, every other call
   * 50 ms: root 0's first support reply is asked while every panel (root 3's among them) is still unanswered.
   */
  it("replies start before their siblings' panels end: root 0's support reply is asked before root 3's panel is answered", async () => {
    const debate = await harness.admittedRun("replies-early", { panelRefs: PANEL_REFS, depth: 1 });
    const holds = legRecordingHolds((request) => request.kind === "PANEL" ? 800 : 50);
    const gates = await harness.startGates({}, undefined, undefined, holds.delayMs);
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    const result = await harness.completedRun(composed, debate, gates);

    const firstSupport = gates.arrivals.find((_arrival, index) => holds.legs[index] === "support")!;
    expect(firstSupport).toBeDefined();
    // Root 3 is the last root asked; its panel's calls are the panel calls that arrived after its author call returned.
    const rootAuthors = gates.arrivals.filter((_arrival, index) => holds.legs[index] === "root");
    expect(rootAuthors).toHaveLength(4);
    const lastRoot = rootAuthors.reduce((latest, arrival) => arrival.answeredAt! > latest.answeredAt! ? arrival : latest);
    const lastRootPanel = arrivalsOf(gates.arrivals, "PANEL").filter((arrival) => arrival.at >= lastRoot.answeredAt!).slice(0, 3);
    expect(lastRootPanel).toHaveLength(3);
    expect(firstSupport.at, `support at ${String(firstSupport.at)}; panels ${JSON.stringify(lastRootPanel)}`)
      .toBeLessThan(Math.min(...lastRootPanel.map((arrival) => arrival.answeredAt!)));
    // Stronger still: it was asked before ANY panel call was answered.
    expect(firstSupport.at).toBeLessThan(Math.min(...arrivalsOf(gates.arrivals, "PANEL").map((arrival) => arrival.answeredAt!)));

    const { answer, workItem } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(composed.holdWaits).toEqual([]);
  }, 300_000);

  /**
   * Spec §2.1 (depth >= 2): a reply AFTER a global round boundary waits for that boundary's freeze/stop decision, which
   * waits for every reply up to the boundary and their reviews — so the decision sees, and prevents, exactly what it
   * does in the serial run. Two makers, depth 2, ε = 0.01: every review measures a support edge at 0 and an attack edge
   * at 0.9, so a support branch moves no root (leverage 0 < ε) and freezes at the round-1 boundary; root 1's support
   * branch is the one the decision can still prevent (root 0's round-2 replies come before the boundary in the plan).
   */
  it("depth 2, two makers: a branch frozen at the round-1 boundary is never expanded, and the debate saved equals the serial run's", async () => {
    const twoMakers = [
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === DEEPSEEK)!,
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === HAIKU)!
    ];
    const variants = [
      { name: "parallel-a", seed: 55, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-b", seed: 66, row: OWNER_CALL_CONCURRENCY },
      { name: "serial", seed: 77, row: undefined }
    ] as const;
    const runs = await savedAcrossVariants("frozen_branch", { panelRefs: twoMakers, depth: 2 }, variants,
      { stoppingPolicy: { delta: 0, epsilon: 0.01 }, bearings: { support: 0, attack: 0.9 } });

    // Root 1's round-1 branches are plan nodes 8 (its support reply) and 9 (its attack reply); their round-2 replies'
    // call sites name them as parent (p8, p9).
    const roundTwoBeneath = (keys: readonly string[], parent: number): readonly string[] => keys.filter((key) =>
      new RegExp(`^JUDGE:(defender|critic):root1:r2:p${String(parent)}(:|$)`, "u").test(key));
    for (const [index, run] of runs.entries()) {
      const name = variants[index]!.name;
      expect(roundTwoBeneath(run.callSiteKeys, 8), `${name}: the frozen support branch is never expanded`).toEqual([]);
      expect(new Set(roundTwoBeneath(run.callSiteKeys, 9)).size, `${name}: the attack branch is expanded`).toBe(2);
      // Root 0's round-2 replies came before the boundary in the plan: all four were asked.
      expect(new Set(run.callSiteKeys.filter((key) => /^JUDGE:(defender|critic):root0:r2:/u.test(key))).size, name).toBe(4);
      if (variants[index]!.row !== undefined) {
        expect(run.legsInFlightWithAnother("support") + run.legsInFlightWithAnother("attack"), name).toBeGreaterThan(0);
      }
    }
    const [first, ...rest] = runs.map((run) => run.saved);
    // 2 roots, root 0's 2 + 4 replies, root 1's 2 + 2 (its support branch frozen), 2 cross-exchanges.
    expect(first!.nodes).toHaveLength(2 + 6 + 4 + 2);
    expect(first!.reviews).toHaveLength(first!.nodes.length);
    for (const [index, other] of rest.entries()) {
      expect(other, variants[index + 1]!.name).toEqual(first);
    }
  }, 900_000);

  /**
   * Ruling R26 (Task 11 fix round 1): a round boundary's freeze/stop decision is pure code and one PROPAGATION row — no
   * model call — so wherever today's loop reaches it, the chains reach it too. Today's loop reaches it when the boundary's
   * OWN review pass raised a spend stop (`reviewPendingAuthoredNodes` returns, then `closeGlobalRound` runs). Depth 2,
   * two makers, the freezing bearings of the case above; the review of root 1's attack reply (node 9, the last node of
   * the round-1 boundary's review batch) is refused by the gate as the run's money ceiling. The serial run records
   * round 1's decision (its STOPPING:round:1 row, the frozen support branch's BRANCH-FROZEN record) and stops arguing;
   * the parallel runs record the same decision. (What else they save differs, as stop paths may: replies and exchanges
   * already sent are kept.)
   */
  it("a spend stop raised by a boundary's own reviews: the round decision is still recorded, as the serial run records it", async () => {
    const twoMakers = [
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === DEEPSEEK)!,
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === HAIKU)!
    ];
    const variants = [
      { name: "parallel-a", seed: 121, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-b", seed: 131, row: OWNER_CALL_CONCURRENCY },
      { name: "serial", seed: 141, row: undefined }
    ] as const;
    const runs = await savedAcrossVariants("boundary_stop", { panelRefs: twoMakers, depth: 2 }, variants, {
      stoppingPolicy: { delta: 0, epsilon: 0.01 },
      answers: (question) => rootOneAttackReviewRefused(question, { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" })
    });
    const decisions = runs.map((run) => ({ stopping: run.stoppingRows, frozen: branchFrozenFacts(run.saved) }));
    const serial = decisions[2]!;
    // The serial run: round 1 decided (and nothing after it: the stop ended the arguing), one branch frozen.
    expect(serial.stopping).toEqual([{ call_site_key: "STOPPING:round:1", outcome: "OK" }]);
    expect(serial.frozen.length).toBeGreaterThan(0);
    for (const [index, decision] of decisions.entries()) {
      expect(decision, variants[index]!.name).toEqual(serial);
      // No reply beyond the boundary was asked: the stop ended the arguing.
      expect(runs[index]!.callSiteKeys.filter((key) => /^JUDGE:(defender|critic):root1:r2:/u.test(key)), variants[index]!.name).toEqual([]);
    }
  }, 900_000);

  /**
   * Ruling R26b (Task 11 fix round 2): the same for "too few members left". Today's boundary block reviews, then decides
   * the round, whatever the review pass latched; a too-few stop latched BEFORE the boundary (the loop's own check before
   * the boundary's last reply) skips the decision. Depth 2, two makers, the freezing bearings, run resilience on: the
   * review of root 1's attack reply (node 9, the last of the round-1 boundary's review batch) is the vendor's
   * gate-proven unbilled refusal, twice (the POST and its one resend), so its reviewer sits out — and with one maker
   * left, too few are left to argue. The serial run still records round 1's decision; so must the parallel runs.
   */
  it("too few members left, raised by a boundary's own reviews: the round decision is still recorded, as the serial run records it", async () => {
    const twoMakers = [
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === DEEPSEEK)!,
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === HAIKU)!
    ];
    const variants = [
      { name: "parallel-a", seed: 151, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-b", seed: 161, row: OWNER_CALL_CONCURRENCY },
      { name: "serial", seed: 171, row: undefined }
    ] as const;
    const runs = await savedAcrossVariants("boundary_too_few", { panelRefs: twoMakers, depth: 2 }, variants, {
      stoppingPolicy: { delta: 0, epsilon: 0.01 }, resilience: RUN_RESILIENCE,
      answers: (question) => rootOneAttackReviewRefused(question, { unbilled: true })
    });
    const decisions = runs.map((run) => ({ stopping: run.stoppingRows, frozen: branchFrozenFacts(run.saved) }));
    const serial = decisions[2]!;
    expect(serial.stopping).toEqual([{ call_site_key: "STOPPING:round:1", outcome: "OK" }]);
    expect(serial.frozen.length).toBeGreaterThan(0);
    for (const [index, decision] of decisions.entries()) {
      expect(decision, variants[index]!.name).toEqual(serial);
      // No reply beyond the boundary was asked: too few members were left to argue.
      expect(runs[index]!.callSiteKeys.filter((key) => /^JUDGE:(defender|critic):root1:r2:/u.test(key)), variants[index]!.name).toEqual([]);
    }
  }, 900_000);

  /**
   * Review fix round 3: a HALTED reply, with calls together, saves what the serial run saves. Depth 2, two makers: every
   * author call of root 0's support reply (node 2) is a billed vendor 500 — the judge bound's attempts, the one cooldown
   * hold, the final retry, then the halt. Its hold and halt records name its parent (root 0, saved later than the reply's
   * call started: `LaterParentNode`), its EXPANSION_HALTED record is in the run's halted list, and nothing beneath it is
   * asked; the whole saved debate and every hold/halt record equal the serial run's.
   */
  it("a halted reply: its halt names its parent, its branch is never asked, and the debate saved equals the serial run's", async () => {
    const twoMakers = [
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === DEEPSEEK)!,
      PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === HAIKU)!
    ];
    const variants = [
      { name: "parallel-a", seed: 181, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-b", seed: 191, row: OWNER_CALL_CONCURRENCY },
      { name: "serial", seed: 201, row: undefined }
    ] as const;
    const runs = await savedAcrossVariants("halted_reply", { panelRefs: twoMakers, depth: 2 }, variants,
      { answers: (question) => rootZeroSupportReplyFails(question) });
    const serial = runs[2]!;
    // The serial run: the reply halted after one hold — its hold, its retry and its halt name root 0 (node#0).
    expect(serial.holdRecords).toEqual([
      expect.objectContaining({ state: "COOLDOWN_HOLD", callSiteKey: "JUDGE:defender:root0:r1:p0", parentNodeId: "node#0" }),
      expect.objectContaining({ state: "COOLDOWN_RETRY", callSiteKey: "JUDGE:defender:root0:r1:p0", parentNodeId: "node#0" }),
      expect.objectContaining({ state: "EXPANSION_HALTED", callSiteKey: "JUDGE:defender:root0:r1:p0", parentNodeId: "node#0" })
    ]);
    // 2 roots, root 0's attack reply and its 2 replies (its support branch halted), root 1's 2 + 4, 2 cross-exchanges.
    expect(serial.saved.nodes).toHaveLength(2 + 3 + 6 + 2);
    for (const [index, run] of runs.entries()) {
      const name = variants[index]!.name;
      // Final review T11: the parallel variants really overlapped calls (the serial one never does).
      if (variants[index]!.row !== undefined) expect(run.concurrencyMost, name).toBeGreaterThan(1);
      // Nothing beneath the halted reply was asked.
      expect(run.callSiteKeys.filter((key) => /^JUDGE:(defender|critic):root0:r2:p2(:|$)/u.test(key)), name).toEqual([]);
      expect(run.holdRecords, name).toEqual(serial.holdRecords);
      expect(run.saved, name).toEqual(serial.saved);
    }
  }, 900_000);

  /**
   * Review fix round 3: a root whose member sits out, with calls together, saves what the serial run saves. Four makers,
   * depth 1, run resilience on: the member that writes the LAST root is busy from the start — every call to it is the
   * vendor's gate-proven unbilled refusal, answered at once (the others are held 20-100 ms, so it sits out before any
   * reply to another root could be planned onto it). Its root is dropped, so are its replies and its cross-exchanges;
   * the debate saved equals the serial run's.
   */
  it("a root whose member sits out: its replies and exchanges are never asked, and the debate saved equals the serial run's", async () => {
    const variants = [
      { name: "parallel-a", seed: 211, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-b", seed: 221, row: OWNER_CALL_CONCURRENCY },
      { name: "serial", seed: 231, row: undefined }
    ] as const;
    const runs = await savedAcrossVariants("root_sits_out", { panelRefs: PANEL_REFS, depth: 1 }, variants, {
      resilience: RUN_RESILIENCE,
      answers: (question, debate) => modelBusyFromTheStart(question, debate.rotated.eligibleModelIds.at(-1)!),
      holdMs: (request, random, debate) => request.model === debate.rotated.eligibleModelIds.at(-1) ? 0 : 20 + Math.floor(random() * 81)
    });
    const serial = runs[2]!;
    // Three roots; the replies of roots 0 and 1 (root 2's replies were planned onto the member that sat out: halted
    // without a call); the cross-exchanges among the three roots (3 x 2 ordered pairs).
    expect(serial.saved.nodes).toHaveLength(3 + 4 + 6);
    for (const [index, run] of runs.entries()) {
      const name = variants[index]!.name;
      // Final review T11: the parallel variants really overlapped calls (the serial one never does).
      if (variants[index]!.row !== undefined) expect(run.concurrencyMost, name).toBeGreaterThan(1);
      // The dropped root (root 3) has no replies and no exchanges: none was ever asked.
      expect(run.callSiteKeys.filter((key) => /^JUDGE:(defender|critic):root3:|^JUDGE:cross-root:(3->|\d->3)/u.test(key)), name).toEqual([]);
      expect(run.saved, name).toEqual(serial.saved);
    }
  }, 900_000);

  /**
   * Spec §2.2 (Task 10 review carry): the reviewer turn is read off the ledger once PER REVIEW BATCH, as today's batch
   * reads it, never carried over from an earlier batch's choices. Root 0's review is answered with a billed vendor 500
   * every time, so it is hidden: the turn its reviewer was chosen with never reaches the ledger. The next batch (the
   * replies) reviews nodes of root 0's maker again; today it reads the ledger, which holds no review of that maker, and
   * so must the chains — a turn advanced in the roots' batch and kept would pick another reviewer.
   */
  it("a review hidden in one batch: the next batch reads the reviewer turn off the ledger again, as the serial run does", async () => {
    const variants = [
      { name: "parallel-a", seed: 88, row: OWNER_CALL_CONCURRENCY },
      { name: "parallel-b", seed: 99, row: OWNER_CALL_CONCURRENCY },
      { name: "serial", seed: 111, row: undefined }
    ] as const;
    const runs = await savedAcrossVariants("hidden_review", { panelRefs: PANEL_REFS, depth: 1 }, variants,
      { answers: rootZeroReviewRefused });
    for (const [index, run] of runs.entries()) {
      // One node's review was hidden (every attempt refused): the others were all reviewed.
      expect(run.saved.reviews.length, variants[index]!.name).toBe(run.saved.nodes.length - 1);
    }
    const [first, ...rest] = runs.map((run) => run.saved);
    for (const [index, other] of rest.entries()) {
      expect(other, variants[index + 1]!.name).toEqual(first);
    }
  }, 900_000);
});

describe("parallel calls: stops and failures with calls in flight (Task 12)", () => {
  /** A root's author call other than root 0's (its system message carries the independent-root directive). */
  const isLaterRootAuthor = (request: GateRequest): boolean =>
    request.kind === "JUDGE" && JSON.stringify(request.body).includes("Independently author your own position");
  /** Root 0's author call: the first position. */
  const isRootZeroAuthor = (request: GateRequest): boolean =>
    request.kind === "JUDGE" && JSON.stringify(request.body).includes("Author your position on the question under debate.");
  /** The AUTHOR and REVIEW calls that reached a gate after `at` (spec §2.3: none may START once the arguing stopped). */
  const authorOrReviewAfter = (arrivals: readonly GateArrival[], at: number) =>
    arrivals.filter((arrival) => (arrival.kind === "JUDGE" || arrival.kind === "REVIEW") && arrival.at > at);
  /** The calls (probes aside) a gate had received and not yet answered at `at`. */
  const inFlightAt = (arrivals: readonly GateArrival[], at: number) =>
    arrivals.filter((arrival) => arrival.kind !== "PROBE" && arrival.at < at && (arrival.answeredAt === null || arrival.answeredAt > at));
  const nodeCount = async (runId: string): Promise<number> => Number((await database.pool.query<{ nodes: string }>(
    `SELECT count(*)::text AS nodes FROM core.node WHERE run_id=$1`, [runId])).rows[0]!.nodes);
  const reviewCount = async (runId: string): Promise<number> => Number((await database.pool.query<{ reviews: string }>(
    `SELECT count(*)::text AS reviews FROM ledger.node_review WHERE run_id=$1`, [runId])).rows[0]!.reviews);
  /** Waits (15 s deadline) until every call a gate received is answered, then 500 ms more for what follows them. */
  const untilAbandonedCallsLand = async (arrivals: readonly GateArrival[]): Promise<void> => {
    const deadline = Date.now() + 15_000;
    while (arrivals.some((arrival) => arrival.answeredAt === null) && Date.now() < deadline) {
      await new Promise((resolve) => { setTimeout(resolve, 100); });
    }
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  };

  /**
   * The first author call of a root other than root 0 (not Haiku's) is refused by the gate as the run's money ceiling
   * (a spend stop), answered after 100 ms; every other call is held `holdMs`. Returns the gates, and where the stopping
   * call is in their arrival log.
   */
  async function moneyStopOnOneRoot(holdMs: number) {
    let stopping: GateRequest | null = null;
    let stoppingIndex = -1;
    let arrivals: readonly GateArrival[] = [];
    // Every model answers (GLM too: `{ unbilled: [] }`), so the incident's five makers can argue.
    const gates = await harness.startGates({}, { unbilled: [] },
      (request) => request === stopping ? { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" } : null,
      (request) => {
        if (request.kind === "PROBE") return 0;
        if (stopping === null && isLaterRootAuthor(request) && request.model !== HAIKU) {
          stopping = request;
          stoppingIndex = arrivals.length - 1;
          return 100;
        }
        return holdMs;
      });
    arrivals = gates.arrivals;
    return { gates, stoppingAt: () => gates.arrivals[stoppingIndex]! };
  }

  /**
   * Spec §2.3 (O6), case (a): a spend stop raised by ONE call while six others are in flight (the incident's five makers
   * and seating, so as many calls as that are always under way: root 0's four panel calls, the other roots, replies to
   * root 0). No author or review call
   * starts after it anywhere in the debate; every call already sent finishes, and its node is saved (each root and reply
   * whose author call answered, with its panel); the stopped root has no node; the answer is served with the stop; and
   * every chain had settled when the run ended (every call the gates received was answered before it ended).
   */
  it("a money stop raised by one root's author call while six other calls are in flight: nothing new starts, what was sent is kept, the answer is served", async () => {
    const debate = await harness.admittedRun("money-stop-in-flight", { panelRefs: FIVE_MAKER_REFS, pin: INCIDENT_PIN, depth: 1 });
    const { gates, stoppingAt } = await moneyStopOnOneRoot(500);
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    const result = await harness.completedRun(composed, debate, gates);
    const endedAt = performance.now();

    const stop = stoppingAt();
    expect(stop.kind).toBe("JUDGE");
    const stopAt = stop.answeredAt!;
    expect(inFlightAt(gates.arrivals, stopAt).filter((arrival) => arrival !== stop).length).toBeGreaterThanOrEqual(6);
    expect(authorOrReviewAfter(gates.arrivals, stopAt)).toEqual([]);
    expect(gates.arrivals.filter((arrival) => arrival.answeredAt === null || arrival.answeredAt > endedAt)).toEqual([]);
    // What was sent is kept: one node per author call that answered (root 0's, the roots and replies in flight), and
    // none for the stopped root. The stop came before any node was saved, so no review was ever asked.
    const answeredAuthors = gates.requests.filter((request) => request.kind === "JUDGE" && request.answer === "OK").length;
    expect(answeredAuthors).toBeGreaterThan(1);
    expect(await nodeCount(debate.runId)).toBe(answeredAuthors);
    expect(await reviewCount(debate.runId)).toBe(0);
    const { answer, workItem } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect((await harness.bodyFactsOf(result.answerId))?.body_stop).not.toBeNull();
    expect(composed.lanes[0]!.stats().running).toBe(0);
  }, 300_000);

  /**
   * Spec §2.3 (O6), the dispatch-time refusal (Task 10 review carry, ruled): one call per model at a time, so calls WAIT
   * in the lane. Roots 1-3's author calls start together once root 0's panel answered (50 ms). The first of them to
   * arrive answers in 50 ms, so its node's panel asks the other makers while their own root calls still hold their
   * slots: those panel calls WAIT. The second is refused by the gate as the run's money ceiling at 300 ms (a spend
   * stop); the third is held 1 s. When the stopped maker's slot frees, and later the slow one's, every AUTHOR and
   * REVIEW call waiting there is refused by the lane as it would start (CALL_LANE_HELD_BACK: never sent, never a
   * failure), while the waiting PANEL call of the node authored before the stop still starts. The answer is served.
   */
  it("a queued author or review call never starts after the stop; a queued panel call of an already-authored node does", async () => {
    const debate = await harness.admittedRun("dispatch-held-back", { panelRefs: PANEL_REFS, depth: 1 });
    const scripted = scriptedAnswers(debate.question);
    /** Each authored statement, with when its author call was answered. */
    const authoredAt = new Map<string, number>();
    const laterRoots: GateRequest[] = [];
    let stoppingIndex = -1;
    /** Each panel call's body, by its place in the arrival log. */
    const panelBodies = new Map<number, string>();
    let arrivals: readonly GateArrival[] = [];
    const gates = await harness.startGates({}, undefined, (request, chat) => {
      if (request === laterRoots[1]) return { gateRefuses: "PREVIEW_TEST_AUTHORITY_STOPPED" };
      const answer = scripted(request, chat);
      if (request.kind === "JUDGE" && answer !== null && "content" in answer) {
        authoredAt.set((JSON.parse(answer.content) as { statement: string }).statement, performance.now());
      }
      return answer;
    }, (request) => {
      if (request.kind === "PROBE") return 0;
      if (request.kind === "PANEL") panelBodies.set(arrivals.length - 1, JSON.stringify(request.body));
      if (!isLaterRootAuthor(request)) return 50;
      laterRoots.push(request);
      if (laterRoots.length === 2) stoppingIndex = arrivals.length - 1;
      return [50, 300][laterRoots.length - 1] ?? 1_000;
    });
    arrivals = gates.arrivals;
    const onePerModel = Object.freeze({ ...OWNER_CALL_CONCURRENCY, perModelPerDebate: 1 });
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: onePerModel });
    const result = await harness.completedRun(composed, debate, gates);

    expect(laterRoots.length).toBeGreaterThanOrEqual(3);
    const stopAt = gates.arrivals[stoppingIndex]!.answeredAt!;
    // Ruling R33: compared in the RUNNER's order, not by the gates' clocks (a call the runner started before it knew of
    // the stop may still reach its gate after the gate answered the stop). The stop is the first spend-stop failure the
    // lane saw; no AUTHOR or REVIEW call was started after it, while PANEL calls were.
    const events = composed.laneEvents;
    const stopEvent = events.findIndex((event) => event.kind === "FAILED" && expansionPhaseStop(event.error) !== null);
    expect(stopEvent).toBeGreaterThan(0);
    const startedAfterStop = events.slice(stopEvent + 1).filter((event) => event.kind === "STARTED");
    expect(startedAfterStop.filter((event) => event.priority === "AUTHOR" || event.priority === "REVIEW")).toEqual([]);
    expect(startedAfterStop.filter((event) => event.priority === "PANEL").length).toBeGreaterThan(0);
    // Author or review calls were waiting when the stop came: the lane held them back.
    expect(composed.lanes[0]!.stats().heldBack).toBeGreaterThan(0);
    // A panel call of a node whose author call answered BEFORE the stop reached its gate only AFTER the stop: it waited
    // for its model's slot across the stop, and still started.
    const panelsOfEarlierNodes = [...panelBodies].filter(([index, body]) => gates.arrivals[index]!.at > stopAt
      && [...authoredAt].some(([statement, at]) => at < stopAt && body.includes(statement)));
    expect(panelsOfEarlierNodes.length).toBeGreaterThan(0);
    const { answer, workItem } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(composed.lanes[0]!.stats().running).toBe(0);
  }, 300_000);

  /**
   * Spec §2.3 (O6), case (b): too few members left, with calls in flight. Three makers, run resilience on. Root 0's
   * writer (Z) is slow: its calls are held 700 ms. Once both other roots answered, their two makers turn busy: every call
   * to them arriving after that is the vendor's unbilled refusal (the POST and its one resend), so both sit out and one
   * maker is left — too few to argue. Z's calls already sent finish and are kept; no author or review call starts after
   * the second maker sat out; the answer is served.
   */
  it("too few members left (two makers turn busy) with calls in flight: nothing new starts, what was sent is kept, the answer is served", async () => {
    const threeMakers = [DEEPSEEK, MIMO, QWEN].map((model) => PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === model)!);
    const debate = await harness.admittedRun("too-few-in-flight", { panelRefs: threeMakers, depth: 1 });
    let rootZeroModel: string | null = null;
    let rootsAnswered = 0;
    /** Calls to the two other makers that arrived once both their roots had answered: refused, busy. */
    const busy = new Set<GateRequest>();
    let lastBusyAt = 0;
    const gates = await harness.startGates({}, undefined, (request) => {
      if (busy.has(request)) {
        lastBusyAt = performance.now();
        return { unbilled: true };
      }
      if (isLaterRootAuthor(request)) rootsAnswered += 1;
      return null;
    }, (request) => {
      if (request.kind === "PROBE") return 0;
      if (rootZeroModel === null && isRootZeroAuthor(request)) rootZeroModel = request.model;
      if (rootsAnswered >= 2 && request.model !== rootZeroModel) busy.add(request);
      return request.model === rootZeroModel ? 700 : 30;
    });
    const composed = await harness.previewRunner(gates, "resend", { resilience: RUN_RESILIENCE, callConcurrency: OWNER_CALL_CONCURRENCY });
    const result = await harness.completedRun(composed, debate, gates);
    const endedAt = performance.now();

    expect(busy.size).toBeGreaterThan(0);
    // Z's calls were in flight when the second maker sat out; no author or review call started after it.
    expect(inFlightAt(gates.arrivals, lastBusyAt).filter((arrival) => arrival.model === rootZeroModel).length).toBeGreaterThan(0);
    expect(authorOrReviewAfter(gates.arrivals, lastBusyAt)).toEqual([]);
    expect(gates.arrivals.filter((arrival) => arrival.answeredAt === null || arrival.answeredAt > endedAt)).toEqual([]);
    // What was sent is kept: every author call that answered has its node (its panel ran, the busy member failing).
    const answeredAuthors = gates.requests.filter((request) => request.kind === "JUDGE" && request.answer === "OK").length;
    expect(await nodeCount(debate.runId)).toBe(answeredAuthors);
    const { answer, workItem } = await harness.servedAnswer(debate, result.answerId);
    expect(["COMPOSED", "RECOMPOSED_ONCE"]).toContain(answer!.serve_state);
    expect(workItem).toEqual({ state: "DONE", terminal_reason: null });
    expect(composed.lanes[0]!.stats().running).toBe(0);
  }, 300_000);

  /**
   * Spec §2.3, case (c): the keep-alive stop (here the task's time limit: Hatchet gave up) while calls are in flight.
   * Every call is held 3 s, except root 0's and the first other root's author calls. Once five calls are in flight the
   * task is aborted; the short root's answer then leads its chain to its next call, which the keep-alive refuses
   * (RUNNER_TIME_LIMIT_REACHED). The work item ends with that code at once — within a second — with the held calls
   * still in flight: they are abandoned, never awaited. They land later; nothing rejects unhandled (vitest fails on
   * one), and the lane is left with no call running.
   */
  it("a keep-alive stop with calls in flight: the work item ends at once with today's code, the calls in flight are abandoned cleanly", async () => {
    const debate = await harness.admittedRun("keep-alive-in-flight", { panelRefs: PANEL_REFS, depth: 1 });
    const task = new AbortController();
    let abortedAt: number | null = null;
    let shortRoot: GateRequest | null = null;
    let arrivals: readonly GateArrival[] = [];
    const gates = await harness.startGates({}, undefined, undefined, (request) => {
      if (request.kind === "PROBE") return 0;
      if (isRootZeroAuthor(request)) return 10;
      const inFlight = arrivals.filter((arrival) => arrival.kind !== "PROBE" && arrival.answeredAt === null).length;
      if (abortedAt === null && inFlight >= 5) {
        task.abort();
        abortedAt = performance.now();
      }
      if (shortRoot === null && isLaterRootAuthor(request)) {
        shortRoot = request;
        return 200;
      }
      return 3_000;
    });
    arrivals = gates.arrivals;
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    await expect(composed.runner.executeWorkItem(debate.workItemId, { executionLimitMs: 3_600_000, signal: task.signal }))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    const endedAt = performance.now();

    expect(abortedAt).not.toBeNull();
    expect(endedAt - abortedAt!).toBeLessThan(1_000);
    // The held calls were still in flight when the work item ended: abandoned, not awaited.
    expect(gates.arrivals.filter((arrival) => arrival.kind !== "PROBE" && (arrival.answeredAt === null || arrival.answeredAt > endedAt)).length)
      .toBeGreaterThanOrEqual(4);
    // They land later; then the lane has nothing running, and nothing rejected unhandled meanwhile. Their results are
    // discarded: no node and no review appears once the work item has ended (fix round 1, reviewer minor 5).
    const savedAtEnd = { nodes: await nodeCount(debate.runId), reviews: await reviewCount(debate.runId) };
    await untilAbandonedCallsLand(gates.arrivals);
    expect(gates.arrivals.filter((arrival) => arrival.answeredAt === null)).toEqual([]);
    expect({ nodes: await nodeCount(debate.runId), reviews: await reviewCount(debate.runId) }).toEqual(savedAtEnd);
    expect(composed.lanes[0]!.stats().running).toBe(0);
  }, 300_000);

  /**
   * Spec §2.3, the keep-alive stop seen only by PANEL calls (Task 12 fix round 1, ruling R30). Two makers, depth 1.
   * Root 0's panel call, root 1's author call and root 0's two replies are all in flight when the task is aborted
   * (root 0's panel held 1 s, root 1's author call 3 s, the replies 500 ms). The replies land first: their panels' calls
   * are the only calls asked next, and the keep-alive refuses them before they are sent — a panel takes such a refusal
   * as one failed member. That refusal must still end the debate: the work item ends with today's code before root 0's
   * panel lands, and root 0 — whose panel was in flight when the stop came — is never saved, nor anything else.
   */
  it("a keep-alive stop seen only by panel calls: the debate ends, and a node whose panel was in flight is never saved", async () => {
    const twoMakers = [DEEPSEEK, QWEN].map((model) => PANEL_REFS.find((ref) => PREVIEW_PROVIDER_REF_MODELS[ref] === model)!);
    const debate = await harness.admittedRun("keep-alive-panel", { panelRefs: twoMakers, depth: 1 });
    const task = new AbortController();
    let abortedAt: number | null = null;
    let rootZeroPanel = -1;
    let arrivals: readonly GateArrival[] = [];
    const gates = await harness.startGates({}, undefined, undefined, (request) => {
      if (request.kind === "PROBE") return 0;
      if (isRootZeroAuthor(request)) return 10;
      const index = arrivals.length - 1;
      const inFlight = arrivals.filter((arrival) => arrival.kind !== "PROBE" && arrival.answeredAt === null).length;
      if (abortedAt === null && inFlight >= 4) {
        task.abort();
        abortedAt = performance.now();
      }
      if (request.kind === "PANEL" && rootZeroPanel < 0) {
        rootZeroPanel = index;
        return 1_000;
      }
      if (isLaterRootAuthor(request)) return 3_000;
      return 500;
    });
    arrivals = gates.arrivals;
    // Four calls of one model may run at once in this debate, so all four are in flight together.
    const composed = await harness.previewRunner(gates, "resend", {
      callConcurrency: Object.freeze({ ...OWNER_CALL_CONCURRENCY, perModelPerDebate: 4 })
    });
    await expect(composed.runner.executeWorkItem(debate.workItemId, { executionLimitMs: 3_600_000, signal: task.signal }))
      .rejects.toMatchObject({ code: "RUNNER_TIME_LIMIT_REACHED" });
    const endedAt = performance.now();

    expect(abortedAt).not.toBeNull();
    expect(rootZeroPanel).toBeGreaterThanOrEqual(0);
    // Root 0's panel was in flight when the stop came, and still was when the work item ended.
    expect(gates.arrivals[rootZeroPanel]!.at).toBeLessThan(abortedAt!);
    expect(gates.arrivals[rootZeroPanel]!.answeredAt === null || gates.arrivals[rootZeroPanel]!.answeredAt! > endedAt).toBe(true);
    await untilAbandonedCallsLand(gates.arrivals);
    expect(gates.arrivals.filter((arrival) => arrival.answeredAt === null)).toEqual([]);
    // Nothing was saved: not root 0 (its panel landed after the stop), not the replies (their panels were refused).
    expect({ nodes: await nodeCount(debate.runId), reviews: await reviewCount(debate.runId) }).toEqual({ nodes: 0, reviews: 0 });
    expect(composed.lanes[0]!.stats().running).toBe(0);
  }, 300_000);

  /**
   * Spec §2.3, case (d): a recorder write that throws. The second node's reduced judgement cannot be written: the run
   * fails with that code — once every other chain has settled — and never hangs on the positions after it.
   */
  it("a recorder write that throws: the run fails with its code and does not hang", async () => {
    const debate = await harness.admittedRun("recorder-throws", { panelRefs: PANEL_REFS, depth: 1 });
    const gates = await harness.startGates({}, undefined, undefined, heldCalls(() => 100));
    const composed = await harness.previewRunner(gates, "resend", { callConcurrency: OWNER_CALL_CONCURRENCY });
    const recordReduced = JudgementRepository.prototype.recordReduced;
    let writes = 0;
    const failing = vi.spyOn(JudgementRepository.prototype, "recordReduced").mockImplementation(function (this: JudgementRepository, ...args) {
      writes += 1;
      if (writes === 2) return Promise.reject(new TypedDomainError("TEST_REDUCED_WRITE_FAILED", "the second node's reduced judgement"));
      return recordReduced.apply(this, args);
    });
    try {
      await expect(composed.runner.executeWorkItem(debate.workItemId)).rejects.toMatchObject({ code: "TEST_REDUCED_WRITE_FAILED" });
    } finally {
      failing.mockRestore();
    }
    const endedAt = performance.now();
    expect(writes).toBeGreaterThanOrEqual(2);
    // Every call the gates received was answered before the run ended: the other chains were awaited.
    expect(gates.arrivals.filter((arrival) => arrival.answeredAt === null || arrival.answeredAt > endedAt)).toEqual([]);
    expect(composed.lanes[0]!.stats().running).toBe(0);
  }, 300_000);
});

/* ------------------------------------------------------------------ one admitted run, argued in several copies */

/** Which authoring leg a JUDGE request is, by the code's own directive in its system message; null for any other call. */
type JudgeLegKind = "root" | "support" | "attack" | "cross-root";
function judgeLegOf(request: GateRequest): JudgeLegKind | null {
  if (request.kind !== "JUDGE") return null;
  const text = JSON.stringify(request.body);
  if (text.includes("genuine supporting case")) return "support";
  if (text.includes("strongest genuine counter-position")) return "attack";
  if (text.includes("direct cross-root response")) return "cross-root";
  return "root";
}

/**
 * Holds every non-probe call `ms(request)`, and notes beside each arrival (same index: the doubles ask for the hold
 * right after they log the arrival) which authoring leg it is.
 */
function legRecordingHolds(ms: (request: GateRequest) => number) {
  const legs: (JudgeLegKind | null)[] = [];
  return {
    legs,
    delayMs: (request: GateRequest): number => {
      legs.push(judgeLegOf(request));
      return request.kind === "PROBE" ? 0 : ms(request);
    }
  };
}

/**
 * ONE admitted run copied (`CREATE DATABASE … TEMPLATE`) into a fresh database per variant — the reviewer turn is
 * hashed off the run id, so the copies must share it — each argued with the scripted answers, its own seeded random
 * holds (5-200 ms) and its own `callConcurrencyPolicy` row (absent: today's serial engine). Returns, per variant, what
 * it saved, the call sites it asked, how many calls overlapped and how many authoring calls of a leg kind were in
 * flight together with another call.
 */
async function savedAcrossVariants(
  label: string,
  admission: Readonly<{ panelRefs: readonly string[]; depth: number }>,
  variants: readonly Readonly<{ name: string; seed: number; row: typeof OWNER_CALL_CONCURRENCY | undefined }>[],
  options: Readonly<{
    stoppingPolicy?: Readonly<{ delta: number; epsilon: number }>;
    /** The run-resilience setting (members sit out); absent, nobody ever does. */
    resilience?: typeof RUN_RESILIENCE;
    bearings?: Readonly<{ support: number; attack: number }>;
    /** The gates' answers (default: `scriptedAnswers` with `bearings`). */
    answers?: (question: string, debate: AdmittedRun) => (request: GateRequest, chat: string) => GateOverride | null;
    /** Each non-probe call's hold, from the variant's seeded `random` (default: 5-200 ms). */
    holdMs?: (request: GateRequest, random: () => number, debate: AdmittedRun) => number;
  }>
) {
  const seedName = `parallel_calls_${label}_seed`;
  await copyDatabase(MIGRATED_COPY, seedName);
  const seedPool = createPool(databaseUrl(seedName));
  let debate: AdmittedRun;
  try {
    debate = await previewDebateHarness({ pool: () => seedPool, stubClosers }).admittedRun(label, admission);
  } finally {
    await seedPool.end();
  }
  const runs: {
    saved: SavedDebate; callSiteKeys: readonly string[]; concurrencyMost: number;
    /** The round decisions' PROPAGATION rows (STOPPING:round:k), in ledger order. */
    stoppingRows: readonly { call_site_key: string; outcome: string }[];
    /** The run's hold and halt records, the parent named by save order (`node#k`), the clock left out. */
    holdRecords: readonly unknown[];
    legsInFlightWithAnother: (leg: JudgeLegKind) => number;
  }[] = [];
  for (const variant of variants) {
    const copy = `parallel_calls_${label}_${variant.name.replace("-", "_")}`;
    await copyDatabase(seedName, copy);
    const pool = createPool(databaseUrl(copy));
    try {
      const run = previewDebateHarness({ pool: () => pool, stubClosers });
      const random = seededRandom(variant.seed);
      const holds = legRecordingHolds((request) => options.holdMs?.(request, random, debate) ?? 5 + Math.floor(random() * 196));
      const answers = options.answers?.(debate.question, debate) ?? scriptedAnswers(debate.question, options.bearings);
      const gates = await run.startGates({}, undefined, answers, holds.delayMs);
      const composed = await run.previewRunner(gates, "resend", {
        ...(variant.row === undefined ? {} : { callConcurrency: variant.row }),
        ...(options.stoppingPolicy === undefined ? {} : { stoppingPolicy: options.stoppingPolicy }),
        ...(options.resilience === undefined ? {} : { resilience: options.resilience })
      });
      const result = await run.completedRun(composed, debate, gates);
      const arrivals = [...gates.arrivals];
      const inFlightWithAnother = (index: number): boolean => arrivals.some((other, otherIndex) => otherIndex !== index
        && other.kind !== "PROBE" && other.at < arrivals[index]!.answeredAt! && arrivals[index]!.at < other.answeredAt!);
      runs.push({
        saved: await savedDebate(pool, debate.runId, result.answerId),
        callSiteKeys: (await run.modelCalls(debate.runId)).map((call) => call.call_site_key),
        holdRecords: await namedHoldRecords(pool, debate.runId, composed.holdRecords),
        stoppingRows: (await pool.query<{ call_site_key: string; outcome: string }>(
          `SELECT call_site_key, outcome FROM ledger.ledger_entry WHERE run_id=$1 AND call_site_key LIKE 'STOPPING:%' ORDER BY sequence`,
          [debate.runId])).rows,
        concurrencyMost: gates.concurrency.most,
        legsInFlightWithAnother: (leg) => arrivals.filter((_arrival, index) => holds.legs[index] === leg && inFlightWithAnother(index)).length
      });
    } finally {
      await pool.end();
    }
    await untilUnused(copy, 60_000);
    await admin.query(`DROP DATABASE "${copy}"`);
  }
  await untilUnused(seedName, 60_000);
  await admin.query(`DROP DATABASE "${seedName}"`);
  return runs;
}

/* ------------------------------------------------------------------ scripted answers, keyed by what was asked */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const digestOf = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
/** The call's own fence and canary, as the provider door reads them; null for a packet with no frame. */
function framedTokensOf(chat: string): Readonly<{ fence: string; canary: string }> | null {
  try {
    const frame = readPromptFrame(wirePacket(chat));
    return { fence: frame.fence, canary: frame.canary };
  } catch {
    return null;
  }
}
/** A number in [0, 1] with two decimals, from 8 hex digits of a digest. */
const share = (hex: string): number => Math.round((Number.parseInt(hex.slice(0, 8), 16) / 0xffffffff) * 100) / 100;

/**
 * Answers that depend only on WHAT a call asked, never on when it arrived: the request's model, kind and text, with
 * the run's question, every random id (node, edge) and each prompt's random fence and canary taken out. A debate argued twice from the same run therefore
 * gets the same answer to the same call, whatever order the calls come in.
 */
function scriptedAnswers(question: string, bearings?: Readonly<{ support: number; attack: number }>) {
  return (request: GateRequest, chat: string): GateOverride | null => {
    // Every framed prompt carries its own random fence and canary (the prompt-injection boundary): not what was asked.
    // They are read through the frame's own reader (never a hand-rolled pattern) and masked in every message.
    const frame = framedTokensOf(chat);
    const unframed = frame === null ? chat
      : chat.split(frame.fence).join("#|<fence>|#").split(frame.canary).join("<canary>");
    const asked = unframed.split(question).join("<question>").replace(UUID, "<id>");
    const digest = digestOf(`${request.model}\n${request.kind}\n${asked}`);
    const level = share(digest);
    switch (request.kind) {
      case "JUDGE": return { content: JSON.stringify({
        statement: `Point ${digest.slice(0, 12)}.`, way_of_knowing: "REASONING", locator: null,
        restatement_text: `Point ${digest.slice(0, 12)}, restated.`, restatement_status: "PASS", value_laden: false, claim_type: "unknown",
        steelman: { summary: `Steelman ${digest.slice(12, 20)}.`, fidelity: level },
        critic: { summary: `Counter ${digest.slice(20, 28)}.`, counterargumentStrength: share(digest.slice(8)), basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.6, relevance: 0.6 }, context: { fit: 0.6, ambiguityFlags: [] }, fallacy: { severity: 0.2, fatalFlags: [] }
      }) };
      case "PANEL": return { content: JSON.stringify({
        steelman: { summary: `Panel ${digest.slice(0, 12)}.`, fidelity: level },
        critic: { summary: "Panel member counter.", counterargumentStrength: share(digest.slice(8)), basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.5, relevance: 0.5 }, context: { fit: 0.5, ambiguityFlags: [] }, fallacy: { severity: 0.3, fatalFlags: [] }
      }) };
      case "REVIEW": return { content: withRequestDerivedBearings(reviewArtifact(
        level < 0.5 ? "agree" : "dispute", [`Review ${digest.slice(0, 12)}.`],
        bearings ?? { support: share(digest.slice(16)), attack: share(digest.slice(24)) }
      ), chat) };
      default: return null;
    }
  };
}

/**
 * `scriptedAnswers`, except that every review of ROOT 0 (the node whose statement the first-position author call was
 * given) is a billed vendor 500: its review is hidden. Root 0's statement is learnt from that author call's answer.
 */
function rootZeroReviewRefused(question: string) {
  const scripted = scriptedAnswers(question);
  let rootZero: string | null = null;
  return (request: GateRequest, chat: string): GateOverride | null => {
    const answer = scripted(request, chat);
    if (request.kind === "JUDGE" && chat.includes("Author your position on the question under debate.")
      && answer !== null && "content" in answer) {
      rootZero = (JSON.parse(answer.content) as { statement: string }).statement;
    }
    if (request.kind === "REVIEW" && rootZero !== null
      && framedField(readFramedMaterial(wirePacket(chat)), "statement") === rootZero) return { vendorStatus: 500 };
    return answer;
  };
}

/**
 * `scriptedAnswers` with the freezing bearings (support 0, attack 0.9), except that the review of ROOT 1's attack
 * reply — a review offering exactly one edge, an attack on root 1's statement (a cross-exchange offers two) — is
 * answered `refusal` (the gate's STOPPED refusal: the run's money ceiling; or the vendor's unbilled refusal: busy).
 * Root 1's statement is learnt from its author call's answer.
 */
function rootOneAttackReviewRefused(question: string, refusal: GateOverride) {
  const scripted = scriptedAnswers(question, { support: 0, attack: 0.9 });
  let rootOne: string | null = null;
  return (request: GateRequest, chat: string): GateOverride | null => {
    const answer = scripted(request, chat);
    if (request.kind === "JUDGE" && chat.includes("Independently author your own position") && answer !== null && "content" in answer) {
      rootOne = (JSON.parse(answer.content) as { statement: string }).statement;
    }
    if (request.kind === "REVIEW" && rootOne !== null) {
      const edges = requestedReviewEdges(chat);
      if (edges.length === 1 && edges[0]!.relation === "attack" && edges[0]!.target_statement === rootOne) {
        return refusal;
      }
    }
    return answer;
  };
}

/** Every BRANCH-FROZEN fact a run saved (answer, composed text, fact bundle), ids named: the smallest object carrying one. */
function branchFrozenFacts(saved: SavedDebate): readonly string[] {
  const facts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.includes("BRANCH-FROZEN")) facts.push(value);
      return;
    }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value === null || typeof value !== "object") return;
    const fields = Object.values(value as Record<string, unknown>);
    if (fields.some((field) => typeof field === "string" && field.includes("BRANCH-FROZEN"))) {
      facts.push(JSON.stringify(value));
      return;
    }
    fields.forEach(walk);
  };
  walk([saved.answer, saved.composed, saved.factBundle]);
  return facts;
}

/**
 * `scriptedAnswers`, except that every author call of ROOT 0's support reply — the support directive with root 0's
 * statement as its position under debate — is a billed vendor 500. Root 0's statement is learnt from its author call.
 */
function rootZeroSupportReplyFails(question: string) {
  const scripted = scriptedAnswers(question);
  let rootZero: string | null = null;
  return (request: GateRequest, chat: string): GateOverride | null => {
    const answer = scripted(request, chat);
    if (request.kind === "JUDGE" && chat.includes("Author your position on the question under debate.")
      && answer !== null && "content" in answer) {
      rootZero = (JSON.parse(answer.content) as { statement: string }).statement;
    }
    if (request.kind === "JUDGE" && rootZero !== null && chat.includes("genuine supporting case")
      && framedField(readFramedMaterial(wirePacket(chat)), "position_under_debate") === rootZero) return { vendorStatus: 500 };
    return answer;
  };
}

/** `scriptedAnswers`, except that every call to `model` (never its claim probe) is the vendor's unbilled refusal: busy. */
function modelBusyFromTheStart(question: string, model: string) {
  const scripted = scriptedAnswers(question);
  return (request: GateRequest, chat: string): GateOverride | null =>
    request.kind !== "PROBE" && request.model === model ? { unbilled: true } : scripted(request, chat);
}

/** A run's hold and halt records, the parent node named by its save order (`node#k`) and the clock left out. */
async function namedHoldRecords(
  pool: Pool, runId: string, records: readonly Readonly<{ parentNodeId: string | null; holdUntil: string | null }>[]
): Promise<readonly unknown[]> {
  const nodes = (await pool.query<{ node_id: string }>(
    `SELECT node_id::text FROM core.node WHERE run_id=$1 ORDER BY created_at_seq`, [runId])).rows.map((row) => row.node_id);
  return records.map(({ holdUntil: _holdUntil, parentNodeId, ...record }) => ({
    ...record,
    parentNodeId: parentNodeId === null ? null : `node#${String(nodes.indexOf(parentNodeId))}`
  }));
}

/** mulberry32: a small seeded generator, so each variant's holds are random but reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ what a run saved, with its random ids named */

type SavedDebate = Readonly<{
  nodes: readonly unknown[]; edges: readonly unknown[]; reduced: readonly unknown[]; reviews: readonly unknown[];
  answer: unknown; composed: unknown; factBundle: unknown;
}>;

/** Keys that are a row's own place on the clock or a digest over random ids: not content. */
const VOLATILE_KEYS = new Set([
  "created_at_seq", "at_seq", "sealed_at_seq", "relevant_as_of", "content_hash", "replay_handle", "input_hash"
]);

/**
 * What one run saved, read back with SQL, every random id replaced by a stable name: a node by its place in the save
 * order (`node#k`, which is the plan order this proves), an edge likewise, a model's answer by the call site and
 * member that produced it. Rows a recorder writes are listed in the order they were written.
 */
async function savedDebate(pool: Pool, runId: string, answerId: string): Promise<SavedDebate> {
  const rows = async (sql: string, values: readonly unknown[]): Promise<Record<string, unknown>[]> =>
    (await pool.query<{ row: Record<string, unknown> }>(sql, [...values])).rows.map((entry) => entry.row);
  const nodes = await rows(`SELECT to_jsonb(node) AS row FROM core.node AS node WHERE run_id=$1 ORDER BY created_at_seq`, [runId]);
  const edges = await rows(`SELECT to_jsonb(edge) AS row FROM core.edge AS edge WHERE run_id=$1 ORDER BY created_at_seq`, [runId]);
  const names = new Map<string, string>();
  nodes.forEach((node, index) => names.set(String(node.node_id), `node#${String(index)}`));
  edges.forEach((edge, index) => names.set(String(edge.edge_id), `edge#${String(index)}`));
  const nameIds = (text: string): string => text.replace(UUID, (id) => names.get(id.toLowerCase()) ?? "<id>");
  // A model's answer is named by the call that produced it: its call site (node ids named) and the member that answered.
  const artifacts = await pool.query<{ raw_artifact_ref: string; call_site_key: string; actor_ref: string }>(
    `SELECT raw_artifact_ref::text, call_site_key, actor_ref FROM ledger.ledger_entry
      WHERE run_id=$1 AND raw_artifact_ref IS NOT NULL AND call_site_key IS NOT NULL`, [runId]);
  for (const artifact of artifacts.rows) {
    names.set(artifact.raw_artifact_ref, `answer(${nameIds(artifact.call_site_key)} @ ${artifact.actor_ref})`);
  }
  const named = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, field: unknown) =>
    VOLATILE_KEYS.has(key) ? undefined : typeof field === "string" ? nameIds(field) : field));
  const reduced = await rows(`SELECT to_jsonb(reduced) AS row FROM ledger.reduced_judgement AS reduced WHERE run_id=$1 ORDER BY at_seq`, [runId]);
  const reviews = await rows(`SELECT to_jsonb(review) AS row FROM ledger.node_review AS review WHERE run_id=$1 ORDER BY at_seq`, [runId]);
  const answer = await rows(`SELECT to_jsonb(answer) AS row FROM serve.answer AS answer WHERE answer_id=$1 ORDER BY answer_version`, [answerId]);
  const factBundle = await rows(`SELECT to_jsonb(bundle) AS row FROM serve.fact_bundle AS bundle WHERE run_id=$1 ORDER BY version`, [runId]);
  const composed = await rows(`SELECT to_jsonb(composed) AS row FROM serve.composed_text AS composed
      JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id = composed.fact_bundle_id WHERE bundle.run_id=$1 ORDER BY composed.attempt`, [runId]);
  return Object.freeze({
    nodes: named(nodes) as unknown[], edges: named(edges) as unknown[], reduced: named(reduced) as unknown[],
    reviews: named(reviews) as unknown[], answer: named(answer), composed: named(composed), factBundle: named(factBundle)
  });
}

# Parallel AI calls in one debate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A V3 debate runs every AI call whose inputs exist at the same time, under owner-set limits, while saving
results in today's fixed order so the same AI answers always produce the same debate and served answer.

**Architecture:** A runner-wide `CallScheduler` hands out slots (per debate, per model in a debate, per model across
the runner, per spending gate) to model calls that pass through a per-debate lane wrapped around every maker's gateway.
The debate body (`execute` in `apps/runner/src/index.ts`) launches each node's chain (author → panel → save → review)
as soon as its inputs exist; two ordered recorders (nodes, reviews) keep every database write in today's serial order.
A runner-wide busy coordinator inside the preview call policy turns "many calls to a busy model" into one probe.

**Tech Stack:** TypeScript (Node 26, ESM), vitest, zod, pg (embedded PostgreSQL for integration), Python 3 (preview
gate), Next.js UI (apps/ui).

**Spec:** `dialectical-engine/docs/superpowers/specs/2026-10-12-parallel-calls-design.md` (read it first; rulings O1–O10).

All paths below are relative to `dialectical-engine/` unless they start with `/`.

## Global Constraints

- Register row key `callConcurrencyPolicy`, kind `"CALL_CONCURRENCY_POLICY"`; start values perDebate 12,
  perModelPerDebate 3, perModelPerRunner `{ default: 50, deepinfra: 150, anthropic: 50 }`; bounds perDebate 1..64,
  perModelPerDebate 1..16, every perModelPerRunner value 1..1000.
- Absent row → perDebate 1, perModelPerDebate 1 (one call at a time per debate); perModelPerRunner default 1000.
- Sealed register values are NEVER edited; never touch `register.bootstrap.json`, `tests/support/fixtures/register-development-v4.json`, or existing migrations. The row is OPTIONAL (not a required row, not in `developmentRows`).
- Content written to the database (nodes, edges, reduced judgements, reviews, records lists, served answer) must be identical for any finish order and identical to the serial run; ledger MODEL_CALL / spend / progress rows follow the clock.
- One site key (callSiteKey) never has two calls in flight at once.
- Hosted and local behave byte for byte as today when the row is absent, except that the preview gate slot limit queues calls instead of letting the gate refuse them.
- Every NEW source file under `apps/*/src` or `packages/*/src` is added by name to `tests/support/shipped-corpus.manifest.txt` (run `tests/unit/s1-1-depth-contract.test.ts` with `SHIPPED_CORPUS_MANIFEST_UPDATE=1` once, then without). A new runner file containing `provider.call(` is added to the provider-surface list in `tests/architecture/s10-carrier-erasure-red.test.ts`.
- New typed error codes go in BOTH twin alphabets and `tests/unit/api-operational-error.test.ts` (grep an existing runner code such as `RUNNER_CLAIM_LOST` to find all three places).
- `tools/orphan-audit` refuses `export const X = <number>`: export numbers inside frozen objects.
- Editing `packages/db/src/index.ts` requires re-pinning `NATIVE_MIGRATE_MODULE_SHA256` in `tools/orphan-audit` after proving `migrate()` is byte-identical (avoid editing that file in this plan).
- Adding a test to a preview gate Python suite requires bumping its "Ran N tests" pin in `tests/unit/preview-budget-authority-json-mode.test.ts`.
- Mac memory rule: at most ONE heavy command at a time (integration suites, `pnpm run test:ci-gate`, `pnpm run typecheck`, whole-directory vitest). Gate each heavy run on `pgrep -f "vi""test[.]mjs run"` showing at most one other run. The Bash tool is zsh: quote globs, `timeout` does not exist, `grep` is a ugrep function.
- Unit test command: `pnpm exec vitest run <file>` from `dialectical-engine/`. Integration: `pnpm exec vitest run tests/integration/<file>`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push; never open PRs (the orchestrator does).
- User-facing UI text: 35 locales under `apps/ui/messages/*/`; translations are done by parallel Haiku workers per language group plus one Opus spot-check of mt, ga, et, lv, lt, ar, he, hi, ja, zh, ko and formal Romanian.

## Review Focus

1. A debate where a model turns busy while three of its calls are in flight: exactly one resend goes out, the others
   wait; if the probe is busy the model sits out in every debate that was waiting on it, none hangs. (Task 3, Task 9 test.)
2. A stop (spend stop or too few members left) while 10 calls are in flight: no call starts afterwards, every
   in-flight call settles and is saved in order, the run is served, and no lane slot leaks. (Task 12.)
3. A keep-alive stop (claim lost / time limit) with calls in flight: the run ends with today's code within one tick,
   abandoned promises never raise an unhandled rejection, and no recorder waits forever. (Task 12.)
4. Depth 2: a branch the round-1 checkpoint freezes is never authored, exactly as in the serial run. (Task 11.)
5. A recorder write that throws (database busy): later positions do not deadlock; the run fails with the write's
   code. (Task 7, Task 12.)

---

## File map

| File | New/Modify | Responsibility |
|---|---|---|
| `packages/register/src/call-concurrency-policy.ts` | new | Row schema, parse, reader, row builder, effective policy |
| `packages/register/src/index.ts` | modify | export |
| `deploy/preview-auth-dev/v1/publish-register-v2.ts` | modify | allow + publish the row on the preview |
| `apps/runner/src/hosted-register-publish.ts` | modify | optional hosted member |
| `apps/runner/src/call-scheduler.ts` | new | Runner-wide slots, per-debate lanes, queues, stats |
| `apps/runner/src/call-lane-gateway.ts` | new | Gateway wrapper: request → lane ticket; gate health observation |
| `packages/providers/src/preview-busy.ts` | new | Runner-wide busy coordinator (CLOSED/OPEN/CONFIRMED_BUSY) |
| `packages/providers/src/preview-test.ts` | modify | gate-unsent refusal class; coordinator hook in `withPreviewProviderCallPolicy` |
| `packages/providers/ops/preview_budget_authority.py` | modify | burst counting of the unsent streak |
| `packages/judgement/src/s04.ts` | modify | `runJudgePanel` asks members together, reduces in member order |
| `apps/runner/src/run-seats.ts` | modify | once-per-slot switch notice; canonical list order |
| `apps/runner/src/ordered-recorder.ts` | new | Position-ordered commit of async writes |
| `apps/runner/src/run-in-flight.ts` | new | Per-run in-flight attempts / projected micros / hold reservations |
| `apps/runner/src/index.ts` | modify | lane per run; pipeline of the body; in-flight checks; stop semantics |
| `apps/runner/src/main.ts` | modify | read row, build scheduler + coordinator, gate capacities, keep-alive pool |
| `packages/budget/src/model-spend.ts`, `packages/budget/src/index.ts` | modify | in-flight terms in money seam / attempt ceiling |
| `packages/db/src/pool-budget.ts` | modify | runner pools 32 + keep-alive 2 |
| `tools/preview-practice/*` | modify | composition mirror, `--call-concurrency`, report stats, README |
| `apps/ui/app/new/NewDebatePageClient.tsx`, `apps/ui/messages/*/newDebate.json`, `apps/ui/lib/phoneCompletionDraft.ts`, `apps/ui/app/debate/[id]/DebatePageClient.tsx` | modify | remove two controls, note text, draft compat, banner fix |
| `docs/operations/2026-10-10-database-connection-budget.md`, `deploy/preview-gate/v3/README.md`, `deploy/vps/register/README.md` | modify | budget, gate redeploy, row publish |

---

### Task 1: The `callConcurrencyPolicy` register row

**Files:**
- Create: `packages/register/src/call-concurrency-policy.ts`
- Modify: `packages/register/src/index.ts` (export), `deploy/preview-auth-dev/v1/publish-register-v2.ts` (`PREVIEW_SOURCE_ROW_KEYS_V2` + the row), `apps/runner/src/hosted-register-publish.ts` (optional member, same pattern as `answerRoleRotationPolicy`: `roleRotationRowOf` ~:755 and the boot check ~:1259), `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/call-concurrency-policy.test.ts`; extend `tests/integration/preview-register-publish-v2.test.ts` and `tests/integration/hosted-register-publish.test.ts` with one case each.

**Interfaces:**
- Produces:
```ts
export const CALL_CONCURRENCY_POLICY_ROW_KEY = "callConcurrencyPolicy" as const;
export type CallConcurrencyPolicy = Readonly<{
  perDebate: number;
  perModelPerDebate: number;
  perModelPerRunner: Readonly<{ default: number } & Record<string, number>>;
}>;
export type CallConcurrencyPolicyState =
  | Readonly<{ state: "ABSENT" }>
  | Readonly<{ state: "SET"; policy: CallConcurrencyPolicy }>;
export function callConcurrencyPolicyFromValue(value: unknown): CallConcurrencyPolicy; // throws TypeError("CALL_CONCURRENCY_POLICY_INVALID")
export function readCallConcurrencyPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<CallConcurrencyPolicyState>;
export function callConcurrencyPolicyRow(policy: CallConcurrencyPolicy, sourceRef: string): Readonly<{ rowKey: typeof CALL_CONCURRENCY_POLICY_ROW_KEY; valueJsonText: CanonicalRegisterJson; sourceRef: string }>;
/** What the runner runs with: the row, or one-at-a-time when absent. */
export function effectiveCallConcurrency(state: CallConcurrencyPolicyState): CallConcurrencyPolicy;
export const CALL_CONCURRENCY_LIMITS: Readonly<{ perDebateMax: 64; perModelPerDebateMax: 16; perModelPerRunnerMax: 1000; absentPerModelPerRunner: 1000 }>;
```

- [ ] **Step 1: Write the failing unit test** `tests/unit/call-concurrency-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CALL_CONCURRENCY_POLICY_ROW_KEY, callConcurrencyPolicyFromValue, callConcurrencyPolicyRow,
  effectiveCallConcurrency, readCallConcurrencyPolicy
} from "@debateai/register";

const valid = { kind: "CALL_CONCURRENCY_POLICY", perDebate: 12, perModelPerDebate: 3,
  perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } };

describe("callConcurrencyPolicy row", () => {
  it("parses the owner's start values", () => {
    expect(callConcurrencyPolicyFromValue(valid)).toEqual({ perDebate: 12, perModelPerDebate: 3,
      perModelPerRunner: { default: 50, deepinfra: 150, anthropic: 50 } });
  });
  it.each([
    { ...valid, perDebate: 0 }, { ...valid, perDebate: 65 }, { ...valid, perModelPerDebate: 17 },
    { ...valid, perModelPerRunner: { deepinfra: 150 } }, { ...valid, perModelPerRunner: { default: 0 } },
    { ...valid, perModelPerRunner: { default: 50, "Bad Key": 3 } }, { ...valid, extra: true },
    { ...valid, kind: "OTHER" }, { ...valid, perDebate: 2.5 }
  ])("refuses %j", (value) => {
    expect(() => callConcurrencyPolicyFromValue(value)).toThrow("CALL_CONCURRENCY_POLICY_INVALID");
  });
  it("absent means one call at a time per debate", () => {
    expect(effectiveCallConcurrency({ state: "ABSENT" })).toEqual({ perDebate: 1, perModelPerDebate: 1,
      perModelPerRunner: { default: 1000 } });
  });
  it("reads ABSENT, SET, and fails loud on a broken row", async () => {
    const query = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;
    await expect(readCallConcurrencyPolicy(query([]), 7)).resolves.toEqual({ state: "ABSENT" });
    await expect(readCallConcurrencyPolicy(query([{ value_json: valid }]), 7))
      .resolves.toMatchObject({ state: "SET", policy: { perDebate: 12 } });
    await expect(readCallConcurrencyPolicy(query([{ value_json: { kind: "X" } }]), 7))
      .rejects.toThrow("CALL_CONCURRENCY_POLICY_INVALID");
  });
  it("builds a canonical row a publisher seals", () => {
    const row = callConcurrencyPolicyRow(callConcurrencyPolicyFromValue(valid), "owner-2026-10-12");
    expect(row.rowKey).toBe(CALL_CONCURRENCY_POLICY_ROW_KEY);
    expect(JSON.parse(row.valueJsonText)).toEqual(valid);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (`pnpm exec vitest run tests/unit/call-concurrency-policy.test.ts` → cannot find export).

- [ ] **Step 3: Implement** `packages/register/src/call-concurrency-policy.ts`, copying the structure of `packages/register/src/answer-role-rotation-policy.ts`:

```ts
import type { Pool } from "pg";
import { z } from "zod";
import { canonicalRegisterJson, type CanonicalRegisterJson } from "./register-publication.js";

/**
 * Parallel calls (spec docs/superpowers/specs/2026-10-12-parallel-calls-design.md §3.1): ONE optional row in its own
 * family. Absent = one call at a time per debate (today). A row that does not parse is loud: the runner's boot refuses.
 */
export const CALL_CONCURRENCY_POLICY_ROW_KEY = "callConcurrencyPolicy" as const;
export const CALL_CONCURRENCY_LIMITS = Object.freeze({
  perDebateMax: 64, perModelPerDebateMax: 16, perModelPerRunnerMax: 1000, absentPerModelPerRunner: 1000
} as const);
const count = (max: number) => z.number().int().min(1).max(max);
const schema = z.object({
  kind: z.literal("CALL_CONCURRENCY_POLICY"),
  perDebate: count(CALL_CONCURRENCY_LIMITS.perDebateMax),
  perModelPerDebate: count(CALL_CONCURRENCY_LIMITS.perModelPerDebateMax),
  perModelPerRunner: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/u), count(CALL_CONCURRENCY_LIMITS.perModelPerRunnerMax))
    .refine((value) => Object.hasOwn(value, "default"))
}).strict();
export type CallConcurrencyPolicy = Readonly<{
  perDebate: number; perModelPerDebate: number; perModelPerRunner: Readonly<{ default: number } & Record<string, number>>;
}>;
export type CallConcurrencyPolicyState =
  | Readonly<{ state: "ABSENT" }> | Readonly<{ state: "SET"; policy: CallConcurrencyPolicy }>;
const invalid = (): never => { throw new TypeError("CALL_CONCURRENCY_POLICY_INVALID"); };
export function callConcurrencyPolicyFromValue(value: unknown): CallConcurrencyPolicy {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return invalid();
  const { perDebate, perModelPerDebate, perModelPerRunner } = parsed.data;
  return Object.freeze({ perDebate, perModelPerDebate,
    perModelPerRunner: Object.freeze({ ...perModelPerRunner }) as CallConcurrencyPolicy["perModelPerRunner"] });
}
export async function readCallConcurrencyPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<CallConcurrencyPolicyState> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, CALL_CONCURRENCY_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? Object.freeze({ state: "ABSENT" })
    : Object.freeze({ state: "SET", policy: callConcurrencyPolicyFromValue(row.value_json) });
}
export function effectiveCallConcurrency(state: CallConcurrencyPolicyState): CallConcurrencyPolicy {
  return state.state === "SET" ? state.policy : Object.freeze({ perDebate: 1, perModelPerDebate: 1,
    perModelPerRunner: Object.freeze({ default: CALL_CONCURRENCY_LIMITS.absentPerModelPerRunner }) });
}
export function callConcurrencyPolicyRow(policy: CallConcurrencyPolicy, sourceRef: string) {
  if (typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid();
  const checked = callConcurrencyPolicyFromValue({ kind: "CALL_CONCURRENCY_POLICY", ...policy });
  const valueAst = Object.freeze({ kind: "CALL_CONCURRENCY_POLICY", ...checked });
  return Object.freeze({ rowKey: CALL_CONCURRENCY_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(valueAst) as CanonicalRegisterJson, sourceRef });
}
```
Export everything from `packages/register/src/index.ts` next to the role-rotation exports.

- [ ] **Step 4: Run the unit test, expect PASS.** Add the new file to `tests/support/shipped-corpus.manifest.txt` (see Global Constraints) and run `tests/unit/s1-1-depth-contract.test.ts` → PASS.

- [ ] **Step 5: Publishers.** In `deploy/preview-auth-dev/v1/publish-register-v2.ts` add `CALL_CONCURRENCY_POLICY_ROW_KEY` to `PREVIEW_SOURCE_ROW_KEYS_V2` handling exactly the way `answerRoleRotationPolicy` is optional there (read how the kit passes the role-rotation row; the concurrency row is optional input to the kit, absent by default). In `apps/runner/src/hosted-register-publish.ts` add an optional member `callConcurrencyPolicy` mirroring `roleRotationRowOf` (~:755) and its boot check (~:1259). Add one integration case to each publish test proving: absent → version has no such row; given → the sealed row equals `callConcurrencyPolicyRow(...)`. Run those two integration files one at a time.

- [ ] **Step 6: Commit** — `git add` the new file, index export, manifest, publishers, tests; message `Register: optional callConcurrencyPolicy row (absent = one call at a time)`.

---

### Task 2: The call scheduler (pure, no database)

**Files:**
- Create: `apps/runner/src/call-scheduler.ts`
- Test: `tests/unit/call-scheduler.test.ts`

**Interfaces:**
- Consumes: `CallConcurrencyPolicy` (Task 1).
- Produces:
```ts
export type CallPriority = "AUTHOR" | "PANEL" | "REVIEW" | "OTHER";
export interface CallSubject { readonly model: string; readonly vendor: string; readonly gate: string | null; }
export interface CallTicket extends CallSubject { readonly priority: CallPriority; }
export interface LaneStats { readonly peakInFlight: number; readonly peakByModel: Readonly<Record<string, number>>; readonly waitedMsByModel: Readonly<Record<string, number>>; readonly calls: number; }
export interface SchedulerStats { readonly peakByGate: Readonly<Record<string, number>>; readonly peakByModel: Readonly<Record<string, number>>; }
export interface DebateCallLane {
  /** Waits for a slot under every limit, runs `call`, always releases. Rejects with TypedDomainError CALL_LANE_STOPPED if the lane is stopped while waiting. */
  run<T>(ticket: CallTicket, call: () => Promise<T>): Promise<T>;
  /** No new call starts; queued calls reject CALL_LANE_STOPPED; running calls are not touched. Idempotent. */
  stop(): void;
  /** Resolves when no call of this lane is running. */
  drained(): Promise<void>;
  /** stop() + forget the lane's queues and counters (call once, at the end of the run). */
  close(): void;
  stats(): LaneStats;
}
export interface CallScheduler {
  openLane(debateId: string): DebateCallLane;
  /** The gate's own slots (preview /remaining max_concurrent_calls); absent gate = unlimited. */
  setGateCapacity(gate: string, slots: number): void;
  /** While unhealthy a gate admits ONE call in flight (spec §3.4). */
  markGateUnhealthy(gate: string): void;
  markGateHealthy(gate: string): void;
  stats(): SchedulerStats;
}
export function createCallScheduler(input: Readonly<{ policy: CallConcurrencyPolicy; now?: () => number }>): CallScheduler;
export function callPriorityOf(callSiteKey: string): CallPriority; // "JUDGE:review:" → REVIEW; "PANEL:" → PANEL; "JUDGE" prefix → AUTHOR; else OTHER
export const CALL_LANE_STOPPED = "CALL_LANE_STOPPED" as const;
```

Rules (implement exactly):
- A call may start when ALL hold: lane running < `perDebate`; lane running for `ticket.model` < `perModelPerDebate`; runner-wide running for `ticket.model` < `perModelPerRunner[ticket.vendor] ?? perModelPerRunner.default`; and, when `ticket.gate !== null` and the gate has a capacity, gate running < (unhealthy ? 1 : capacity).
- Waiting order inside a lane: priority AUTHOR < PANEL < REVIEW < OTHER, then arrival order (a monotonically increasing sequence number).
- Across lanes, when a runner-wide or gate slot frees, the waiting call to admit is picked round robin over lanes (the lane after the last one served), and within that lane by the order above. A call blocked only by its own lane's limits never blocks another lane's call.
- Dispatch is re-attempted after every release, `setGateCapacity`, `markGateHealthy`, and `stop`.
- `run` releases its slots in `finally` whether `call` resolves or rejects; release is idempotent.
- A rejected call's error propagates unchanged.
- `stats()` tracks peaks and accumulated wait time per model (time from `run` to start).

- [ ] **Step 1: Write the failing tests** `tests/unit/call-scheduler.test.ts`. Use a controllable deferred helper:

```ts
import { describe, expect, it } from "vitest";
import { createCallScheduler, callPriorityOf, CALL_LANE_STOPPED } from "../../apps/runner/src/call-scheduler.js";

const deferred = () => { let resolve!: (v: string) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const flush = () => new Promise((r) => setTimeout(r, 0));
const policy = { perDebate: 3, perModelPerDebate: 2, perModelPerRunner: { default: 4, deepinfra: 3 } };
const t = (model: string, priority: "AUTHOR" | "PANEL" | "REVIEW" | "OTHER" = "AUTHOR", gate: string | null = null, vendor = "deepinfra") =>
  ({ model, vendor, gate, priority });

describe("call scheduler", () => {
  it("respects perModelPerDebate and perDebate", async () => {
    const s = createCallScheduler({ policy }); const lane = s.openLane("d1");
    const started: string[] = []; const gates = [deferred(), deferred(), deferred(), deferred()];
    const calls = [t("A"), t("A"), t("A"), t("B")].map((ticket, i) => lane.run(ticket, () => { started.push(`${ticket.model}${i}`); return gates[i]!.promise; }));
    await flush();
    expect(started).toEqual(["A0", "A1", "B3"]); // A2 waits: 2 per model; B3 fills perDebate 3
    gates[0]!.resolve("ok"); await flush();
    expect(started).toEqual(["A0", "A1", "B3", "A2"]);
    gates.forEach((g) => g.resolve("ok")); await Promise.all(calls);
    expect(lane.stats().peakInFlight).toBe(3);
  });
  it("orders waiting calls by priority then arrival", async () => {
    const s = createCallScheduler({ policy: { ...policy, perDebate: 1 } }); const lane = s.openLane("d1");
    const order: string[] = []; const first = deferred();
    const a = lane.run(t("A"), () => first.promise);
    const rest = [["r", "REVIEW"], ["p", "PANEL"], ["a", "AUTHOR"], ["p2", "PANEL"]].map(([name, pr]) =>
      lane.run(t("B", pr as never), async () => { order.push(name!); return "ok"; }));
    first.resolve("ok"); await Promise.all([a, ...rest]);
    expect(order).toEqual(["a", "p", "p2", "r"]);
  });
  it("applies the runner-wide per-vendor cap across lanes with round robin", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10, deepinfra: 2 } } });
    const l1 = s.openLane("d1"); const l2 = s.openLane("d2"); const started: string[] = [];
    const gs = Array.from({ length: 6 }, deferred);
    const runs = [l1, l1, l1, l2, l2, l2].map((lane, i) => lane.run(t("M"), () => { started.push(`${lane === l1 ? "x" : "y"}${i}`); return gs[i]!.promise; }));
    await flush(); expect(started).toEqual(["x0", "x1"]);
    gs[0]!.resolve("ok"); await flush(); expect(started.at(-1)).toBe("y3");     // round robin hands the slot to d2
    gs[1]!.resolve("ok"); await flush(); expect(started.at(-1)).toBe("x2");
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
  });
  it("limits a gate to its capacity and to one call while unhealthy", async () => {
    const s = createCallScheduler({ policy: { perDebate: 10, perModelPerDebate: 10, perModelPerRunner: { default: 10 } } });
    s.setGateCapacity("g", 2); const lane = s.openLane("d1"); const started: number[] = [];
    const gs = Array.from({ length: 4 }, deferred);
    const runs = gs.map((g, i) => lane.run(t(`M${i}`, "AUTHOR", "g", "x"), () => { started.push(i); return g.promise; }));
    await flush(); expect(started).toEqual([0, 1]);
    s.markGateUnhealthy("g"); gs[0]!.resolve("ok"); await flush(); expect(started).toEqual([0, 1]); // 1 still running ≥ 1
    gs[1]!.resolve("ok"); await flush(); expect(started).toEqual([0, 1, 2]);
    s.markGateHealthy("g"); await flush(); expect(started).toEqual([0, 1, 2, 3]);
    gs.forEach((g) => g.resolve("ok")); await Promise.all(runs);
  });
  it("stop rejects waiting calls, leaves running ones, never leaks a slot", async () => {
    const s = createCallScheduler({ policy: { ...policy, perDebate: 1 } }); const lane = s.openLane("d1");
    const g = deferred(); const running = lane.run(t("A"), () => g.promise);
    const waiting = lane.run(t("A"), async () => "never");
    lane.stop();
    await expect(waiting).rejects.toMatchObject({ code: CALL_LANE_STOPPED });
    g.resolve("done"); await expect(running).resolves.toBe("done"); await lane.drained();
    const other = s.openLane("d2"); await expect(other.run(t("A"), async () => "ok")).resolves.toBe("ok");
  });
  it("releases on rejection and propagates the error unchanged", async () => {
    const s = createCallScheduler({ policy: { ...policy, perDebate: 1 } }); const lane = s.openLane("d1");
    const boom = new Error("boom");
    await expect(lane.run(t("A"), async () => { throw boom; })).rejects.toBe(boom);
    await expect(lane.run(t("A"), async () => "ok")).resolves.toBe("ok");
  });
  it("names priorities from call-site keys", () => {
    expect(callPriorityOf("JUDGE")).toBe("AUTHOR");
    expect(callPriorityOf("JUDGE:root:2:seat:main")).toBe("AUTHOR");
    expect(callPriorityOf("JUDGE:cross-root:0->1")).toBe("AUTHOR");
    expect(callPriorityOf("PANEL:root:preview:fixture-a")).toBe("PANEL");
    expect(callPriorityOf("JUDGE:review:8f…")).toBe("REVIEW");
    expect(callPriorityOf("COMPOSER:SYNTHESIZER:INITIAL:1")).toBe("OTHER");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module not found).
- [ ] **Step 3: Implement** `apps/runner/src/call-scheduler.ts` to the rules above (a single dispatcher function `pump()` that scans lanes round robin and starts every admissible waiting call; per-lane waiting arrays sorted by `[priorityRank, seq]`; counters in `Map`s; `run` returns a promise created when the entry is queued; `TypedDomainError` from `@debateai/kernel` for `CALL_LANE_STOPPED`). Add `CALL_LANE_STOPPED` to the twin alphabets + `tests/unit/api-operational-error.test.ts` (Global Constraints). Add the file to the shipped-corpus manifest.
- [ ] **Step 4: Run the test, expect PASS**; run `tests/unit/s1-1-depth-contract.test.ts` and `tests/unit/api-operational-error.test.ts` → PASS.
- [ ] **Step 5: Commit** `Runner: call scheduler with per-debate, per-model, per-gate slots`.

---

### Task 3: Busy coordinator and gate-unsent classification (preview policy)

**Files:**
- Create: `packages/providers/src/preview-busy.ts`
- Modify: `packages/providers/src/preview-test.ts` (refusal mapping ~:568-588; `withPreviewProviderCallPolicy` ~:383-416), `packages/providers/src/index.ts` (exports)
- Test: `tests/unit/preview-busy-coordinator.test.ts`; extend `tests/unit/preview-budget-gate-refusals.test.ts`

**Interfaces:**
- Produces:
```ts
// preview-test.ts
/** The gate proved the call unbilled because it could not reach the vendor (PROVIDER_NOT_REACHED) or the vendor answered an unbilled error (PROVIDER_ERROR_UNBILLED). Still a PreviewUnbilledRefusal (REFUSED row, one resend). */
export class PreviewGateUnsent extends PreviewUnbilledRefusal {}
/** True for PreviewGateUnsent itself or a PROVIDER_CALL_FAILED whose cause is one. */
export function providerCallGateUnsent(error: unknown): boolean;
// preview-busy.ts
export type BusyTurn = "PROBE" | "RESEND" | "GIVE_UP";
export interface PreviewBusyCoordinator {
  /** Before a call's FIRST send: resolves at once when the model is CLOSED or CONFIRMED_BUSY; while OPEN it waits for the probe's outcome. */
  admit(model: string): Promise<void>;
  /** A send of this model ended in a vendor busy refusal. PROBE: you are the probe (wait, then resend once). RESEND: the probe was answered, resend once now. GIVE_UP: the model is confirmed busy, end with your refusal. */
  refusedBusy(model: string, retryAfterSeconds: number | undefined): Promise<BusyTurn>;
  /** The probe's resend: answered → CLOSED; busy → CONFIRMED_BUSY for max(60 s, retryAfter); any other outcome → CLOSED. */
  probeOutcome(model: string, outcome: "ANSWERED" | "BUSY" | "OTHER", retryAfterSeconds?: number): void;
  /** Any send of this model answered: CONFIRMED_BUSY or OPEN without a probe in flight → CLOSED. */
  answered(model: string): void;
}
export function createPreviewBusyCoordinator(input?: Readonly<{ now?: () => number }>): PreviewBusyCoordinator;
/** One coordinator that never waits: today's behaviour (each call resends after 60 s on its own). */
export const NO_BUSY_COORDINATION: PreviewBusyCoordinator;
```
- `withPreviewProviderCallPolicy(gateway, config, target, options)` gains `options.busy?: PreviewBusyCoordinator` (default `NO_BUSY_COORDINATION`, so every existing caller and test is unchanged).

State machine (per model key = `target.model`):
- CLOSED: `admit` resolves; first `refusedBusy` → OPEN with that caller as the probe → returns `"PROBE"`.
- OPEN: `admit` waits; a further `refusedBusy` waits; on `probeOutcome("ANSWERED")` → CLOSED, every waiter of `admit` resolves and every waiter of `refusedBusy` gets `"RESEND"`; on `"BUSY"` → CONFIRMED_BUSY until `now + max(60, retryAfter) s`, `admit` waiters resolve (they will send once and be refused) and `refusedBusy` waiters get `"GIVE_UP"`; on `"OTHER"` → CLOSED and `refusedBusy` waiters get `"RESEND"`.
- CONFIRMED_BUSY: `admit` resolves; `refusedBusy` → `"GIVE_UP"` at once; after expiry the next `admit`/`refusedBusy` sees CLOSED.

Policy flow inside `withPreviewProviderCallPolicy` (the non-story branch):
```ts
await busy.admit(reviewed.model);
try { const result = await send(); busy.answered(reviewed.model); return result; }
catch (error) {
  if (!previewCallWasUnbilled(error)) throw error;
  if (previewCallWasVendorBusy(error)) {           // cause/instance PreviewVendorRefusedUnbilled (incl. PreviewModelCooling)
    const turn = await busy.refusedBusy(reviewed.model, retryAfterOf(error));
    if (turn === "GIVE_UP") throw error;
    if (turn === "PROBE") {
      await sleep(Math.max(PREVIEW_UNBILLED_RETRY_COOLDOWN_MS, (retryAfterOf(error) ?? 0) * 1000));
      try { const result = await send(); busy.probeOutcome(reviewed.model, "ANSWERED"); return result; }
      catch (probeError) { busy.probeOutcome(reviewed.model, previewCallWasVendorBusy(probeError) ? "BUSY" : "OTHER", retryAfterOf(probeError)); throw probeError; }
    }
    return send();                                   // RESEND: this call's one resend
  }
  await sleep(PREVIEW_UNBILLED_RETRY_COOLDOWN_MS);   // the gate's own unbilled refusals: today's path
  return send();
}
```
The story branch (`storyRepair`) keeps `return send()` but calls `await busy.admit(...)` first and `busy.answered(...)` on success. `NO_BUSY_COORDINATION` makes `refusedBusy` return `"PROBE"` every time and every other method a no-op, so the flow equals today's (each call: sleep 60 s, resend once).

- [ ] **Step 1: Write the failing tests.** `tests/unit/preview-busy-coordinator.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createPreviewBusyCoordinator, NO_BUSY_COORDINATION } from "@debateai/providers";
const flush = () => new Promise((r) => setTimeout(r, 0));
describe("preview busy coordinator", () => {
  it("first busy refusal is the probe; others wait; probe answered → they resend", async () => {
    const c = createPreviewBusyCoordinator();
    await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
    const second = c.refusedBusy("m", undefined); const fresh = c.admit("m"); let freshDone = false; void fresh.then(() => { freshDone = true; });
    await flush(); expect(freshDone).toBe(false);
    c.probeOutcome("m", "ANSWERED");
    await expect(second).resolves.toBe("RESEND"); await fresh; expect(freshDone).toBe(true);
  });
  it("probe busy → waiting refusals give up, new calls are released, later refusals give up until expiry", async () => {
    let clock = 0; const c = createPreviewBusyCoordinator({ now: () => clock });
    await c.refusedBusy("m", undefined); const waiting = c.refusedBusy("m", undefined); const fresh = c.admit("m");
    c.probeOutcome("m", "BUSY", 120);
    await expect(waiting).resolves.toBe("GIVE_UP"); await fresh;
    await expect(c.refusedBusy("m", undefined)).resolves.toBe("GIVE_UP");
    clock = 121_000; await expect(c.refusedBusy("m", undefined)).resolves.toBe("PROBE");
  });
  it("models are independent", async () => {
    const c = createPreviewBusyCoordinator();
    await c.refusedBusy("a", undefined); await expect(c.admit("b")).resolves.toBeUndefined();
  });
  it("the no-op coordinator is today's behaviour", async () => {
    await expect(NO_BUSY_COORDINATION.refusedBusy("m", undefined)).resolves.toBe("PROBE");
    await expect(NO_BUSY_COORDINATION.refusedBusy("m", undefined)).resolves.toBe("PROBE");
  });
});
```
In `tests/unit/preview-budget-gate-refusals.test.ts` add: a gate 409 `PROVIDER_NOT_REACHED` and `PROVIDER_ERROR_UNBILLED` map to `PreviewGateUnsent` (still `instanceof PreviewUnbilledRefusal`, still not vendor-busy), and `providerCallGateUnsent` is true for it and false for `CONCURRENCY_LIMIT_REACHED` and vendor busy. Add a policy test with an injected `sleep` and a scripted gateway: three concurrent calls of one model all refused busy, `busy: createPreviewBusyCoordinator()` → exactly ONE resend POST happens before the probe's outcome; probe answered → the other two resend once each.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `preview-busy.ts` (state per model in a `Map`, waiters as arrays of resolvers), the `PreviewGateUnsent` class + `providerCallGateUnsent`, the mapping change (only `PROVIDER_NOT_REACHED` and `PROVIDER_ERROR_UNBILLED` become `PreviewGateUnsent`; `CONCURRENCY_LIMIT_REACHED` stays a plain `PreviewUnbilledRefusal`), and the policy flow above. Export from `packages/providers/src/index.ts`. Manifest line for the new file.
- [ ] **Step 4: Run** the two unit files plus `tests/unit/run-sit-out.test.ts`, `tests/unit/preview-practice.test.ts` → PASS (sit-out semantics unchanged: `PreviewGateUnsent` is not vendor-busy).
- [ ] **Step 5: Commit** `Preview: one probe for a busy model; gate-unsent refusals named`.

---

### Task 4: The gate counts a burst of unsent failures once

**Files:**
- Modify: `packages/providers/ops/preview_budget_authority.py` (`release_unsent` ~:1085-1105, the not-busy branch of `release_unbilled` ~:1135-1142, the settled branch that resets the streak ~:1018)
- Test: `tests/unit/preview_budget_authority_v3_test.py` (find the existing unsent-streak tests and add next to them); bump the "Ran N tests" pin in `tests/unit/preview-budget-authority-json-mode.test.ts`.

Rule: keep `control['unsent_counted_at']` (ISO time, absent = never). When a release would grow `unsent_streak`, grow it only if the entry's `reserved_at` is AFTER `unsent_counted_at` (or `unsent_counted_at` is absent); when it grows, set `unsent_counted_at = iso(moment)`. A settled reply resets the streak (as today) and deletes `unsent_counted_at`. The halt check (`streak >= UNSENT_HALT_STREAK`) is unchanged and runs only when the streak grew.

- [ ] **Step 1: Write failing Python tests** (follow the file's existing helpers for creating a store, reserving and releasing):
  1. ten calls reserved, then all ten released unsent → `unsent_streak == 1`, gate not halted;
  2. five calls each reserved AFTER the previous one's unsent release → streak 5 → halted `provider_unreachable` (today's rule for serial calls);
  3. a settled reply between failures resets the streak and the counted-at time;
  4. the same burst rule for `release_unbilled(busy=False)` (Anthropic 400/500).
- [ ] **Step 2: Run** `python3 -m unittest tests/unit/preview_budget_authority_v3_test.py` (or the runner the file's header names) → the new tests FAIL.
- [ ] **Step 3: Implement** the rule in both release paths and the settle reset; update the module docstring paragraph that describes the streak ("calls in flight together count once — spec 2026-10-12 parallel calls §3.4").
- [ ] **Step 4: Run** the Python file → PASS; bump the pinned count; run `pnpm exec vitest run tests/unit/preview-budget-authority-json-mode.test.ts` → PASS.
- [ ] **Step 5: Add the redeploy note** to `deploy/preview-gate/v3/README.md`: the two file hashes change, so root writes a new GO for each gate (DeepInfra and Anthropic) exactly as in the existing GO step; nothing else changes. Commit `Preview gate: unsent failures of calls in flight together count once`.

---

### Task 5: A judge panel asks its members together

**Files:**
- Modify: `packages/judgement/src/s04.ts` (`runJudgePanel` ~:512-621)
- Test: `tests/unit/judgement-s04.test.ts` and/or `tests/unit/t03-judge-panel.test.ts` (add cases)

Behaviour: every member that is not refused before its call (`isTheAuthor` on the planned identity) is started at once (`member.judge()` called in member order, synchronously, collecting the promises); then the results are processed with `Promise.allSettled` IN MEMBER ORDER, applying exactly today's per-member rules (after-call FX-HR-H6 note, judgement push, money-refused seat left out, `PanelMemberFailure` notes). Run-level spend stops:
- `RETURN_HEARD`: every member that answered is kept (in member order), every other note kept; `stoppedBy` = the FIRST run-level spend stop in member order.
- `RETHROW` (default): after ALL members settled, throw the first run-level spend stop in member order.
No member is started after another member's failure is known (they all start together), so "no further member is asked" is now "every member was asked at once".

- [ ] **Step 1: Failing tests:** (a) three members with judge functions that resolve in reverse order → `judgements` order is author, m1, m2, m3; (b) all three `judge()` calls start before any resolves (record start order synchronously); (c) RETURN_HEARD with member 2 raising a run-level spend stop and members 1 and 3 answering → judgements author, m1, m3, `stoppedBy` = m2's error; (d) RETHROW with member 3 stop and member 1 failing normally → throws m3's stop only after m1, m2 settled; (e) the author-maker member is still a PRODUCER_GRADING_FORBIDDEN note without a call.
- [ ] **Step 2: Run, expect FAIL** on (b) and (c).
- [ ] **Step 3: Implement**; update the comment block above `PanelRunLevelSpendStopRule` (~:476-500) to say members are asked together (spec 2026-10-12 §2.3).
- [ ] **Step 4: Run** `tests/unit/judgement-s04.test.ts tests/unit/t03-judge-panel.test.ts tests/unit/v28-truncated-maker-panel.test.ts tests/unit/b9-runner-wall.test.ts` → PASS (fix any test that pinned the old "stop asking after the stop" ORDER only by re-reading the spec ruling O6; never weaken a test of a different rule).
- [ ] **Step 5: Commit** `Judge panel: members are asked together, results read in member order`.

---

### Task 6: Seat caller safe with calls in flight

**Files:**
- Modify: `apps/runner/src/run-seats.ts` (`createSeatCaller` ~:728-890)
- Test: `tests/unit/a16-seat-backup.test.ts` (add cases)

Changes:
1. In the `catch` path of `callSeat`, call `recordSwitch(first, second, …)` only if `!switchedFrom.has(slotId(input.seat, first))`; the backup is still called.
2. `backupAnswers()` and `switches()` return copies sorted by `(role, seatIndex, callSiteKey)` (string compare); `answered(role)` returns refs sorted.
- [ ] **Step 1: Failing tests:** two overlapping `callSeat` calls on the same seat, different sites, whose main fails with a switching cause (e.g. the cause used by existing a16 tests) → `onSwitch` called ONCE and `switches()` has one record; both calls answered by the runner-up; lists come back sorted regardless of completion order.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4:** run `tests/unit/a16-seat-backup.test.ts tests/unit/a15-run-seats.test.ts tests/unit/a15d-seat-fill.test.ts tests/unit/evaluator-seat-share.test.ts` → PASS.
- [ ] **Step 5: Commit** `Seat caller: one switch notice per seat slot, lists in a fixed order`.

---

### Task 7: Ordered recorder

**Files:**
- Create: `apps/runner/src/ordered-recorder.ts`
- Test: `tests/unit/ordered-recorder.test.ts`

**Interfaces:**
```ts
export interface OrderedRecorder {
  /** Runs `write` once every position below `position` has committed or been skipped. Resolves/rejects with write's result. */
  commit<T>(position: number, write: () => Promise<T>): Promise<T>;
  /** Marks a position as having nothing to write (a skipped or failed chain). Idempotent. */
  skip(position: number): void;
  /** Resolves when every position in [0, size) is committed or skipped. */
  done(): Promise<void>;
}
export function createOrderedRecorder(size: number): OrderedRecorder;
```
Rules: positions are integers in `[0, size)`; a position may be committed or skipped once (a second call throws `TypeError("ORDERED_RECORDER_POSITION_REUSED")`); a `write` that rejects still advances the cursor (later positions do not deadlock) and its rejection goes to that `commit`'s caller only.

- [ ] **Step 1: Failing tests:** commits requested in order 2,0,1 run in order 0,1,2; a skip unblocks the next; a throwing write rejects its caller and the next position still runs; `done()` resolves after the last; reusing a position throws; position out of range throws.
- [ ] **Step 2: FAIL. Step 3: Implement** (cursor + map of pending `{ write, resolve, reject }` + `advance()` loop). Manifest line. **Step 4: PASS. Step 5: Commit** `Runner: ordered recorder for saving results in plan order`.

---

### Task 8: In-flight attempts, money and holds

**Files:**
- Create: `apps/runner/src/run-in-flight.ts`
- Modify: `apps/runner/src/index.ts` (`createPostgresProviderGateway` ~:9983-10179: the run-wide ceiling check ~:10107 and the per-attempt hook ~:10134; `withCooldownRetry` ~:1061-1068 hold cap), `packages/budget/src/model-spend.ts` (`#meteredSeam` ~:573-598 / shared wall ~:722-750), `packages/budget/src/index.ts` (`assertModelAttemptAllowed` ~:587-604)
- Test: `tests/unit/run-in-flight.test.ts`; add cases to `tests/unit/b9-runner-wall.test.ts` (or the closest unit test of `CostEnvelopeGuard`) and a unit test of `withCooldownRetry` hold cap (file `tests/unit/dr174-resilience.test.ts` has the existing cooldown tests).

**Interfaces:**
```ts
export interface RunInFlight {
  /** Synchronously counts one attempt in flight for runId (and its projected micros, 0 when unpriced); returns a release function (idempotent). */
  begin(runId: string, projectedMicros: bigint): () => void;
  attempts(runId: string): number;
  projectedMicros(runId: string): bigint;
  /** All runs: for the shared wall. */
  projectedMicrosAll(): bigint;
}
export function createRunInFlight(): RunInFlight;
```
- `assertModelAttemptAllowed(runId, { inFlightAttempts })`: allowed iff `consumed + inFlightAttempts < ceiling` (read the existing function; add an optional second parameter, default 0 → today).
- `createPostgresProviderGateway` takes an optional `inFlight?: RunInFlight` setting: `begin(runId, 0n)` immediately before `http.call(...)` and release in `finally`; the ceiling checks pass `inFlight.attempts(runId) - 1` (excluding the call itself once begun; write the test first to pin the arithmetic: with ceiling 3, consumed 2 and one other call in flight, a new call is refused).
- `CostEnvelopeGuard.providerSeam(...)`: the run's `spentMicros` used by `assertCallAllowed` becomes `readRunSpentMicros + inFlight.projectedMicros(runId)` and the shared wall adds `inFlight.projectedMicrosAll()`; the seam's own call registers its projected maximum with `begin` before the vendor call and releases after `recordCall` or on failure. (Hosted only; the preview builds no seam.)
- Hold cap: give `HoldRecorder` an optional `reserveHold?(runId: string, cap: number): Promise<boolean>`; `withCooldownRetry` uses it when present instead of `countCooldownHolds` + compare. In `execute`, wrap the configured recorder with an in-memory reservation per run: increment `reserved` synchronously, then `const recorded = await countCooldownHolds(runId)`; admit iff `recorded + reserved <= cap`, otherwise decrement and refuse; decrement `reserved` after the hold's `COOLDOWN_HOLD` record commits.
- [ ] **Step 1: Failing tests** for each rule above (unit, fakes for the ledger counts).
- [ ] **Step 2: FAIL. Step 3: Implement.** Manifest line for the new file. **Step 4:** run the new and touched unit files + `tests/unit/b9-runner-wall.test.ts tests/unit/dr174-resilience.test.ts tests/unit/dr184-review-resilience.test.ts` → PASS.
- [ ] **Step 5: Commit** `Runner: calls in flight count toward the attempt ceiling, the money envelope and the hold cap`.

---

### Task 9: Wire the scheduler into the runner (lanes, main.ts, pools, practice)

**Files:**
- Create: `apps/runner/src/call-lane-gateway.ts`
- Modify: `apps/runner/src/index.ts` (constructor settings; `execute`: open the lane after `sitOutMaker` ~:4867-4870, close it in the outermost `finally` after the story), `apps/runner/src/main.ts`, `packages/db/src/pool-budget.ts`, `tests/architecture/database-connection-budget.test.ts`, `docs/operations/2026-10-10-database-connection-budget.md`, `tools/preview-practice/practice-runner-composition.ts`, `tests/unit/preview-practice-wiring-drift.test.ts`
- Test: `tests/unit/call-lane-gateway.test.ts`; existing `tests/integration/preview-busy-model-run.test.ts` must stay green.

**Interfaces:**
```ts
// call-lane-gateway.ts
export interface CallSubjectResolver { subjectOf(providerRef: string): CallSubject; }
export function previewCallSubjects(config: PreviewProviderTestConfig): CallSubjectResolver; // model = preview row model, vendor = row.provider, gate = row.provider
export function targetCallSubjects(targets: readonly Readonly<{ providerRef: string; model: string; baseUrl: string }>[]): CallSubjectResolver; // vendor from hostname: *deepinfra.com → "deepinfra", *anthropic.com → "anthropic", else "default"; gate null
export function laneGateway(input: Readonly<{ lane: DebateCallLane; scheduler: CallScheduler; subject: CallSubject; provider: ProviderGateway }>): ProviderGateway;
// runner settings (WalkingSkeletonSettings) gain:
//   callScheduler?: CallScheduler; callSubjects?: CallSubjectResolver; renewals?: Pick<WorkItemRepository, "renewClaim">
```
- `laneGateway.call(request)` = `lane.run({ ...subject, priority: callPriorityOf(request.callSiteKey) }, () => provider.call(request))`; on success, if `subject.gate !== null` → `scheduler.markGateHealthy(gate)`; on failure with `providerCallGateUnsent(error)` → `scheduler.markGateUnhealthy(gate)`; rethrow unchanged.
- In `execute`, when `this.settings.callScheduler` is set: `const lane = callScheduler.openLane(claimedRunId)`; every `configuredMakers[index]` gets `provider = laneGateway({ lane, scheduler, subject: callSubjects.subjectOf(ref), provider: <sit-out wrapped provider> })` and a fresh `Judge` over it — applied in the same loop as `sitOutMaker`, so every later copy (body makers, seat book, synthesis makers, story makers) uses the lane. Without a scheduler nothing is wrapped (today).
- `main.ts`: read `effectiveCallConcurrency(await readCallConcurrencyPolicy(pool, REGISTER_VERSION))`; `createCallScheduler({ policy })`; on the preview, for each gate in the preview config read `/remaining` once at boot (`createPreviewRemainingRpcPort`) and `setGateCapacity(gate, maxConcurrentCalls)` (a failed read leaves capacity 1 and logs one content-free line); one `createPreviewBusyCoordinator()` passed to every `withPreviewProviderCallPolicy(..., { busy })`; `callSubjects` = `previewCallSubjects(config)` on the preview else `targetCallSubjects(providerTargets)`; `inFlight = createRunInFlight()` passed to every `createPostgresProviderGateway` and the guard; a second pool `createPool(DATABASE_URL, RUNNER_DATABASE_POOLS.keepAlive)` and `renewals: new WorkItemRepository(keepAlivePool)`; `execute` uses `this.settings.renewals ?? this.#work` for `renewClaim`.
- `pool-budget.ts`: `runtime: budget("runner:runtime", RUNNER_CAPACITY.concurrentRuns * 3 + 8, 5_000)` (32) and `keepAlive: budget("runner:keep-alive", 2, 5_000)`; update the comment (spec §3.6), the architecture test's expectations and the budget doc's table and arithmetic.
- Practice composition mirrors main.ts (scheduler, busy coordinator, subjects, inFlight, keep-alive pool); the drift test must keep passing.
- [ ] **Step 1: Failing tests:** `tests/unit/call-lane-gateway.test.ts` (priority mapping reaches the scheduler; gate health toggles on `PreviewGateUnsent` and on success; errors unchanged); architecture test expects 32 and 2.
- [ ] **Step 2: FAIL. Step 3: Implement.** Manifest + s10 provider-surface list (the new file calls `provider.call(`).
- [ ] **Step 4:** run unit files + `tests/architecture/database-connection-budget.test.ts tests/unit/preview-practice-wiring-drift.test.ts tests/unit/runner-keep-alive.test.ts`; then (one heavy run) `pnpm exec vitest run tests/integration/preview-busy-model-run.test.ts` → PASS with the row ABSENT (serial lane).
- [ ] **Step 5: Commit** `Runner: every debate's calls go through a lane of the call scheduler`.

---

### Task 10: Roots run together (pipeline, part 1)

**Files:**
- Modify: `apps/runner/src/index.ts` (`execute` ~:6100-6776: root 0, secondary root, per-maker roots, first review pass)
- Test: new `tests/integration/parallel-calls-debate.test.ts` (built on the harness of `tests/integration/preview-busy-model-run.test.ts`: copy its composition helpers into `tests/support/preview-debate-harness.ts` if they are not already shared, and make the gate stubs in `tests/support/preview-gate-stubs.ts` accept an optional per-call delay function)

Implement in `execute`:
1. Root 0's author call (with today's seat-swap loop) stays first and alone.
2. Create `nodeRecorder = createOrderedRecorder(totalPlannedNodes)` where `totalPlannedNodes = effectiveMakerCount + expansionPlan.length + crossPlan.length` (compute `expansionPlan` and the cross plan BEFORE root 0; both are pure functions of depth and `effectiveMakerCount`). Node positions: root i → i; expansion leg j → `effectiveMakerCount + j`; cross leg k → `effectiveMakerCount + expansionPlan.length + k`. Cross-exchange `authoredNodes` keys become exactly these positions (replace `Math.max(...keys)+1`).
3. Split `authorPosition` into `authorAndPanel(input)` (the author call through `cooldownAttempt` + `reduceAssessment` + `runNodePanel`; NO database writes except the existing `JUDGEMENT_SCHEDULED` ledger append) and `saveAuthored(position, input, authored)` (the `withGraphWrite` block, the two record pushes, `recordReduced`, `authoredNodes.set(position, …)`), and do the root 0 save through `nodeRecorder.commit(0, …)` too.
4. Start root 0's panel and roots 1..M−1's `authorAndPanel` together (no `await` between them; collect promises). Each root i's chain: `authorAndPanel` → `nodeRecorder.commit(i, saveAuthored)`; a dropped (sat-out) root or a stopped chain calls `nodeRecorder.skip(i)`. Keep today's per-root rules exactly (dropSatOutRoot, MAKER_POSITION_UNAVAILABLE, expansionPhaseStop → `runBodyBudgetStop`) but evaluate them on each root's own result; a root that halts with `MAKER_POSITION_UNAVAILABLE` stops the lane (`lane.stop()`), awaits the other chains (`Promise.allSettled`), then throws (spec §2.3).
5. Reviews of roots: a chain per root, started when that root's save resolves: an ordered CHOICE step (`reviewChoices = createOrderedRecorder(totalPlannedNodes)` keyed by the node's position, which runs today's reviewer choice code with a LOCAL `latestReviewerByAuthor` map seeded on first use from `readLatestReviewerMaker` and advanced at choice time), then the review call (no `await` on other reviews), then `reviewRecorder.commit(position, …)` with `recordReviewWithMeasurements` and the record pushes. A review whose reviewer sat out is offered again by a second choice for that node after the first choice pass of the batch (keep today's semantics; a test pins it).
6. Every chain checks the stop state (`runBodyBudgetStop !== null || tooFewLeftToArgue()`) right before its AUTHOR call and right before its REVIEW call; a chain stopped there skips its positions (spec §2.3, O6). Panel members of a node whose author call was already sent ALWAYS run: they finish a paid step, exactly as the serial leg that was underway finished its panel (a money refusal inside that panel keeps today's RETURN_HEARD / TRAVEL / leave-out rules). `positionAnswerers.set(...)` happens inside `authorAndPanel` right after the author call (cross-exchange chains read it).

- [ ] **Step 1: Failing integration test** `tests/integration/parallel-calls-debate.test.ts`, case "roots and their panels run together": four makers, depth 1, the row SET to the owner's values; gate stubs log each request's start time; assert that roots 1–3's author requests and root 0's panel requests start before any of them is answered (all start within the first stub delay window), and that the run is served.
- [ ] **Step 2: Failing determinism case** (same file): run the same four-maker depth-1 debate (scripted, content-deterministic answers keyed by call-site key) THREE times with different seeded random per-call delays (e.g. 5–200 ms) and once with the row ABSENT; read back with SQL: nodes (`statement_text`, `materialized_path`, `sibling_ordinal`, `parent`), edges, reduced judgements (`tau`, `dispersion`, `selected_judgement_ref` mapped to the producing maker), node reviews (node path → reviewer maker, outcome), the served answer text and the fact bundle → all four runs deep-equal. (Only roots are parallel after this task; the case must pass now and keep passing after Task 11.)
- [ ] **Step 3: Implement** items 1–6.
- [ ] **Step 4:** run the new integration file, then `tests/integration/preview-busy-model-run.test.ts` (one at a time) → PASS; run `tests/unit/pro01-runner-tree.test.ts tests/unit/dr174-resilience.test.ts tests/unit/dr184-review-resilience.test.ts` → PASS.
- [ ] **Step 5: Commit** `Runner: opening positions, their panels and reviews run together, saved in order`.

---

### Task 11: Replies and cross-exchanges run together (pipeline, part 2)

**Files:**
- Modify: `apps/runner/src/index.ts` (`execute` ~:6776-7045)
- Test: `tests/integration/parallel-calls-debate.test.ts` (add cases)

Implement:
1. Each expansion leg j gets a chain: wait for its PARENT's author result (a per-position `Promise<AuthorResult | null>` registry filled by every chain right after its author call; a null parent = halted/dropped/stopped → this leg is skipped exactly as today's `skipped` predicate and `haltedIndices`/`frozenIndices`/`droppedSubtreeIndices` say) → `authorAndPanel` with today's leg input → `nodeRecorder.commit(M + j, saveAuthored)` → review chain (Task 10 item 5).
2. Depth ≥ 2 checkpoint: for each global round boundary `b` (`deriveGlobalRoundCompletions`), legs with plan index > b wait for `boundaryDone[b]`, which resolves after every position ≤ M + b is committed or skipped AND every review of those nodes is committed or skipped, and then `closeGlobalRound(round, b)` ran (it sets `frozenIndices`/`stoppedByAdaptiveRule`). A leg waiting on a boundary re-reads `frozenIndices` and the stop flag after it resolves. Legs ≤ b never wait for it.
3. Each cross-exchange k gets a chain: wait for both roots' author results (and `positionAnswerers.get(authorRoot)`), skip as today when either root is missing/sat out, `authorAndPanel` → `nodeRecorder.commit(M + E + k, saveAuthored)` → review chain.
4. Remove the serial loops (`for (const [legIndex, leg] of expansionPlan.entries())`, the cross loop) and the interleaved `reviewPendingAuthoredNodes()` calls; after all chains, `await Promise.allSettled(chains)`, `await nodeRecorder.done()`, `await reviewRecorder.done()`, then continue exactly as today from `const authoredNodeList = …` (~:7045).
- [ ] **Step 1: Failing integration cases:** (a) "replies start before their siblings' panels end": depth 1, the first support leg's author request starts before root 3's panel is answered (delays arranged by the stub); (b) the determinism case of Task 10 now with every phase parallel (3 seeds + serial) stays deep-equal; (c) depth 2, two makers, with a stopping policy that freezes one round-1 branch: the frozen branch's round-2 legs are never requested, and the saved debate equals the serial run's.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4:** run the integration file, `tests/integration/preview-busy-model-run.test.ts`, then `tests/unit/pro01-runner-tree.test.ts` → PASS.
- [ ] **Step 5: Commit** `Runner: replies and cross-exchanges start as soon as their positions exist`.

---

### Task 12: Stops and failures with calls in flight

**Files:**
- Modify: `apps/runner/src/index.ts` (stop helpers used by every chain; keep-alive handling around the body), `apps/runner/src/run-keep-alive.ts` only if a hook is needed (prefer none)
- Test: `tests/integration/parallel-calls-debate.test.ts` (add cases); unit cases where a fake gateway suffices

Implement the spec §2.3 rules exactly:
- spend stop / too few members left: set the flag; `lane.stop()` is NOT called. Chains refuse to START an author or review call once the flag is set (Task 10 item 6) and skip their positions; panel members of nodes whose author call was already sent still run (they finish that node; money refusals inside keep today's panel rules); every call already sent finishes and its chain saves it; the run is served.
- fatal error in a chain: `lane.stop()`; `await Promise.allSettled(allChains)`; throw the first fatal error in plan order.
- keep-alive stop (`RUNNER_CLAIM_LOST` / `RUNNER_TIME_LIMIT_REACHED` raised by `assertMayCall`): `lane.stop()`; do NOT await running calls; attach `.catch(() => undefined)` to every abandoned chain; rethrow so today's handling records the run.
- [ ] **Step 1: Failing cases:** (a) a body money stop raised by one author call while 6 other calls are in flight → no AUTHOR or REVIEW request starts after the stop, the in-flight calls finish, nodes whose panels completed are saved (a panel cut by its own money refusal follows today's rule), the answer is served, and every chain has settled when the run ends; (b) too few members left (two makers become busy) with calls in flight → same; (c) keep-alive time limit while 5 calls are in flight → the work item ends with today's code within 1 s of the stop and no unhandled rejection is reported (vitest fails on unhandled rejections; keep that default); (d) a recorder write that throws (inject a failing `recordReduced` once) → the run fails with that code and does not hang.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4:** run the integration file and `tests/integration/preview-busy-model-run.test.ts` → PASS.
- [ ] **Step 5: Commit** `Runner: stops keep paid answers; a lost claim abandons calls cleanly`.

---

### Task 13: New-debate page and live view

**Files:**
- Modify: `apps/ui/app/new/NewDebatePageClient.tsx` (state `branching` :154 and `concurrency` :155; SliderRows ~:498-517; `choosePlanTier` reset ~:227-240), `apps/ui/messages/*/newDebate.json` (35 locales: delete `branching`, `branchingHint`, `concurrency`, `concurrencyHint`; rewrite `legacyNotice` to name only Depth mode, Depth of scrutiny and Max tokens), `apps/ui/lib/phoneCompletionDraft.ts` (stop writing `branching`/`concurrency`; accept old drafts that still carry them), `apps/ui/app/debate/[id]/DebatePageClient.tsx` (~:171-174: a `node.retrying` clears the page error only when it belongs to the same node that set it)
- Test: `tests/render/*` cases for the options panel (find the existing /new render test); a unit test for the draft parser; a unit test for the event consumer banner rule.

English `legacyNotice` text: "Depth mode, depth of scrutiny and max tokens are not sent yet: the new engine does not use them." Keep the existing key and sentence structure; other locales translated with the same meaning (Global Constraints: Haiku translators by language group + Opus spot-check).
- [ ] **Step 1: Failing tests** (render: the two controls are absent and the note's English text matches; draft: an old draft with `branching: 2, concurrency: 3` still parses and a new draft has neither key; banner: failure on node A, retry on node B → error still shown; retry on node A → cleared).
- [ ] **Step 2: FAIL. Step 3: Implement** (UI + 35 message files; run the i18n key-parity test the repo has for message files — find it with `grep -rl "newDebate" tests/unit | head`).
- [ ] **Step 4:** run the render test file and the unit files → PASS.
- [ ] **Step 5: Commit** `New-debate page: remove Concurrency and Branching width; a retry no longer hides another step's failure`.

---

### Task 14: Practice tool — the setting and the report

**Files:**
- Modify: `tools/preview-practice/practice.ts` (flag), `tools/preview-practice/practice-debate.ts` (pass the policy), `tools/preview-practice/practice-runner-composition.ts` (policy input), `tools/preview-practice/practice-report.ts` (stats), `tools/preview-practice/README.md`
- Test: `tests/unit/preview-practice.test.ts` (flag parsing, report fields)

- `--call-concurrency <perDebate>/<perModelPerDebate>/<vendor>=<n>,…` e.g. `12/3/default=50,deepinfra=150,anthropic=50`; absent → the row from the imported register export if present, else one at a time. The policy is handed to `composePracticeRunner` directly (nothing is written to any live register).
- The report adds per run: `peakInFlight`, `peakByModel`, `waitedMsByModel` (lane stats), scheduler `peakByGate`, and per model the number of busy probes (count `PROBE` turns via a counting wrapper around the coordinator).
- README: replace "Debate mode is unchanged: the runner sends one call at a time" with the new behaviour and the flag; keep the budget notes.
- [ ] **Step 1: Failing unit tests** for the flag parser (valid, invalid forms) and the report's new fields (from a fake lane stats object).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS** + `tests/unit/preview-practice-wiring-drift.test.ts`.
- [ ] **Step 5: Commit** `Practice: --call-concurrency and parallel stats in the report`.

---

### Task 15: Owner runbook

**Files:**
- Modify: `deploy/vps/register/README.md` (how to publish `callConcurrencyPolicy` on hosted), the preview v2 kit's README (how to include the row), `deploy/preview-gate/v3/README.md` (Task 4's note, checked)
- [ ] **Step 1:** Write the steps in plain words: values, the new-version rule (never edit), restart order (register publish → `REGISTER_VERSION` → API then runner), and how to turn it off (publish a version without the row).
- [ ] **Step 2: Commit** `Runbook: publishing the call-concurrency row and redeploying the gate`.

---

## After the tasks (orchestrator, not a subagent task)

1. Whole-branch review (Opus). 2. `pnpm run typecheck`, `pnpm run test:ci-gate`, then each touched integration suite, one at a time. 3. Practice measurement on the real gates (spec §5). 4. Merge latest origin/dev, re-run, push, PR to dev with Auto-fix; report to the owner.

---

### Task 16: The preview operator path carries the call-concurrency row (plan amendment, controller ruling R18)

Task 15 found that the preview's real publish path cannot carry the row: `deploy/preview-auth-dev/v1/native-operator.mjs` `validateNativePlan` accepts only `checkerChoice` and `roleRotation` as optional plan keys and calls `publisher.buildPreviewSourceRowsV2(…, plan.checkerChoice, plan.roleRotation)` without the policy, and `deploy/preview-release/v1/release-artifacts.mjs native-plan` has no option for it.

**Files:**
- Modify: `deploy/preview-auth-dev/v1/native-operator.mjs`, `deploy/preview-auth-dev/v1/publish-register-v2.ts` (only if `buildPreviewSourceRowsV2` needs its policy parameter position adjusted), `deploy/preview-release/v1/release-artifacts.mjs`, `deploy/preview-release/v1/README.md`, `deploy/preview-auth-dev/v1/README.md` (replace the "Not wired yet" bullet with the real steps)
- Test: the existing unit tests of these modules (find them: `grep -rln "validateNativePlan\|release-artifacts" tests | head`)

Rules (mirror `checkerChoice` exactly):
- Native plan optional key `callConcurrency`: an object `{ perDebate, perModelPerDebate, perModelPerRunner }` (exact keys; integers; perModelPerRunner an object with a `default`); allowed only when `operation` is `plan` or `publish`; otherwise `PREVIEW_NATIVE_PLAN_REFUSED`. The publisher validates it again with `callConcurrencyPolicyFromValue` before building the row.
- `runNativeOperator` passes `plan.callConcurrency` through to `buildPreviewSourceRowsV2` so the row is in the composed snapshot (and therefore in the owner-reviewed delta).
- `release-artifacts.mjs native-plan` gains optional `--call-concurrency '<json>'` (a JSON object as above), allowed only with `--operation plan`; `publish` carries the value over from the `--from` plan exactly as `checkerChoice` is carried.
- Preview off switch stays the value form (R6): `{"perDebate":1,"perModelPerDebate":1,"perModelPerRunner":{"default":1000}}`.
- [ ] Step 1: failing tests (plan accepts the key on plan/publish, refuses it on apply-and-plan/verify and on a malformed value; release tool writes it on plan and carries it on publish; native operator passes it to the builder — use the module's existing test seams).
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS (+ any README-reading tests). Step 5: commit `Preview operator: a native plan can carry the call-concurrency row`.

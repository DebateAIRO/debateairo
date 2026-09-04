# FIX-09 C2 Listener Fold Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` while implementing each task, and `superpowers:verification-before-completion` before every commit and handoff.

**Goal:** Build the authorized C2 listener so committed occurrences are folded exactly once into composite-versioned incidents, every row receives a durable terminal receipt, priority processing cannot skip the cursor, and a standby daemon takes over after leader loss.

**Architecture:** A dedicated `pg.Client` owns LISTEN and a session advisory lock. NOTIFY and the periodic timer only wake a serialized reconcile loop. That loop selects one unacked occurrence in severity/time/sequence order and executes classification, aggregate recomputation or typed terminal receipt, ACK, and contiguous cursor advancement in one transaction. Migration 0062 changes only incident uniqueness and the transactional wake publisher; the existing delivery/action/health tables carry C2 durability.

**Tech stack:** TypeScript, `pg`, PostgreSQL migration SQL, Vitest, the repository's embedded PostgreSQL test fixture, Drizzle declarations for schema parity.

**Spec:** `docs/missions/observability-agents/slices/FIX-09/SPEC-v2.md`

## Global constraints

- Start from `daa8908d` or a descendant whose C1 artifacts and interfaces are byte-identical. The allocation recheck covers later migration claims even when their commits are not ancestors of the C1 worktree.
- Create or edit only the nine paths in SPEC-v2 §4. Do not edit C1, a prior migration, a package manifest, a lockfile, or a standing test.
- The daemon may import `pg` and Node standard-library modules only. It may not import `@debateai/db`, a provider/model/CLI module, `child_process`, or any product package.
- Do not query `occurrence_detail`, `identity.*`, raw `core.run`, or `observation.defect_signal_v`.
- Do not call `TracerHook`, populate `DispatchArm`, evaluate a tier, notify a human, write a board, dispatch work, or mutate product code.
- COMMON §4's vocabulary ban applies to every authored step and criterion.
- Use no Hermes command or state.
- Stop on any SPEC-v2 §6 condition. Do not choose a new migration number without a successor authority packet.

## Exact file ledger

| Path | Act | Task |
|---|---|---|
| `migrations/0062_fix09_listener_fold.sql` | create | 1 |
| `packages/db/src/obs-schema.ts` | edit schema parity only | 1 |
| `tools/obs-listener/src/daemon/intake.ts` | create | 2 |
| `tools/obs-listener/src/daemon/fold.ts` | create | 2–3 |
| `tools/obs-listener/src/daemon/poison.ts` | create | 3 |
| `tools/obs-listener/src/daemon/cursor.ts` | create | 3 |
| `tools/obs-listener/src/daemon/main.ts` | create | 4 |
| `tests/unit/fix09-fold.test.ts` | create | 2 |
| `tests/integration/fix09-daemon.test.ts` | create, extend | 1, 3–4 |

No other path is a C2 write target.

## Task 0: Revalidate dispatch authority

**Files:** none.

- [ ] Confirm the implementation branch contains C1 commit `daa8908d`, and compute the C1 bundle/interface bytes. Compare them with the C1 PASS packet and canonical hash `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- [ ] Enumerate every local/remote ref and every registered worktree. Search tracked and untracked migration filenames plus mission plan/document claims for `0050` through `0062`.
- [ ] Confirm the allocation ledger is still: Support paper reservations `0050`–`0054`; Support `0055`; Security `0056`; Observation `0057`–`0060`; FIX-01 `0061`; this successor packet is the sole `0062` paper claim; no `0062` migration file or competing claim exists.
- [ ] Confirm migration 0034 still exposes the grants and constraints quoted by SPEC-v2 §3, and confirm 0061 remains allocated to FIX-01 in the audited refs/worktrees.
- [ ] Record the commands, ref count, worktree count, matches, C1 hash, and HEAD in the C2 handoff. If any comparison fails, STOP before the RED test.

## Task 1: Allocate the composite identity and wake publisher

**Files:** create `migrations/0062_fix09_listener_fold.sql`; edit `packages/db/src/obs-schema.ts`; create the migration section of `tests/integration/fix09-daemon.test.ts`.

### Step 1.1 — Write the migration contract RED

- [ ] Start embedded PostgreSQL from the existing integration fixture and apply the full migration chain.
- [ ] Assert `obs.incident` accepts the same fingerprint at versions 1 and 2, rejects a duplicate version-1 pair, and exposes the exact constraint `incident_fingerprint_fingerprint_version_key` on `(fingerprint, fingerprint_version)`.
- [ ] Assert `information_schema.columns.column_default` for `obs.occurrence.occ_seq` contains `obs.occurrence_seq_nextval_notify`.
- [ ] Assert the non-internal trigger names on `obs.occurrence` equal the pre-0062 set. No new trigger is allowed.
- [ ] As `debateai_obs_writer`, insert an occurrence without `occ_seq` and assert it receives a positive sequence. As `debateai_obs_listener`, assert execution of the new function is denied.
- [ ] Assert the 0034 listener grants remain byte-for-byte equivalent as a sorted `information_schema.role_table_grants` projection.
- [ ] Run the focused file and retain the failing assertions.

```bash
out=$(pnpm exec vitest run tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

### Step 1.2 — Write the narrow migration

- [ ] Implement only this shape, with the repository's migration transaction convention:

```sql
ALTER TABLE obs.incident
  DROP CONSTRAINT incident_fingerprint_key,
  ADD CONSTRAINT incident_fingerprint_fingerprint_version_key
    UNIQUE (fingerprint, fingerprint_version);

CREATE FUNCTION obs.occurrence_seq_nextval_notify()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog
AS $function$
DECLARE
  next_seq bigint;
BEGIN
  next_seq := pg_catalog.nextval('obs.occurrence_seq'::pg_catalog.regclass);
  PERFORM pg_catalog.pg_notify('obs_occurrence_inserted', next_seq::text);
  RETURN next_seq;
END;
$function$;

REVOKE ALL ON FUNCTION obs.occurrence_seq_nextval_notify() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION obs.occurrence_seq_nextval_notify() TO debateai_obs_writer;
ALTER TABLE obs.occurrence
  ALTER COLUMN occ_seq SET DEFAULT obs.occurrence_seq_nextval_notify();
```

- [ ] Mirror the default and composite uniqueness in Drizzle. The intended declaration shape is:

```ts
occSeq: bigint("occ_seq", { mode: "bigint" })
  .notNull()
  .default(sql`obs.occurrence_seq_nextval_notify()`)
  .unique()

unique("incident_fingerprint_fingerprint_version_key")
  .on(table.fingerprint, table.fingerprintVersion)
```

- [ ] Remove only `.unique()` from the incident fingerprint column; keep every other declaration unchanged.
- [ ] Run the migration contract and the standing foundation test. Inspect the SQL diff and fail if it includes any object or privilege outside SPEC-v2 §3.

```bash
out=$(pnpm exec vitest run tests/integration/fix09-daemon.test.ts tests/integration/obs-l1-s01-foundation.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +2 passed \(2\)$'
```

### Step 1.3 — Commit the migration slice

- [ ] Run `git diff --check`, inspect the staged path list, then commit only the three Task 1 paths.

```bash
git commit -m "feat(listener): FIX-09 C2.1 — composite incidents and transactional wake"
```

## Task 2: Freeze pure intake, identity, eligibility, and state logic

**Files:** create `tools/obs-listener/src/daemon/intake.ts`, `tools/obs-listener/src/daemon/fold.ts`, and `tests/unit/fix09-fold.test.ts`.

### Step 2.1 — Write table-driven RED cases

- [ ] Define fixtures without free-form diagnostic content: scheduler `JOB_FAILURE`; lifecycle `STARTED`, `SUCCEEDED`, and `NOOP`; detector with and without location; first-party/hatchet/UI sources; declared UUID pairs; sentinel and mixed reference pairs; each severity; each transition state.
- [ ] Assert the intake union contains exactly `ACCEPT`, the two skip codes, and the seven poison codes from SPEC-v2 §2.3.
- [ ] Assert `[7]` frames produce `POISON_INVALID_FRAMES`, an unsafe `occ_seq` produces `POISON_UNSAFE_OCC_SEQ`, and invalid timestamps/components/closed values map to their exact typed codes.
- [ ] Assert `JOB_FAILURE` with code `OBS_SCHEDULER_JOB_FAILED` is accepted while all `JOB_LIFECYCLE` fixtures are skipped.
- [ ] Assert a detector row is accepted only when both `component.package` and `component.call_site_key` are non-empty strings.
- [ ] Assert work-unit JSON is `["DECLARED_PAIR",run,work]` only for two canonical lowercase UUIDs and `["SOURCE_EVENT",source,source_event_ref]` for every other fixture.
- [ ] Fold five specified occurrences into three composite incidents. Assert repeated declared work counts once, separate scheduler source events count separately, source order is fixed, severity/time extrema are exact, and recomputing the same input is byte-identical.
- [ ] Assert `["ui_client"]` derives `FIX_INELIGIBLE`; every other source set derives `FIX_ELIGIBLE`.
- [ ] Generate the Cartesian product of all persisted states and assert only SPEC-v2 §2.4's edges return true. Assert proposal denial and FIXING denial map to `PARKED`, invalid proposal maps to `TICKETED`, kill/lease revocation maps from `FIXING` to `APPROVED`, and `PR_PRESENTED` is not a state.
- [ ] Run the focused file and retain the failures.

```bash
out=$(pnpm exec vitest run tests/unit/fix09-fold.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

### Step 2.2 — Implement closed pure functions

- [ ] Export these contracts from the two modules, with readonly values and no I/O in their bodies:

```ts
export type IntakeResult =
  | { readonly kind: "ACCEPT"; readonly occurrence: OccurrenceRecord }
  | { readonly kind: "SKIP"; readonly reason: SkipReason }
  | { readonly kind: "POISON"; readonly reason: PoisonReason };

export type WorkUnitKey =
  | readonly ["DECLARED_PAIR", string, string]
  | readonly ["SOURCE_EVENT", OccurrenceSource, string];

export function decodeOccurrence(row: unknown): IntakeResult;
export function workUnitKey(row: OccurrenceRecord): WorkUnitKey;
export function fixEligibility(sourceSet: readonly OccurrenceSource[]):
  "FIX_ELIGIBLE" | "FIX_INELIGIBLE";
export function foldIncident(rows: readonly OccurrenceRecord[]): IncidentAggregate;
export function isLegalTransition(from: IncidentState, to: IncidentState): boolean;
```

- [ ] Use explicit ASCII/enum comparison and numeric severity ranks. Do not use locale comparison or object-key iteration as ordering authority.
- [ ] Keep `foldIncident` independent from PostgreSQL and preserve incident state outside the aggregate return type.
- [ ] Run the focused file three times. Flip one legal edge and one UUID fixture, see RED, then restore.

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/unit/fix09-fold.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +1 passed \(1\)$' || exit 1; done
```

### Step 2.3 — Commit the pure slice

- [ ] Run `git diff --check`, inspect staged paths, then commit only the three Task 2 paths.

```bash
git commit -m "feat(listener): FIX-09 C2.2 — deterministic intake and fold"
```

## Task 3: Make each occurrence one atomic delivery

**Files:** edit `tools/obs-listener/src/daemon/fold.ts`; create `tools/obs-listener/src/daemon/poison.ts` and `tools/obs-listener/src/daemon/cursor.ts`; extend `tests/integration/fix09-daemon.test.ts`.

### Step 3.1 — Write transactional RED cases

- [ ] Insert an accepted row. Run one delivery transaction and assert one composite incident, one ACK, and a cursor at the greatest acknowledged boundary.
- [ ] Run the same delivery again and assert no aggregate, ACK, action, or cursor change.
- [ ] Insert two unacked accepted rows with one composite identity. Deliver only the newer severe row and assert the incident excludes the older row until that older row receives its own delivery transaction.
- [ ] Insert a lifecycle row and detector-without-location row. Assert each appends exactly one `FIXAGENT_SKIPPED` action with the closed schema/reason/decimal-sequence payload, then ACKs.
- [ ] Insert a database-valid occurrence with `frames='[7]'::jsonb`. Assert one `FIXAGENT_DEAD_LETTER`, one ACK, `component_health('fixagent-daemon') = POISON`, and no incident.
- [ ] Insert a later valid occurrence and assert it folds and ACKs while POISON remains set.
- [ ] Inject an SQL error between classification and ACK. Assert the transaction leaves no incident/action/ACK/cursor change and that a second attempt can commit.
- [ ] Create an older INFO row and newer FATAL row. Deliver FATAL first; assert the cursor remains below the older row. Deliver INFO; assert the cursor advances through both, including sequence gaps.
- [ ] Seed the same fingerprint at versions 1 and 2 and assert two incidents; seed the same pair twice and assert one.
- [ ] Run the focused integration file and retain the failures.

### Step 3.2 — Implement the repository transaction

- [ ] Export a single transaction entry point:

```ts
export interface DeliveryOutcome {
  readonly occurrenceId: string;
  readonly occSeq: bigint;
  readonly result: "FOLDED" | "SKIPPED" | "DEAD_LETTERED" | "ALREADY_ACKED";
  readonly cursor: bigint;
}

export async function deliverOccurrence(
  client: Pick<PoolClient, "query">,
  occurrenceId: string
): Promise<DeliveryOutcome>;
```

- [ ] Start the transaction before rechecking ACK. Lock the selected occurrence row; return `ALREADY_ACKED` if its ACK exists.
- [ ] For `ACCEPT`, select the current occurrence plus same-composite occurrences already ACKed by `fixagent-daemon`, apply `decodeOccurrence`, retain only accepted rows, compute the pure aggregate, and upsert the incident. An unacked occurrence must not enter this transaction's aggregate. Update aggregate columns only; preserve workflow columns.
- [ ] For skip/dead-letter, append the deterministic action only when its `action_ref` does not exist. Payload keys and values must match SPEC-v2 §2.5 exactly.
- [ ] Append ACK after fold/action. Use the deterministic lease reference and `max(attempt_index)+1` for that consumer/occurrence.
- [ ] Advance the cursor with the smallest-unacked-boundary query in the same transaction. Apply `GREATEST(current, candidate)` in the update.
- [ ] Roll back every thrown SQL error. Never turn an operational error into a poison receipt.
- [ ] Run the integration file three times. Move ACK before fold and verify the crash-injection case turns RED; restore.

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +1 passed \(1\)$' || exit 1; done
```

### Step 3.3 — Commit the transaction slice

- [ ] Run `git diff --check`, inspect staged paths, then commit only the four Task 3 paths.

```bash
git commit -m "feat(listener): FIX-09 C2.3 — atomic delivery, dead-letter, and cursor"
```

## Task 4: Drive delivery from LISTEN, polling, and one leader

**Files:** create `tools/obs-listener/src/daemon/main.ts`; extend `tests/integration/fix09-daemon.test.ts`.

### Step 4.1 — Write daemon-loop RED cases

- [ ] Reject missing/empty `OBS_LISTENER_DATABASE_URL` and any missing, zero, negative, fractional, unsafe, or non-decimal `OBS_LISTENER_POLL_INTERVAL_MS` value.
- [ ] Instrument the client factory and assert every initial connection and reconnect issues `LISTEN obs_occurrence_inserted` before advisory leadership or reconciliation.
- [ ] Set the poll interval beyond the test deadline, insert through `debateai_obs_writer`, and assert the notification wakes delivery before that interval.
- [ ] Suppress one notification, keep the daemon alive, and assert the next periodic poll finds and delivers the row.
- [ ] Send empty, negative, zero, fractional, alphabetic, and unsafe-integer payloads. Assert no payload-keyed occurrence query occurs and the daemon remains alive.
- [ ] Queue simultaneous notification/timer callbacks around a mixed backlog. Assert processing order is FATAL, SEVERE, DEGRADED, INFO, then `occurred_at`, then `occ_seq`, and observed in-flight count is exactly `1`.
- [ ] Start two daemons. Assert one advisory leader, one incident fold, and one ACK. Terminate the leader connection, insert a second row, and assert the standby acquires leadership on a poll tick and delivers it once.
- [ ] Force a leader connection error. Assert processing stops on that client, a fresh client is created after one injected interval, LISTEN occurs first, and durable reconciliation completes pending work.
- [ ] Run the focused integration file and retain the failures.

### Step 4.2 — Implement the serialized lifecycle

- [ ] Export configuration and lifecycle seams:

```ts
export interface DaemonConfig {
  readonly databaseUrl: string;
  readonly pollIntervalMs: number;
  readonly consumer: "fixagent-daemon";
}

export interface DaemonControl {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function readDaemonConfig(env: NodeJS.ProcessEnv): DaemonConfig;
export function createDaemon(config: DaemonConfig, clients: ClientFactory): DaemonControl;
```

- [ ] Use one dedicated connected `pg.Client` per daemon generation. Issue LISTEN, install `notification`/`error`/`end` callbacks, then try the exact session advisory lock from SPEC-v2 §2.6.
- [ ] Let callbacks set one coalesced wake flag. A single awaited loop drains one pending row per transaction until none remains; callback bodies never call `deliverOccurrence` directly.
- [ ] Query pending rows with `NOT EXISTS` ACK and exact rank/time/sequence ordering. Use `LIMIT 1` because the concurrency cap is one.
- [ ] Let a standby retry the advisory lock every poll interval. On promotion, reconcile before waiting for another notification.
- [ ] On `error` or `end`, detach the failed generation, reset local leader state, wait one injected interval, create a new client, and restart at LISTEN. Ignore late callbacks from prior generations.
- [ ] Parse notification payload only to accept or reject a wake hint. Do not place it in SQL parameters.
- [ ] Make `stop()` cancel timers, detach callbacks, release/end the live client, and await the serialized loop so tests leave no open resources.
- [ ] Run the integration file three times. Remove the advisory lock and see the two-daemon assertion turn RED; restore.

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +1 passed \(1\)$' || exit 1; done
```

### Step 4.3 — Run C2 authority scans

- [ ] Confirm the only daemon production imports resolve to `pg`, Node standard library, or another C2 daemon module.
- [ ] Confirm zero forbidden schema/module strings in C2 production source, and confirm `dispatch-arm.ts`, `tracer-hook.ts`, policy bytes, fixtures, and bundle hash did not change.
- [ ] Confirm the migration diff contains one function, one replaced constraint, one replaced default, and one function grant; confirm no new occurrence trigger.

```bash
out=$(rg -n "occurrence_detail|identity\\.|core\\.run|observation\\.defect_signal_v|@debateai/db|child_process|providers|hermes|DispatchArm|TracerHook" tools/obs-listener/src/daemon/{main,intake,fold,cursor,poison}.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 1
```

### Step 4.4 — Run the final local evidence set

- [ ] Run the focused C2 unit/integration pair three times, then the standing S01 foundation suite, the C1 suite, and typecheck. Capture each exit code and exact pass summary. The worst repetition is the C2 result.

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/unit/fix09-fold.test.ts tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +2 passed \(2\)$' || exit 1; done
out=$(pnpm exec vitest run tests/integration/obs-l1-s01-foundation.test.ts tests/unit/fix09-bundle.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +2 passed \(2\)$'
out=$(pnpm typecheck 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
```

- [ ] Do not run or mark frozen SPEC §5's production/launchd acceptance. Report it as pending V.

### Step 4.5 — Commit and hand off C2

- [ ] Run `git status --short`, `git diff --check`, and `git diff --stat daa8908d...HEAD`. Stage only the exact C2 ledger paths.
- [ ] Commit the daemon loop and final integration changes.

```bash
git commit -m "feat(listener): FIX-09 C2.4 — LISTEN leader reconciliation loop"
```

- [ ] Handoff includes: all four C2 SHAs; final HEAD; base C1 hash; repeated allocation counts/matches; migration object/grant inventory; three focused run summaries; standing/C1/typecheck summaries; static-scan output; and an explicit statement that V acceptance remains unperformed.

## Requirements trace

| Successor contract | Task evidence |
|---|---|
| composite incident identity and migration parity | Task 1 |
| LISTEN channel and transactional publisher | Tasks 1, 4 |
| intake, scheduler fallback, detector boundary | Task 2 |
| derived FIX_INELIGIBLE | Task 2 |
| newer closed state edges | Task 2 |
| existing-schema ACK/skip/dead-letter durability | Task 3 |
| cursor-after-terminal-receipt invariant | Task 3 |
| severity/age order and cap one | Task 4 |
| multi-daemon leadership and callback serialization | Task 4 |
| polling, payload distrust, reconnect | Task 4 |
| listener/writer role authority | Tasks 1, 3–4 |
| no-model/no-db-package/no-sensitive-query/C1 preservation | Task 4 |

Frozen R01/R02 stay satisfied by C1. Frozen R05/R07 are C3. Frozen R08–R10 are C4. Frozen R11/R12 remain global constraints. Frozen R13 remains V-owned; this plan records no V production act or Done verdict.

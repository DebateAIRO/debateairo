# FIX-09 C2 — Authorized listener intake, delivery, fold, and cursor contract

**Successor authority packet — 2026-09-04, architecture seat.** This document supersedes the frozen `SPEC.md` only for C2 and for the C2-dependent wording in R03, R04, R06, §3, §5 item 4, and §7. The rest of the frozen specification remains binding. The source-backed corrections below are authorized by V's broad correction instruction; they do not record a V production run, veto, or acceptance.

**Entry gate:** C1 PASS at `daa8908d`, with the C1 policy bytes, canonical bundle hash `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`, `TracerHook`, and empty `DispatchArm` unchanged. C2 is a deterministic PostgreSQL listener and contains no model, trace, ticket, tier-gate, notification, watchdog, launchd, dispatch, or mutation implementation.

## 1. Source reconciliation

C2 previously had no lawful implementation because the frozen specification, live plan, and migration 0034 did not agree. This successor makes the following source-backed rulings:

1. The newer live-plan incident chain wins over frozen R04's older ordering. The chain is frozen below as a closed edge set.
2. Migration 0034's `UNIQUE (fingerprint)` is too narrow for the already-ruled incident identity `(fingerprint, fingerprint_version)`. C2 receives one narrow migration to replace that constraint.
3. Migration 0034 already supplies append-only `obs.delivery` and `obs.agent_action`. They carry ACK and typed skip/dead-letter receipts; no queue or dead-letter table is added.
4. `FIX_INELIGIBLE` is a derived incident property. Persisting it would duplicate `source_set` and could become stale.
5. A declared UUID run/work-item pair is the work unit. Rows without that pair use their already-unique source event identity, so scheduler one-shots and other unknown-reference rows do not collapse into one unit.
6. PostgreSQL notification is a wake hint. A transaction-aware sequence-default function publishes the exact channel without adding an occurrence trigger, because the standing S01 foundation test freezes the occurrence trigger inventory.
7. One active daemon owns folding. PostgreSQL session advisory leadership plus process-local serialization closes both multi-daemon and callback races.

Rejected alternatives are: concatenating fingerprint and version into one text value; adding a durable eligibility flag; adding a second queue/dead-letter table; counting sentinel run/work strings as one global unit; trusting NOTIFY payloads as work; adding an occurrence trigger and rewriting another slice's standing test; or permitting concurrent incident writers in C2.

## 2. Closed contracts

### 2.1 Incident identity and aggregate

There is exactly one `obs.incident` row for each `(fingerprint, fingerprint_version)` pair. In the current delivery transaction, C2 recomputes the aggregate from the current accepted occurrence plus previously ACKed accepted occurrences for that pair, then upserts against the composite unique constraint. An unacked occurrence is not folded by another occurrence's transaction. After the backlog drains, the incident equals a projection of all accepted occurrences for the pair. A replay, reconnect, duplicate wake hint, or crash retry produces the same aggregate.

The recomputed columns are:

- `first_seen_at = min(occurred_at)`;
- `last_seen_at = max(occurred_at)`;
- `distinct_work_unit_count = cardinality(distinct workUnitKey(row))`;
- `max_severity` by `FATAL > SEVERE > DEGRADED > INFO`;
- `source_set` as a duplicate-free JSON array ordered `first_party`, `hatchet`, `ui_client`.

An existing incident's `state`, `cooldown_until`, `attributed_landing_ref`, and `lineage_depth` are not reset by recomputation. A newly inserted incident starts in `NEW`.

`FIX_INELIGIBLE` is derived as:

```text
fixEligibility(source_set) = FIX_INELIGIBLE iff source_set == ["ui_client"]
                             FIX_ELIGIBLE otherwise
```

Thus a UI-only incident cannot enter a fix path. If later first-party or Hatchet evidence joins the same composite identity, the recomputed mixed source set becomes eligible. C2 stores no eligibility column, state, action, or free-text label.

### 2.2 Work-unit identity

The key is a structured JSON tuple, never a delimiter-joined string:

```text
if run_ref and work_item_ref are canonical lowercase UUIDs:
  ["DECLARED_PAIR", run_ref, work_item_ref]
else:
  ["SOURCE_EVENT", source, source_event_ref]
```

Both values must be canonical UUIDs for the first branch. This makes `NOT_APPLICABLE`, `UNKNOWN:DECLARED_KIND_REQUIRED`, mixed known/unknown pairs, and any other non-UUID declaration use the fallback. Migration 0034's `UNIQUE (source, source_event_ref)` makes that fallback stable. Retries carrying the same declared pair count once; scheduler or other one-shot rows without the pair count once per source event.

### 2.3 Intake result

Every decoded occurrence has exactly one result:

- `ACCEPT`: a defect row that participates in the incident aggregate;
- `SKIP_NON_DEFECT_JOB_LIFECYCLE`: taxonomy `JOB_LIFECYCLE` (including `STARTED`, `SUCCEEDED`, and `NOOP`) is not a defect;
- `SKIP_DETECTOR_LOCATION_MISSING`: a `capture_point='detector'` row whose `component` lacks non-empty `package` and `call_site_key` fields;
- `POISON_<reason>`: a row selected from PostgreSQL cannot be converted to the closed `OccurrenceRecord` type. Reason codes are `UNSAFE_OCC_SEQ`, `INVALID_TIMESTAMP`, `INVALID_COMPONENT`, `INVALID_FRAMES`, `INVALID_SOURCE`, `INVALID_SEVERITY`, and `INVALID_IDENTITY`.

The FIX-01 scheduler failure remains taxonomy `JOB_FAILURE` even when its code is `OBS_SCHEDULER_JOB_FAILED`; it is accepted. C2 reads `obs.occurrence` only. It preserves the detector filter for a future lawful producer but does not query `observation.defect_signal_v` or create a detector transport.

`frames` must decode as an array of data-only JSON objects; a value such as `[7]` is a valid database array but is `POISON_INVALID_FRAMES` at this boundary. Poison classification never copies messages, SQL text, stack text, absolute paths, or arbitrary JSON into a receipt.

### 2.4 Closed incident transitions

The legal directed edges are exactly:

```text
NEW               -> RESEARCHING
RESEARCHING       -> TICKETED | PROPOSED | ESCALATED
TICKETED          -> RESEARCHING
PROPOSED          -> APPROVED | TICKETED | PARKED
APPROVED          -> FIXING
FIXING            -> FIXED_UNVALIDATED | PARKED | APPROVED
FIXED_UNVALIDATED -> FIXED_VALIDATED | REGRESSED
FIXED_VALIDATED   -> REGRESSED
REGRESSED         -> ESCALATED
ESCALATED         -> (none)
PARKED            -> (none)
```

The `RESEARCHING -> TICKETED` edge is FIX-11's trace act; `RESEARCHING -> PROPOSED` is FIX-12's worker act. The database stores the shared `RESEARCHING` state, and the later workflow caller owns which named act it invokes. Proposal denial is `PROPOSED -> PARKED`; an invalid proposal is `PROPOSED -> TICKETED`. In FIX-13, V denial is `FIXING -> PARKED`, kill/lease revocation is `FIXING -> APPROVED`, and V merge is `FIXING -> FIXED_UNVALIDATED`; `PR_PRESENTED` stays an `obs.agent_action`, not an incident state. FIX-14 owns validation/regression, with a second recurrence ending `REGRESSED -> ESCALATED`. No caller may infer an unlisted edge. C2 exports and tests the state-level transition predicate but only creates `NEW` incidents; later slices own the state-changing acts.

### 2.5 Durable delivery, skip, and poison receipts

The consumer id is the literal `fixagent-daemon`.

An occurrence is pending iff there is no `obs.delivery` row with the same `occurrence_id`, `consumer='fixagent-daemon'`, and `delivery_status='ACKED'`. Each occurrence is processed in one database transaction:

1. decode and classify the occurrence;
2. for `ACCEPT`, recompute/upsert its incident;
3. for a skip, append one `obs.agent_action` with `action_kind='FIXAGENT_SKIPPED'`, deterministic `action_ref='fixagent-skip:<occurrence_id>'`, and payload `{schema:'fixagent-skip/v1', reason:<closed skip code>, occ_seq:<decimal string>}`;
4. for poison, append one `obs.agent_action` with `action_kind='FIXAGENT_DEAD_LETTER'`, deterministic `action_ref='fixagent-dead-letter:<occurrence_id>'`, and payload `{schema:'fixagent-dead-letter/v1', reason:<closed poison code>, occ_seq:<decimal string>}`, then upsert `obs.component_health('fixagent-daemon')` to `state='POISON'` with a closed `detail_code` equal to the poison reason;
5. append one ACK delivery receipt, using deterministic `lease_ref='fixagent-daemon:<occurrence_id>'` and the next non-negative attempt index for that consumer/occurrence;
6. advance the cursor as specified in §2.7;
7. commit.

Before appending a skip/dead-letter or ACK, the transaction checks for its deterministic prior receipt. A crash before commit leaves none of the fold, receipt, or cursor changes. A crash after commit finds the ACK and does not repeat the work. Database connection, serialization, and SQL errors roll back and remain pending; they are not misclassified as poison.

The append-only dead-letter action is the durable poison representation. `component_health=POISON` is the current liveness signal and is not a substitute for that receipt. C2 does not clear POISON merely because a later occurrence succeeds. Human delivery of the typed reason remains FIX-12 scope.

### 2.6 Backlog order and concurrency

The leader selects one pending occurrence at a time with this total order:

```text
severity rank: FATAL, SEVERE, DEGRADED, INFO
then occurred_at ASC
then occ_seq ASC
```

The C2 concurrency cap is exactly `1`. Notification callbacks, timer callbacks, startup, and reconnect all set a coalesced wake flag; none calls the processor concurrently. This cap is deliberate because `obs.incident` has mutable aggregates and C2 needs no parallel worker lease protocol.

Every dedicated `pg.Client` session executes:

```sql
SELECT pg_try_advisory_lock(hashtextextended('fixagent-daemon', 0));
```

Only the session returning `true` may reconcile or process. A standby remains connected and listening, and retries leadership on every poll tick. The session lock is released by PostgreSQL when its connection dies. Process-local serialization still applies to the leader. Two live daemon processes therefore cannot fold concurrently; after leader loss, a standby takes over and reconciles from durable receipts.

### 2.7 Cursor invariant

`obs.consumer_cursor('fixagent-daemon').last_occ_seq` is monotonic. It denotes the greatest sequence boundary such that every occurrence row at or below that boundary has an ACK for this consumer. Priority processing may ACK a high-severity later row first while the cursor remains behind an older pending row.

After each ACK, within the same transaction, C2 computes the smallest unacked `occ_seq` above the current cursor. If one exists, the new cursor is `smallest_unacked - 1`; otherwise it is the greatest existing `occ_seq`, or the current cursor when the occurrence table is empty. Sequence gaps from rollbacks or conflict attempts are boundaries, not missing work. The cursor never moves from a wake payload and never moves past an unacked occurrence.

### 2.8 LISTEN, publisher, polling, and reconnect

The exact channel is `obs_occurrence_inserted`. The publisher is migration 0062's `obs.occurrence_seq_nextval_notify()` default function:

```sql
next_seq := nextval('obs.occurrence_seq'::regclass);
PERFORM pg_notify('obs_occurrence_inserted', next_seq::text);
RETURN next_seq;
```

PostgreSQL delivers the notification only if the inserting transaction commits. A conflict attempt can consume a sequence and emit a false wake, which is safe because the payload is never work authority. Migration 0062 grants function execution only to `debateai_obs_writer`; it adds no trigger and no listener write privilege.

`OBS_LISTENER_DATABASE_URL` is required and must establish a direct session as `debateai_obs_listener`. `OBS_LISTENER_POLL_INTERVAL_MS` is also required and must parse as an integer greater than zero. C2 supplies no production default; C4 owns the launch configuration and any later V-ratified duration.

For startup and every reconnect the order is:

```text
connect -> LISTEN obs_occurrence_inserted -> acquire/retry leadership -> reconcile receipts/cursor -> process -> idle
```

A notification payload is accepted as a hint only when it matches a positive base-10 integer within JavaScript's safe integer range. Empty, malformed, negative, zero, and oversized payloads are ignored. All valid notifications coalesce to one database reconciliation; no query selects an occurrence by notification payload.

The periodic poll runs even if no notification arrives. It also drives standby leadership retry and reconnect delay. On client `error` or `end`, C2 stops processing that client, drops local leadership state, waits one injected poll interval, creates a fresh client, issues LISTEN first, and reconciles. Repeated reconnect failures repeat this bounded cycle without cursor mutation.

## 3. Migration and role authority

The one authorized migration is `migrations/0062_fix09_listener_fold.sql`. It may contain only:

1. `DROP CONSTRAINT incident_fingerprint_key` and `ADD CONSTRAINT incident_fingerprint_fingerprint_version_key UNIQUE (fingerprint, fingerprint_version)`;
2. creation of `obs.occurrence_seq_nextval_notify()` with schema-qualified objects, `VOLATILE`, and a pinned `pg_catalog` search path;
3. `REVOKE ALL` on that function from `PUBLIC`, `GRANT EXECUTE` to `debateai_obs_writer`, and replacement of `obs.occurrence.occ_seq`'s default with that function.

No table, column, enum, trigger, role, view, row-level policy, sequence, or additional grant is authorized. The listener's 0034 grants already permit `SELECT` on occurrence/delivery/action/incident/cursor/health, `INSERT` on delivery/action/incident/cursor/health, and the listed column updates on incident/cursor/health. `LISTEN`, advisory-lock calls, and polling need no object grant. C2 must not escalate role, use a pooler, or use the human/writer role.

Every later migration available across the audited refs/worktrees was checked for C2 effects. The later identity migrations keep observability roles revoked from their new identity objects; C2 retains that denial. Observation migration 0057 grants the listener a read on `observation.defect_signal_v`, but V-13 has not selected that transport, so C2 intentionally does not exercise the grant. Migration 0061 adds `JOB_LIFECYCLE`; C2 consumes its rows only to write the typed skip/ACK receipts. No later migration grants a replacement C2 queue or changes the 0034 incident/delivery/action/cursor write authority used here.

The Drizzle declaration in `packages/db/src/obs-schema.ts` must mirror the new composite incident uniqueness and the new occurrence default. The daemon still imports `pg` directly and never imports `@debateai/db`.

### 3.1 Exhaustive allocation record

At this packet's final allocation check, all 65 local/remote refs, all 71 registered worktrees, each registered worktree filesystem (including untracked files), the repository filesystem, migration filenames, and mission-plan/document claims were searched.

- `0050`–`0054` have no files but are paper-reserved for the five Support migrations.
- `0055` is `register_support_publication`.
- `0056` is `security_truncate_definer_searchpath`.
- `0057`–`0059` are the Observation foundation/safe-view/monitor grants.
- `0060` is allocated by the untracked Observation throughput-view migration in its active worktree.
- `0061` is the FIX-01 `obs_job_lifecycle_taxonomy` migration.
- No file, ref, worktree, or plan claim for `0062` was found.

Immediately before creating migration 0062, the implementation seat must repeat the same scan. This successor packet is the expected `0062` paper claim; any existing `0062` migration file or any competing allocation outside this packet is a STOP. The worker must return to architecture for a successor allocation and must not renumber on its own.

## 4. Exact C2 file surface

Create only:

- `migrations/0062_fix09_listener_fold.sql`;
- `tools/obs-listener/src/daemon/main.ts`;
- `tools/obs-listener/src/daemon/intake.ts`;
- `tools/obs-listener/src/daemon/fold.ts`;
- `tools/obs-listener/src/daemon/cursor.ts`;
- `tools/obs-listener/src/daemon/poison.ts`;
- `tests/unit/fix09-fold.test.ts`;
- `tests/integration/fix09-daemon.test.ts`.

Modify only:

- `packages/db/src/obs-schema.ts` for migration parity.

Read without editing:

- migration 0034 and every later migration;
- `tests/integration/obs-l1-s01-foundation.test.ts`;
- C1 policy files, fixtures, tests, `tracer-hook.ts`, and `dispatch-arm.ts`;
- package manifests and lockfiles.

Forbidden remains: every product runtime; all other tests; `occurrence_detail`; `identity.*`; raw `core.run`; `observation.defect_signal_v`; `@debateai/db` in the daemon; model/provider/CLI/child-process imports; Hermes; tier decisions; trace calls; board writes; notifications to humans; dispatch; mutation; edits to the C1 interfaces or bundle.

## 5. C2 verification contract

The focused unit and integration suites must prove:

1. composite incident identity, idempotent aggregate recomputation, canonical source ordering, derived eligibility, both work-unit branches, every intake result, and all legal/illegal transition pairs;
2. the migration changes only the named constraint/default/function/grant, retains the 0034 listener grants and occurrence trigger inventory, denies function execution to `PUBLIC` and the listener, and lets the writer insert;
3. notification wake before a long poll, periodic recovery of a deliberately missed notification, malformed-payload rejection, LISTEN-before-reconcile on startup/reconnect, and reconnect after forced connection loss;
4. FATAL-to-INFO then time/sequence ordering and observed in-flight processing exactly `1`;
5. two daemons produce one fold/ACK, standby takeover after leader loss, no repeated aggregate increment, and cursor recovery from receipts;
6. accepted, skipped, and poison rows all become ACKed; the poison row `[7]` creates one typed durable dead-letter and POISON health while later rows progress; an injected SQL failure creates no ACK/dead-letter and leaves the row pending;
7. the cursor remains behind an older unacked row when a newer severe row commits, then advances to the greatest acknowledged boundary after the older row commits;
8. the daemon dependency graph contains no banned authority named in §4 and C1's canonical hash/interfaces remain byte-identical.

Run the focused command three times; the worst run is the result. Also run the standing S01 foundation suite once, typecheck, and the C1 focused suite once. Green worker evidence is a milestone only.

### Acceptance amendment for V's later run

Frozen SPEC §5 remains V-owned and unperformed. Item 4's incident lookup is replaced by a composite join so a future fingerprint version cannot make the query ambiguous:

```sql
WITH latest AS (
  SELECT fingerprint, fingerprint_version
  FROM obs.occurrence
  ORDER BY occ_seq DESC
  LIMIT 1
)
SELECT i.state, i.distinct_work_unit_count, i.max_severity, i.source_set
FROM obs.incident AS i
JOIN latest AS l
  ON l.fingerprint = i.fingerprint
 AND l.fingerprint_version = i.fingerprint_version;
```

For the FIX-01 scheduler one-shot, the first failure yields count `1` and the second distinct source event yields count `2`; the composite incident row count remains `1`. This packet does not assert that V ran or accepted that result.

## 6. Stop conditions

C2 stops without source edits and reports the exact evidence if any of these is true:

- C1 is not PASS at `daa8908d` or a descendant with byte-identical C1 artifacts, hash, and interfaces;
- the repeat allocation scan finds an existing `0062` migration file or a competing paper claim outside this successor packet;
- the live migration chain does not contain the audited 0034 grants/constraints or contains duplicate composite incident identities;
- implementation would require a second migration, a file outside §4, a package change, or an edit to a standing test or prior migration;
- implementation would require `occurrence_detail`, `identity.*`, raw `core.run`, `observation.defect_signal_v`, `@debateai/db` in the daemon, a model, a CLI, Hermes, product source, or a non-empty `DispatchArm`;
- a required state edge, intake category, dead-letter reason, source, severity, or work-unit form is outside this closed contract;
- a production launch duration, production credential, V run, V veto, or other V-owned act is needed.

None of those V-owned acts is needed to implement and locally verify C2. They remain pending at their existing gates.

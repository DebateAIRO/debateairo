# ObservationAgent shared compatibility repairs

**Status:** approved by the user on 2026-09-04; implementation planning authorized.

**Scope:** ObservationAgent only. This design repairs two shared foundation seams exposed by OBS-05 and required by OBS-07, then repairs OBS-05 on the replayed base. It does not implement OBS-06 or OBS-07 behavior.

## 1. Context and evidence

The provisional local ObservationAgent chain is clean through OBS-05:

| Lane | Commit | Parent |
|---|---|---|
| OBS-01 foundation and compatibility | `47c356431094a7f54e4aa8a547125ac6949d5c7e` | `4aae53120a1de1ea7d5195b64dfdea2ab845bd89` |
| OBS-02 | `d0e619c0f88ee3ff831ba71fb3c6744791aa9386` | `47c356431094a7f54e4aa8a547125ac6949d5c7e` |
| OBS-03 | `6b3a9e4399a08a24d6389d3bf9fd0cfb2d3236cb` | `d0e619c0f88ee3ff831ba71fb3c6744791aa9386` |
| OBS-04 | `f16a9340525a59a07302dec29e1841473d95d946` | `6b3a9e4399a08a24d6389d3bf9fd0cfb2d3236cb` |
| OBS-05 provisional | `0f992ed18b119cd7457eee26d993e4076bae3d5c` | `f16a9340525a59a07302dec29e1841473d95d946` |

The OBS-05 verification suite is green, but source review found two contract defects:

1. `src/modules/host-capacity/tracker.ts` emits sustained CPU load as `IMPACT_MEMORY` with byte-shaped evidence. The rendered sentence falsely says that host memory pressure is high.
2. `src/modules/postgres-capacity/query.ts` filters lock waits at 60 seconds and idle-in-transaction sessions at 120 seconds in SQL before the versioned threshold policy reaches the tracker. A lower ratified threshold would therefore hide rows that the tracker must detect.

A read-only OBS-07 audit found a shared foundation gap:

3. `src/main.ts` persists each signal and then unconditionally delegates to `OsaScriptNotifier`. That notifier sends every CLEARED signal. OBS-07 requires a CLEARED osascript attempt only when its OPEN was routed to osascript, and a ticket comment only when the OPEN obtained a ticket. OBS-07 owns routing policy but is forbidden from modifying the OBS-01 core files where delivery is currently hard-wired.

These are architecture defects, not live-environment defects. `SET LOCAL ROLE pg_monitor` is intentional because the observation role is `NOINHERIT`; it remains unchanged.

## 2. Goals

1. Give sustained host load a truthful, closed, typed impact contract.
2. Make Postgres age prefilters follow the versioned policy without permitting SQL injection or increasing database-session/query count.
3. Introduce one generic signal-routing extension point while preserving OBS-01 through OBS-06 behavior when no extension is installed.
4. Preserve the invariant that a signal is fsynced before any channel execution and that every channel attempt/result uses the typed delivery journal and mirror path.
5. Replay the completed downstream commits without rewriting their slice-owned behavior, then repair OBS-05 under strict TDD.
6. Leave OBS-07 able to implement its exact channel ladder, acknowledgement, escalation, storm and recovery rules entirely inside OBS-07-owned modules.

## 3. Non-goals and safety boundaries

- No FixAgent or SupportAgent implementation.
- No live V acceptance and no real notification, email, ticket, dev-database, certificate, credential, launchd or service action. Disposable embedded databases remain allowed for migration and repository tests.
- No push or merge to a shared branch.
- No access to or action on the security-hardening pull request.
- No generic plugin system beyond the single router contribution needed by the frozen ObservationAgent slice model.
- No sendmail, Kanban, acknowledgement, storm or status-page behavior in the OBS-01 compatibility repair.
- No removal of `SET LOCAL ROLE pg_monitor` and no selection of SQL text or other private Postgres fields.

## 4. Decision A — truthful host-load impact

### 4.1 Vocabulary

Add `IMPACT_LOAD` to the closed TypeScript impact vocabulary, the `CAPACITY` class allow-list, its renderer table, and the unapplied candidate `0057_observation_foundation.sql` impact-code check.

The fixed sentence is:

> Host load is P across N logical cores for T seconds: processes are contending for CPU.

The OBS-05 requirements/SPEC/PLAN/DECISIONS must use that same code and sentence. Existing memory pressure remains `IMPACT_MEMORY` with its existing sentence and evidence.

### 4.2 Typed evidence

An OPEN `IMPACT_LOAD` signal has exactly these fields:

| Field | Type | Meaning |
|---|---|---|
| `load_one_minute` | finite non-negative number | measured one-minute load average |
| `logical_cores` | positive integer | core count used by the threshold |
| `threshold_multiplier` | finite positive number | ratified load-per-core multiplier |
| `sustained_seconds` | finite non-negative number | continuous time above the threshold when OPEN is emitted |
| `observed_at` | ISO-8601 timestamp | sample time |

No percent, byte count or unit field is accepted for this impact. Extra evidence keys fail closed. The signal remains:

- `class = CAPACITY`
- `component = host`
- `severity = DEGRADED`
- `suspected_defect = false`
- `defect_kind = null`

Its recovery is the existing `IMPACT_CLEARED` successor linked to the OPEN. The tracker keeps the frozen threshold `load average > multiplier × cores` for the configured sustained duration and the existing recovery-sample rule.

### 4.3 Migration handling

Migration 0057 belongs to the unmerged, unapplied local ObservationAgent candidate. The compatibility commit updates that candidate migration rather than allocating a later migration. Verification must replay the migration from an empty database and prove that `IMPACT_LOAD` is accepted while an unknown impact remains rejected.

## 5. Decision B — policy-driven Postgres age filters

`readPostgresCapacity` accepts the current lock-wait and idle-in-transaction age thresholds as typed finite non-negative seconds. The module passes the active OBS-05 policy values on every probe, including after a threshold-policy reload.

The single read transaction remains:

1. `BEGIN`
2. `SET LOCAL statement_timeout = 2000`
3. `SET LOCAL ROLE pg_monitor`
4. one bounded aggregate query over allow-listed `pg_catalog.pg_stat_activity` fields
5. `COMMIT`, or `ROLLBACK` on failure

The aggregate query uses bound parameters for both ages. It must not interpolate policy values into SQL text. Both the count and maximum-age FILTER clauses use the same matching parameter. The query continues to omit `query` and all other text that could contain user or provider content.

The tracker remains the authority for opening, changing band and clearing a signal. The SQL filter only limits eligible rows according to the same active policy; it does not embed default policy.

## 6. Decision C — one generic persisted-signal router

### 6.1 Foundation contract

`ObservationModuleManifest` gains one optional router-factory contribution. Module discovery returns either no contributed router or exactly one. Discovery fails closed before probe or channel effects if more than one manifest contributes a router or if the contribution does not implement the required lifecycle.

The factory creates a `SignalRouter` with two methods:

```ts
type SignalRouter = Readonly<{
  onSignal(input: PersistedSignalRoutingInput): Promise<void>;
  onTick(input: SignalRoutingTickInput): Promise<void>;
}>;
```

The exact implementation types will be specified in the implementation plan, but the semantic contract is fixed here:

- `onSignal` receives an immutable, schema-validated signal only after its signal journal append has fsynced.
- `onTick` receives the current time, current ratified routing policy and current mute state. It lets a router evaluate delayed and repeated delivery without changing detector cadence.
- The router factory receives only core-owned capabilities: the ObservationAgent state directory, a typed delivery coordinator, and the pure osascript executor. It does not receive arbitrary process environment access or database writer credentials.
- The contribution owns its routing state. When OBS-07 installs one, it must hydrate its durable OPEN/delivery/ack state before channel execution so restart does not forget whether an OPEN was previously routed.

### 6.2 Delivery coordinator

The foundation extracts the existing two-phase delivery sequence into a channel-neutral coordinator. A router submits one typed delivery action containing:

- the persisted signal;
- one closed channel: `osascript`, `sendmail` or `kanban`;
- a disposition of `EXECUTE`, `MUTED` or `RATE_LIMITED`;
- for `EXECUTE`, a bounded executor that returns only `delivered_at` and an optional `external_ref`.

For every action the coordinator:

1. validates the action before an external effect;
2. appends and fsyncs a typed `ATTEMPT` envelope;
3. executes the bounded channel callback only for `EXECUTE`;
4. maps callback success/failure to a typed delivery result;
5. appends and fsyncs the typed `RESULT` envelope;
6. mirrors the result to Postgres only after the RESULT is durable.

An executor failure becomes `FAILED` and does not undo the signal. A Postgres mirror failure does not undo the journals. A delivery-journal failure follows the existing direct AGENT_SELF emergency path. One channel failure must not stop later independent channel actions.

### 6.3 Default router

When discovery finds no contributed router, bootstrap installs a `LegacyOsaScriptRouter`. It preserves the pre-OBS-07 semantics required by OBS-01 through OBS-06 and already verified through OBS-05:

- OPEN at SEVERE or FATAL routes to osascript;
- OPEN at DEGRADED routes only after the existing configured continuous-open delay;
- OPEN at INFO does not route to osascript;
- every CLEARED signal routes to osascript, matching current pre-OBS-07 behavior;
- existing mute, escalation exception and `(component,class)` rate limit behavior are unchanged.

The current delayed-DEGRADED loop moves behind `LegacyOsaScriptRouter.onTick`; `main.ts` no longer calls a concrete notifier directly.

### 6.4 OBS-07 router ownership

OBS-07's `modules/routing` manifest contributes the one replacement router. It may import executor factories from the OBS-07-owned `channels-sendmail` and `channels-kanban` modules, but core does not learn their policies or configuration.

The OBS-07 router owns:

- exact severity-to-channel selection;
- mute and rate-limit dispositions;
- delayed DEGRADED notification;
- FATAL retries and SEVERE email escalation;
- acknowledgement;
- storm membership, root selection and summary suppression;
- durable association between an OPEN and its actual channel history.

For CLEARED routing, “the OPEN was osascript-routed” means the OPEN has a typed osascript ATTEMPT/RESULT history, including a recorded suppressed disposition. A CLEARED ticket comment is eligible only when the OPEN's successful Kanban delivery stored a non-null `external_ref`. INFO and short-lived DEGRADED OPENs that produced no osascript action therefore produce no osascript CLEARED action. CLEARED never routes to sendmail.

Digest and status remain non-channel projections and are always updated from stored signals/deliveries. They do not create pseudo delivery rows.

## 7. Data flow and failure boundaries

```text
detector/module signal intent
  -> strict signal validation
  -> signal journal fsync
  -> best-effort Postgres signal mirror
  -> status/open-set update
  -> active router onSignal
       -> zero or more typed delivery actions
       -> ATTEMPT journal fsync
       -> bounded external executor, if any
       -> RESULT journal fsync
       -> best-effort Postgres delivery mirror

each agent cycle
  -> detector work
  -> active router onTick
  -> status snapshot
```

No channel call can precede signal durability. No database outage can prevent local signal or delivery journaling. A channel-executor error becomes its own typed FAILED delivery. A router contract error fails that routing cycle through the existing process/self-observability boundary, but it cannot retroactively remove the already durable signal.

## 8. Strict-TDD verification contract

### 8.1 Shared `IMPACT_LOAD` repair

- RED: sustained load currently validates/renders as memory pressure.
- GREEN: exact typed load evidence validates and renders the fixed CPU-contention sentence.
- Refutation: old byte-shaped load evidence and any extra evidence key are rejected.
- Refutation: replacing `IMPACT_LOAD` with `IMPACT_MEMORY` makes the focused tracker assertion fail.
- Database replay: 0057 accepts `IMPACT_LOAD` and rejects an unknown impact.

### 8.2 Postgres threshold propagation

- RED: policy values below 60/120 are not represented in the query call.
- GREEN: lock and idle thresholds are passed as bound values on every probe.
- Refutation: restoring either literal default causes the focused test to fail.
- Source/spy proof: the SQL has placeholders, no interpolated threshold, no `query` column and exactly one aggregate query under the two-second statement timeout.
- Regression: `SET LOCAL ROLE pg_monitor` remains present and ordered inside the transaction.

### 8.3 Router seam

- RED: a synthetic router cannot replace unconditional osascript delivery.
- GREEN: a discovered synthetic router sees a signal only after the signal journal is readable and durable.
- GREEN: without a contribution, all existing OBS-01 delivery and delayed-DEGRADED tests remain unchanged and pass.
- Refutation: two router contributions fail closed before any executor runs.
- Refutation: an invalid action cannot create an external effect.
- Delivery proof: ATTEMPT precedes executor; RESULT precedes mirror; executor failure is journaled as FAILED.
- Isolation proof: failure of one submitted channel action does not block the next independent action.
- Future characterization: an injected OBS-07-style router produces no osascript action for an INFO OPEN/CLEARED pair or a DEGRADED pair cleared before the delay, and comments only when a ticket external reference exists.

Every focused command runs three consecutive times after GREEN. Reversible mutants are restored byte-for-byte. The full inherited ObservationAgent suite, both established ObservationAgent TypeScript gates, root-diagnostic delta, migration replay, source audit, trace containment, path/mode/scope checks and `git diff --check` run before a local commit.

## 9. Sequencing and ownership

1. Write a strict-TDD compatibility brief from this design.
2. The original exact GPT-5.6-sol OBS-01 compatibility worker implements the shared vocabulary, migration, coordinator and router seam in the OBS-01 worktree as one local compatibility commit.
3. The controller independently verifies that commit and records evidence in the external progress ledger.
4. Replay OBS-02, OBS-03, OBS-04 and the provisional OBS-05 commit in order onto the repaired foundation. Resolve only mechanical replay conflicts; a semantic conflict stops the replay and returns to the owning worker.
5. The exact GPT-5.6-sol OBS-05 worker adds strict failing tests, then changes only OBS-05-owned host/Postgres capacity code and tests to consume the new contracts. It creates one local fix commit.
6. The controller reruns the full OBS-01 through OBS-05 suite and non-live gates.
7. Continue OBS-06 from the repaired OBS-05 candidate.
8. Implement the concrete router and channels only in OBS-07-owned paths when OBS-07 begins.

Claude Opus 5 review is retried only when its provider and explicit external-code-egress approval route are available. Review transport does not idle provisional local implementation, and no review result authorizes push, merge or live acceptance.

## 10. Acceptance for this repair sequence

The shared repair is ready for downstream work only when all of the following are true:

- one clean OBS-01 compatibility commit contains only the approved shared files/tests;
- the default router proves behavior-preserving against the inherited suite;
- `IMPACT_LOAD` is closed and consistent across requirements, TypeScript, migration, renderer and OBS-05 tests;
- Postgres age thresholds reach bound SQL parameters from the active policy;
- OBS-02 through OBS-05 replay cleanly and their combined suite passes;
- the OBS-05 fix is one clean local commit with no core or other-slice edits;
- no prohibited external or live action occurred;
- remaining V-only work is explicitly carried forward: D5 application, measured disk-drill substitution, D4/D7 tokens and all live timing/readback.

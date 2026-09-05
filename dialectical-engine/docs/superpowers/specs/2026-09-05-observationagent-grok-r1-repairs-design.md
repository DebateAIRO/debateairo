# ObservationAgent Grok Round-1 Repair Design

**Status:** written specification approved by the user on 2026-09-05.

**Candidate under review:** `b3d9d689e508d523d43f00c5be6e0356623e96ae`, based on `2b670d3059c60d7262cf655bd5d402c88100dff3`.

**Scope:** ObservationAgent only. This design closes Grok 4.6 round-1 findings B1-B2 and N1-N9 without implementing FixAgent or SupportAgent, running live V acceptance, changing product capture wiring, or interacting with PR #8/security-hardening.

## 1. Context

The complete local ObservationAgent implementation passed its controller-owned unit, integration, architecture, contract, TypeScript, containment, and audit gates. Grok's independent source review nevertheless found two acceptance blockers and nine restart, recovery, ownership, or configuration defects that repo-root tests did not expose.

The most important common cause is that several facts which are durable in PostgreSQL or the journal are interpreted through process-local state. A launchd restart can therefore change the detector's identity, age, or recovery decision. A second common cause is that production path and database-session behavior is implicit rather than owned by a typed runtime boundary.

The user's standing architecture remains binding:

- each ObservationAgent module owns the meaning of its own status;
- only a detector that explicitly sets `suspected_defect=true` may expose work through `observation.defect_signal_v` for a future FixAgent;
- normalized error occurrences and their complete normalized cause/frame structure are a separate future FixAgent feed;
- status text, channel failures, infrastructure health, and operational degradation never become FixAgent work by implication.

## 2. Goals

1. Make repo-relative configured paths independent of the daemon's current working directory.
2. Render the exact frozen `storm 5/60s` status token from typed data.
3. Restore detector OPEN identity and lifecycle state before the first post-restart probe, including while PostgreSQL is unavailable.
4. Persist READY and progress clocks in the bounded `observation.sample_ring` instead of resetting them in memory.
5. Emit truthful, non-defect delivery-health signals for osascript, sendmail, and Kanban failures.
6. Withdraw capture blindness when the observed runtime is definitively DOWN, while retaining fail-open behavior for UNKNOWN.
7. Contain an expected status-page bind failure inside its owning module.
8. Enforce the two-session daemon database budget by construction.
9. Give the loopback endpoint one status owner, write daily capture reminders with a real time and signal UUID, and stop probing a fabricated spool directory.
10. Preserve all existing safety, privacy, append-only, routing, and module-ownership invariants.

## 3. Non-goals and fixed boundaries

- No FixAgent or SupportAgent code.
- No product capture-wiring change and no invention of a product spool path.
- No new environment key; the four-key ObservationAgent environment contract remains exact.
- No raw error message, stack text, prompt, response, query text, payload, cookie, token, email, user identity, or arbitrary product string in signals, samples, status, delivery state, or the journal.
- No ObservationAgent read of `obs.occurrence_detail` and no write to `obs.occurrence`.
- No free-form status projection, arbitrary HTML, arbitrary command, or shell execution.
- No change that makes `AGENT_SELF`, delivery failure, capture health, infrastructure health, or capacity health a suspected defect.
- No push, merge, live V acceptance, credential access, service mutation, product-process mutation, or PR #8/security-hardening interaction.

## 4. Finding disposition

| Finding | Disposition | Owning boundary |
|---|---|---|
| B1 | Resolve configured repo paths against a code-derived repo root; launch from repo root | shared runtime plus certificate/sendmail consumers |
| B2 | Change the routing projection key from `storm.threshold` to `storm` | OBS-07 routing |
| N1 | Add versioned journal lifecycle metadata, boot replay, runtime hydration, and module/core tracker restoration | shared journal/runtime plus stateful modules |
| N2 | Replace READY and progress in-memory clocks with fixed-key, fixed-slot `sample_ring` clocks | OBS-03 stall detectors |
| N3 | Generalize channel RESULT tracking to all three external channels and emit non-defect OPEN/CLEARED self-health | OBS-07 routing module |
| N4 | Clear an existing `BLIND_PERIOD` on definitive DOWN; preserve it on UNKNOWN | OBS-04 capture health |
| N5 | Convert only expected listen/bind failure into module-owned degraded status and retry later | OBS-07 status page |
| N6 | Share one daemon pool capped at two sessions through a restricted database port | shared runtime and database-reading modules |
| N7 | Remove the router's duplicate loopback projection; status-page remains sole owner | OBS-07 routing/status-page |
| N8 | Resolve the actual still-open signal from the journal and append its UUID at the real UTC time | OBS-04 daily digest |
| N9 | Remove the fabricated `/tmp` target and report spool health as unconfigured/UNKNOWN | OBS-04 target fragment/spool module |

## 5. Repo-root path contract

### 5.1 Root identity

The daemon derives `repoRoot` from `import.meta.url`, never from `process.cwd()` and never from a new environment variable. `launch.sh` still validates the same repo-owned `0600` environment file, then changes directory to `repoRoot` and executes:

```text
node --import tsx apps/observation-agent/src/main.ts
```

Changing the launch directory makes ordinary repo-root behavior unsurprising, but correctness does not rely on that directory.

### 5.2 Configured path resolution

A shared helper accepts `(repoRoot, configuredRelativePath)` and returns a validated absolute path. It:

- accepts only a non-empty relative path already accepted by the owning module's configuration schema;
- resolves it beneath `repoRoot`;
- rejects absolute input, `..`, NUL, and any resolved escape;
- returns a branded absolute path so a consumer cannot accidentally use the raw configured string.

The OBS-05 certificate module continues to validate the frozen target `.local/dev-auth/tls/localhost.pem`, then reads the resolved absolute path. The OBS-07 sendmail module continues to validate `deploy/dev-auth/sendmail-capture.mjs`, then invokes Node with the resolved absolute path and the existing fixed argv/child-only environment.

Tests must start from both the repo root and `apps/observation-agent`, proving identical path resolution and proving that an escape or arbitrary absolute path is rejected. This closes B1 without broadening file-read authority.

## 6. Durable signal lifecycle and restart restoration

### 6.0 Last-ratified threshold fallback

Journal restoration must not be defeated by the current database-only threshold bootstrap. After every successful strict read of a ratified threshold policy, the daemon atomically stores that exact validated policy and version beneath its owned `0700` state directory in a `0600` file. The file contains no credentials or product content.

On boot the daemon first attempts the authoritative PostgreSQL read. It may use the local last-ratified snapshot only when the database connection is unavailable. A reachable database that returns an invalid or unratified policy is an error and must not fall back. A missing, malformed, wrongly owned, wrongly permissioned, or schema-invalid cache is also an error when PostgreSQL is unavailable. On database recovery, the next successful reload replaces the cache atomically.

This permits restart-safe Postgres-down observation without turning an editable deployment file into policy authority. First-ever boot still requires one successful ratified database read.

### 6.1 Journal record

New signal journal entries use a versioned envelope:

```ts
type SignalJournalRecordV2 = Readonly<{
  record_version: 2;
  kind: "signal";
  signal: ObservationSignal;
  lifecycle: null | Readonly<{
    owner: string;
    correlation_key: string;
  }>;
}>;
```

`owner` must be a discovered module name or the fixed owner `core-liveness`. `correlation_key` uses the existing bounded correlation-key grammar. One-shot self events that do not participate in an OPEN/CLEARED lifecycle use `lifecycle:null`.

The envelope is written and fsynced in the same append that currently stores the raw signal. PostgreSQL rows and migrations do not gain lifecycle columns. Postgres mirroring, digest rendering, and routing receive the extracted `signal` only, so their external contracts remain unchanged.

All journal readers accept both:

- legacy raw `ObservationSignal` rows already on disk;
- strict version-2 envelopes for new rows.

Unknown envelope versions, unknown fields, invalid lifecycle owners, invalid correlations, a CLEAR whose referenced OPEN is inconsistent, or a malformed complete record fail boot closed before probes or routing. A final non-newline partial record caused by an interrupted append is ignored only when it is the final physical line; malformed earlier data is not silently skipped.

### 6.2 Boot replay

Before the initial `AGENT_SELF/IMPACT_AGENT_START` signal and before any probe, the daemon replays signal journal files in chronological file-and-line order. Replay:

1. validates each signal and envelope;
2. applies OPEN rows by `signal_id`;
3. applies CLEARED rows only to their exact `clears_signal_id`;
4. constructs the current durable OPEN set;
5. constructs `(owner,correlation_key) -> OPEN signal` for version-2 rows;
6. indexes legacy opens by the already-frozen one-OPEN identity `(component,class)`.

The one-OPEN identity is a guard in addition to correlation identity: no module may create a second OPEN for the same `(component,class)` merely by changing its correlation key. Legacy adoption succeeds only when a stateful owner can uniquely derive its native correlation from the closed signal fields and evidence schema. Ambiguity fails closed: no replacement OPEN is emitted and the affected module reports UNKNOWN until the journal is repaired under V authority.

Replay does not require PostgreSQL. Postgres catch-up remains idempotent by `signal_id` and runs after local lifecycle state is safe.

### 6.3 Runtime and tracker restoration

`ObservationModuleRuntime` is constructed with the replayed lifecycle index. Before a module's first `probe`, runtime calls one optional pure restoration hook with only that module's validated current OPEN records. Stateful modules restore their trackers from those records; stateless modules expose no hook.

The same mechanism restores core liveness before its first observation. A restored tracker begins in the equivalent OPEN/DOWN state with the original first-failure time. Therefore:

- a continuing failure does not append another OPEN;
- a post-restart recovery produces the required two-success recovery transition and clears the original `signal_id`;
- a recovery that is already present on the first post-restart probe does not strand the old OPEN;
- routing sees the original signal identity and does not create a new ticket or escalation lineage.

Every stateful owner must have a restart test covering `OPEN -> process reconstruction -> continuing fault -> recovery -> CLEARED(original UUID)`. At minimum this includes core liveness, capture health, stall defect lifecycle, worker heartbeat, product expectations/latency, capacity, throughput/provider, witness, and schedule trackers.

## 7. Bounded detector clocks in `sample_ring`

The specialized OBS-03 clock store uses fixed metric keys and the existing 8,640 bucket bound. It never creates a metric key containing a work-item ID or run ID.

### 7.1 Lossless UUID representation

A canonical UUID is converted to its unsigned 128-bit integer and sent to PostgreSQL as a decimal `numeric` string. Reading pads the inverse hexadecimal representation to 32 digits and reconstructs the canonical UUID. No JavaScript `number` conversion is permitted. Invalid, negative, fractional, or greater-than-128-bit values fail closed.

### 7.2 READY first-observed clock

Metric key `runner.ready_identity` owns 8,640 slots:

- `bucket` is a stable slot, not a wall-clock modulo for this specialized store;
- `value` is the lossless READY work-item UUID;
- `observed_at` is its first observed READY time.

On each eligible safe-view cycle, current READY IDs retain their existing rows and timestamps. A new ID receives an unused slot or a slot whose prior ID is absent from the complete current READY set. A current ID is never overwritten. If all slots are occupied by current IDs, QUEUE_NOT_DRAINING becomes INELIGIBLE/UNKNOWN and emits no defect signal.

Persistence completes before age evaluation. On restart, the same READY ID reuses the stored timestamp, so the 120-second deadline neither resets nor advances falsely.

### 7.3 NO_PROGRESS clock

Two fixed keys share the same 8,640 slot number:

- `runner.progress_identity` stores the lossless run UUID;
- `runner.progress_sequence` stores the last safe-view progress sequence.

Their `observed_at` values are updated together only when the run is first observed or its sequence increases. An unchanged sequence retains its prior observation time across restart. Slots are recycled only for runs absent from the complete current in-flight set. Exhaustion fails the NO_PROGRESS detector closed.

All writes use the existing agent `INSERT/UPDATE` grants; no DELETE, new table, unbounded key, private `value_json`, product write, or schema migration is introduced.

## 8. Channel delivery health

The router exposes a channel-result callback for every completed external delivery RESULT, not a sendmail-only failure callback. A routing-owned delivery-health tracker consumes only:

```text
channel = osascript | sendmail | kanban
outcome = DELIVERED | FAILED | RATE_LIMITED | MUTED
completed_at
```

The tracker also replays durable delivery RESULT rows on boot so a crash between RESULT fsync and the next module cycle cannot erase a failure.

- `FAILED` opens one `AGENT_SELF/IMPACT_AGENT_DELIVERY` signal for that channel.
- A later `DELIVERED` result clears that channel's original OPEN.
- `RATE_LIMITED` and `MUTED` are policy outcomes and do not declare a channel unhealthy.
- Evidence is exactly `{reason:"DELIVERY_FAILURE",channel}`.
- Severity remains DEGRADED, `suspected_defect=false`, and `defect_kind=null`.

The three channel correlations are independent. A sendmail failure cannot block osascript or Kanban, and a Kanban failure cannot suppress a sendmail result. Because DEGRADED routes only to digest/status, the delivery-health signal cannot recursively call the failing external channel.

## 9. Capture-health corrections

### 9.1 Definitive DOWN clears blindness

An existing `BLIND_PERIOD` clears when either:

- a fresh `FLUSH_OK` makes silence lower than the threshold; or
- the corresponding runtime liveness is definitively `DOWN`.

`UNKNOWN` does not clear and does not open: uncertainty remains fail-open. The DOWN check happens even when no current positive capture authority row exists, so an early branch cannot strand the OPEN. The clear references the original OPEN UUID restored under section 6.

### 9.2 Truthful daily reminder

The daily CAPTURE_NOT_WIRED writer no longer accepts or constructs a free-form daily identifier. It replays the local lifecycle journal to find the actual still-open `capture-health:not-wired:<runtime>` signal, then:

- uses the real append time as `HH:MM:SSZ`;
- uses the original OPEN `signal_id` as the sixth digest field;
- appends at most once per `(UTC day, signal_id)`;
- refuses to append if the matching still-open lifecycle identity is absent or ambiguous.

Idempotency is derived from the current day's digest plus journal identity, not a process-local `lastDigestDay`. A restart on the same day cannot duplicate the reminder; a clear followed by a new OPEN uses the new UUID.

### 9.3 No fabricated spool

`OBS-04.json` no longer names `/tmp/dialectical-engine-observation-spool`. Until the product/capture owner wires a canonical absolute `OBS_SPOOL_DIR` and V approves that deployment change, the OBS-04 fragment has no spool target.

The spool module treats absence as an unconfigured condition, publishes the closed status projection `spool UNKNOWN`, performs no filesystem scan, and emits no SPOOL_STRANDED signal. An empty OBS-04 spool target list is valid only for the owning spool probe; it does not weaken global target validation or permit arbitrary paths. A future real target must still be absolute, outside excluded zones, and validated together with product wiring in a separately owned change.

## 10. Status and status-page ownership

### 10.1 Exact storm line

Routing emits:

```ts
{ kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD",
  count: 5, windowSeconds: 60 }
```

The fixed core renderer therefore prints exactly `storm 5/60s`. No special-case string renderer is added.

### 10.2 One loopback owner

The status-page module remains the sole owner of `{kind:"loopback_endpoint",key:"status"}`. Routing removes its duplicate projection. A snapshot/CLI/HTML integration test proves the URL occurs exactly once.

### 10.3 Bind-failure containment

The status-page startup primitive distinguishes:

- invalid configured host/port/path: configuration error, still fatal before service readiness;
- expected listen failure such as `EADDRINUSE` or permission denial: typed `OBSERVATION_STATUS_BIND_FAILED`.

The module catches only the typed listen failure. It closes any partially created server/listeners, clears the cached startup promise, and returns module-owned DEGRADED/UNKNOWN status so the next cadence can retry. Later modules continue in the same cycle. It emits no suspected-defect signal and performs no alternate bind. All other errors still fail closed through the existing module boundary.

## 11. Enforced database-session budget

The daemon owns one `pg.Pool` capped at `max: min(2, ratified max_database_sessions)`. Bootstrap uses its existing separate one-session pool only before the daemon pool exists, then closes it.

Production modules no longer construct `pg.Pool` or `pg.Client`. They receive a restricted database port from runtime:

```ts
type ObservationDatabasePort = Readonly<{
  withClient<T>(operation: (client: ObservationQueryClient) => Promise<T>): Promise<T>;
}>;
```

The port exposes parameterized query and transaction operations needed by current observation modules, not pool creation, connection strings, `end`, or arbitrary role persistence. `SET LOCAL ROLE pg_monitor` remains transaction-scoped. The same two-session pool serves heartbeat, journal catch-up/mirroring, samples, and module reads; the pool is therefore the mechanical concurrency limit even if future routing and a probe overlap.

Architecture tests reject `new pg.Pool` and `new pg.Client` under daemon module production paths. Oactl provisioning and isolated acceptance helpers remain separate processes and are outside the daemon session count. A disposable-Postgres integration test holds one daemon client while a module query runs and proves `pg_stat_activity` never observes more than two ObservationAgent sessions.

## 12. Ordering and failure semantics

The repaired boot/cycle order is:

```text
load four-key environment and code-derived repo root
  -> discover modules and validate targets
  -> replay signal and delivery journals
  -> read threshold policy with bootstrap pool
       -> on success validate and atomically cache it
       -> on connection failure validate the last-ratified local cache
       -> close bootstrap pool
  -> open the single max-2 daemon pool
  -> restore core/module lifecycle and delivery-health state
  -> construct the router from validated owned configuration
  -> append/fsync initial AGENT_SELF start signal
  -> mirror/catch up best effort
  -> run modules sequentially
       -> persist OBS-03 clocks before evaluating deadlines
       -> journal/fsync every signal envelope
       -> route only after signal durability
       -> journal/fsync ATTEMPT before effect
       -> journal/fsync RESULT before mirror
  -> merge module-owned status and atomically replace status.json
```

PostgreSQL failure cannot erase local lifecycle identity. Journal corruption cannot be papered over by database state. A status-page bind failure cannot stop later probes. An unconfigured spool cannot cause a read. A channel failure cannot become a suspected defect. No repair changes Docker's read-only argv wall, the Hatchet REST-only rule, append-only signal/delivery rows, or V's authority over live operations.

## 13. Considered alternatives

### A. Selected: journal lifecycle envelopes plus module restoration

This is the only option that preserves original signal IDs through launchd restart while PostgreSQL is down. It also lets a healthy first post-restart probe clear an existing OPEN rather than merely suppressing duplicates.

### B. Rejected: hydrate only from `observation.open_signal_v`

This fails precisely when the local journal is the source of truth: PostgreSQL outage before catch-up. It would also make restart safety depend on a service the liveness detector is meant to observe.

### C. Rejected: dedupe only inside runtime by `(component,class)`

Runtime-only dedupe prevents some duplicate OPEN rows but cannot restore tracker state. A component that recovers before a tracker reopens would leave the original signal stranded forever.

### D. Rejected: add per-ID metric keys or a new clock table

Per-ID keys violate the fixed per-metric bound and grow forever. A new table/migration is unnecessary because fixed identity slots fit the existing ring and grants.

### E. Rejected: rely only on `cd repoRoot`

It would fix the current launch script but keep module behavior dependent on any future caller's cwd. Code-derived resolution at the consumer boundary is testable and durable.

### F. Rejected: keep per-module pools and rely on sequential timing

Timing makes three sessions unlikely, not impossible. A shared max-two pool makes the resource invariant true by construction.

### G. Rejected: invent a likely spool path

Scanning a plausible directory produces false confidence and cannot prove product capture wiring. UNKNOWN is the only truthful state until the product owner supplies the real path.

## 14. Strict-TDD verification contract

Each cluster begins with a focused failing regression against the frozen candidate. Production changes follow only after the intended RED is recorded.

### 14.1 Required RED-to-GREEN proofs

1. Launch the path test from `apps/observation-agent`; certificate and sendmail currently resolve incorrectly, then resolve beneath the exact repo root.
2. Render router status; it currently lacks exact `storm 5/60s`, then prints it once.
3. Open a liveness/module signal, reconstruct the process with PostgreSQL unavailable, keep the fault active, recover, and prove one OPEN plus a CLEAR of the original UUID.
4. Prove a previously validated cached policy permits that Postgres-down restart, while a missing/invalid cache and an invalid reachable database policy fail closed.
5. Repeat restart restoration for every stateful owner and for a legacy raw journal OPEN.
6. Observe READY below threshold, reconstruct, cross 120 seconds, and prove detection uses the pre-restart time. Prove slot reuse and exhaustion fail closed.
7. Advance a run's progress sequence, reconstruct, hold it unchanged for 300 seconds, and prove NO_PROGRESS uses the stored change time.
8. Fail each of osascript, sendmail, and Kanban independently; prove three truthful non-defect self-health lifecycles and unaffected sibling channels.
9. Open BLIND_PERIOD, switch runtime to DOWN, and prove CLEAR(original UUID); switch to UNKNOWN and prove no clear.
10. Occupy port 9797, prove status-page degradation while a lexically later module still runs, release it, and prove retry succeeds.
11. Hold one daemon database client during a module query and prove the daemon never exceeds two sessions.
12. Render status/HTML and prove the loopback URL occurs exactly once.
13. Append a next-day CAPTURE_NOT_WIRED reminder and prove real UTC time, actual OPEN UUID, exact six fields, same-day idempotency, and new UUID after reopen.
14. Run with no spool target and prove no filesystem call, UNKNOWN status, and no SPOOL_STRANDED signal.
15. Prove `observation.defect_signal_v` still contains only the four explicitly suspected OBS-03 defect classes plus their clears.

### 14.2 Required reversible refutations

- use cwd-relative certificate/sendmail input after validation;
- accept an invalid cached threshold policy or prefer it over a valid reachable database policy;
- restore an OPEN without its original UUID;
- permit a second OPEN for the same `(component,class)` after restart;
- clear a legacy or restored OPEN using a different UUID;
- convert a UUID clock through JavaScript `number`;
- reset READY or progress time during reconstruction;
- overwrite a slot whose identity is still current;
- treat RATE_LIMITED or MUTED as a channel failure;
- set `suspected_defect=true` on delivery health;
- clear BLIND_PERIOD on UNKNOWN;
- swallow an invalid status-page configuration as a bind failure;
- restore the duplicate routing loopback projection;
- fabricate a reminder ID/time or append twice for the same day/UUID;
- scan any fallback spool directory;
- construct a production module pool/client outside the shared port.

Each mutant must fail the intended focused assertion and every modified file must be restored byte-for-byte before final verification.

### 14.3 Final non-live gates

- every repaired focused cluster three consecutive times;
- the complete OBS-01 through OBS-07 unit/integration/architecture command three consecutive times;
- contract generation and both established ObservationAgent TypeScript commands;
- exact inherited-only root TypeScript diagnostic delta;
- TypeScript resolution containment;
- source, privacy, text-byte, orphan, architecture, migration, grant, path, JSON, mode, scope, and `git diff --check` gates;
- candidate branch has one reviewed design commit, one reviewed plan commit, and bounded implementation commits prescribed by the approved plan;
- clean worktree and immutable whole-campaign patch hash before Grok round 2.

No final gate substitutes for numbered live V acceptance.

## 15. Delivery sequence

1. Review and approve this written design.
2. Commit the design alone on the isolated repair branch.
3. Write and approve a detailed strict-TDD implementation plan.
4. Dispatch exact GPT-5.6-sol code work in bounded ownership clusters from this repaired branch; do not modify the frozen OBS-07 review lane.
5. Independently inspect every diff and rerun the prescribed controller gates.
6. Freeze a new whole-campaign patch and SHA-256.
7. Submit the immutable patch, design, plan, original verdict, and verification evidence to Grok 4.6 round 2 with read-only permissions.
8. If Grok returns REWORK, reproduce and disposition it before further edits; at most three review rounds.
9. After Grok PASS, hand the exact candidate and current numbered acceptance commands to V. V retains veto and integration authority.

## 16. Written-design acceptance

This design is ready for implementation planning only when the user confirms that:

- the durable journal and bounded sample-ring mechanisms match the intended restart semantics;
- all three external channels own truthful non-defect health;
- definitive DOWN clears blindness but UNKNOWN does not;
- UNKNOWN is preferred to a fabricated spool path;
- one shared two-session pool is the desired daemon database boundary;
- the future FixAgent boundary remains explicit suspected-defect signals plus the separate normalized error feed, never status scraping;
- no listed repair expands into FixAgent, SupportAgent, live operations, product capture wiring, or security hardening.

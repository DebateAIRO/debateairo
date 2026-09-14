# FIX-09 C2 independent Sol review

Date: 2026-09-04

- Review target: `b8f63a84761fb4f3f0931bbc33fe0d730f1f1b64`
- C1 PASS base: `daa8908d918da1ab137014f68c89e752bd406428`
- Controller authority: `8ea0999de58edfa52b3b2066953299eaefc8b0c5`
- Integrated authority: `5544070d5bf2d3db7b54b15eb0e99479f5af473f`
- Controller lock correction: `99fa48974fc2cd98b7e6e22a51624d9cf72c1f4f`
- Integrated lock correction: `e2aa13fdea1678c2542d08e9977844e7ce617437`
- Implementation commits: `95d0908b`, `4fdfa192`, `f4216415`, `b8f63a84`
- Review mode: source and test review plus isolated-copy mutants; no production, specification,
  test, C1, board, or Hermes mutation

## Verdicts

- **SPEC: FAIL / CHANGES REQUESTED.** The pending selector uses `captured_at` where the
  binding v2 specification and plan require `occurred_at`. This changes the mandated
  total order for equal-severity rows.
- **CODE QUALITY: FAIL / CHANGES REQUESTED.** Four binding verification requirements are
  not falsifiable by the focused suite, and the implementation report records a passing
  `git diff --check` although the command exits `2`.
- **V acceptance: pending and unperformed.** This review records no production or launchd
  act and no Done verdict.

## Findings

### F1 — P1 — the daemon uses capture time instead of event time for backlog age

Binding authority is exact: `SPEC-v2.md` §2.6 orders rows by severity, then
`occurred_at ASC`, then `occ_seq ASC`; `PLAN-v2.md` Step 4.1 repeats the same columns.
`tools/obs-listener/src/daemon/main.ts:98-101` instead orders by severity,
`occurrence.captured_at ASC`, then sequence. The focused test pins that divergent field at
`tests/integration/fix09-daemon.test.ts:538` and constructs/labels the case as capture-time
ordering at lines 577-608.

For two equal-severity events whose occurrence time and capture time are inverted, the
daemon processes the later event first. This violates the closed total order and can defer
the older defect behind a later-captured row.

Reproduction: in an isolated clean copy, changing only `captured_at ASC` to the required
`occurred_at ASC` made the focused integration file exit `1` with two failures, including
the order assertion at line 606. A separate `FATAL THEN 3` mutant also exited `1`, showing
that severity order is pinned while the age field is pinned to the wrong column.

Required correction: use `occurrence.occurred_at ASC` in production and make the test set
opposed `occurred_at`/`captured_at` values so it proves occurrence-age authority rather
than restating the SQL spelling.

### F2 — P2 — the focused suite does not prove composite-version isolation during delivery

`tools/obs-listener/src/daemon/fold.ts:116-129` correctly filters prior ACKed rows by both
fingerprint and fingerprint version. However, replacing
`occurrence.fingerprint_version=$2` with the always-true `$2=$2` survived the complete
focused pair: `2 passed`, `18 passed`.

That mutant admits an ACKed version-1 occurrence while delivering a version-2 occurrence
with the same fingerprint. `foldIncident` then receives mixed identities and throws
`INCIDENT_IDENTITY_MISMATCH`, leaving the version-2 occurrence pending. This is the exact
case required by `SPEC-v2.md` §2.1 and `PLAN-v2.md` Step 3.1, which says to seed versions
1 and 2 and assert two incidents. The current integration case proves only the database
constraint, not delivery isolation.

Required correction: add a real-PostgreSQL delivery case with the same fingerprint at two
versions, ACK both, assert two incidents and isolated aggregates, and repeat either version
without changing row counts or aggregates.

### F3 — P2 — the two-daemon test does not bind successful global leadership or cap one

`tools/obs-listener/src/daemon/main.ts:106-126` currently gates reconciliation on the
boolean result of the global session advisory lock and awaits every delivery. Replacing

```ts
generation.leader = result.rows[0]?.acquired === true;
```

with unconditional `generation.leader = true` survived the entire integration file:
`1 passed`, `12 passed`. The mutant executes the lock statement but lets a client process
after a `false` result. Per-occurrence transaction
locks can hide duplicate processing of the same id, but they do not restore the global
one-daemon/cap-one invariant for distinct occurrences or prevent same-incident aggregate
races.

This leaves `SPEC-v2.md` §2.6/§5 items 4-5 and `SPEC-v3.md`/`PLAN-v3.md` global-leader
nesting unproved. The source-string assertion at test lines 533-541 proves that a lock SQL
literal exists, not that successful ownership dominates every delivery; no test measures
in-flight delivery count.

Required correction: record each daemon generation's returned leadership value and
delivery statement sequence, assert only the generation that observed `true` reaches
`BEGIN`, and instrument the query seam to prove the shared maximum in-flight delivery count
is exactly one. Retain the standby-promotion check after real leader connection loss.

### F4 — P2 — the migration test accepts a forbidden listener privilege expansion

Appending this unauthorized statement to migration 0062 in an isolated copy survived the
focused integration file: `1 passed`, `12 passed`.

```sql
GRANT SELECT ON obs.occurrence_detail TO debateai_obs_listener;
```

This directly violates `SPEC-v2.md` §§3-4 and the privacy boundary. The test at
`tests/integration/fix09-daemon.test.ts:203-215` uses `arrayContaining`, so it verifies
required grants are present but does not reject extra grants. Its later exact assertion at
lines 279-284 is scoped only to `obs.occurrence`.

Required correction: compare the listener's full sorted `obs` privilege projection with
the exact pre-0062 grant inventory and separately assert no routine/table privilege outside
the one authorized writer EXECUTE was added by 0062.

### F5 — P2 — deterministic skip/dead-letter receipt reuse is not exercised

`tools/obs-listener/src/daemon/poison.ts:14-18` and lines 31-35 currently perform the
required deterministic prior-receipt checks. Removing both `WHERE NOT EXISTS` predicates
survived the full integration file: `1 passed`, `12 passed`.

The replay case only retries after an ACK, so `deliverOccurrence` returns before reaching
the terminal action path. It does not cover a deterministic action already present while
the ACK is absent, even though `SPEC-v2.md` §2.5 explicitly requires checking skip or
dead-letter receipt existence before append.

Required correction: for one skip and one poison occurrence, seed the exact prior action
without an ACK, run delivery, and assert the existing action remains singular while the ACK
and cursor commit. For poison, also assert the fixed reason code and health state without
free-form payload growth.

### F6 — P3 — the implementation report's diff-check claim is false

`.superpowers/sdd/PLAN-FixAgent/FIX-09-C2.md:82` says `git diff --check` passed. Running the
review-bound command

```text
git diff --check daa8908d..HEAD
```

exits `2` and reports trailing whitespace at report lines 3, 4, and 5. This does not change
daemon behavior, but it makes the recorded verification receipt inaccurate.

Required correction: remove the trailing spaces and record the rerun result rather than
retaining the current pass claim.

### P0 findings

None.

## Clean verification evidence

### Authority and scope

- Controller/integrated v2 bytes match independently for `SPEC-v2.md`, `PLAN-v2.md`, and
  their then-current `DECISIONS.md` entry.
- Controller/integrated v3 bytes match independently for `SPEC-v3.md`, `PLAN-v3.md`, and
  their then-current `DECISIONS.md` entry.
- `daa8908d` is an ancestor of HEAD.
- No C1 policy, fixture, `TracerHook`, or `DispatchArm` path differs from `daa8908d`.
- Independent C1 bundle hash:
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `fix09-interface-tsconfig.json` compiled with exit `0`.
- Review start and pre-report status contained only the pre-existing untracked C1 SOL
  review files. This review added only this untracked normal report.

### Clean test runs

- Focused C2 unit/integration pair, three fresh real-PostgreSQL runs: each `2 passed`,
  `18 passed`; zero skipped or failed.
- Adjacent S01 foundation plus C1 bundle: `2 passed`, `91 passed`.
- `pnpm typecheck` exits `1` with the same eight diagnostics confined to the pre-existing
  sparse-worktree `tests/unit/s14-ui.test.ts` imports/types; no C2 diagnostic was emitted.

### Real PostgreSQL permission and lock probe

The focused run used PostgreSQL 18.4 and direct role-authenticated `pg.Client` sessions.
It proved:

- `debateai_obs_writer` can insert through the 0062 default and receives a positive
  sequence; the notification appears only after commit;
- `debateai_obs_listener` is denied direct publisher execution with SQLSTATE `42501`;
- the listener can plain-select the occurrence but `FOR UPDATE` is denied with `42501`;
- the exact prefixed transaction advisory lock is executable as the listener;
- a second listener gets `false` for the same try-lock key and `true` for the sampled
  distinct key, then gets `true` for the first key after rollback;
- occurrence grants remain SELECT-only for the listener in the clean migration.

### Implementation audit

- Migration 0062 clean source has the composite `(fingerprint,fingerprint_version)`
  constraint, one `VOLATILE` publisher with `pg_catalog` search path, PUBLIC revoke,
  writer EXECUTE, and the replacement sequence default. The clean real-PostgreSQL tests
  prove commit-aware notification and unchanged occurrence trigger inventory.
- Intake is a closed union with ACCEPT, both skip reasons, and all seven fixed poison
  reasons. Detector location, scheduler failure acceptance, JSON-object frames, source,
  severity, timestamps, identity, and safe sequence checks are present.
- Eligibility is derived only from canonical `source_set`; it is not persisted.
- Work-unit keys are structured declared pairs or `(source,source_event_ref)` fallbacks;
  no row-count key is used.
- The legal transition edge set exactly matches the v2 Cartesian contract.
- Fold/action, poison health, ACK, and contiguous cursor updates occur in one transaction;
  operational failures roll back and remain pending. POISON is not cleared by later work.
- Delivery acquires the exact prefixed transaction advisory lock after BEGIN and before a
  plain occurrence read and durable ACK recheck. No occurrence row/table lock or occurrence
  mutation is present.
- The clean daemon LISTENs before leadership/reconciliation, treats valid notifications as
  coalesced wake hints, polls without a notification, reconnects after forced loss, and uses
  the current client generation's session leader result before delivery.
- Poison receipts contain only schema, closed reason, and decimal sequence. No arbitrary
  message, SQL, stack, path, or JSON content is copied.
- Forbidden production scan returned no matches for `occurrence_detail`, `identity.*`, raw
  `core.run`, `observation.defect_signal_v`, `@debateai/db`, model/provider/child-process,
  Hermes, `DispatchArm`, or `TracerHook`. Production imports are only `pg` types or sibling
  C2 daemon modules.

## Isolated mutation matrix

All mutations ran in disposable archive copies with the reviewed worktree untouched.

| Mutant | Result | Binding observation |
|---|---:|---|
| work-unit distinct count becomes row count | KILLED, unit exit 1 | aggregate count assertion fails |
| composite constraint becomes fingerprint-only | KILLED, integration exit 1 | version/duplicate migration behavior fails |
| cursor advances before ACK | KILLED, integration exit 1 | cursor assertion fails at test line 404 |
| poison action/health commit before ACK transaction | KILLED, integration exit 1 | rollback assertion finds retained action |
| FATAL loses first rank | KILLED, integration exit 1 | ordering assertion fails |
| notification payload is sent directly as occurrence id | KILLED, integration exit 1 | UUID/authority path fails with SQLSTATE `22P02` |
| required `occurred_at` replaces divergent `captured_at` | TEST REJECTS SPEC, integration exit 1 | F1; two current assertions fail |
| aggregate version predicate becomes always true | SURVIVED, 18/18 | F2 |
| global session-lock result is ignored and every daemon becomes leader | SURVIVED, 12/12 | F3 |
| forbidden listener SELECT on `occurrence_detail` | SURVIVED, 12/12 | F4 |
| terminal action prior-receipt checks removed | SURVIVED, 12/12 | F5 |

## Frozen review scope

The reportable scope is F1-F6 above. No other P0-P3 finding is claimed. The clean source
does satisfy the reviewed migration, typed intake, eligibility, work-unit, state graph,
transactional receipt/cursor, occurrence lock, leader gate, polling/reconnect, poison
privacy, rollback, and forbidden-authority properties except for F1; F2-F5 concern the
binding proof surface rather than a present source defect.

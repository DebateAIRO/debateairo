# FIX-09 C2 implementation report

Date: 2026-09-04
Base C1 PASS: `daa8908d918da1ab137014f68c89e752bd406428`
Controller authority: `8ea0999de58edfa52b3b2066953299eaefc8b0c5`
Controller lock correction: `99fa48974fc2cd98b7e6e22a51624d9cf72c1f4f`

## Outcome

Implemented only the authorized C2 listener fold surface. Migration 0062 replaces the
incident fingerprint-only key with `(fingerprint,fingerprint_version)` and publishes the
commit-aware `obs_occurrence_inserted` hint from the occurrence sequence default. The
listener decodes a closed occurrence type, derives source-event fallback work units and
UI-only ineligibility, folds only accepted/ACKed evidence, durably receipts skip/poison,
ACKs and advances a contiguous cursor atomically, and reconciles under one session leader
with LISTEN-first startup/reconnect and positive polling.

No C3, C4, V acceptance, launchd, trace, ticket, tier, dispatch, product mutation, board,
or Hermes act was performed.

## Entry and authority gates

- Integrated v2 authority as `5544070d` before source edits.
- The repeated allocation scan covered 78 refs and 71 registered worktrees. Before 0062
  creation, the successor packet was the sole 0062 claim and there was no 0062 file. After
  creation, the only 0062 file is this branch's authorized migration; no competing claim
  appeared.
- C1 files are byte-identical to `daa8908d`. Independent hash:
  `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `fix09-interface-tsconfig.json` compiled successfully.
- Migration 0034 still grants the listener occurrence SELECT, delivery/action/incident/
  cursor/health writes, and no occurrence UPDATE.

PLAN-v2's literal occurrence `FOR UPDATE` failed in RED as the real
`debateai_obs_listener` with SQLSTATE `42501` (`permission denied for table occurrence`).
Implementation stopped cleanly at `4fdfa192`; architecture ratified SPEC-v3/PLAN-v3.
The correction was integrated as `e2aa13fd` before C2.3 resumed. Delivery now performs
`BEGIN`, the exact prefixed transaction advisory lock, a plain occurrence SELECT, then the
durable ACK recheck. Real PostgreSQL proves same-key exclusion, fixed sampled distinct-key
independence, and rollback release. A 64-bit hash collision conservatively serializes
unrelated work; it cannot admit same-occurrence concurrency.

## RED/GREEN record

- C2.1 RED: the old `incident_fingerprint_key` rejected version 2 and `occ_seq` retained
  the plain `nextval` default. GREEN proves the composite key, duplicate-pair rejection,
  commit-only notification, unchanged occurrence triggers, writer execution, listener
  denial, and Drizzle parity.
- C2.2 RED: intake/fold modules were absent. GREEN covers ACCEPT, both skips, all seven
  poison codes, scheduler failure acceptance, detector location filtering, both work-key
  branches, stable aggregate recomputation, derived eligibility, and the full legal-state
  Cartesian matrix.
- C2.3 RED: `deliverOccurrence` was absent after the v3 direct-role lock probe passed.
  GREEN proves lock-before-read/recheck, concurrent same-occurrence convergence, fold or
  terminal receipt before ACK, previously-ACKed-only aggregate input, composite identity,
  source-event cardinality, FATAL extrema, cursor gaps, idempotence, SQL rollback, poison
  rollback, and later progress without clearing POISON.
- C2.4 RED: the daemon module was absent. GREEN proves strict required configuration,
  malformed-payload rejection, LISTEN before leadership/reconciliation, notification wake
  before a long poll, missed-wake polling, FATAL/occurred-at/occ-seq ordering, cap one,
  single leadership, standby promotion, forced-error reconnect, and reconnect LISTEN-first.

## Independent review rework

The C2 review found that the pending selector used capture time instead of the binding event
time. Opposed `occurred_at` and `captured_at` fixtures reproduced the defect: the two new
ordering assertions failed while the other 12 integration cases passed. The selector now
orders equal-severity rows by `occurred_at ASC`, then `occ_seq ASC`.

Four proof gaps were closed with real-PostgreSQL cases while their already-correct product
paths remained unchanged:

- delivery of one fingerprint at versions 1 and 2 produces two isolated aggregates and
  replaying either occurrence leaves both aggregates and ACK counts unchanged;
- the successful global advisory-lock result dominates delivery, the false-lock generation
  never reaches `BEGIN`, and a deliberately paused owned transaction observes maximum
  in-flight delivery exactly one;
- the listener's full sorted `obs` table privilege projection equals the 0034 inventory,
  excludes `occurrence_detail`, and the only relevant routine grant is writer `EXECUTE` on
  `occurrence_seq_nextval_notify`;
- pre-seeded deterministic skip and dead-letter actions without ACK are reused exactly once,
  then ACK/cursor work commits and poison health retains the closed reason.

The exact former survivors now fail: removing the fingerprint-version predicate throws
`INCIDENT_IDENTITY_MISMATCH`; ignoring the global leader result records a transaction from
the false-lock generation; granting listener SELECT on `occurrence_detail` changes the exact
privilege projection; removing both terminal receipt guards creates duplicate actions.

Round-two review found that the routine-grant query still filtered its observed grantees and
the source inventory recognized only uppercase, column-zero `GRANT`. The real catalog proof
now expands the exact no-argument publisher ACL, excludes only its owner, and requires the
complete non-owner EXECUTE grantee set to be the singleton `debateai_obs_writer`. The source
inventory splits statements and normalizes whitespace and case as defense in depth. The
exact indented lowercase human-role grant and a mixed-case indented watchdog-role neighbor
both fail the real-PostgreSQL case. Migration 0062 was restored byte-identically at SHA-256
`4b600044eaeb628091a23206a3e266c6fe85b99f8bc0bc1478b4b2aee762ddec`.

## Commits

- `95d0908be3334f01c7e175c7253306e77ff147fa` — C2.1 composite incidents and transactional wake
- `4fdfa192356ec830c5a420d6469d94b80d3c8308` — C2.2 deterministic intake and fold
- `f42164153c3694eedb2454e7d2ac0883e2f6b74a` — C2.3 atomic delivery, dead-letter, and cursor
- `b8f63a84761fb4f3f0931bbc33fe0d730f1f1b64` — C2.4 LISTEN leader reconciliation loop
- `480a148d658f5d535588f164bb40de181ffb4562` — first independent-review rework

The final implementation HEAD reviewed in round two was
`480a148d658f5d535588f164bb40de181ffb4562`. This round-two correction changes only the
focused integration proof and this report; its resulting handoff HEAD is recorded with the
separate correction commit and fresh-review request.

## Final verification

- Focused C2 pair, three fresh real-PostgreSQL runs: `2 passed`, `20 passed` each run.
- Adjacent S01+C1: `2 passed`, `91 passed`.
- C1 independent hash: exact canonical hash above; interface compile: exit 0.
- Forbidden daemon authority/import scan: zero matches. Production imports resolve only to
  `pg` types or sibling C2 daemon modules.
- v3 lock scan: no occurrence row/table lock or mutation; exact canonical prefixed key is
  present in production and integration evidence.
- Migration inventory: one replaced constraint, one function, one function revoke/grant,
  one replaced default, and no trigger/table/column/role/view/policy/sequence addition.
- Text control bytes: `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- `git diff --check`: pass.
- Typecheck reports only the eight pre-existing `tests/unit/s14-ui.test.ts` diagnostics;
  C2 contributes no diagnostic.
- Source audit reports the three pre-existing obs-capture environment findings plus two
  0062 findings for unguarded `ADD CONSTRAINT` and bare `CREATE FUNCTION`; both 0062 forms
  are the exact non-replay-safe SQL required verbatim by PLAN-v2 Step 1.2.
- Architecture audit remains blocked by the pre-existing absent `web/package.json` in this
  sparse worktree (`ENOENT`), before any C2-specific finding.

Frozen production/launchd acceptance remains pending V and is not claimed here.

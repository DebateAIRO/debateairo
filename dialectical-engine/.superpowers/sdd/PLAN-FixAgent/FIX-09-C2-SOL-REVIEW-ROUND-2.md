# FIX-09 C2 Sol review — round 2

Date: 2026-09-04

- Immediate range: `b8f63a84761fb4f3f0931bbc33fe0d730f1f1b64..480a148d658f5d535588f164bb40de181ffb4562`
- Accumulated C2 range: `daa8908d918da1ab137014f68c89e752bd406428..480a148d658f5d535588f164bb40de181ffb4562`
- Reviewed HEAD: `480a148d658f5d535588f164bb40de181ffb4562`
- Review mode: frozen-document/source review, real-PostgreSQL execution, and mutation probes in a disposable commit snapshot
- Repository acts: this report only; no product, specification, test, C1, V, C3, C4, merge, push, board, or Hermes act

## Verdicts

- **SPEC: PASS.** The committed production code and migration satisfy the bounded F1-F5 corrections and the reviewed adjacent C2 contracts. The clean migration grants publisher execution only to `debateai_obs_writer`; the reportable P2 below is a proof-surface survivor, not a defect in the committed migration.
- **CODE QUALITY: REWORK.** The new routine-grant proof is not exhaustive and permits an equivalent unauthorized EXECUTE grant to survive the complete focused suite. The implementation report also omits required commit/final-HEAD identifiers.

## Findings

### R2-F1 — P2 — the “only writer EXECUTE” proof excludes other grantees and has a formatting-sensitive fallback

Binding authority is explicit: `SPEC-v2.md` lines 146 and 162-168 authorize only `debateai_obs_writer` to execute `obs.occurrence_seq_nextval_notify()`, and no additional grant. The committed migration is correct. The new test does not prove that exact negative boundary.

At `tests/integration/fix09-daemon.test.ts:262-275`, the catalog query restricts its result to only these grantees:

```sql
grantee IN ('PUBLIC','debateai_obs_listener','debateai_obs_writer')
```

An EXECUTE grant to `debateai_obs_human`, `debateai_obs_watchdog`, or another role is therefore invisible. The fallback at lines 276-283 matches only uppercase `GRANT` beginning in column zero, so ordinary SQL with indentation or lowercase syntax bypasses it.

Reproduction in a disposable snapshot of `480a148d` appended this semantically valid statement to migration 0062:

```sql
  grant execute on function obs.occurrence_seq_nextval_notify() to debateai_obs_human;
```

The complete focused pair still exited `0`: `2 passed`, `20 passed`. PostgreSQL applied the extra grant, but the filtered catalog projection and source matcher both omitted it. This permits a regression that broadens the exact 0062 authority and lets an unauthorized role consume occurrence sequence values and publish wake hints.

Required correction: query the exact routine's EXECUTE grants without a grantee allow-filter and assert the complete direct-grantee set is the singleton writer grant. Any source inventory retained as defense in depth must be insensitive to SQL case and leading whitespace. Add the equivalent extra-role mutation to the proof receipt.

### R2-F2 — P3 — the implementation handoff still lacks its required commit and final-HEAD inventory

`PLAN-v2.md:320` requires all four C2 SHAs and final HEAD in the handoff. `.superpowers/sdd/PLAN-FixAgent/FIX-09-C2.md:91-94` lists only the first three SHAs and leaves C2.4 as the text `final implementation/report commit`; it also does not identify review-rework commit/final HEAD `480a148d658f5d535588f164bb40de181ffb4562`.

The report's whitespace and executed verification claims now reproduce, so prior F6's inaccurate `git diff --check` claim is closed. This remaining omission makes the commit receipt incomplete rather than changing C2 behavior.

Required correction: record `b8f63a84761fb4f3f0931bbc33fe0d730f1f1b64` for C2.4 and `480a148d658f5d535588f164bb40de181ffb4562` as the reviewed final HEAD/rework commit.

### P0 findings

None.

### P1 findings

None.

### Other P2 findings

None.

### Other P3 findings

None.

## Prior F1-F6 disposition

1. **F1 closed.** `main.ts:98-101` now orders severity, `occurred_at ASC`, then `occ_seq ASC`. Opposed event/capture timestamps pass cleanly; restoring `captured_at` fails the real-PostgreSQL ordering assertion.
2. **F2 closed.** Delivery filters aggregate input by both fingerprint and fingerprint version. Versions 1 and 2 remain isolated and replay preserves both aggregates and singleton ACKs. Replacing the predicate with `$2=$2` fails with `INCIDENT_IDENTITY_MISMATCH`.
3. **F3 closed.** The current generation may enter delivery only after a true global advisory-lock result, and the instrumented two-daemon case observes no `BEGIN` from the false generation and maximum in-flight delivery exactly one. Forcing every generation to leader fails on `beginWithoutLeadership`.
4. **F4's reported mutation is closed.** Adding listener SELECT on `obs.occurrence_detail` changes the full listener table-grant projection and fails. Clean PostgreSQL denies listener publisher execution with SQLSTATE `42501`. R2-F1 is the adjacent untested extra-role routine grant.
5. **F5 closed.** Preseeded deterministic skip/dead-letter actions without ACK remain singular while ACK/cursor commits; poison health retains its closed reason. Removing both action guards fails with duplicate rows.
6. **F6's reported defect is closed.** Both review ranges pass `git diff --check`, the report has no trailing whitespace, and its test/type/static audit summaries reproduce. R2-F2 is a separate commit-receipt omission.

## Clean verification evidence

### Real PostgreSQL and regression runs

- Focused `fix09-fold` plus `fix09-daemon`, three fresh PostgreSQL 18.4 runs: each `2 passed`, `20 passed`, exit `0`.
- Adjacent S01 foundation plus C1 bundle: `2 passed`, `91 passed`, exit `0`.
- The focused real-role cases independently exercised composite incident identity, commit-only wake delivery, exact listener table privileges, writer execution/listener denial, occurrence advisory-lock exclusion and rollback release, transaction rollback, version isolation/replay, deterministic terminal receipt reuse, event-time ordering, false-leader exclusion, standby promotion, and reconnect ordering.

### C1 and authority boundary

- No C1 policy, fixture, `TracerHook`, or `DispatchArm` path appears in the accumulated C2 diff.
- Independent bundle hash: `aa76b3fe955ca5d46bcdf05d7b8f78ac27c25341104bf0b3810b6fc833497ecd`.
- `fix09-interface-tsconfig.json`: exit `0`.
- Controller and integrated `SPEC-v2.md`, `PLAN-v2.md`, `SPEC-v3.md`, and `PLAN-v3.md` blob IDs match pairwise.
- The accumulated changed-path list is confined to the binding C2 documents/report, migration/schema parity, five daemon modules, and two C2 tests.

### Static and report claims

- `git diff --check` passes for both requested ranges.
- Repository text-byte audit: `REPOSITORY_TEXT_CONTROL_BYTES=0`.
- Production imports are only `pg` types and sibling C2 daemon modules; the binding forbidden-authority scan has zero matches.
- `pnpm typecheck` reports the same eight existing diagnostics, all in `tests/unit/s14-ui.test.ts`; no C2 diagnostic is emitted.
- Source audit reports the three existing obs-capture environment findings plus the two expected 0062 replay-safety findings for the binding literal `ADD CONSTRAINT` and `CREATE FUNCTION` forms.
- Architecture audit stops at the existing sparse-worktree absence of `web/package.json` with `ENOENT`, before a C2-specific result.

## Mutation evidence

| Mutation | Result | Binding observation |
|---|---|---|
| `occurred_at ASC` to former `captured_at ASC` | KILLED, exit `1` | opposed-time order differs |
| aggregate version predicate to `$2=$2` | KILLED, exit `1` | `INCIDENT_IDENTITY_MISMATCH` |
| global leadership result ignored (`leader = true`) | KILLED, exit `1` | false generation reaches `BEGIN` |
| listener SELECT on `occurrence_detail` | KILLED, exit `1` | exact table-grant projection gains a row |
| both terminal `NOT EXISTS` guards removed | KILLED, exit `1` | duplicate skip action observed |
| inverse ordering neighbor: FATAL rank changed to 3 | KILLED, exit `1` | severity order differs |
| inverse version neighbor: `fingerprint_version<>$2` | KILLED, exit `1` | `INCIDENT_ROWS_REQUIRED` |
| inverse routine neighbor: writer grant changed to listener | KILLED, exit `1` | routine-grant identity differs |
| inverse terminal neighbor: new receipt inserts suppressed | KILLED, exit `1` | required skip action absent |
| adjacent extra-role EXECUTE with lowercase/indentation | **SURVIVED**, `20/20` | R2-F1 |

All mutations were made only in `/private/tmp` against an archive of reviewed HEAD. The shared worktree's tracked product, specification, and test bytes were not changed.

## Frozen scope

Review coverage is limited to the requested F1-F6 corrections and directly adjacent regressions in the two specified ranges. V acceptance remains unperformed. C3, C4, integration, merge, push, board, launchd, and production actions were not reviewed or performed.

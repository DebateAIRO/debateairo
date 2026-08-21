# XREV-01 — Opus 5 lens, rev2 (dual diamond DR-153)

Ticket `t_b8750870` · worker Codex GPT-5.6 Sol · handoff `XREV-01-codex-handoff.md`
(rev2) · progress log through `2026-08-12T22:06:03Z REV2 FULL GATES`.
Reviewed 2026-08-13 against my own rev1 verdict (`xrev01-opus-rev1.md`), the
rework directive, and the shared tree at `56b256c` + working changes.

**Method (DR-163):** every probe and mutation ran in an APFS clone of the PARENT
git root (`cp -c -R /Users/…/DebateAIRO`), including `.git` and the parent
`.gitignore`, at
`…/scratchpad/xrev01-rev2-clone/DebateAIRO`. Clone verified against the shared
tree before mutating (only difference: the live Postgres `pg_dynshmem/mmap.*`
page of the running standing DB) and verified byte-identical again after every
mutation was reverted. The shared tree's `git status` was 284 entries at start
and 284 at finish. Only this verdict was written to the real tree.

**DR-163-A:** `pgrep -f "codex exec"` returned nothing at start and at finish.
The only repo-touching process in flight is the standing acceptance stack
(pid 74634, `acceptance/run-acceptance.ts --token v-dev --serve`, started
2026-08-12 23:24:39) — a running service, not a coder. It was not restarted,
not written to, and only read from once (a read-only `to_regclass` query, see
A-7). No file overlap.

**Baseline reproduced in the clone (pristine, before any mutation):**

```text
pnpm test        Test Files 68 passed (68) · Tests 486 passed (486)
pnpm typecheck   $ tsc --noEmit
pnpm lint        architecture { edgeRowsChecked: 27, violations: [] } · source { blocking: [] }
generate:contract → packages/contract/src/{index,client}.ts byte-identical to the shared tree (ZERO drift)
audit:text-bytes REPOSITORY_TEXT_CONTROL_BYTES=0
```

486 matches the orchestrator's measured baseline exactly.

---

## VERDICT: **APPROVED**

All three rev1 blockers are closed **by execution, not by claim**, and the
folded advisory A-2 is closed with a shipped regression test. The diamond
completes.

| rev1 finding | Ordered fix | rev2 status |
|---|---|---|
| **B-1** M=1 serves 100% unjudged with no mark, no record, and skips the depth guard | typed disclosure mark + required record; depth guard UNCONDITIONAL | **CLOSED** — proven by probe + kill-mutation |
| **B-2** deleting the depth-refusal call site left 484 green | one integration test: depth-3 M=2 refuses typed with ZERO `MODEL_CALL` rows | **CLOSED** — deletion now fails 2 shipped tests; 0 vs 33 rows measured |
| **B-3** arithmetic table understates the re-ratification | full regime picture at every depth + both candidate member sets, no recommendation | **CLOSED** — handoff rewritten, numbers independently recomputed |
| **A-2** bare catch laundering `PRODUCER_GRADING_FORBIDDEN` | preserve the typed code | **CLOSED** — code preserved and mutation-killed |

---

## 1 · B-1 — the mono-maker hole (CLOSED)

### 1a · The rev1 probe, re-run unchanged

My rev1 probe was a mono-maker run (`agent_count = 1`) at **depth 5**, an
explicitly unratified depth. It returned:

```text
rev1:  OPUS PROBE result.kind = COMPLETED
       depth=5 mono-maker: nodes= 1  reviews= 0  answers= 1
       projection condition_marks = []
```

The same probe, re-run against rev2 in the clone (`OPUS PROBE A`, real runner,
real embedded Postgres, provider double armed with 40 responses):

```text
rev2:  OPUS PROBE A depth=5 mono-maker: thrown=NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED
       resultKind=NONE providerCalls=0 modelCallRows=0 answers=0 nodes=0
```

Typed refusal, not silent completion. Zero provider calls, zero persisted
`MODEL_CALL` rows, zero nodes, zero answers. The guard at
`apps/runner/src/index.ts:525` is now called unconditionally — the
`if (effectiveMakerCount > 1)` wrapper is gone, and the call sits above the
`JUDGEMENT_SCHEDULED` append and every `authorPosition` provider call.

### 1b · The mark and its required record at a ratified depth

`OPUS PROBE B` — mono-maker at depth 1, full happy path, read back through the
real serve projection:

```text
OPUS PROBE B condition_marks = ["SINGLE-LINEAGE","CRITIQUE-UNAVAILABLE"]
OPUS PROBE B condition_mark_records = [
  {"mark":"SINGLE-LINEAGE","scope":"answer","subject_ref":"932716ba-…",
   "reason":"MONO_MAKER_RUN","lift_path":"RUN_DIFFERENT_MAKER_CRITIQUE","served_root_rule":null},
  {"mark":"CRITIQUE-UNAVAILABLE","scope":"answer","subject_ref":"932716ba-…",
   "reason":"DIFFERENT_MAKER_REVIEWER_UNAVAILABLE","lift_path":"RUN_DIFFERENT_MAKER_CRITIQUE","served_root_rule":null}
]
OPUS PROBE B node reviews = [null]
```

The node-level `review: null` is still honest absence — but it is no longer
*silent* absence. The answer now carries two typed marks, each with a required
record naming the cause and the lift path. `CRITIQUE-UNAVAILABLE`'s reason is
literally `DIFFERENT_MAKER_REVIEWER_UNAVAILABLE`, the code the unreachable
`selectDifferentMakerReviewer` would have thrown. That is the honest thing
DR-165(3) asked for, and it reaches the reader: both drawers map
`condition_marks` generically
(`apps/v2-ui/components/AnswerHonestyDrawer.tsx:126-130`,
`NodeDetailDrawer.tsx:421-423`), so the disclosure renders, not just persists.

### 1c · The DR-161-pattern gate refuses when the record is stripped

**Mutation M1 (clone):** replace the mono-maker `conditionMarkRecords` branch
at `apps/runner/src/index.ts:1033` with `[]`, leaving the marks in place.

```text
× tests/integration/database.test.ts > claims, judges through the HTTP gateway, propagates, serves, and settles
× OPUS PROBE B — mono-maker at ratified depth 1 discloses with mark AND record
  Serialized Error: { code: 'CONDITION_MARK_RECORD_REQUIRED' }
```

`assertRequiredConditionMarkRecords` (`packages/serve/src/index.ts:792-807`)
now lists both new marks in `REQUIRED_CONDITION_MARK_RECORDS`, and the gate is
called on the real serve path (`:911`). A mark without its record cannot be
served, and a record without its mark is equally refused
(`CONDITION_MARK_RECORD_WITHOUT_MARK`). **KILLED — mutation caught by a shipped
test, not only by my probe.**

*DR-137 tension:* correctly left to V. The handoff's `QUESTION FOR V #2` asks it
in as many words and the implementation keeps M=1 lawful — a disclosure, not a
ban. That is what I asked for and it is not the worker's call to settle.

---

## 2 · B-2 — the depth refusal is now wired-proof (CLOSED)

**Mutation M2 (clone):** delete the call site at
`apps/runner/src/index.ts:525` (replace with a comment) — the exact mutation
that survived the whole suite in rev1.

```text
rev1:  Test Files 68 passed (68) · Tests 484 passed (484)   ← SURVIVED
rev2:  Test Files 1 failed | 67 passed (68) · Tests 3 failed | 485 passed (488)
       × refuses depth-3 M=2 review coverage before persisting any model call
       × calls the depth guard for a mono-maker run before persisting any model call
       × OPUS PROBE A — mono-maker at depth 5
```

Two **shipped** integration tests fail (`tests/integration/database.test.ts:804`
and `:850`), plus my probe. Both assert the ordered pair:

```ts
await expect(runner.executeWorkItem(workItemId)).rejects.toMatchObject({
  code: "NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED"
});
expect(primary.calls()).toBe(0); expect(secondary.calls()).toBe(0);
// SELECT count(*) FROM ledger.ledger_entry WHERE run_id=$1 AND action_kind='MODEL_CALL'
expect(calls.rows[0]?.count).toBe("0");
```

**The zero-rows assertion is load-bearing, measured both ways.** I ran a
reporting-only census (`OPUS PROBE C`, depth-3 M=2, no assertions) against both
sources:

```text
guard present:  thrown=NODE_REVIEW_COVERAGE_ENVELOPE_UNRATIFIED  providerCalls=0   MODEL_CALL_rows=0
guard deleted:  thrown=NODE_REVIEW_UNAVAILABLE                   providerCalls=33  MODEL_CALL_rows=33
```

33 charged attempts is precisely the spend the ratified-envelope refusal exists
to prevent. The before-spend ordering is no longer a reading of the source; it
is a measured number. The DR-161 defect class ("the guard is correct but
deleting it leaves the suite green") is closed for this guard.

---

## 3 · B-3 — the arithmetic deliverable (CLOSED)

I recomputed every column from first principles a second time. `A(d)=2^(d+2)` =
8/16/32/64/128; healthy pre-XREV `A+4` = 12/20/36/68/132; healthy XREV `2A+4` =
20/36/68/132/260; full first try `2A+7` = 23/39/71/135/263; ratios
3.50/3.30/3.17/3.09/3.05 → 2.10/1.83/1.68/1.59/1.55; `3(2A+4)` =
60/108/204/396/780; `3(2A+7)` = 69/117/213/405/789. **Every number in the
rev2 table reproduces exactly.**

The three omissions I named are repaired:

1. **The false FITS/REFUSED column is gone.** The prose now names the basis
   under each verdict: *"Every first-try topology fits arithmetically under the
   present members, but none of the five depths fits a full three-attempt
   reservation. DR-165 separately rules operational coverage to depth 1–2, so
   the engine refuses depth 3–5 even though their first-try arithmetic is below
   the current member."* That is the honest statement; there is no longer any
   claim that "1 and 2 fit, 3 does not" is a coverage computation.
2. **The regime is presented, not five integers.** Healthy-spend columns and
   member/healthy ratios are in the table, with the headline stated plainly:
   *"XREV therefore halves ratified healthy-run headroom at every depth, not
   only depth 3+."*
3. **Both candidate member sets are placed before V without a choice.**
   `60/108/204/396/780` (restore 3× over healthy `2A+4`) and
   `69/117/213/405/789` (full three-attempt reservation for `2A+7`), explicitly
   labelled *"derived candidates, not ratified register values; AC-76 leaves the
   choice to V."* `QUESTION FOR V #1` now spans **all five depths**, not 3–5.
   No option is recommended. Correct under AC-76.

---

## 4 · A-2 — the typed code survives to the surface (CLOSED)

`apps/runner/src/index.ts:905-910` now rethrows `PRODUCER_GRADING_FORBIDDEN`
alongside the two budget codes instead of laundering it into
`NODE_REVIEW_UNAVAILABLE`. The database's refusal keeps its own name across the
repository boundary (`packages/judgement/src/index.ts:313-315` maps the raw
`PRODUCER_GRADING_FORBIDDEN:` message to the typed error) and now across the
runner boundary too.

Forced in the fixture, as ordered: `tests/integration/database.test.ts:1062`
runs an M=2 run whose two gateways record the **same** maker, so the DB trigger
fires on the recorded makers.

**Mutation M3 (clone):** remove `"PRODUCER_GRADING_FORBIDDEN"` from the rethrow
list.

```text
× preserves the database producer-grading refusal instead of laundering it
  expected TypedDomainError: No valid cross-maker re… to match object { code: 'PRODUCER_GRADING_FORBIDDEN' }
```

**KILLED.** A law violation can no longer wear the code that means "the model
call failed", and the test proves it stays that way. The same test asserts zero
served answers.

---

## 5 · Canary — a rev1-accepted property, re-checked

**The different-maker rule is still structural at the database, on the makers
actually recorded.** `migrations/0019_xrev01_node_review.sql:14-34` is unchanged:
it reads `maker` off *both* `ledger.raw_artifact` rows and raises
`PRODUCER_GRADING_FORBIDDEN`, and separately raises
`NODE_REVIEW_AUTHOR_LINEAGE_MISMATCH` when the node's own `provenance_ref` does
not match the claimed author artifact. Append-only guarantees intact:
`UNIQUE (node_id)`, `REVOKE UPDATE, DELETE`, `reject_mutation` trigger.

The depth-2 fixture (`tests/integration/database.test.ts:944-975`) still proves
16/16 coverage with `author_maker !== reviewer_maker` on every row, and then
probes the trigger directly by attempting a self-review insert:
`rejects.toThrow(/PRODUCER_GRADING_FORBIDDEN/)`. Still the strongest part of the
ticket: a mislabelled roster or a swapped gateway cannot get a same-maker
verdict into the ledger.

---

## Mutation ledger (all in the isolated clone; each reverted, byte-identity confirmed)

| # | Mutation / probe | Result |
|---|---|---|
| A | probe: mono-maker run at **depth 5** (rev1's B-1 probe, unchanged) | **FIXED** — typed refusal, 0 calls / 0 rows / 0 answers (was COMPLETED + 1 answer + 0 marks) |
| B | probe: mono-maker run at depth 1, read through the serve projection | **FIXED** — both marks + both required records present |
| M1 | strip the mono `conditionMarkRecords` → `[]` | **KILLED** — `CONDITION_MARK_RECORD_REQUIRED`, shipped test fails |
| M2 | delete the depth-guard **call site** (`:525`) | **KILLED** — 2 shipped integration tests fail (rev1: survived) |
| C | census: depth-3 M=2 spend with and without the guard | **0 vs 33** `MODEL_CALL` rows — before-spend ordering measured |
| M3 | drop `PRODUCER_GRADING_FORBIDDEN` from the rethrow list | **KILLED** — shipped test catches the laundering |

---

## ADVISORY (none blocking; carried forward for the ledger)

**A-12 (new) · `applyCriticUnavailableCap` is still unused, and its band cap is
not honoured.** The runner hand-mints `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`
and the `RUN_DIFFERENT_MAKER_CRITIQUE` lift path at
`apps/runner/src/index.ts:1012-1053` rather than calling the shipped
`applyCriticUnavailableCap` (`packages/critique/src/index.ts:340-354`), which
returns the same vocabulary **plus** `confidenceBandCapRequired: true`. In
`OPUS PROBE B` the mono answer served at `confidence_band: "TEST_TOP_BAND"` with
the default ceiling — disclosed, but uncapped. I do **not** block on this: rev1
offered exactly this shape as an acceptable fix, and minting a cap member would
be inventing a register value (AC-76). But the same law now lives in two places,
and the shipped function has no caller. Whether a mono-maker answer should also
carry a band cap is V's ruling, and it belongs next to `QUESTION FOR V #2`.

**A-1, A-3, A-4, A-5, A-8, A-9, A-10, A-11 carry forward from rev1 unchanged.**
Re-checked as still-true, still-advisory: no review-coverage check in
`runServeGateChain`; `selectDifferentMakerReviewer` is first-by-array-position
at N>2 with the choice recorded nowhere (a trap the moment M=3 lands — add it as
the fourth item to DR-162-A's M=3 audit obligation); the reviewer roster is a
hardcoded pair at the call site; DR-165(3)'s headline scenario (envelope
exhausting *during* the review loop) still has only a gateway-level unit test
(`tests/unit/xrev01-node-review.test.ts:101`), no run-level fixture; a loud stop
mid-review still leaves the reader no typed terminal (LOAD-01 adjacency); the
three UI minors stand.

**A-6 (proof re-readability)** is unchanged and unchangeable: the depth-1 proof
script deleted its own database. I accepted the proof's claims in rev1 on the
strength of its in-process assertions plus `acceptance/ceremony.test.ts:392-398`,
and nothing in rev2 disturbs that. No new paid run was required or performed.

**A-7 · Ops, and it now has a date.** I re-checked the standing database at
55432 read-only: `to_regclass('ledger.node_review')` returns **null**, and it
holds V's 2 pre-XREV runs. The reason is clean —
`migrations/0019_xrev01_node_review.sql` was created at 00:19, while the running
stack started at 23:24, so the live process is running **pre-XREV serve code
against a pre-XREV database**. That is a consistent state, not a broken one:
nothing is failing right now. But it means **XREV-01's serve path has still
never executed against the live database**, and `startStandingDatabase`
(`acceptance/standing-db.ts:49`) applies `migrate` on reuse, so the next restart
will apply `0019` and then serve the new projection. Two consequences to hand to
whoever runs the visual gate:

1. Restart the ceremony before V looks, so the serve projection runs at least
   once against the live schema.
2. After that restart, **every node on V's two existing debates will truthfully
   read "REVIEW N/A" / "House unavailable"** — they predate the review table.
   Tell V first, or a correct feature reads as broken on first sight.

---

## Path to greenlight

None. XREV-01 is done.

The three blockers were the coverage law's hole at M=1, an unwired guard, and a
deliverable that would have reached V understating what he must re-rule. All
three are closed by execution: a probe that flipped from COMPLETED-and-silent to
typed-refusal, a deletion that now costs two shipped tests, a measured 33-call
spend that the guard prevents, and a table that finally tells V the regime
rather than five integers. The M=2 path — the path V will actually look at — was
already lawful in rev1 and remains so.

— Opus 5 lens, XREV-01 rev2

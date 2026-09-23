CODEX REVIEW T4 r2 — CHANGES · comments read through: t04-r2-2026-09-01

# CODEX REVIEW T4 r2

## VERDICT

**CHANGES — 2 BLOCKING, 1 NON-BLOCKING.** R1 B1 and B2 are closed: the downgrade now
travels through the canonical vocabulary, is bound after each real `addNode()`, survives the
node FK, and is observed on the served node. R1 B3 is only partially closed: the terminal
suite counts now exist, but the report does not classify every failure/error as the r2 packet
requires. The D14 ui/web compiler gates are absent.

This verdict opens **round 3, the last lawful rework round**. B1–B2 and N1 return to T04;
there is no authorized round 4.

## FINDINGS

1. **B1 · BLOCKING · WHAT — both D14 surface-local typecheck gates are absent.** The r2
   diff adds one line to `apps/ui/lib/v3/labels.ts` and one line to
   `web/lib/v3Presentation.ts`, but the SUITES table reports only root
   `pnpm run typecheck`. Neither the report nor `logs/t04/` contains
   `tsc --noEmit -p apps/ui/tsconfig.json` or `tsc --noEmit -p web/tsconfig.json`
   evidence. **WHERE —** `agent-reports/t04-wok.md:221-230`;
   `DECISIONS.md:265-274`; packet `t04-codex-r2.md` priority 5.
   **WHY —** D14 states that root typecheck excludes both surfaces and explicitly requires
   both workspace-local gates with base classification; the r2 packet says absence is a
   finding. Root `TYPECHECK_R2_EXIT=0` proves nothing about these two changed files.
   **SUGGESTED FIX —** in the worker session, run and tee the two exact D14 commands on HEAD,
   record exit/error counts in SUITES, and classify any errors against unmodified-base runs
   (including web's ruled pre-existing `layout.tsx:3 TS2882` if it appears).

2. **B2 · BLOCKING (CANNOT-ASSESS) · WHAT — the terminal full-suite record is real, but its
   required attribution is incomplete and omits the unhandled error.** The log contains
   `26 failed | 1762 passed (1788)` plus `Errors  1 error`. The report proves 14 failures on
   `1c9578a`, cites T0/D13/F21 for others, but then contradicts itself: lines 311–313 claim
   all 26 are accounted while lines 315–324 explicitly decline attribution for a residual
   set. After removing `s13-contract` (already proven by the paired blast-radius run), eight
   failed tests remain without unmodified-base or ruled-flake classification:
   `acceptance/dual-maker-proof` (1), `memory-database` (1),
   `s7-authorization-database` (1), `obs-l3-s06-runner-binding` (4), and registration's
   `S3d` arm (1). The log's unhandled
   `ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP` rejection, attributed by Vitest to the S7
   test, is not mentioned in the report at all. **WHERE —**
   `agent-reports/t04-wok.md:240-324`; `logs/t04/test-r2b.log:36134-36160`.
   **WHY —** packet priority 3 requires every failure to be named PRE-EXISTING against the
   lane's own base evidence/F21 class or owned; router §2.6 also requires every failure to be
   named. “Present on the r1 tree” is only pre-existing-to-rework, not D12's
   pre-existing-to-lane proof. The static “not in my blast radius” claim is also unsafe:
   `memory-database` imports serve, S7 imports judgement/serve/contract, and the four S06
   tests import runner/kernel. D15 defers the authoritative integration run but does not
   authorize the report to call unknowns accounted. **SUGGESTED FIX —** provide paired
   unmodified-base↔HEAD evidence or an applicable ruled flake/ticket for each residual test;
   classify the unhandled error separately; then make the classification cardinality equal
   26 failed tests plus one error. If evidence remains unavailable, say CANNOT-ASSESS and
   route it to V rather than retaining the “all accounted” claim.

3. **N1 · NON-BLOCKING · WHAT — the report understates and incompletely lists the committed
   diff surface.** It says “eleven files” and its table omits
   `dialectical-engine/tests/unit/judgement.test.ts`; the packet-prescribed
   `git diff --name-only 1c9578a..HEAD` returns twelve files. **WHERE —**
   `agent-reports/t04-wok.md:14-29`. **WHY —** scope evidence must be mechanically complete;
   this omission does not hide an out-of-scope edit, but the stated count/list is false.
   **SUGGESTED FIX —** regenerate the table from `git diff --name-only 1c9578a..HEAD`, add
   `judgement.test.ts`, and change eleven to twelve.

## R1 CONVERGENCE CHECK

- **B1 CLOSED.** `WAY-OF-KNOWING-DOWNGRADED` is mid-list in kernel
  `CONDITION_MARKS`; contract derives `ConditionMarkSchema`; runner emits the answer mark and
  typed records; serve persists `affectedNodeIds` and projects their links onto nodes. The
  DR-176 `slice(-4)` tail is unchanged.
- **B2 CLOSED.** Judge-time downgrade data contains no subject. Root and child records bind
  only after `writer.addNode()` returns. Migration `0006_s05.sql:185-188` gives
  `condition_mark_node.node_id` a foreign key to `core.node(node_id)`. M5's work-item
  rebinding is rejected with `ANSWER_PERSIST_FAILED`, and the production-seam test reads the
  subject id from the served node.
- **B3 PARTIAL / B2 ABOVE.** The r1 and r2 terminal counts are now present and match their
  logs; classification coverage does not yet meet the packet.
- **B4 CLOSED BY J5 AND IMPLEMENTATION.** Exactly one mapping line was added to each of the
  two ruled UI switches; nothing else in ui/web changed.
- **N1 CLOSED BY D12.** The report uses its own paired unmodified-base probes rather than
  treating T0's pre-provisioning counts as authoritative. The remaining problem is incomplete
  application, not the stale packet premise.

## PACKET REVIEW

**CONFORMANT.** The r2 packet's board round, report path, claimed HEAD `7d179c6`, governing
rulings, J5 bounds, suite counts, and F5 guard all resolve. It explicitly identified D14 as
a gate and required full failure classification; B1/B2 are execution/report defects, not
packet ambiguity.

## EVIDENCE CHECKED

- Revised marker and body hash verified verbatim:

  ```text
  REWORK READY FOR REVIEW — T4 r2 · comments read through: t04-codex-r1-2026-09-01
  8f83778e68a4841c7e0b777a8162830f2df4f6c2bc357a507553f21472c376fc  -
  ```

- Packet-prescribed log/diff position:

  ```text
  7d179c6 T4 r2: make WAY-OF-KNOWING-DOWNGRADED a canonical, visible mark on the real node
  73fb096 T4: drop RAN from the judge output schema and disclose way-of-knowing downgrades
  ```

  Fresh `git status --short` produced no output. Base-to-HEAD diff is 12 files,
  406 insertions and 11 deletions. Rework-only ui/web numstat is exactly `1 0` for each;
  serve is `1 1` for the single union-line replacement. Q51 and serve line 562 are absent
  from the diff.

- R2 production-seam RED log:

  ```text
   Test Files  1 failed (1)
        Tests  1 failed | 60 skipped (61)
  RED_R2_EXIT=1
  ```

- Three named C3a logs each contain `Test Files  8 passed (8)` and
  `Tests  152 passed (152)` with `C3A_RUN1_EXIT=0`, `C3A_RUN2_EXIT=0`, and
  `C3A_RUN3_EXIT=0`. Three PostgreSQL seam logs each contain
  `Test Files  1 passed (1)` and `Tests  1 passed | 60 skipped (61)` with exit 0.

- Root typecheck log contains:

  ```text
  GEN_EXIT=0
  TYPECHECK_R2_EXIT=0
  ```

  Exact report/log search for `tsc --noEmit`, `apps/ui/tsconfig`, and `web/tsconfig`
  returned no D14 rows or logs.

- Terminal suite logs verified:

  ```text
   Test Files  20 failed | 198 passed (218)
        Tests  26 failed | 1762 passed (1788)
       Errors  1 error
     Duration  3036.07s
  TEST_R2B_EXIT=1
  ```

  `rg '^ *FAIL .* > ' ... | sort -u | wc -l` returned 26 for r2 and 24 for r1; `comm`
  showed exactly the two r2-only failed tests named in the report. Both isolated delta reruns
  contain exit 0. Paired scaffold, blast-radius, and database-seam log counts match the
  report.

- Static M5/FK check: `migrations/0006_s05.sql:185-188` defines the node FK; mutant log
  contains:

  ```text
  AssertionError: expected TypedDomainError: ANSWER_PERSIST_FAILED { code: '…' } to be null
   Test Files  1 failed (1)
        Tests  1 failed | 60 skipped (61)
  ```

- Did **not** run pnpm, tests, builds, typecheck, database fixtures, stash, checkout, or any
  dynamic command; the r2 packet requires static review. Did not verify the absent D14 gates
  or classify the eight residual failures beyond the evidence named above.

## PREDICTIONS

I predict a code-focused lens will approve because the real-node path and J5 bounds are now
strong, but may miss D14 by treating green root typecheck as universal. I predict a
suite-focused lens will compare only the +2 delta and accept “present in r1” as pre-existing,
without noticing that D12's category is pre-existing to the unmodified lane base or that the
terminal block contains a separate unhandled error. First checks: grep the report for both
D14 command strings, then require a one-to-one mapping from all 26 failure headers plus the
error block to cited classification evidence.

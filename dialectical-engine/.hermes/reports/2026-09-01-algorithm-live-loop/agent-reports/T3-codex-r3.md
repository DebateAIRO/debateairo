CODEX REVIEW T3 r3 — CHANGES · comments read through: t03-r3-2026-09-01

# T3 flagship lane — final static verification

## Verdict

**FINAL-ROUND CHANGES. Two findings: B7 blocking, N6 non-blocking record residue. There
is no round 4; both are V-packet-row-ready.** B6 closes for `PANEL-PARTIAL`, and the
sibling's current implementation closes steps one through four. The remaining blocker is
the packet's explicit fifth-step proof for the all-failed sibling: its acceptance test
still reads only raw receipt JSON and never consumes the canonical projection.

This seat obeyed the STATIC-only boundary. I ran no tests, builds, live provider calls,
or product writes. Existing logs are upstream evidence; all fresh probes were read-only.

## Independent verification

- Packet/board/report integrity: the board is at `rework_round: 2`; the r3 worker marker
  resolves; and `sed '$d'` reproduces report SHA
  `4f40925ffd9cb54a152fd2cc946927b1d9de9bd9d6909ea3f6136eee7b5126b3`.
  Actual r3 commit order is `4b743cc`, `d8586db`, `eb90d68`. The 11-file r2-to-r3
  delta is `+169/-8`, `git diff --check` is empty, and the lane worktree is clean.
- **B6 step 1 closes for both arms.** Kernel `CONDITION_MARKS` mints
  `PANEL-PARTIAL` and `PANEL-DEGRADED-SINGLE-VOICE` together at `:84-85`, beside the
  panel/lineage degradations and before the DR-176 tail. The new T3 test re-pins
  `slice(-4)` to the unchanged hidden-material tail.
- **Step 2 closes for both arms.** The new unit test asserts both kernel memberships and
  both `ConditionMarkSchema.parse` calls. The existing vocabulary RED is the desired
  failure (`expected … to include 'PANEL-PARTIAL'`), and the filed GREEN is 12/12.
- **Step 3 closes for both arms.** `ConditionMarkRecord.mark` names both values in the
  serve union (`packages/serve/src/index.ts:806-810`).
- **Step 4 closes for both arms.** `PanelDegradationMark` is the two-member typed union;
  `runNodePanel` returns typed marks; both root and child judgement producers bind them to
  the minted node; and the shared record projection emits node-scope records with the
  affected node and arm-specific lift path (`apps/runner/src/index.ts:152-165,
  1490-1539,1674-1684,1853-1863,2032-2042,2557-2576`).
- **Step 5 closes only for `PANEL-PARTIAL`.** The M=3 database fixture reads the answer
  with `ServeRepository.readAnswerProjection`, asserts the answer mark, finds a
  node-scope typed record, and pins affected-node and reason evidence
  (`database.test.ts:2952-2967`). Its projection RED is the desired assertion failure;
  the filed GREEN is 1/1. B7 records the sibling gap.
- **Forced vocabulary consumers close.** The three handwritten pins move exactly 29 to
  31 in `s14-ui`, `dr174-resilience`, and `obs-l2-s02-registry`. Both exhaustive
  presentation switches add exactly one branch per new member. The four-suite vocabulary
  consumer log is 60/60, and generated contract output has no delta.
- **D16 closes with base classification.** The apps/ui base and HEAD logs are
  byte-identical one-line TS2882 failures for `apps/ui/app/layout.tsx`; the web pair is
  likewise byte-identical for `web/app/layout.tsx`. Both pairs exit 1 on base and HEAD,
  so the r3 delta is zero errors. Root typecheck's filed log exits 0.
- **Stale scope and delta scope close.** The trap file retracts the expiring r2
  “kernel untouched / D16 does not gate” premise and records the closed-vocabulary chain.
  The r3 delta contains only the kernel/serve/runner mint, its partial projection test,
  forced UI/count consumers, and the two related trap notes. No migration changed.
- Filed suite summaries match the report: cluster A is 1235/1248 with the same 13 failures
  in all three runs; cluster B is 5/5 in all three; cluster C is 63/64 with the same
  pre-existing `staleness_state` failure in all three. These were inspected, not rerun.

Fresh static probe, output verbatim:

```text
$ rg -n 'PANEL-DEGRADED-SINGLE-VOICE|readAnswerProjection|condition_mark_records' dialectical-engine/acceptance/panel-multi-maker.test.ts
340:  it("confirm-item 5 — marks PANEL-DEGRADED-SINGLE-VOICE and steps the band down when every non-author member fails", async () => {
423:        expect(row.disagreement.marks).toContain("PANEL-DEGRADED-SINGLE-VOICE");
$ git diff --quiet 7a573ef..HEAD -- dialectical-engine/acceptance/panel-multi-maker.test.ts
all-failed-acceptance-delta=NONE
$ rg -q 'TS2367' logs/t03
ts2367-filed-log=ABSENT
$ cmp d16-apps-ui-BASE.log d16-apps-ui.log
apps-ui D16 payload: BYTE-IDENTICAL
$ cmp d16-web-BASE.log d16-web.log
web D16 payload: BYTE-IDENTICAL
```

## Findings

### B7 — the all-failed sibling has no canonical production-seam assertion

**File/line:** `dialectical-engine/acceptance/panel-multi-maker.test.ts:340-444`;
compare `dialectical-engine/tests/integration/database.test.ts:2952-2967`.

**Scenario:** regress the shared projection so it emits records only when
`record.mark === PANEL_PARTIAL_MARK`, while leaving `runNodePanel`'s receipt marks
unchanged. The vocabulary/schema test stays green because both values remain canonical;
the M=3 partial projection test stays green; and the all-failed acceptance test stays
green because it directly selects `ledger.reduced_judgement.disagreement` and asserts
only that raw JSON at line 423. No test then detects that
`PANEL-DEGRADED-SINGLE-VOICE` disappeared from the answer's parsed condition marks and
node-scope records.

The current shared code does project the sibling correctly; this is a missing
discriminating proof, not a claim of a present runtime drop. But the final packet requires
the sibling's mechanics to equal `PANEL-PARTIAL` on **all five steps** and specifically
says the all-failed arm consumes the canonical mark. It does not: the acceptance file has
no `readAnswerProjection` or `condition_mark_records` occurrence and was untouched in r3.

**V-packet residue, no round 4:** extend the existing all-failed acceptance fixture to
resolve its settled answer, read it through `ServeRepository.readAnswerProjection`, and
assert (a) answer `condition_marks` contains `PANEL-DEGRADED-SINGLE-VOICE`, and (b) its
typed record is node-scoped, names a non-empty affected-node set, and carries the failure
reason. The one-arm filter above is the refutation target.

### N6 — the quoted TS2367 RED has no filed log capture

**Artifact/line:** worker report `t03-panel.md:740-746`; T3 log directory.

The report quotes the desired compile failure—comparison against `PANEL-PARTIAL` had no
overlap with the pre-mint union—but repository-wide inspection of the filed T3 logs finds
no `TS2367` frame. `b6-RED-vocabulary.log` and `b6-RED-projection.log` exist and contain
their desired assertion failures; neither contains the compiler frame. This does not
invalidate the current implementation or its green root typecheck, but the quoted frame
is testimony rather than replayable log evidence.

**V-packet residue:** record the frame as report-only testimony, or attach the original
command/output/exit capture if it exists outside the filed log surface. Do not describe it
as log-backed evidence without that artifact.

## Not independently verified

- No suite, typecheck, database fixture, generator, compiler gate, or provider call was
  rerun; the packet prohibited them.
- D15 full-suite product proof remains deferred to the integration batch.
- I did not inspect the 1,959-line spine.

## PREDICTIONS

I predict another lens will approve the sibling because the shared two-member union and
projection loop are correct today, missing that the packet asks for independently
discriminating proof on both arms. I predict a second lens will treat the all-failed raw
receipt assertion as canonical consumption because J13(c) ratified receipt-as-surface;
the counterexample is a projection filter that drops only the sibling while leaving that
receipt untouched. Because no round 4 exists, I expect V may absorb B7 as proof-only
residue; if so, the row must preserve the exact one-arm mutant and the missing
`readAnswerProjection` assertions rather than merely say “add coverage.” Finally, I
predict at least one audit will repeat the TS2367 quotation as if it came from a filed RED
log; the first check is `rg TS2367 logs/t03`, which currently returns no match.

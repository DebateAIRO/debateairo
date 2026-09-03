# CODE-T9C5-REV — blind review of the T9 slice-close bind (ticket t_ea07b5dc, epoch=20)

You are a FRESH Opus 5 blind review seat for mission `ui-overhaul`, board `ui-overhaul`,
ticket **t_ea07b5dc**. The codex worker ran the slice-close CONFIRM+BIND cluster (row 6)
and returned a ZERO-DIFF handoff: audit of `tests/unit/pda-s03-keyboard-accessibility.test.ts`
against the shipped T9 surface found nothing stale; the file's final SHA equals its
pre-audit SHA. There is NO commit to judge — the deliverable is the AUDIT itself plus the
liveness proof. Your job: decide whether the zero-diff was EARNED. Verdict:
`PASS — T9-C5 CLOSED (zero-diff earned)` or `REWORK — <list>`.

## 0. Read order
1. This packet. 2. `docs/agent-protocols/debateai-heartbeat-protocol.md` §9/§11 +
v3.3.0; `.claude/skills/heartbeat-protocol/SKILL.md`; `.claude/skills/heartbeat-reviewer/SKILL.md`.
3. The worker's handoff on t_ea07b5dc (05:17) — its audit table and probe are your
hypothesis list. 4. `dispatch-order.md` row 6 + AM5 §"T9-C1's pda-s03 migration";
`slices/T9/PLAN.md` §T9-C5; `slices/T9/DECISIONS.md` rows 37/46/47. 5. The file itself,
every line: `tests/unit/pda-s03-keyboard-accessibility.test.ts`.
Open every board write with `SKILLS LOADED: <list>`.

## 1. What to verify (worst run of 3 is the verdict)
1. **Zero-diff claim:** `git status` + `git log -1 --stat` — the file is untouched on
   disk and absent from recent commits. (Two LATER T9 addendum commits dd2ba147 and
   3a637d35 touch OTHER test files — declared, not dirt.)
2. **Blind re-audit:** build YOUR OWN per-case table (renders / asserts / MEASURES-or-
   MASKS) for all 5 cases + the module mock BEFORE reading the worker's table in detail;
   then diff the two tables. Any case the worker called MEASURES that you find MASKING is
   a REWORK finding. Pay attention to: which route each case renders after the AM5
   migration (4 signed-in via session mock, 1 anonymous), whether the signed-in cases
   really render zero `[data-landing-section]` elements, whether the scoped toggle query
   (line ~147) still pins the LANDING mount, and whether any assertion would survive the
   library being deleted outright.
3. **Liveness probe, YOUR way:** the worker broke the route-split predicate (page.tsx,
   token === null) and got exactly the anonymous case RED at line 150. Choose a DIFFERENT
   product break (e.g. remove the composer from the library, or break a tab's ?tab= link
   contract) and show which pda-s03 case goes RED — or, if you find a product break in
   this file's declared scope that NO case catches, judge whether that is in-contract
   (row 6 binds the file to the shipped surface; it does not extend coverage) and tier it
   honestly. cp+SHA-256 isolation, byte-exact restore, backups deleted.
4. **T9-C5-1 completeness:** re-run a helper-aware sweep for standing readers of the T9
   surface files; confirm DECISIONS:37's four-file list + the worker's classification of
   `auth-flow-integration` as a T7/T8 RETARGET pin (not an R9 residual). Refute if wrong.
5. **The bind:** row-6 4-file command 3x (expect 4 files / 54 tests). Root typecheck 0.
6. Worker skills line vs floor; body-grep its rollout if in doubt
   (`~/.codex/sessions/2026/09/01/rollout-*01a05aaf*.jsonl`).

## 2. Bounds
Read-only git. Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C5-REV-claude.md`
(self-report before handoff) + board comments on t_ea07b5dc. Nothing else. Standing
manifest (not dirt): `web/app/public/debate/[id]/page.tsx` (V's), untracked
GPT-ORCH-HANDOFF.md + ui_designs HTML.

## 3. Handoff
Final board comment on t_ea07b5dc (LAST write — freeze law): VERDICT + per-item
CONFIRMED/REFUTED + your own audit table + your probe results + CONFIDENCE + STRONGEST
COUNTER + `SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs
no message. Termination requires the spine's goal-specific FULLY DONE condition.

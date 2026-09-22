# PACKET — worker T9B (role as a predicate in producer binding) · AUTHORIZED BY V 2026-09-03, LIVE · spine §4

**AUTHORIZED AND LIVE — V ruled on 2026-09-03; this packet is dispatched.** (Original standing text follows, kept for the record.)

**This packet did not authorize work when written.** It is written in advance of V's ruling on
V-S07-CODEX-r4-1 and V-S07-CODEX-r4-2 so that no drafting time is spent after the ruling.
It becomes live only when the orchestrator sends a dispatch message naming it. If you are
reading this without such a message, stop and say so.

## 1. Ticket-state block
Ticket: `<mission>/board/T9B-role-predicate-binding.md` (rework rounds max 3; markers state the
filing label AND the rework count, J19). Writable surface: EXACTLY the ticket's allowed list —
lane worktree `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07`
(branch `lane/s07`, tip at staging `9a3a5f6074fd42da56b74674e1e2f45406ff436d`, porcelain clean),
report `agent-reports/s07-synthesis.md`, self-report `agent-reports/s07-synthesis-self.md`,
`logs/s07/**`. Never push; never merge out; never edit board or DECISIONS files.

`<mission>` means
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`.

## 2. Your base is stale — step 0 before any code
`lane/s07` is NOT on the integration tip. Integration is `44836ecf101066c822f317233912c0c99beab2dc`
(TINT1, T6, S06, T7). Merge it into `lane/s07` first, re-run `pnpm install --frozen-lockfile`
and `pnpm run generate:contract` if the lockfile or contract sources moved, and resolve conflicts
by understanding both sides. You may NOT weaken any landed lane's assertion to make the merge
green; a genuine conflict with a landed assertion is a finding you file and stop on. Note that
T3C and S08 may also have landed by the time you are dispatched — the orchestrator will say.

## 3. The charge, from codex r4 B1 and B2 (read both verbatim first)
`<mission>/agent-reports/S07-codex-r4.md`.

**B1 — role must be a PREDICATE.** Today `bound.role` is only interpolated into error text.
A legitimate round-1 synthesizer artifact `A` submitted as BOTH candidate and verdict, with its
real key `COMPOSER:SYNTHESIZER:INITIAL:1` in both positions, passes every check: both suffix
checks pass and both ledger queries return the same valid row. A synthesizer response commits
as the evaluator verdict. Swapping two real role pairs passes the same way. Fix at
`packages/serve/src/index.ts:1783-1809`: derive the expected call-site key INSIDE persistence
from the typed role, `synthesizerRequest.stage`, and `round`, through ONE shared builder used
by both runner and serve; require equality; resolve the ledger entry only after. No stored
round column. This also makes a future key-format change fail closed until the shared
expectation changes.

The existing negative arm at `tests/integration/database.test.ts:4970-5001` does NOT cover
this: it supplies NONEXISTENT keys, proving an invented pairing is rejected. Add REAL-PAIR
arms: evaluator-as-candidate, synthesizer-as-verdict, and one artifact/key used for both roles.
RED first — each new arm must fail before your fix and pass after, and you file both logs.

**B2 — two credited pins do not exist.** R5M1 died of `42P18 could not determine data type of
parameter $2`; R5M2 died of `23514` from a work-item constraint after `persistTerminalRun`
settled a reused queued work item. Neither death was caused by the assertion it was credited
to (D43). Rebuild both: drive the production writer through `ServeRepository.persist` BEFORE
the unrelated `work.settle`, so guard removal RESOLVES rather than dying later; use a
type-valid run-only producer mutant; emit every transcript through `<mission>/tools/mutate.sh`
so each carries the D42 custody fields, and name the exact targeted assertion in each. The four
R5 records as filed are inadmissible; the 15 previously accepted mutants stand.

**Record correction travelling with the lane.** The report's "nineteen mutants across five
campaigns" is not established. Correct it to what the admissible evidence supports. Do NOT
re-run the four earlier campaigns.

## 4. Evidence contract
Capture EVERY gate through `<mission>/tools/gate-run.sh` (D45): it emits the measured
checkout's own commit and tree, porcelain before and after, the exact unpiped command, raw
output, the command's own exit, and a clean-state verdict. A record that asserts its own
provisioning is inadmissible. Check records with `<mission>/tools/stamp-check.sh <lane> <prefix>`
before filing. Take gates AFTER you commit (D27). All evidence to `<mission>/logs/s07/`, never
a lane-local `logs/` (gitignored, dies with the worktree). Cite every artifact by absolute
path. Report suites verbatim as `passed/total`, name every failure and whether it predates you.

## 5. Handoff marker
Line 1: `READY FOR PEER REVIEW — T9B r1 (rework 0/3) · comments read through: s07-codex-r4-2026-09-02`;
line 2 `report sha256:`; the self-report precedes the marker.

## 6. Stop conditions
- A conflict with a landed lane's assertion: file the finding and stop; never weaken it.
- If the shared builder cannot be placed without widening T9's scope, stop and say so — scope
  widening is V's, not yours.
- Final message = `FILED: <path>` + marker + the RED and GREEN log paths for each new negative
  arm + the rebuilt mutant transcript paths.

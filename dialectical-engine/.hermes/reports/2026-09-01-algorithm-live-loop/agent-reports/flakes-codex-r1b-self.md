CODEX REVIEW FLAKES r1b — CHANGES · comments read through: flakes-r1b-2026-09-08
SKILLS LOADED: none; packet-directed static review and saved-artifact audit.
Counts: 2 P2 blocking findings in the companion review; no additional findings in this self-report. POL-03 clear.

## Review accountability

I read the complete reviewer packet first. I then read the prior verdict, worker packet/amendment and dispatch, worker filing and self-report; inspected the complete immutable rework diff and affected evaluator/issuer/disposition paths; checked final-tip gate and mutant artifacts; and executed the canonical stamp comparator and an isolated merge-tree. No subagents were used. No acceptance tests or source mutations were run.

The reviewed identity is `lane/flakes` at `5e3bd0e0dc1b56d9a64c3f8276b5e416e6f80578`, two commits after dev `169941c6f1d9d2e50019550f78cb48d89288c49c`. The worktree was clean before and after inspection. Only the two requested report files were written persistently; temporary merge objects were created outside the repository and removed. No install, push, source Git mutation, board edit or DECISIONS edit occurred. STRENGTH: entailed by the operations performed and Git inspection.

## Findings and strength discipline

**F1, P2 — File/line:** `tests/integration/registration-database.test.ts:6652`, `:6846`, `:7110`, `:7128`.

**Input → wrong outcome:** an unresolved effect accompanied by at least five qualifying issuer delays earns a successful skip without evidence distinguishing product work from external interference. The issuer and in-process API share execution. The new condition does not consume endpoint scores, but that does not make its inputs causally independent of the product.

**Required fix:** retain red with cadence diagnostics unless a justified independent invalidation condition exists; cover the coupled product-delay case and correct the independence explanation.

**STRENGTH:** entailed for code structure, arithmetic and disposition; consistent-with for a product regression producing the combined inputs. I did not claim or build a product exploit or validate a production timing defect.

**F2, P2 — File/line:** `tests/integration/registration-database.test.ts:6977`, `:7017`, `:6853`, `:7304`.

**Input → wrong outcome:** skip-only removal of the cause is not observed by controls that inspect only the skip outcome and the red message. The filed mutant removes shared formatting and is killed on the red path.

**Required fix:** if the skip remains, pin the complete message delivered through its actual boundary and kill a delivery-scoped mutant. If F1 removes the skip, this skip-specific obligation disappears.

**STRENGTH:** entailed static data flow and saved mutant payload; no rerun survival claim. Current code does deliver the complete cause to the skip. The defect is the explicitly requested delivery contract remaining incomplete.

## What could have misled this review

- A clock reading before a request is easy to call “independent.” The next clock reading occurs after work on the same event loop; the interval can include the very product behavior under review. I traced the request and timer between both endpoints before judging the claim.
- The four controls are meaningful improvements. I did not dismiss them because F1 remains open: accuracy-only and single-replicate cases naturally reach INCONCLUSIVE and stay red with valid cadence. Their synthetic cadence inputs, however, cannot demonstrate independence of the live instrument.
- A mutant failure can be correctly recorded yet cover a narrower property than the report claims. The endpoint mutant really fails at the red cause assertion; it does not exercise skip-only receipt removal.
- Existing numbers can acquire new policy meanings. The 100 ms and 0.025 values are unchanged numerically, but their scheduling-validity roles were introduced in this rework.
- Green records are not equivalent to live coverage of a rare branch. All six unmutated new-tip T9 gates are GREEN. The constructed skip only asserts an outcome.

## Evidence custody

Rechecked all 12 gate headers and tracked before/after states, all three mutants' headers/payloads/completion records, and matching before/after registration-test hashes against the head blob. Recompared all three baseline and all three new-tip compiler diagnostic bodies: eight diagnostics each, identical SHA-256 `b4602fbc2fd076c4528a006b8b7d70299042153cda597d584def2b471b66a3be`. No typecheck success is inferred from identity. The canonical comparator freshly returned exit 0, `records compared: 16 · failures: 0`, ending `OK: every record stamps the filed tip`. STRENGTH: entailed.

POL-03's child, harness, integration test and pool source match r1 byte-for-byte; three new-tip file gates also pass. The three prior whole-file logs remain identified as r1 evidence with their known S3d failure, not new-tip passes. Source outside the one reworked T9 test was compared directly and is byte-identical to r1. STRENGTH: entailed for source/records; consistent-with for unchanged runtime behavior of unrerun rows.

## Packet audit

Scope and required new-tip record population clear. F1/F2 completion charged only as the two findings above. Issuer instrumentation is within AMENDMENT 1's explicit measurement-condition request; no artificial output-only scope charge was added. The report's 107.448 ms first-attempt measurement has no matching raw log in the supplied flakes log tree and is qualified, not alleged fabricated. The observed 118.866 ms/one-breach gate is independently located. Worker skill-loading history is declared but not independently attested. STRENGTH: entailed for searches, source and declarations; undetermined for absent history.

## Landing

Isolated `merge-tree --write-tree` exited 0 without conflicts against dev `169941c6f1d9d2e50019550f78cb48d89288c49c`. Result tree `11c66c299ac010ccf095fe01881511057eb2210f`, identical to HEAD. Source Git remained unchanged. Textual landing is clear; semantic recommendation remains CHANGES. STRENGTH: entailed.

## Not verified

No tests, typechecks, load probes, mutants, full suite or product-regression reproduction were executed by this reviewer. No listen() refusal is claimed. No exact-base whole-file run or Node 22.23.1 validation is supplied. Skip-only receipt removal was analyzed statically, not executed. I did not independently attest historical executions, unfiled calibration measurements or skill invocations.

Review tooling corrections: an initial broad combined read exceeded the output budget; relevant material was reread in bounded chunks. Initial ripgrep searches inherited ignore rules, so the missing-calibration-record search was repeated with `--no-ignore`. A guessed runner declaration path and API filename were corrected through file inventory. No conclusions rely on those failed lookups. These were read-only review errors, not source changes or acceptance results.

REWORK: changes — the review verifies the new controls and records while keeping the product-coupled cadence waiver and the retained skip's missing delivery contract open.

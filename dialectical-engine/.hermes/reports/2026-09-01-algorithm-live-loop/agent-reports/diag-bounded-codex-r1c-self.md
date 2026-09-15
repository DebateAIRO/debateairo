CODEX REVIEW DIAG-BOUNDED r1c — APPROVE · comments read through: diag-bounded-r1c-2026-09-07

Counts: **0 must-fix findings; F2/F3 closed; C1/C2 carried; 1 nonblocking expected-list provenance qualification.** Reviewed tip `d797d8052c10bd095373f238d4c456064be77fe1`, base/dev `d5b4f7f568aceec55a9cfca72b62473e7ee26c19`. This is the reviewer's self-report; `diag-bounded-codex-r1c.md` contains the complete source evidence and verdict.

Skills applied: using-superpowers, codex-security:verify-fix and its static-assessment reference, verification-before-completion. The user's explicit two-file Markdown contract overrides verify-fix's default JSON-only/no-artifact output. No implementation, full security scan, delegation, or mutation workflow was used.

## The case: separate storage does not supply separate evidence

The main risk in this review was accepting the new committed expected list as proof of its own correctness. The worker repaired the old runtime tautology: tests no longer read the implementation and immediately affirm it. However, the map, citations, and expected snapshot still share extraction provenance. A bad regex could supply the same wrong member to all three artifacts.

That distinction does not make the new tests worthless or violate the amendment. They now detect subsequent drift relative to an explicit snapshot, and AMENDMENT 2 expressly accepts that design. It means their initial contents need a separate check. I kept map/citation/expected values out of the producer derivation, reconstructed declarations with TypeScript syntax trees and explicit argument flow, and compared the resulting set afterward.

The independent result is 398 codes: 420 direct literal constructor sites, two subclass `super` declarations, and 98 resolved rows from 13 nonliteral constructor sites. No missing or excess member appears in either map, the expected domain array, or the citation key set. All 420 direct citation locations match the named base revision. I checked the ten positive cases including both subclasses and the eight prior spot-checks, plus the three excluded non-code values. STRENGTH: **entailed** by the independent enumeration and source inspection.

## What could have misled the review

The prior round's omission of `super(...)` was a warning against repeating a constructor-only audit. This time I included class heritage and `super` arguments before claiming the set complete. I also checked import aliases and other identifier-use forms in the stated scope; no additional unresolved form appeared. The completeness claim remains bounded to that source scope and its declared-code producers, not arbitrary runtime values accepted by the kernel's string-typed constructor.

The runner's source-text read initially looks different from the API test's runtime array. I compared its extracted strings with independently parsed array initializers: both yield precisely the same 398 domain and 215 message values at this tip. That establishes present equivalence, not parser correctness for arbitrary future TypeScript. Treating that limited implementation as a universal parser would overstate the result. STRENGTH: **entailed** for present equivalence; **undetermined** for arbitrary future declaration syntax.

The h mutant changes two membership facts by replacing a legitimate code with `MATCHED_EXISTING`. Its saved test stops at the explicit non-code rejection, so the intended kill is established without borrowing credit from the later membership comparison. Likewise i stops at the real provider-call subclass assertion, not the second subclass or raw-field checks. The worker's h/i table shorthand must remain narrower than the complete test result. No additional mutant is necessary to clear the two charged defects.

## Evidence discipline and self-charges

Some initial batched reads exceeded the aggregate output budget. I recovered truncated required material with bounded reads, then raised the output budget explicitly for the full nine-transcript read. I used exact extraction for large integration summaries and exit markers and do not claim to have read every database-log line. This was avoidable tool-output overhead; it did not justify treating omitted text as inspected.

I did not turn the shared-provenance qualification into another CHANGES round. The operative requirement explicitly permits a committed expected list; the current declared membership is independently correct; the required explicit controls run; and the saved mutants kill for their intended assertions. Requiring a new committed extraction framework now would expand the landing contract. The qualification belongs in the evidence description and future refresh method.

I also kept current execution separate from historical evidence. The only application tests I ran were the three permitted unit files, once each, together: 19/19 passed, exit 0, 2.73 seconds on Node v25.7.0. All nine saved mutant transcripts were read fully and their source hashes matched to current files. The database and rollback test are byte-identical from r0 through this tip, supporting b/c reuse under the packet's exception. Typecheck's eight diagnostic lines were freshly compared with the saved base; they match byte-for-byte, but the saved typecheck still exits 1. STRENGTH: **entailed** for fresh execution and artifact comparisons; **consistent-with** for historical executions beyond the retained records.

No new exploitable path, production disclosure, or externally controlled code input was inferred. F2 and F3 were vocabulary/contract regressions at an already closed output boundary. Fixing them preserves that distinction.

## Packet audit

AMENDMENT 2 is clear and fulfilled: remove the false members, resolve the actual evaluator loop, include subclass producers, add explicit negative and real-class controls, commit an expected membership snapshot, repair citations and attribution, and refresh the required evidence. The packet/dispatch equality, allowed file scope, final-tip stamps, and provisioning record were checked. No shared-module extraction or rollback redesign is a landing prerequisite. STRENGTH: **entailed** for the requirements and artifact facts; **consistent-with** for accepting the scoped design.

A useful future packet clause would distinguish two questions explicitly: “Does the map match its reviewed snapshot?” and “Was that snapshot independently derived from producer semantics?” A second filename is not a second method. The current review supplies the second method without requiring new production or test architecture.

## Landing

Fresh isolated merge-tree computation exited 0 and returned `b5500995e0816b5b2de9dbe15277dae29942d1d4`, equal to the reviewed tip tree. `dev` remains the pinned base, whitespace checks passed, and the worktree remained clean. Merge-calculation objects were confined to a disposable directory and removed. Only the two requested reports were authored; no source checkout/ref mutation or actual merge was performed. STRENGTH: **entailed** by fresh checks.

The recommendation is APPROVE. No residual F2/F3 repair requires V's decision. The provenance qualification should travel with the report so future snapshot refreshes are not mistaken for independent membership verification.

## Not verified

No fresh integration, typecheck, mutant, provisioning, deployment, or Node 22.23.1 run. No complete runtime propagation proof, production disclosure, general hostile-object guarantee, or combined-cleanup behavioral test. No independent re-creation of every message citation, broad repository scan, follow-up issue filing, board/DECISIONS edit, push, or actual merge. No saved worker second-derivation script was established. STRENGTH: **undetermined** for these unperformed checks and production claims.

REWORK: approve — independent source reconstruction closes the membership question, both requested fixes and evidence corrections are carried, and the reviewed tip is ready to land on pinned dev.

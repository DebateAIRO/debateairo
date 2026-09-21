CODEX REVIEW DIAG-BOUNDED r1b — CHANGES · comments read through: diag-bounded-r1b-2026-09-07

Counts: **2 must-fix findings (F2/F3, both P2), 2 nonblocking evidence corrections (C1/C2), original F1 closed.** Reviewed tip `474794537c7709e26bbae49cdb5f2ccba7913bcc`; base/dev `d5b4f7f568aceec55a9cfca72b62473e7ee26c19`. This is the reviewer's self-report; the companion `diag-bounded-codex-r1b.md` contains the complete evidence and required fixes.

Skills applied: using-superpowers, codex-security:verify-fix and its static-assessment reference, verification-before-completion. The user's explicit two-file Markdown contract overrides verify-fix's default JSON-only/no-artifact output. No implementation, security scan, delegation, or mutation workflow was used.

## The case: a correct guard over an incorrect vocabulary

The runtime repair is straightforward and correct: exact lookup replaces arbitrary typed-code passthrough. Reviewing only that branch and the green tests would have produced an approval. The packet also required checking what had entered the map. That separate question produced the remaining finding.

Independent constructor enumeration yielded 315 distinct direct literal codes. Resolving the helper arguments, the evaluator's actual five-pair loop, the database constant, settlement ternary, and register templates yielded 396 legitimate codes. The shipped map contains all of those direct-constructor/helper codes and three additional non-code values: `MATCHED_EXISTING`, `PROWESS_RANK`, and `UNASSESSABLE`.

A later real-subclass cross-check found two more legitimate codes declared through `super(...)`: `PROVIDER_CALL_FAILED` and `PROVIDER_CONTENT_UNACCEPTED`. Both are absent from the map. The complete checked producer set therefore contains 398 codes; the map has three excess members and two omissions. F3 records the resulting regression in known-code diagnostics.

The decisive evidence for F2 was each value's syntax at its cited source location. These were decision membership checks, phase tuples, and a verdict enum. All five citation rows falsely linked them to a different function's `requireNonblank` loop. This did not depend on interpreting a test failure or claiming a deployed attack. STRENGTH: **entailed** for the source/citation mismatch and resulting map recognition.

The worker's six-value negative check passed, as did the source-driven positive controls and byte-identical twin check. Each established a useful but narrower fact. None established that every admitted string was a domain code. The recurring failure mode is treating a shape check and a matching citation key as proof of argument provenance.

## What almost misled this review

My first syntax-tree count at the packet's declared base was 420 literal constructor sites, against the reported 419. I did not immediately charge a missing code: the set comparison showed no omission. Comparing the actual cited line numbers to both revisions established that the rows belonged to r0 `d6d0f69c`. Its rollback rewrite reduced two constructors to one, explaining the count difference. All 419 direct citation rows matched r0 exactly. C1 therefore identifies inaccurate producer provenance, rather than inventing a missing-code regression. STRENGTH: **entailed**.

I also separated two conclusions that could easily be conflated. The alphabet is closed at 699 strings, and the known-code classification has three excess members and two missing subclass codes. F2/F3 require correcting membership; they do not resurrect the original arbitrary-string disclosure claim. Removing the three excess values and adding the two missing codes would produce 398 codes and 698 outputs with the other maps unchanged. STRENGTH: **entailed** for current counts and the set subtraction.

My initial review draft overstated the completeness of the direct-constructor sweep. Before delivery, the final check for `extends TypedDomainError` found the two provider classes. Their constructor calls use `super`, and the earlier enumeration could not see them. I updated both reports and the projected counts; I did not preserve the first conclusion because the report was already written. This is the review's principal self-charge: checking arbitrary subclasses semantically was insufficient without inspecting the existing subclasses. A producer audit must include inheritance before claiming completeness. STRENGTH: **entailed** for the omitted declarations and their correction in this review.

## Evidence discipline and costs

The first large parallel read exceeded the tool's output budget. I recovered the required portions with bounded reads and used a byte comparison for the duplicate packet/dispatch, rather than treating truncation as a complete read. Subsequent large gate output was checked through exact summary/exit extraction. No claim of reading every integration-log line is made.

I ran the three permitted unit files once, together, with credentials excluded from the process environment: 17/17 passed, exit 0, 2.66 seconds on Node v25.7.0. I read all seven r1 mutant transcripts completely and matched their recorded source hashes to the current files. The new f/g assertions fail precisely on the sentinel; a/d fail on the digest. Later token, SQL, and name assertions cannot borrow mutation evidence from those earlier stopping points. C2 preserves that distinction. STRENGTH: **entailed** for fresh results and saved assertion frames; **consistent-with** for historical executions beyond their artifacts.

No extra dynamic probes or repeat tests were necessary to establish the finding. Syntax-tree enumeration ran in memory; the only temporary filesystem artifact was the isolated merge object's disposable directory, removed afterward. The review authored only the two requested reports.

## Packet audit

AMENDMENT 1 corrected the false type premise and gave adequate scope for the runtime boundary. It also specifically asked for honest code membership and fresh evidence, so the remaining vocabulary repair is within the existing task. The three originally requested corrections were carried; C2 identifies additional attribution overclaims rather than denying that work. The shared-module restriction remains acceptable for this landing because the twin-copy check survives and architectural consolidation is already a separate follow-up. STRENGTH: **entailed** for the packet obligations and correction text; **consistent-with** for the design judgment.

A useful packet improvement is to require a provenance record that distinguishes filing commit from producer-source commit, and to state that helper-loop extraction must identify the containing function and argument position. Neither a regular expression's output shape nor the presence of a source line is enough. This is a workflow recommendation, not an additional landing prerequisite.

## Landing

The isolated merge-tree command exited 0 and returned `0720d82b2b8cc85051eb62cdcdf7ddc3391d7e09`, equal to the reviewed head tree. `dev` still points to the pinned base. Diff whitespace checks passed and the lane remained clean. Source Git storage, refs, index, and checkout were unchanged; the object-directory override confined merge calculation writes to disposable storage. STRENGTH: **entailed** by fresh checks.

The recommendation remains CHANGES for two localized P2 findings: remove three non-code members, restore two provider subclass codes, and add independent rejection and real-subclass controls. The existing finite lookup, legitimate-code preservation, rollback categories, and twin-copy acceptance should remain intact.

## Not verified

No integration, typecheck, mutant, provisioning, deployment, or Node 22.23.1 rerun; no production disclosure, externally controlled code path, or complete runtime reachability proof. The requested casing/whitespace/prefix/subclass/cause cases were assessed statically. No hostile-object guarantee or combined-cleanup runtime test is claimed. No board/DECISIONS edits, follow-up issue creation, or actual merge occurred. STRENGTH: **undetermined** for the unperformed validations and production claims.

REWORK: changes — the runtime boundary is closed, but three non-code entries and two missing provider subclass codes must be corrected before landing.

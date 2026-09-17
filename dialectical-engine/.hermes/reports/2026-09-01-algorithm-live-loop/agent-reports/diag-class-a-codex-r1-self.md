CODEX REVIEW DIAG-CLASS-A r1 — CHANGES · comments read through: diag-class-a-r1-2026-09-07

Reviewer self-report. Counts: four required changes (three implementation, one evidence/reporting); three packet charges; three product follow-ups, one already ticketed. The detailed evidence and dispositions are in `diag-class-a-codex-r1.md` beside this file.

## What determined the verdict

The central defect was accepting a declared vocabulary as proof about runtime input. S04's typed branch still returns a received property directly. The DEV formatter checks a property and reads it again for output. Neither establishes the universal bounded-output claim in the packet. These are separate from whether today's ordinary constructors usually provide valid stable data.

The producer audit had a different blind spot: it counted literal spellings and the explicitly noticed component-exit template, but missed TLS suffix builders. A base-blob comparison proved that all 148 admitted entries had provenance; following the builders then exposed four legitimate missing codes. Both observations are needed. “The set matches the grep” is not the same result as “the set covers the producers.”

The supplemental evidence was better than the filing made it possible to verify initially. The canonical log directory omitted it, but `/private/tmp` retained full/base logs, name lists, both patches, and the stash-pop record. Git still retained the named stash object. Those artifacts support the controlled comparison and final six-file source identity, while contradicting “at the tip” and “2331 passed.”

## Review findings and strength

| Finding | File/line · Input → wrong outcome · Required fix | STRENGTH |
|---|---|---|
| F1 | `packages/judgement/src/s04.ts:263` · out-of-domain runtime kind → unbounded reason · runtime projection with fixed fallback, preserving the granted note contract. | Entailed statically; production disclosure not observed. |
| F2 | `apps/runner/src/dev-auth-stack.ts:269,:273,:293` · bounded TLS probe timeout/size code → UNRECOGNIZED · include the four derived codes and audit their builders. | Entailed from producer/caller tracing. |
| F3 | `apps/runner/src/dev-auth-stack.ts:293` · unstable message property → checked/emitted values can differ · snapshot once and emit only the validated value. | Entailed statically under the generic input contract. |
| F4 | `agent-reports/diag-class-a.md:98,:109,:111` · pre-commit logs and total count → overstated head custody/passed count · identify artifacts accurately and preserve the narrower comparison. | Entailed by logs, commit times, and patch/object equality. |

## What I checked independently

I read the reviewer packet in full first, then the worker packet/identical dispatch, reports, named tickets, source diff, affected callers, producer builders, gates, mutation failure assertions, and stamp comparator. I used the using-superpowers, assess-patch-risk, systematic-debugging, and verification-before-completion skills. The user's exact two-file reporting format takes precedence over the generic assessment skill's separate JSON delivery format. No implementation or delegation workflow was needed, and no subagents were spawned.

Fresh checks bound base/head/tree, patch SHA-256, source cleanliness, classified-token suffix bytes, base producer membership, six explicit producer examples, all three typecheck diagnostic streams, all six mutation restore hashes/anchor counts, and the stamp comparator. I computed the merge in a temporary object directory, using the repository objects read-only. I used a Node built-in regex check for whitespace behavior, not project code.

For the unmatched wider-suite failure, I compared the actual assertion in both logs and independently enumerated tracked files under the test's declared rules. The count is 232 at the cited earlier dev, 233 at lane base, and 233 at tip; the extra file is the previously landed risk-signal diagnostic module. This prevents charging the current lane for a real but inherited baseline drift. It also prevents misdescribing a file-count assertion as a parser error merely because of the test's name.

## Self-charges

- I initially combined too much evidence into tool responses, causing aggregate truncation. I recovered the relevant report/source ranges in smaller reads and extracted the complete failing-assertion and custody portions of each mutant transcript. A better first pass is a bounded artifact inventory, followed by claim-specific reads.
- The first supplemental-log search used task-specific filenames; the actual wider logs had generic names. A timestamp-bounded directory inventory found them. I then verified their contents, runner paths, patches, and stash identity rather than treating nearby timestamps alone as provenance.
- A read-only optional glob search hit zsh's no-match expansion. It did not affect the independent searches or verdict. I repeated the relevant searches through `rg` with quoted globs.
- I did not run project tests. The packet permitted static review plus saved artifacts, and fresh execution of the existing green tests would not cover the missing properties without new tests. I have kept all gate claims explicitly attributed to their saved runs.

## Packet audit

Charged the runtime “already closed” premise, missing read reach for mandatory producer/consumer work, and the unsupported exhaustive “last three” wording. Cleared provisioning, the expressly historical 76-site prior, and read access to the second token owner. The packet's four-other-kinds wording is imprecise; complete suffix-byte equality resolves its intended compatibility duty.

The worker's TLS double-wrap finding is real and already ticketed, but the existing follow-up scope should include the cleanup call at `tls-front-door.mjs:263` as well as start failure at `:288`. The second token test was already covered by the packet's read-only grant for every other test, so it was not a discovery blocker.

## Tickets to file

The main report routes implementation/evidence revisions to existing lane tickets, requests a tracked packet correction, preserves `F-DEV-TLS-DOUBLE-WRAP` without duplication, and identifies separate corpus-count and sibling CLI-diagnostic follow-ups. No board or DECISIONS file was edited.

## Landing

Base `1fc2dece2775ca77c56a57fd93e1d656a019c24b`, head `e86c850e9a7481324ada5c5468fd07569997ea13`, isolated merge-tree exit 0, result `40265eb9940cc909c0e16360409f134b14446c1b`. Clean textual application does not clear the implementation defects. No merge, checkout, commit, stash, install, or push was performed by this reviewer. Only the two requested report files are delivered.

## Not verified

No live provider/database/TLS/UI behavior or real sensitive disclosure was measured. No project-controlled reproduction was executed. The wider run environment cannot be reconstructed completely from unstamped temporary logs; the source diff and stash identity can. I did not claim exhaustive discovery outside the requested three formatters.

REVIEW: changes — the verdict rests on three source-visible defects and corrected evidence attribution, with the reviewed source left unchanged.

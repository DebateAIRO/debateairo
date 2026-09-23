CODEX REVIEW DIAG-CLASS-A r1b — CHANGES · comments read through: diag-class-a-r1b-2026-09-07

Counts: **2 required changes: 1 implementation finding (F1 remainder) and 1 producer-audit finding (F2 remainder).** F2's four-code implementation, F3 and F4 are cleared. Packet audit: **1 residual premise charge; P2 and P3 cleared.** All nine saved mutants have complete final-tip custody. No project tests or mutants were executed by this reviewer.

Reviewed immutable range `1fc2dece2775ca77c56a57fd93e1d656a019c24b..f5236484b37b7f4b0baced2bed5d1d1c12b39a3d` on `lane/diag-class-a`. Three commits: `e86c850e9a7481324ada5c5468fd07569997ea13`, `d8319a0aee8d7c8d1e7055a1bbc8fed5a6a6c1ff`, `f5236484b37b7f4b0baced2bed5d1d1c12b39a3d`. Seven cumulative files, 720 insertions, 7 deletions. Exact `git diff --no-ext-diff --binary <base> <head>` SHA-256: **`dc1f91ca14d3d99a290dafd13a4d59287bc19566affdf2fbb2bf71e6109e5eb1`**. HEAD and dev match the packet; working tree clean. STRENGTH: **entailed by fresh Git reads**.

Source paths below are relative to the lane's `dialectical-engine/`. Mission paths are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/`. I read the reviewer packet, original r1 verdict, worker packet including AMENDMENT 1, dispatch, worker report and self-report in full.

## Findings

**F1 remainder — the snapshot is correct, but its membership vocabulary is still externally mutable. Required implementation change.**

**File/line:** `packages/judgement/src/s04.ts:272`, using the exported array at `:316`; runtime membership at `:273`; worker report `agent-reports/diag-class-a.md:14,:68,:72`.

**Input → wrong outcome:** a caller changes the contents of the exported `PANEL_MEMBER_FAILURE_KINDS` array, then a member rejects with a `PanelMemberFailure` carrying an added value outside the original seven literals → the helper accepts that added value as `reason`. The `readonly string[]` local aliases the exported array; it does not copy it. The export ends in `as const`, with no runtime freeze. The repair therefore closes membership over the array's *current contents*, not over the promised fixed vocabulary. This requires mutation of exposed application state; an ordinary unknown error string alone cannot do it. No present production writer to that array was found.

**Required fix:** keep the one-read discipline and use a private canonical mapping or fixed literal selection within the granted helper area, independent of later mutations to the exported array. Preserve the seven public spellings, note shape and existing `failureKind:` expression. Cover independence from mutation of the exported vocabulary, while retaining ordinary valid-kind and fallback controls. Correct the claim that the existing export itself is sealed. This can be repaired without expanding the failure-kind list or changing its declaration.

**STRENGTH:** **entailed statically** for the alias, runtime mutability and conditional wrong output; **not observed in production**. This is a remaining violation of the requested formatter invariant, not a demonstrated remote disclosure. My r1 guidance also failed to distinguish a fixed private vocabulary from this exported compile-time-readonly array; this refinement is partly a correction to that guidance.

The specific challenges in question 1 otherwise pass: a getter-backed subclass whose kind changes between reads cannot cause an unchecked *second helper read* to be returned, because `:271` captures once and `:274` returns that capture. `declared.includes(failureKind)` is array membership, so a proper prefix such as `TIME` does not match `TIMEOUT`. A stable `TIMEOUT` does match. STRENGTH: **entailed statically, assuming the vocabulary contents are unchanged**.

The accessor regression at `tests/unit/judgement-s04.test.ts:374` has a narrower discriminator than its title suggests. The unchanged note construction at `s04.ts:305` reads the kind first; the helper then sees the test's second, invalid value and falls back. Thus it demonstrates refusal of an invalid helper input, but does not independently force the helper's successful-membership branch to encounter a changing accessor. When extending the test, account for the preceding note-field read and observe the exact reason. The separate `failureKind` field remains unchecked, as expressly excluded by the packet; current location is `s04.ts:305`, with runner consumers at `apps/runner/src/index.ts:2650,:2698`. No new charge for that excluded field.

**F2 remainder — two fixed template inputs are falsely classified as unbounded. Required audit/report change; the 152-code implementation is clear.**

**File/line:** `logs/diag-class-a/20-producer-audit.log:52–59`; `agent-reports/diag-class-a.md:40–43` and its follow-up finding; corresponding template-count/free-tail claims in `diag-class-a-self.md`. Actual producers/callers: `apps/runner/src/dev-deployment-register.ts:187,:189,:202,:203–207` and `deploy/dev-auth/validate-compose-postgres.mjs:5,:8,:15,:16`.

**Input → wrong outcome:** applying the audit's own rule, “resolve each interpolated variable to its call sites,” to these two private helpers → the audit calls their fixed caller-supplied literals free input, and recommends treating both as further unbounded-message findings. In fact:

| Template input | Actual source domain | Correct disposition |
|---|---|---|
| `override` at `dev-deployment-register.ts:163` | Caller/environment string from `source.DEBATEAI_DEV_SYNTHESIZER_ROLE_REF` or `source.DEBATEAI_DEV_EVALUATOR_ROLE_REF`, `:156,:168–169` | Unbounded; exclude. |
| `label` at `dev-deployment-register.ts:189` | Private `requireMatch` has only the `judge` and `composer` literal callers at `:202,:203–207` | Bounded, two messages; exclude because the colon is outside the historical code grammar. |
| `service` at `validate-compose-postgres.mjs:8` | Private `serviceBlock` is called only with `postgres` and `hatchet-lite` at `:15–16` | Bounded, two messages; exclude because the colon is outside the historical code grammar. |

**Required fix:** correct both classifications and remove the unsupported free-input follow-up attribution for these two sites. Keep their exclusion and the 152-entry set unchanged: none of the three colon-bearing forms matched the old joiner's grammar. Describe the six sites as the error-construction candidates, not all DEV-bearing output interpolations. Part B `:66–75` still prints a derivation summary and result counts, rather than the actual generating command/script it claims to print; preserve that procedure with the corrected audit so the two set differences can be rerun.

**STRENGTH:** **entailed by complete local caller searches and source reads**. This is evidence quality and false follow-up attribution, not an additional lost diagnostic in the repaired joiner.

## Independent producer sweep and cleared repairs

I independently enumerated the **26 base producer files** in `apps/runner/src/dev-*.ts` and `deploy/dev-auth/*.mjs` via Git, so the new allow-list could not feed its own derivation. Quoted uppercase DEV literals yield **145 distinct values**. Expanding three component-exit codes and four TLS probe codes gives **152**. Both differences against the committed set are empty. STRENGTH: **entailed by fresh base-blob enumeration**.

For template completeness, I also parsed every base producer with the installed TypeScript classic parser and walked every `TemplateExpression`, without executing producer modules: **53 expressions**, including the **six error constructions** the worker found. Of those six, **five have bounded source inputs and one is unbounded**, after correcting F2 above. The other DEV-related output sites are:

- Eight success-message templates: `dev-api-environment-cli.ts:11`, `dev-auth-data-plane-cli.ts:19`, `dev-database-principals-cli.ts:16`, `dev-deployment-register-cli.ts:17`, `dev-hatchet-token-cli.ts:17`, `dev-secret-files-cli.ts:4`, `tls-front-door.mjs:346` and `validate-compose-postgres.mjs:41`.
- Three newline wrappers around an already selected `code`: `create-local-certificate.mjs:160`, `sendmail-capture.mjs:125` and `tls-front-door.mjs:361`.

These output sites do not add new error-constructor codes to the joiner's input vocabulary. The remaining templates concern paths, configuration, URLs, SQL, serialization or HTTP text. No additional bounded, grammar-compatible code construction was found. The worker's six-candidate result is complete for current error constructors; its classification and broad wording need correction. The one-line grep is not a general proof against future multiline or indirect constructions. STRENGTH: **entailed for the inspected tree**, not a repository-wide or future completeness guarantee.

**F2 implementation — CLEAR.** All four new entries at `dev-auth-stack.ts:283–286` are cited precisely:

| Admitted value | Prefix producer | Suffix producer |
|---|---|---|
| `DEV_TLS_PRIVATE_PROBE_FAILED_BODY_TOO_LARGE` | `tls-front-door.mjs:327` | `:61` |
| `DEV_TLS_PRIVATE_PROBE_FAILED_TIMEOUT` | `:327` | `:72` |
| `DEV_TLS_PUBLIC_PROBE_FAILED_BODY_TOO_LARGE` | `:336` | `:61` |
| `DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT` | `:336` | `:72` |

`probeUi` passes the fixed prefix through both `probeEndpoint` calls at `:84,:91`. The error listener at `:75–77` retains the typed error. Private-probe rejection at `:277` and public-probe rejection at `:292,:310–312` reach the stack's TLS stage and `fixedStage` wrapper. The four-case test at `tests/unit/dev-auth-stack.test.ts:147` observes exact joined values and their distinctness, plus both bare-prefix controls. Mutant I removes **all four entries in one multiline anchor**, not just one code. STRENGTH: **entailed statically and by saved exact-tip tests/mutant**; no live probe was induced.

**F3 — CLEAR.** `dev-auth-stack.ts:305` snapshots `message` as unknown; `:306` rejects nonstrings; `:311` both validates and emits the same string; `:312` uses the same snapshot for the unknown-code decision. Cause traversal `:314`, four-link bound `:299`, order and final fallback `:316` are preserved. Unknown code-shaped strings retain their position as `DEV_UNRECOGNIZED`; non-code strings fall away. The tests at `dev-auth-stack.test.ts:173,:190` install actual changing accessors on Error objects, observe exact output at root and deeper levels, and are relevant. Mutant H is killed at the intended assertion. STRENGTH: **entailed by source and saved exact-tip evidence**.

**tokenUnlock — remains CLEAR.** No round-1 change to its source or owner test. The complete classified suffix from `  if (error.serverCode ===` through the wrapper is byte-identical between base and final tip, SHA-256 `fbe07cde03114cf4e15ff51156f831344c6cb7ef7f594632b7e07cbe54666e69`. The unclassified branch returns the fixed sentence at `apps/ui/lib/v3/tokenUnlock.ts:46`; the UI sink is `apps/ui/app/debate/[id]/DebatePageClient.tsx:564`. STRENGTH: **entailed by fresh byte comparison and source**.

## Gates, mutants and custody

All three saved runs in each focused gate were inspected:

| Gate | Each of three recorded runs | Assessment |
|---|---|---|
| `10-gate-judgement-s04.log` | 22/22, exit 0 | Recorded PASS |
| `11-gate-dev-auth-stack.log` | 22/22, exit 0 | Recorded PASS |
| `12-gate-v2ui-data-layer.log` | 59/59, exit 0 | Recorded PASS |
| `13-gate-typecheck.log` | Eight inherited diagnostics, exit 1 | Identity PASS; typecheck remains failing |

Every typecheck run independently extracts to the untouched `03` baseline's exact eight-line stream, SHA-256 `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. All final captures occur after `f5236484`'s 18:25:41 CEST commit. The six-failure RED record `30-red-r1.log` explicitly states that only the two source files were reverted while new tests remained: **6 failed, 38 passed, 44 total, exit 1**. It is evidence of failure under the recorded arrangement, not a pristine e86 checkout or evidence that tests were authored first. STRENGTH: **entailed by saved artifacts**.

| Mutants | Saved observation |
|---|---|
| A, B, C | Each intended passthrough assertion fails; 1 failed, remaining tests skipped; command exit 1. |
| G | Removing S04 membership fails the runtime out-of-domain assertion; exit 1. It does not cover the mutable-vocabulary remainder. |
| H | Reintroducing message reread for emission fails the actual unstable-accessor assertion; exit 1. |
| I | Dropping all four TLS entries fails the exact four-code retention assertion; exit 1. |
| D, E, F | Consistent neighboring renames survive: respectively 22/22, 22/22, 59/59, exit 0. |

Each of the nine current transcripts has exactly **one** commit/tree header for `f5236484… / b023ef91…`. I compared OLD anchors, expected multiplicities, absence of NEW in the original, and before/after hashes to the corresponding immutable Git source: all match. Multiplicities are 1 except D/E, which are 2. Every transcript records pre=0, restored=0, matching hashes, empty porcelain and `RESULT: ok`. STRENGTH: **entailed by fresh transcript/Git comparison**.

**Append claim — TRUE; first stamp, not last.** `tools/mutate.sh:62` redirects the normal transcript with `>> "$OUT"`. Rerunning successfully into an existing file appends. `tools/stamp-check.sh:19` uses `grep -m1` and `head -1`, so it selects the first matching commit. The trap entry at `.hermes/TOOLING-TRAPS.md:2186` correctly describes this mechanism. The early dirty-tree abort uses truncating `tee`, which is separate from the successful rerun path.

Fresh execution of the read-only stamp comparator returns **23 records, 8 failures, exit 1**, matching `21-stamp-check.log`. The 15 delivery records `10–20,22–25` all stamp the final tip. The flagged files are the six deliberate base captures `01–06`, the mixed-source/test RED record `30` and the unstamped frozen reviewer verdict. The comparator intentionally skips subdirectories and its own output.

**Effect on r1 custody:** the append mechanism does not invalidate the prior review's A–F custody conclusion. All six preserved `superseded-r0/` transcripts have a single original `e86c850e… / 40265eb9…` header, complete gates and original-source hashes; all six manifest hashes match. Current delivery transcripts are separate and independently valid. However, the numbered paths now identify new records; the old “eleven delivery records at e86” claim cannot be applied to their present contents. Original `10–13` and `20` are not preserved in that archive, so their historical custody cannot be freshly reconstructed from those paths. The frozen r1 verdict records the earlier review.

The superseded manifest's prose still says the parent records stamp `d8319a0a`; their actual stamps are `f5236484`. That stale pointer does not invalidate either set of transcript hashes. The intermediate appended files and 14-failure comparator are not retained here, so the exact intermediate chronology is **consistent-with**, not independently established. The final custody result is **entailed**. Hashing itself does not repair differently ordered typecheck extracts; the successful correction was using the same extraction on both sides.

## F4 — wider-suite evidence cleared

`25-wider-unit-suite-at-tip.log` has the final commit stamp, clean-porcelain declaration, command, start time and explicit exit 1. It records **17 failed, 2322 passed, 2339 total; 10 failed and 114 passed files, 124 total**, including one collection-failed `s14-ui` suite. The increase of eight passing tests matches five added S04 cases and three added DEV cases. STRENGTH: **entailed by saved log and diff**.

I independently extracted raw FAIL headings, rather than trusting the appended name table. Final tip, pre-commit lane and selected untouched-base runs have the same **17 failed test names and the same separate collection failure**. Canonicalizing the 17 test names to the worker's sorted format independently reproduces SHA-256 **`81d0fb09f5da90c6d5a6f674ecbab83b38bc71c975b5f225943e8522f351f0d7`**.

Question 4 needs a precise interpretation of “dev-known set.” The raw `logs/dev-merge/03-names-dev.txt` has **18 unit-test names**: only **16** still fail in these runs. Two previously failing depth checks (“keeps the owning declaration…” and “leaves no duplicate definition…”) are absent, as `10-attribution.txt` already documents. Thus the observed set is **the relevant 16 dev-known names plus the corpus-count row**, not the entire old 18-name unit slice plus one. After that documented baseline adjustment, equality holds. The collection failure remains a separate suite event.

Both base and final logs show `expected 233 to be 232` at `s1-1-depth-contract.test.ts:377` after its syntax assertion. Fresh tree enumeration using that test's roots/extensions/exclusions gives **232 at 70647e7e, 233 at 1fc2dece, 233 at f5236484**, with 59 TSX files throughout. The additional file is `apps/api/src/risk-signal-identity.ts`; the lane adds no shipped file. `board/F-ORACLE-CORPUS-COUNT.md` exists. STRENGTH: **entailed by source, saved failures and fresh Git-tree enumeration**.

All seven supplemental files match their manifest hashes and sizes and the still-readable `/private/tmp` originals, byte for byte. The two patch copies share `331efdd008ee5d2a0e142b87684fa82ac62e68e69010c8c9854d131f3647d37f`; both name files share the hash above. Their preservation does not retrofit commit or exit stamps. The corrected pre-commit figures are **17 failed, 2314 passed, 2331 total**, with 10 failed files of 124. The selected base run is **17 failed, 1097 passed, 1114 total**. This establishes unchanged observed failing names; it cannot rule out a changed failure hidden within an already-failing test.

## Packet audit

**P1 — PARTIALLY CLEARED; residual CHARGE.** AMENDMENT 1 correctly retracts the claim that the kind's TypeScript declaration guarantees runtime membership and explicitly requires a one-read check or canonical map. But its F1 paragraph at `packets/diag-class-a-worker.md:39` still calls the membership array “the sealed list.” `s04.ts:316–319` is an exported, unfrozen array. **Input → wrong outcome:** treating that backing list as immutable leads to the F1 remainder despite correct local snapshotting. **Required fix:** distinguish declared spellings from immutable runtime membership storage, and permit the existing helper to own its canonical vocabulary. The map option already allowed by the packet makes this possible without a wider edit grant. **STRENGTH: entailed statically.** The original reviewer guidance shares this imprecision.

**P2 — CLEAR.** AMENDMENT 1 explicitly grants the MJS producers, provider errors, contract client, judgement producer, runner consumers and resolvable UI sink read access. This covers the necessary trace. The UI sink is named above. The cumulative edits remain in the seven allowed files, TOOLING-TRAPS is append-only, and round 1 changes only the two helpers, their two test files and traps. No read-grant charge remains. **STRENGTH: entailed by packet and diff.**

**P3 — CLEAR for amendment scope.** The amendment explicitly retracts “last three” as an exhaustive inventory and treats the sibling CLI separately. Its precedence corrects the historical title without requiring broader lane edits. The worker's new claims about free template tails need F2's correction, but those are worker audit claims, not an instruction to extend this lane. **STRENGTH: entailed.**

The worker openly admits implementation-before-tests this round. The later RED frame and mutants provide the recorded discrimination, but do not satisfy or rewrite test-first chronology. That acknowledged process lapse adds no separate implementation finding.

## Landing

**Textually mergeable into dev 1fc2dece; not approved to land.** Fresh isolated `git merge-tree --write-tree <base> <head>` returned exit 0, no conflicts, tree **`b023ef918142faf4554806ba781777ba0d63b44e`**, exactly HEAD's tree. Object writes were directed to a disposable `/private/tmp` directory, with the repository object store used only as a read alternate; the disposable directory was removed. No refs, index, repository object store or source were mutated. **STRENGTH: entailed by isolated merge computation.**

Patch-risk recommendation/label: **revise / revise**. Impact if wrong is **moderate**, confined to diagnostic confidentiality and identity, including persisted panel text. Likelihood is **critical under the rubric's failed-required-property category**, not a claim of critical exploit severity: F1 still has a conditional source-visible route beyond the promised fixed vocabulary. Protection is **partial**: direct tests and all specified mutants ran at the exact head, but they do not cover mutation of the membership backing array or live caller integration. Code recovery is **easy** because the patch has no migration or new dependency; reverting does not erase text already persisted. Confidence is **high** in the static and artifact conclusions. Leaving base unchanged retains the original raw-message routes.

Return F1 for a private fixed membership implementation and F2 for audit correction; retain the cleared TLS, DEV snapshot and token behavior. Capture the required evidence after the replacement immutable tip. The validated structured assessment is included in the companion self-report, keeping delivery to the two requested files.

## Not verified

- No project test, mutation run, integration suite, live database, provider request, TLS listener or browser flow was executed by this reviewer. All project run results above are saved evidence.
- No disclosure reproduction or external exploitation was performed. In particular, no current production mutation of the exported failure-kind array was found; F1's conditional contract failure is static.
- Getter exceptions, arbitrary global/intrinsic tampering and a repository-wide inventory are outside this review's established claims.
- The worker's separately stated at-tip neighboring 56/56 run with exit 0 has no named dedicated saved transcript here; the wider run shows those tests passing, but its overall exit is 1.
- The exact intermediate appended-log incident is not preserved; source behavior, original mutant sections and final transcripts are verifiable.
- Equal failure names do not prove absence of regression inside an already-failing test. The saved runner uses Node v25.7.0 while package metadata asks for 22.23.1; supported-version/live deployment validation was not established.

REWORK: changes — make S04 membership independent of the mutable exported list and correct the two bounded-template classifications and their audit provenance before landing.

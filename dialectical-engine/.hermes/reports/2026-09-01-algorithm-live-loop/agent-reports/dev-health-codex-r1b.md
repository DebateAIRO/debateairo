CODEX REVIEW DEV-HEALTH r1b — APPROVE · comments read through: dev-health-r1b-2026-09-07
Counts: 0 blocking lane findings; R1/R2 and N2 cleared; 1 remaining tool finding (S1, P2); A1/A2 cleared with 2 packet charges (A3/A4); 2 nonblocking filing observations (N3/N4). Lane approval and the separate tool verdict have different scopes.

Source paths below are relative to the lane's `dialectical-engine/`; mission paths (`logs/`, `tools/`, `packets/`, `agent-reports/`) are relative to the mission directory in the packet. The reviewer packet was read in full first. Evidence is source inspection and saved worker records, with fresh Git/tree/hash calculations and one execution of the preserved stamp-check fixture. No reviewer unit-test execution is claimed. STRENGTH: entailed.

Base `80559019e68932fd16528fc82e9ba174b952e0cf`; head `4e5f93278809c42f098468623227a0918e9db91e`; branch `lane/dev-health`; four commits; clean working tree. Head tree `04b40920737700d8119597b2f131d77e76306261`. Eight changed files. Exact patch SHA-256 `06b7ca5eadf0d6c986cb9d11c95130a7db75ce16b378258faff33458a32e0e45` over 38,333 bytes from `git diff --no-ext-diff --no-textconv --binary --full-index <base> <head> --`. STRENGTH: entailed by fresh computation.

## R1 — cleared

File/line: `tests/unit/p2-auth-risk.test.ts:319`, `:332`, `:363`, `:371`, `:385`; `packages/db/src/auth-risk.ts:82`.

The probe reads the CURRENT production file on every call through a URL relative to the test module. It does not compile a copied signature or a historical Git blob. It appends one call in memory, creates a program containing that virtual source, and throws if the program has no source file. Semantic diagnostics are requested for that file. Only TS2554 diagnostics starting after the original source count; the negative row requires exactly one with the exact message “Expected 1 arguments, but got 0.” A missing/unresolved helper cannot make this row pass: it would supply no required arity diagnostic, and the explicit TS2304 guard would also reject it. No invalid call executes, and the helper remains private. STRENGTH: entailed by source.

The saved default-restoration mutant at this head changes only the signature's default, with one applied occurrence. `logs/dev-health/r1-63-mutant-b-restore-default-NOW-KILLED.log:32` names the negative contract row; `:47` locates its length assertion at test line 389; `:59` reports 1 failed / 13 passed; `:63` gives command exit 1. The named-argument control stays green at `:34`. Restoration at `:65`–`:69` reports zero remaining occurrences, matching before/after hashes, empty porcelain, and RESULT ok. I independently matched those hashes to the current target bytes. Thus the observed failure is precisely the removed arity diagnostic when the default returns. STRENGTH: entailed for source and saved record contents.

All three final-head P2 records (`r1-51-gate-p2-auth-risk-run{1,2,3}.log`) contain the two successful contract rows, 14 passing tests, exit 0, and clean before/after state. The check passes at the tip in those saved executions. b2 is retained at `r1-64-mutant-b2-strip-call-site-argument.log:13`: the actual tsc reports TS2554 at `auth-risk.ts(95,51)`; `:22` records TSC_EXIT=1. Its wrapper's EXIT=0 is the final echo's exit and is not the discriminating outcome. STRENGTH: entailed.

The standing probe uses the existing `typescript-classic` 5.9.3 alias; b2 uses `typescript` 7.0.2. This is an adequate persistent observer for the requested default-restoration property, supplemented by the shipped compiler's call-site check. It is not a standing test of future agreement between two compilers. Also, the positive row filters only arity and unresolved-helper errors: its title does not prove absence of every possible diagnostic on a supplied argument. That limited control does not make the negative arity assertion vacuous. STRENGTH: entailed for test scope; future compiler agreement undetermined.

The trap correction is an append at `.hermes/TOOLING-TRAPS.md:2261`; the earlier text is preserved. Both filings explicitly withdraw the impossibility claim (`agent-reports/dev-health.md:98`, `:114`; `dev-health-self.md:33`, `:79`, `:99`). These corrections satisfy R1; retained historical prose should be read with the correction, not as a current waiver. Required fix for R1: none. STRENGTH: entailed.

## R2 — cleared, with a bounded custody ruling

File/line: `logs/dev-health/baseline/r1-base-typecheck-run{1,2,3}.log:1`; `logs/dev-health/r1-53-gate-typecheck-run{1,2,3}.log:1`; package script at `package.json:13`.

There are THREE baseline records and THREE final-head records. All six name `pnpm exec tsc --noEmit -p tsconfig.json` from the engine directory. That explicitly selects the same configuration as the unchanged package script `tsc --noEmit`; the tsconfig is unchanged between base and head. All six carry package `typescript@7.0.2`, the resolved `typescript/bin/tsc` entry, entry SHA-256 `2219f428a7e55aaf1f7ad85b9b0f0cf5078aeb76ccc9a7c6036c92d48f492ffd`, and self-reported `Version 7.0.2`. Node is 25.7.0 and pnpm is 11.20.0 on both halves. STRENGTH: entailed by all six raw records.

The baseline stamps tree `2ed299a54b1948c67d710537125cb249bb9605b8` at the specified base; final records stamp tree `04b40920737700d8119597b2f131d77e76306261` at the specified head. Each contains empty porcelain BEFORE/AFTER, EXIT=1, and CLEAN-STATE unchanged. The base/head lock hashes match their respective committed lockfiles; the generated-contract manifest hash is identical across all six. Old captures remain preserved. STRENGTH: entailed.

I independently extracted the output between the markers from every record, then selected compiler-shaped diagnostic lines. In each record the ENTIRE raw output consists of those same eight diagnostic lines, all in `tests/unit/s14-ui.test.ts`. Each newline-terminated output hashes to `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. Equality therefore covers diagnostic content, not just counts or the worker's extract files. Required fix for R2's requested records: none. STRENGTH: entailed by fresh extraction.

**Detach/restore ruling:** accept these measurements as usable baseline evidence, but baseline checkout/provisioning should be routed through the orchestrator's separate base worktree in future packets. Fresh HEAD reflog inspection independently shows the lane leaving `4e5f9327` for the base at 20:19:31 +0200 and returning to `lane/dev-health` at 20:19:45. The three baseline timestamps lie within that interval. Later final-head records and the current clean branch corroborate restoration. The dev ref still resolves to `80559019`. These facts support the baseline's measured commit and the successful return. STRENGTH: entailed.

The packet's records do not independently preserve the surrounding shell invocation, EXIT-trap definition, or the two boundary install outputs. Those details appear in the worker's disclosure at `agent-reports/dev-health.md:146`, not in a separate contemporaneous custody transcript. A lockfile hash identifies the checked-out input, not every installed dependency byte. The claimed trap and full ignored-state restoration are therefore consistent-with the available evidence, not independently entailed. The original r1 requested orchestrator measurement, and the worker skill's §7 says “do not … touch a branch or worktree”; I do not endorse narrowing that to creation/destruction alone. This process gap does not establish a wrong baseline or require repeating the otherwise adequate six records. See A3. STRENGTH: entailed for the record gap; acceptance and future routing are reviewer judgment.

## Unchanged corpus, dependency, and N2

Fresh byte comparisons against r1 `8252bca1` confirm that the manifest, manifest helper, whole S1-1 test file, runner package, and lockfile are unchanged. Fresh filesystem enumeration using the oracle's roots/exclusions/extensions agrees with the filtered HEAD tree and the manifest: 233 unique sorted entries, packages 75 / apps 157 / web 1, including 59 TSX; both set differences are empty. The manifest still describes the scan and does not filter it. Its optional update flag remains deliberate regeneration, so update-mode runs would not establish absence of drift. STRENGTH: entailed.

The runner still declares exactly `"@debateai/valuation": "workspace:*"` at `apps/runner/package.json:27`; the lockfile has only its three-line importer addition, linking `../../packages/valuation`. The pre-existing import is at `apps/runner/src/index.ts:73`. Saved final-head frozen installs exit 0 in all three runs. The ENV-01 smoke imports the runner and tests its composer cap; it establishes loading, not valuation algorithm correctness. No install was rerun. STRENGTH: entailed for source and saved outcomes.

N2 is cleared at `auth-risk.ts:43` and `:58`: the comments now describe a vocabulary and remove the stale cardinality. The source at `:256`, `:260`, and `:268` supports decrypt/parse before evaluation. N1's inherited retention check at `:117` is unchanged and remains separately scoped. Required fix for N2: none. STRENGTH: entailed.

## Saved gate population

All fifteen final-head gate records have the correct head/tree and empty before/after porcelain. These are saved worker executions, not newly run reviewer suites. STRENGTH: entailed by raw-record inspection.

| Gate prefix | Records | Outcome in each |
|---|---:|---|
| r1-50, whole S1-1 | 3 | Exit 1; 1009 passed, 1 inherited failure |
| r1-51, P2 | 3 | Exit 0; 14 passed |
| r1-52, ENV-01 | 3 | Exit 0; 1 passed |
| r1-53, typecheck | 3 | Exit 1; eight baseline-identical diagnostics |
| r1-54, frozen install | 3 | Exit 0 |

The sole S1-1 failure is “S1-1 · the architecture audit recognizes the ruled exports and edges (J10) > reports no T1-owned architecture or source-rule violation,” ENOENT opening `web/package.json`. It is present at `r1-50-…run{1,2,3}.log:1035` and the untouched-base RED at `red/01-red-s1-1-corpus.log:1042`. The corpus row is green at the final head. STRENGTH: entailed.

The final-head population is 20 = 15 gates + 5 mutants. All five mutants have one anchored header and full restoration summaries; each before/after target hash matches the present target. a/a2 fail with the respective added/missing paths; c survives its three consistent replacements; b fails the new negative probe; b2 supplies the shipped TS2554. The saved scoped comparator at `90-r1-stamp-check.log` reports “records compared: 20 · failures: 0”. Provisioning and baselines are outside that prefix and are correctly reported separately. This review inspected the records independently of the comparator verdict. STRENGTH: entailed.

## Tool re-review F-TOOL-MUTATE-3

**CHANGES — S1 remains open, P2: completion metadata is still parsed from command output.**

Reviewed `tools/stamp-check.sh` v3.1 bytes SHA-256 `f72053579588e40c8efe405392988f77f3f2ed3b300deb5dedecffcd092dfb2d`, both saved predecessor scripts, the preserved fixture and its EXPECTED.md, and both saved v3/v3.1 outputs.

The improvements are real: line 28 ignores header-shaped lines within OUTPUT spans; line 30 selects the newest remaining header; lines 35/37 refuse a latest block lacking the specified completion markers without falling back; lines 40–43 accept a single distinct bare identity, reject differing identities as AMBIGUOUS, and reject no identity as NO-STAMP. The v3.1 `*stamp-check*` self-skip is restored at line 24. STRENGTH: entailed by source.

I ran the preserved nine-file fixture once. Exit was 1, as expected for a fixture containing negative cases: **8 compared, 5 failures**; 09 was skipped. Individual results match EXPECTED.md:

| Case | Result |
|---|---|
| 01 single current gate | Accepted |
| 02 complete appended mutant rerun | Accepted |
| 03 appended mutant header without RESULT | INCOMPLETE |
| 04 old gate with current stamp in OUTPUT | STALE |
| 05 single bare identity | Accepted |
| 06 differing bare identities | AMBIGUOUS |
| 07 none | NO-STAMP |
| 08 old completed gate plus bare current tail | STALE |
| 09 comparator output | Skipped |

This preserves the named cases missing from r1: complete rerun, bare stamp-only tail, aborted rerun, and a stamp in gate output. Case 08 rejects the stale identity rather than classifying a bare tail as an attempted emitter block; it does not falsely pass. STRENGTH: entailed by fresh execution and fixture inspection.

**Remaining finding.** File/line: `tools/stamp-check.sh:28`, `:33`, `:35`, `:37`; `tools/mutate.sh:41`, `:51`; fixture `logs/tooling/st3-fixture/EXPECTED.md:1`.

Input → wrong outcome: after selecting a current-head header, the checker searches the whole remaining tail for RESULT or EXIT/CLEAN-STATE, without applying the output-state filter to those searches. An interrupted latest gate whose output contains another gate's completion text can therefore be accepted despite never emitting its own completion. If it was appended to an older stale run, v1 would still reject the old first stamp; v3.1 can accept the incomplete current attempt. Separately, mutate.sh emits OLD/TOKEN data and the command's output without the OUTPUT framing used by gate-run.sh, so header-shaped or RESULT-shaped text from those payloads remains indistinguishable to this parser. This is a source-visible custody weakness, not a claim that the dev-health transcripts contain such text. STRENGTH: entailed by parser/emitter control flow; no additional synthetic record was executed.

The header recognizer also does not enforce the emitter discriminator promised in lines 7–8: any anchored commit/tree pair is selected, and anything without “mutate.sh v3” is assumed to be a gate. The fixture verifies the implemented minimal markers, not internally matching execution/restoration evidence: case 02's RESULT summaries are only “old”/“new,” and case 08 has no output delimiters. Passing this fixture therefore cannot close the broader S1 custody requirement. STRENGTH: entailed.

Required fix: use emitter-aware framing for header, payload, output, and completion; recognize completion only outside payload/output and in the selected block's expected order. Ensure mutant output/token data has an unambiguous boundary, and validate the applicable execution/restoration fields rather than mere marker occurrence. Preserve the present fixture and extend it to cover completion text inside output, interrupted output, nested emitter text in mutant output, and a non-emitter commit/tree line. A green stamp check should continue to mean only the documented structural identity check, never authentication of arbitrary transcript edits.

Additional compatibility observation: v3.1 restores `*stamp-check*`, but v1/v2's `*.json` and `*comparator*` exclusions are absent, while `*.sha256` and `*.pid` are newly skipped. Thus “v1 behaviour” is restored for the reported self-output case, not for the complete file-selection contract. Restore or expressly document that population change and cover it when revising S1. STRENGTH: entailed by comparison.

The tool finding does not invalidate this lane's individually inspected, complete final-head records and does not change its Git merge tree.

## Packet audit

**A1/A2 — CLEAR for this round.** Amendment 1 at `packets/dev-health-worker.md:36` and `:40`, with `WORKER-RECORDS-BLOCK.md:4`–`:9`, supplies the missing emitter, literal tool invocation, baseline tree/clean-state method, three final typechecks, new mutant filenames, and final-head-only comparator scope. The dispatch is byte-identical to the worker packet. Provisioning ends with the correct base-bound PROVISIONED OK line. The original whole-directory instruction is superseded explicitly by the amendment. STRENGTH: entailed.

The amendment's implementation scope is sufficient. Its mention of the `typescript` package does not identify the programmatic API provider precisely for this repository; the already-declared `typescript-classic` alias is the correct available implementation route and needs no dependency change. Updating the example would prevent a dead end. This does not make R1 impossible. STRENGTH: entailed by package/source inspection.

**A3 — CHARGE: baseline responsibility is omitted while worker checkout/provisioning is constrained.**

File/line: `packets/dev-health-worker.md:40`; `packets/WORKER-RECORDS-BLOCK.md:5`, `:12`; worker contract `.claude/skills/heartbeat-worker/SKILL.md:97`.

Input → wrong outcome: the worker is ordered to obtain a new untouched-base measurement but is given no orchestrator-owned baseline path or handoff instruction. Provisioning is explicitly the orchestrator's, the worker contract prohibits touching branches/worktrees, and r1 already requested orchestrator measurement. The observed workaround detached and reinstalled the active lane. Successful restoration does not resolve the authority ambiguity for the next worker.

Required fix: name the orchestrator as owner of the base checkout/provisioning and supply the separate-base gate records, or explicitly grant and specify an isolated alternative before dispatch. If temporary lane detachment is ever authorized, preserve its full restore/install transcript. No repetition of these six adequate measurements is required solely to rewrite history. STRENGTH: entailed for the conflicting constraints and observed checkout; causal attribution to missing routing is consistent-with.

**A4 — CHARGE: the shared mutation instruction needs the layer distinction repaired in this round.**

File/line: `packets/WORKER-RECORDS-BLOCK.md:10`; compare `packets/dev-health-worker.md:38`.

Input → wrong outcome: the block ends its declaration-versus-caller maxim with “mutate a call site instead,” without identifying the runtime-value scope of that advice. Applied to requiredness, that instruction recreates b2 as a substitute for b—the inadequate substitution R1 corrects. The narrower statement about properties whose content callers supply can be true; requiredness itself belongs to the declaration and needs a type-level observer. The more specific R1 amendment made this lane actionable, but the reusable block does not teach that distinction.

Required fix: scope call-site mutation advice to runtime properties determined by supplied arguments; explicitly retain declaration mutations for signature contracts and require checking runtime/type/build observers before declaring a mutant unobservable. STRENGTH: entailed for the wording and b/b2 distinction; recurrence in another worker is a projected risk, not a measured event.

## Nonblocking filing observations

**N3 — compiler identity overclaim.** File/line: `agent-reports/dev-health.md:144`, `:185`; installed `node_modules/typescript/bin/tsc:2`. Input → wrong claim: matching the recorded entry hash is described as proving the “same compiler binary.” The hashed file is a small launcher importing `../lib/tsc.js`; that module selects and executes a native executable. The records establish matching entry bytes, package/version reports, and diagnostic output, not equality of all compiler implementation bytes. Required fix: narrow the filing to those measured identities, or separately record the resolved implementation/executable hash before making the stronger claim. This is nonblocking because R2 expressly required package, entry, and version, which are now present. STRENGTH: entailed for launcher delegation and record scope; identical full historical compiler contents consistent-with, not proved.

**N4 — stale historical summaries remain presented as current.** File/line: `agent-reports/dev-health.md:4`, `:230`; `agent-reports/dev-health-self.md:3`, `:58`. Input → wrong summary: readers see “three commits,” the old tip/zero rework rounds, and the old “defective prescribed mutant” conclusion before reaching the explicit correction/addendum. The actual lane has four commits and mutant b is killed in round 1. Required fix: label these opening/closing passages as historical or update the current summary; retain the measurements and correction trail. The explicit round-1 withdrawals clear R1 despite this editorial residue. STRENGTH: entailed.

## Landing

**Mergeable into dev `80559019`; lane rework APPROVE.** Fresh isolated `git merge-tree --write-tree <base> <head>` exited 0 and returned `04b40920737700d8119597b2f131d77e76306261`, identical to the head tree. Its writable object directory was temporary under `/private/tmp`, with the original object store used only as a read-only alternate; the temporary directory was removed. No checkout, branch, index, or original object store was changed. `git diff --check` exited 0, and the source checkout remains clean. STRENGTH: entailed.

Patch-risk recommendation **merge**, workflow label **human_review_required**. Impact if wrong moderate; likelihood low for the bounded final change; protection partial overall because the standing probe uses the classic compiler, broad integration is unmeasured, and inherited gates remain red; recovery easy by revert with no migration/new persisted format; confidence moderate. Known status-quo costs are the count-based census failure, undeclared runtime dependency, and unguarded return of the category default. This approval does not approve the shared tool; S1 and the packet charges belong to their owners. The validated structured assessment is embedded in the self-report.

## Not verified

No fresh unit suite, typecheck, install, mutant, full security scan, production recovery/valuation integration, Windows execution, or pinned Node 22 execution was performed. The packet's static-plus-saved-artifacts path was used; the only shared-tool execution was the preserved stamp-check fixture once. No additional failure fixture was constructed. No network, source edit, git mutation of the subject, push, merge, board edit, or DECISIONS edit occurred. The baseline trap body/boundary install outputs and full historical compiler implementation identity are not independently preserved in the reviewed records. STRENGTH: entailed for review actions and observed evidence gaps; unmeasured behavior undetermined.

REWORK: approve — R1/R2 and N2 are resolved and the lane merges cleanly, while stamp-check still requires the separate S1 repair and the packet needs A3/A4 clarification.

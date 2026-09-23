CODEX REVIEW DEV-HEALTH r1 — CHANGES · comments read through: dev-health-r1-2026-09-07
Counts: 2 lane acceptance findings (R1–R2, P2); 1 separate tool finding (S1, P2); 2 worker-packet charges (A1–A2); 2 nonblocking source observations (N1–N2). No introduced production failure demonstrated.

Reviewed the complete reviewer packet first, then the worker packet and identical dispatch, both worker filings, four tickets, the immutable eight-file diff, callers, and saved evidence. Source paths below are relative to the lane's `dialectical-engine/`; mission paths (`logs/`, `tools/`, `packets/`, `agent-reports/`, `DECISIONS.md`) are relative to the mission directory named in the packet. Source line numbers bind the head below. STRENGTH: entailed by reads and Git inspection.

Base: `80559019e68932fd16528fc82e9ba174b952e0cf`. Head: `8252bca106df77185710465d97713399a6ed92f2`. Branch: `lane/dev-health`; three commits, clean working tree. Exact patch SHA-256: `a95db219b16fdb4c8f5131a2b0fb2feca2ac9071b79624c20956bf75a808a011`, computed over 29,359 bytes from `git diff --no-ext-diff --no-textconv --binary --full-index <base> <head> --`. STRENGTH: entailed.

## Findings

**R1 — P2: the default-restoration requirement has no persistent observer, and the committed trap overstates impossibility.**

File/line: `tests/unit/p2-auth-risk.test.ts:246`; `.hermes/TOOLING-TRAPS.md:2228`; `agent-reports/dev-health.md:98`.

Input → wrong outcome: restoring only the default on `poisoned` leaves every existing argument intact. The saved `33-mutant-b-restore-default-SURVIVES.log:17` reports the same eight compiler diagnostics and 12 passing tests. Thus the regression prohibited by worker outcome §3/§5(b)—accepting a future zero-argument call—escapes the committed checks. The source currently has the correct required parameter; this finding concerns regression protection and the claim used to waive the required mutant.

The worker is right about the existing runtime tests: an unused default does not change their observations. It is not right that requiredness is unpinnable at a declaration. A compile-negative contract check can assert that an omitted category produces an arity error; restoring the default removes that error and fails the check. This can inspect the private helper through a virtual compiler source without exporting it or executing an invalid call. The allowed test file is sufficient scope. A syntax/arity contract check is another option.

b2 is useful evidence that today's compiler rejects one omitted argument: `34-mutant-b2-strip-call-site-argument.log:15` contains TS2554. It does not make the ordinary suite fail when the default returns, and therefore is supplementary evidence rather than an equivalent replacement for b. Its wrapper's `EXIT = 0` is correctly disclosed; the named diagnostic, not that exit, discriminates.

Required fix: add a persistent required-argument contract check, demonstrate that b fails it while the fixed declaration passes, retain b2 as complementary evidence, and append a correction to the append-only trap plus correct both worker filings' universal impossibility claim. Do not change the working production signature or expose the helper merely for testing.

STRENGTH: entailed for the missing observer, source signature, saved outcomes, and distinction between a type contract and existing runtime behavior; the proposed new check has not been implemented or executed in this review.

**R2 — P2: the typecheck identity evidence lacks the compiler identity it claims and does not meet the stated repetition count.**

File/line: `logs/dev-health/43-gate-typecheck.log:5`, `logs/dev-health/baseline/00-typecheck-untouched.log:1`, `agent-reports/dev-health.md:110`; mechanism at `tools/gate-run.sh:50`.

Input → wrong outcome: the gate is invoked as `pnpm --dir dialectical-engine run typecheck`. The emitter recognizes literal tool arguments such as `tsc`, not package-script names. Consequently this record contains no tsc package, resolved entry, entry hash, or version. The baseline is a hand-written record with a commit but no tree, compiler identity, or before/after porcelain. The report nevertheless says the records carry resolved “vitest/tsc” identities. Equal diagnostic text cannot establish which compiler produced either half. D45 requires the baseline commit and tree; D52 supplies the compiler identity requirement.

Separately, only one final typecheck gate exists, despite worker §4 saying “Gates ×3 each” and the report opening its table with “Three runs each.” Superseded or mutant runs do not supply two additional clean final-head identity gates. The semicolon-separated packet wording could be clearer, but it grants no express single-run exception.

Required fix: preserve the captures and repair both halves with the actual compiler identity and baseline tree/clean-state evidence required by the emitter contract. Use an invocation that exposes the actual compiler to the emitter while preserving the package script's semantics, or attach equivalent contemporaneous identity evidence. Supply the missing final-head repetitions and derive the report's counts from those records. If historical compiler identity cannot be recovered, obtain a freshly measured baseline through the orchestrator rather than retroactively adding metadata to an old run. Correct the current provisioning overclaim.

STRENGTH: entailed for absent fields, emitter behavior, and one recorded final-head run. Compiler equivalence at measurement time is undetermined. This is an evidence defect, not evidence that the compiler changed or that typechecking regressed.

## Corpus and dependency assessment

**Corpus — implementation cleared.** `shippedCorpusManifest.ts:53` constructs sets for both inputs and calculates both differences; input order has no effect. `s1-1-depth-contract.test.ts:373` still parses every scanned file before the assertions. The manifest does not filter the scan. Roots, exclusions, extensions, walker, and other oracle rows are unchanged. The scan uses `relative(...).split(sep).join("/")`, matching the manifest's slash form; reading trims CRLF line endings. The update helper receives those already-normalized paths. Windows execution was not measured, but the separator handling is correct by source inspection. STRENGTH: entailed for these source properties.

Fresh independent filesystem enumeration and filtered Git trees agree: 233 unique manifest paths, sorted; packages 75, apps 157, web 1; 59 TSX. Scan minus manifest and manifest minus scan are both empty. The similarly filtered tree at `70647e7e` has 232 paths; its sole addition is `apps/api/src/risk-signal-identity.ts`, with no removed path. STRENGTH: entailed by fresh computation.

A file deletion accompanied by deletion of its manifest entry passes this census check. Both deletions remain visible in Git review; there is no independent historical inventory in this row that rejects an approved pair. That is the requested deliberate-manifest-edit contract, not an invariant that source files can never be removed. A source-only deletion produces `missing`; a manifest-only deletion produces `added`. Setting `SHIPPED_CORPUS_MANIFEST_UPDATE=1` deliberately regenerates the expectation before comparison, so a run in update mode is not evidence of absence of drift. The recorded acceptance commands do not request update mode. STRENGTH: entailed by source/record inspection; no paired-deletion experiment run.

Saved mutants a/a2 name the respective paths in `30-mutant-a-manifest-entry-removed.log:1038` and `31-mutant-a2-phantom-manifest-entry.log:1040`; c reports a surviving consistent rename with three applied replacements. Restore hashes match the committed targets in all five mutant records. The TSX assertion is redundant for this unique manifest; it adds no independent coverage over exact path-set equality. STRENGTH: entailed.

**Runner dependency — implementation cleared.** `apps/runner/package.json:27` uses exactly `"workspace:*"`, like its sixteen existing workspace dependencies; the new total is seventeen. The sole lockfile addition at `pnpm-lock.yaml:252` is the valuation importer entry with `specifier: workspace:*` and `version: link:../../packages/valuation`. The runtime import already existed at `apps/runner/src/index.ts:73`; valuation's package exports its source entry. STRENGTH: entailed.

The install capture `red/06-pnpm-install-tool.log` records `pnpm install`, exit 0, and before/after lock hashes. I independently hashed both committed versions: `203df4b7…32fea` → `cdd1a10e…9768`, exactly matching that capture and the final gate headers. The diff is exactly those three added lines. This supports the reported tool-generated provenance; it does not independently prove that no human ever edited the bytes. No install was rerun. STRENGTH: entailed for byte/hash correspondence; consistent-with for exclusive tool authorship.

## Category assessment and nonblocking observations

The three newly explicit arguments at `auth-risk.ts:91`, `:95`, and `:123` are `policy-shape`, `evaluated-at-shape`, and the existing `signal-shape`. There are two new vocabulary members, five total. Their values are constants; the getter accepts only the frozen vocabulary, and the public error remains `TypeError("AUTH_RISK_SIGNAL_POISONED")`. Existing decrypt/parse calls remain explicit. The new tests observe the stages and exact public message; saved RED has 3 failures/9 passes, then final P2 captures have 12 passes each. STRENGTH: entailed.

**N1 — inherited classification limit, nonblocking.** File/line: `auth-risk.ts:113`. Input → outcome: invalid `retentionMs` with a row reaches `signal-shape`, while an empty signal list never checks retention. The same predicates and default label existed at base. Thus `policy-shape` truthfully describes the maxSignals site, but does not classify every policy defect. Required fix for a separately scoped follow-up: decide the retention-validation contract before moving the check; no change required for this lane's category-only scope. STRENGTH: entailed by base/head source.

**N2 — inaccurate new ordering comment, nonblocking.** File/line: `auth-risk.ts:41`. Input → wrong description: a nonempty `evaluateForRecovery` result is decrypted and parsed at `:247` before the evaluator is called at `:264`; the comment describes the reverse order. The getter's nearby comment at `:54` also still says “three constants.” Required fix: describe the vocabulary without promising a global execution order and update the stale cardinality when revising the documentation. No predicate or execution order changed here. STRENGTH: entailed.

## Saved gates

These are inspected worker captures, not fresh reviewer test executions. Each final gate has the stated head/tree and empty before/after tracked porcelain. STRENGTH: entailed for record contents, subject to R2.

| Gate | Recorded runs | Result |
|---|---:|---|
| Whole S1-1 file, prefix 40 | 3 | Each exit 1; 1009 passed, 1 failed |
| P2 auth-risk, prefix 41 | 3 | Each exit 0; 12 passed |
| ENV-01 runner smoke, prefix 42 | 3 | Each exit 0; 1 passed |
| Typecheck, prefix 43 | 1 | Exit 1; eight baseline-identical diagnostics |
| Frozen install, prefix 44 | 3 | Each exit 0 |

The sole S1-1 failure is “S1-1 · the architecture audit recognizes the ruled exports and edges (J10) > reports no T1-owned architecture or source-rule violation,” opening missing `web/package.json`. It appears in the untouched-base RED at `red/01-red-s1-1-corpus.log:1042` and all three final runs at `:1035`. The previous corpus-count failure is absent from those final runs. The runner smoke imports the runner entry and tests its composer cap; it does not test valuation behavior. STRENGTH: entailed for the saved assertions and failures.

I independently re-extracted diagnostics from raw command output, using compiler-shaped lines rather than the worker's saved extracts. Both halves contain eight lines and hash to `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120`. This establishes textual equality only; see R2. STRENGTH: entailed.

## Side question F-TOOL-MUTATE-3

**CHANGES — S1, P2: select a complete latest run, not the last unstructured hash.**

File/line: mission `tools/stamp-check.sh:21`; emitter `tools/mutate.sh:39`, `:44`, `:58`, `:62`.

Input → wrong outcome: a stale record with a later current-head stamp is accepted even if no fresh discriminating command ran. The comparator accepts a matching substring anywhere and never checks an emitter boundary, command output, completion, restore evidence, or RESULT. An ordinary rerun that stops at the pre-gate already appends its new stamp before running a command. An unrelated stamp later in command output has the same identity-selection problem.

Selecting the latest run is correct for append-only transcripts; selecting the latest matching token is insufficient. The v1 first-stamp rule would keep rejecting a stale record after a bare fresh tail stamp; v2 now accepts it. Thus this weakens that stale-record check, although neither version authenticates arbitrary edits to the whole log. `stamp-check` is only an identity comparator; a green result must not be presented as proof of fresh execution.

Required fix: prefer a distinct immutable record per run, preserving previous captures, or parse anchored emitter blocks and require the newest attempted block to be complete with internally matching execution/restoration evidence. Reject trailing partial attempts rather than falling back to older successful output. Add positive coverage for a complete appended rerun and negative coverage for a stamp-only tail, an aborted rerun, and a stamp inside command output. Structural checks still do not establish tamper-proof custody.

The saved `logs/tooling/st3-selftest.log` contains only the comparator output (4 records, 2 failures); its temporary fixture directory is absent. It does not preserve the fixture contents, assertions, command exits, or a negative test for completion. It cannot establish the required custody property. STRENGTH: entailed by comparator/emitter source and the surviving artifact; no forged record or mutant was created in this review.

The lane used distinct mutant filenames, each with one complete emitter block and a final restoration RESULT, so this side defect alone does not invalidate those particular captures. STRENGTH: entailed by full-file structural inspection.

## Packet audit

**Overall: CHARGE A1–A2; clear implementation reach and the alleged impossibility of §5(b).**

**A1 — missing gate emitter/provisioning guidance.** File/line: `packets/dev-health-worker.md:20` and `:29`. Input → wrong outcome: a worker follows the named gate commands/tools without the required `gate-run.sh` invocation and produces hand-written records missing D45/D52 provenance. The preserved superseded pass and R2 show the cost. Required packet fix: name the mandatory emitter and show invocations that identify the actual compiler, plus baseline provenance and an explicit repetition count per gate. STRENGTH: entailed for omission and saved artifacts; causal attribution to packet wording is consistent-with.

**A2 — stamp-check scope includes an intentionally old provisioning record.** File/line: `packets/dev-health-worker.md:22`, alongside its fixed provisioning path at `:6`. Input → wrong outcome: following the whole-directory comparator command after any lane commit necessarily reports the valid base provisioning record as stale. Required packet fix: compare only final-head gate/mutant records and validate provisioning separately against the base. This also follows the narrower comparator meaning recorded in `DECISIONS.md:2457`. Preserve the original provisioning record. STRENGTH: entailed.

The saved whole-directory count is **19**, not the reviewer packet's 17: 1 provisioning record + 5 mutant records + 13 gate records. `92-stamp-check.log:3` and a fresh top-level enumeration agree; its one failure is provisioning. `93-stamp-check-worker-records.log` reports 5/0 and 13/0 for the worker prefixes. This corrects a reviewer-packet fact, not a worker failure. STRENGTH: entailed.

Contract reach is sufficient: the packet expressly permits the corpus helper/generation mechanism, new manifest, dependency/lock entry, category-set update in outcome §3, tests, and append-only traps. The eight changed files fit that scope; the readonly instrument and production paths remain unchanged. The ticket's old call-site line numbers are stale, but the worker packet correctly binds the three base sites. The base corpus pin and sixteen undeclared-valuation-neighbor dependencies also check out. STRENGTH: entailed.

§5(b) is **cleared of the claimed impossibility defect**: a test of requiredness can observe the restored default. Existing runtime rows cannot; the packet could usefully explain that distinction. b2 is a valid positive demonstration of the compiler guard, not a complete substitution for the specified regression check. See R1. The optional learning-pass suggestion is reasonable, but the numbered outcomes do not require taking final records before learning; no independent impossibility charge is warranted. STRENGTH: entailed for the contract/test distinction; workflow preference is judgment.

Provisioning's terminal line is exactly `PROVISIONED OK commit=80559019e68932fd16528fc82e9ba174b952e0cf`, with frozen install and generation exits 0. This clears the packet's startup condition. Saved runs use Node 25.7.0 despite the package's 22.23.1 engine warning. The emitter reports pnpm 10.33.0 from its context, while actual package commands report 11.20.0; this is not evidence of a lockfile failure, but does limit claims of uniform tool provenance. Neither the conditional skill-tool warning nor the worker's disclosed skill omissions proves a provisioning failure. STRENGTH: entailed for recorded versions and startup text; pinned-runtime compatibility is undetermined.

## Landing

**Textually mergeable into dev 80559019; acceptance not approved pending R1–R2.** Fresh `git merge-tree --write-tree <base> <head>` exited 0 and returned tree `67bd59a7d57f17166e1b9f786a36820954e6fb4b`, identical to the head tree. Git object writes were redirected into a disposable `/private/tmp` object directory, using the original object store only as a read-only alternate; the temporary directory was removed. No checkout, branch, index, or original object store was changed. Local dev still resolves to the stated base. `git diff --check` also exited 0. STRENGTH: entailed.

Patch-risk recommendation: **revise**, workflow label **revise**. Impact if wrong: moderate (bounded dependency resolution and internal diagnostic contract); regression likelihood: moderate because requiredness protection is incomplete; protection: partial; recovery: easy via isolated revert, with no migration or new persisted format; confidence: moderate. Holding the patch leaves the known count failure, undeclared dependency, and defaulted-category maintenance risk in place. The tool verdict is separate and concerns mission evidence custody, not this Git merge tree. The validated structured assessment is embedded in the self-report.

## Not verified

No unit suite, typecheck, install, mutant, or shared tool self-test was executed by this reviewer; this follows the packet's static-plus-saved-artifacts review path. No network, push, merge, board edit, DECISIONS edit, or production edit was performed. No full-suite, production valuation/recovery integration, Windows, or pinned Node 22 execution is claimed. Historical tool authorship and compiler identity cannot be recovered merely from the current filesystem. Proposed repairs remain unimplemented. STRENGTH: entailed for review actions; unmeasured runtime properties are undetermined.

REVIEW: changes — repair the requiredness regression check and typecheck provenance before landing; revise last-stamp custody separately.


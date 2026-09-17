# Ceremony report — the definition-of-done facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The acceptance ceremony's phase report prints, from the run it just settled, every fact the Global definition of done's flagship bullet names — so the judge can issue the whole-goal verdict from the closing run's log instead of from six absences.

**Architecture:** `acceptance/run-acceptance.ts` already reads the settled run (answer through the API, lineage/review/envelope through SQL) and prints a report. A new reader beside it derives the definition-of-done facts from the same run, the ceremony carries them on `LiveAcceptanceCeremony` as a typed block and prints one stable line per sub-clause. No migration, no runtime change, no credential: everything printed is already computed and persisted by the algorithm.

**Tech Stack:** TypeScript (ESM, strict), vitest, embedded PostgreSQL (`acceptance/standing-db.ts`), the `@debateai/contract` Answer schema.

## Global Constraints

- Repository: worktree `/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/algo-loop-2026-09-16`, engine root `dialectical-engine/` (run every command from there). Base commit `5c9c4678`. Branch `mission/2026-09-16-algorithm-live-loop-continuation`. Never `cd` to the main checkout; never touch another worktree.
- Allowed writes: `acceptance/**` (code and tests) and `acceptance/README.md`. Forbidden: `.hermes/**`, `docs/**`, `migrations/**`, `packages/**`, `apps/**`, `tests/**`, `package.json`, lockfiles, vitest configs. A change outside the allowed set is BLOCKED — report it, do not make it.
- D18: never mint, read, echo or store a real credential. The 43-character fixture value the proofs use (`"p".repeat(43)`, `acceptance/panel01-depth1-proof.ts:12`) is test data and is fine. Never run a real `claude`/`codex`/`grok` binary; never start Docker ("Docker not running" is immaterial — the acceptance suites run on embedded PostgreSQL here). Never run the full test suite; never push.
- Content law (V-SEC-1, `migrations/0063`; `migrations/0057` header): no debate content in the ceremony log — no claim text, no statement text, no objection text. Ids, numbers, booleans, marks and register row keys only.
- Every sealed value is READ from the register, never a literal: the evaluator loop bound is `readAcceptanceRuntimePolicy(pool).synthesisRolePolicy.evaluatorLoopMaxRounds` (`acceptance/runtime-policy.ts:293,356`; `packages/register/src/algorithm-policy.ts:278-281,614`). No numeric enumerations anywhere (the S1-1 depth law; `tests/unit/s1-1-depth-contract.test.ts:296` scans `packages`, `apps`, `web` — `acceptance/` is outside its roots, and the law binds regardless).
- Three-run law: every suite you cite is run three times at the final tip and reported as passed/total per run, with `testResults.length` as the file count when you read vitest JSON. RED before GREEN on every new assertion (the failing frame quoted). Two typechecks, both 0 errors: `pnpm run typecheck` (blind to `acceptance/`) AND `pnpm exec tsc -p acceptance/tsconfig.json --noEmit`.
- Commits: conventional prefix, message body says what changed and why; end every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: The ceremony report prints the definition-of-done facts

**Files:**
- Create: `acceptance/<a module you name>.ts` — the reader that derives the facts from the settled run (and its unit test beside it, `*.test.ts`)
- Modify: `acceptance/run-acceptance.ts:97-133` (the `LiveAcceptanceCeremony` interface) and `:236-407` (the read-and-print section of `runAcceptanceCeremony`)
- Modify: `acceptance/README.md:190-196` (the paragraph that documents what the ceremony prints)
- Test: `acceptance/ceremony.test.ts:340-470` (the dry-run ceremony: a real settled run on the embedded database, answer read through the API) — extend it, or add a sibling test that reuses its setup; `acceptance/run-acceptance.test.ts:185-197` (the source-order pattern)

**Interfaces:**
- Consumes: `AnswerSchema` (`packages/contract/src/index.ts:575-655`: `verdict_state`, `verdict_unavailable`, `confidence_band`, `band_ceiling`, `condition_marks`, `residual_objections`, `nodes`, `edges`, `terminal`, `serve_state`); `NodeSchema` (`:450-468`: `base_score.value` is the node's τ, `final_strength` nullable, `disagreement` nullable record); `BandCeilingSchema` (`:357-368`: `basis {LOOKED_UP, RAN, REASONING}`, `register_row_key`); the ceremony's own lineage rows (`run-acceptance.ts:264-276`, `node.depth`); `serve.synthesis_round` (`migrations/0057_t09_synthesis_round.sql`: `round`, `synthesizer_stage`, `evaluator_satisfied`, keyed by `answer_id, answer_version`); `ledger.reduced_judgement` (`packages/db/src/schema.ts:342-366`: `tau`, `selected_judgement_ref`, `dispersion`, `panel_contract_hashes`, `disagreement`); `ledger.node_strength_record` (`:367-389`, latest propagation run — the LATERAL join at `packages/serve/src/index.ts:3336-3342` is the served definition of "final"); `core.edge` (`:247-262`: `polarity`, `strength`, `magnitude_status`).
- Produces: a typed, frozen facts block on `LiveAcceptanceCeremony` (every field typed — no `unknown`, no `any`), one printed line per sub-clause with a stable leading token you choose and document.

**The clause this serves — the Global definition of done, verbatim (`slices/S12-closure/SPEC.md:33-45`):**

```
- Full multi-maker acceptance run (M≥2, depth≥2) completes with: panel-reduced τ
  (non-self-graded), measured edges, at least one root's final strength ≠ τ, an adaptive
  stop or ceiling recorded, a synthesizer verdict statement acknowledging the strongest
  surviving objection, an evaluator loop record (≤3 rounds), a code-derived three-state
  label, a band counted over cited nodes, AND envelope state WITHIN at terminal.
```

The 2026-09-08 closing run printed the ceiling arm and the envelope state (`T17 envelope at terminal: WITHIN · 30/106`), the graph counts and the lineages — and none of the rest. The W12 closure audit (`.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/w12-closure-audit-2026-09-16.md` §2.3, read-only for you) found sub-clauses 1, 3, 5, 6, 7, 8 absent and 2 partial: every one is computed and persisted by the algorithm; the report never wrote it down.

**Where each fact lives (measured 2026-09-17 at 5c9c4678):**

1. *Panel-reduced τ, non-self-graded.* Per node, `ledger.reduced_judgement.tau` with `disagreement.panel = { authorMaker, authorProviderRef, voiceCount, nonAuthorVoiceCount, members[...] }` written by the runner (`apps/runner/src/index.ts:2727-2739`); `nonAuthorVoices === 0` earns the `PANEL-DEGRADED-SINGLE-VOICE` mark (`:2700`). At M=1 the skeleton path selects the author's own judgement (`:2571-2593`) — that is what "self-graded" means. Served as `nodes[].base_score.value` and `nodes[].disagreement` (`packages/serve/src/index.ts:3380-3386`, `:3312`); whether the owner read carries `disagreement` non-null is yours to measure — if it does not, read the ledger row.
2. *Measured edges.* `core.edge.strength` / `magnitude_status` per attack edge; served as `edges[].strength.status` `PRESENT | UNKNOWN` (`packages/contract/src/index.ts:482-485`).
3. *A root's final strength ≠ τ.* Roots are `core.node.depth = 0` (your lineage rows carry `depth`); final is the latest `ledger.node_strength_record.strength` (served `nodes[].final_strength.value`, nullable); τ as in (1).
4. *Adaptive stop or ceiling recorded.* Already printed (`T17 envelope at terminal`, `run-acceptance.ts:376-379`); leave it.
5. *Synthesizer statement acknowledging the strongest surviving objection.* The code's judge of this is the evaluator: `EVALUATOR_INSTRUCTIONS` (`packages/serve/src/synthesis.ts:292-295`) — fairness to the losing positions, agreement with the label, overstatement — and the digest it judges against emphasises the top surviving objections strongest-first, node id breaking ties (`:178-200`, count at `:99`). A surviving objection is a node that attacks something and still carries a propagated number (`apps/runner/src/index.ts:3925-3928`). The loop ends satisfied or with the objection standing: `standingObjection` is null iff the last round's verdict was satisfied (`synthesis.ts:705-707`), and then the served answer carries the `SYNTHESIS-OBJECTION-STANDING` mark (`:127`) in `condition_marks`.
6. *Evaluator loop record ≤ bound rounds.* `serve.synthesis_round` rows for the served `(answer_id, answer_version)`; the bound from the register row named in Global Constraints.
7. *Code-derived three-state label.* `answer.verdict_state` or, exactly when it is null, `answer.verdict_unavailable.reason_ref` (contract `:581-582`, `:650-651`; derivation `packages/serve/src/index.ts:1412-1413`).
8. *Band counted over cited nodes.* `answer.confidence_band` with `band_ceiling.basis` — the counts over the CITED set (`packages/serve/src/index.ts:1101-1112`) — and `band_ceiling.register_row_key`.
9. *Envelope WITHIN at terminal.* Already printed; leave it.

**Outcomes (what must be true when you are done — the how is yours):**

- O1. `LiveAcceptanceCeremony` carries a typed, frozen block with, at least: per node its τ, voice count and non-author voice count, and whether the panel was single-voice; per root (depth 0) its τ, its final strength (nullable) and whether they differ; the run-level booleans "every node's τ had ≥1 non-author voice" and "at least one root's final ≠ τ" with the offending/witness node ids; the attack-edge count and how many carry a PRESENT magnitude; the strongest surviving objection's node id and final strength (strength descending, node id tie-break, nodes without a number excluded), or null when none survives; the loop rounds (round, stage, satisfied) with the count and the sealed bound; whether the final round was satisfied and whether the standing mark is present; the label or the unavailability reason ref with `terminal` and `serve_state`; the band, the three basis counts and the ceiling's register row key.
- O2. The ceremony prints one line per sub-clause (1–3, 5–8; 4 and 9 already exist) with a stable leading token per line, before it returns, in the same `console.info` stream as the existing report (`run-acceptance.ts:364-385`). The tokens are documented in `acceptance/README.md` beside the paragraph at `:190-196`. WHO READS THESE STRINGS: the W12 judge and the closure audit, reading `logs/closing-run/ceremony-*.log` as captured verbatim by `tools/closing-run.sh`; nothing greps them today, so the tokens are yours — make each unique, keep them once you have chosen.
- O3. A SHAPE violation is a typed refusal in the style of `ACCEPTANCE_TERMINAL_ENVELOPE_STATE_INVALID` (`run-acceptance.ts:301-303`): round count above the sealed bound, a round record whose numbering is not 1..n, a label that is neither a state nor an unavailability reason, a node without a τ. A DoD OUTCOME is reported, never thrown: no root differing, an objection standing, a single-voice panel, an UNKNOWN edge magnitude, no surviving objection — the judge decides those.
- O4. The three live proofs (`acceptance/panel01-depth1-proof.ts`, `xrev01-depth1-proof.ts`, `pro01-depth2-proof.ts`) typecheck unchanged: the interface change is additive.
- O5. Tests, RED first, each frame quoted in your report:
  - unit tests of the derivation over hand-built inputs: root differs / does not; loop satisfied on round 1 / on round 3 / standing after the bound; multi-voice / single-voice panel; strongest-objection order incl. the null-strength exclusion and the id tie-break; label vs unavailable; band basis passthrough; each shape refusal by its code.
  - the dry-run ceremony test's settled run (`acceptance/ceremony.test.ts:340-470`) proves the reader against the database: the facts equal independent SQL over `ledger.reduced_judgement`, `ledger.node_strength_record`, `serve.synthesis_round` and `core.edge` for that run, and the round count is ≤ the register's bound read from that same database.
  - a source-order test in the pattern of `acceptance/run-acceptance.test.ts:185-197`: the ceremony calls the reader and prints every documented token before it returns the report.
  - per-assertion refutation: for each new assertion, one mutant that must make it fail (drop the non-author check; print a literal bound; exclude the tie-break; swap τ and final), its target suite red at that site, then restored — recorded as a matrix in your report.
- O6. Gate at your final tip, three runs each, passed/total per run: `acceptance/run-acceptance.test.ts`, `acceptance/boot-relays.test.ts`, `acceptance/ceremony.test.ts`, your new test file(s), `tests/architecture/s6-content-encryption-contract.test.ts`, `tests/architecture/s7-authorization-contract.test.ts`, `tests/architecture/s9-dev-token-retirement-contract.test.ts`, `tests/unit/deployment-register-family-wiring.test.ts`, `tests/unit/exec01-rework-contract.test.ts`, `tests/unit/t15-eval-harness.test.ts` (every suite that reads `run-acceptance.ts`, `main.ts` or the README), plus both typechecks. Run each with `./node_modules/.bin/vitest run <file>`; a command that may exceed ten minutes is detached (`nohup … > log 2>&1 & disown`) and its log read back — never a background Bash.

- [ ] **Step 1: Read the sources named above at the lines named** — the ceremony's read-and-print section, the contract schemas, the 0057 migration, the runner's panel record, the synthesis loop end, the dry-run ceremony test. Measure whether the owner read of the answer carries `nodes[].disagreement`.
- [ ] **Step 2: RED** — write the unit tests and the dry-run assertions against the reader you have not written yet; run them; quote the failing frames.
- [ ] **Step 3: The reader** — the module, the interface block, the printed lines, the README paragraph. GREEN.
- [ ] **Step 4: Refutation matrix** — one mutant per new assertion, red at the site, restored.
- [ ] **Step 5: Gate** — O6 in full, both typechecks, the proofs typecheck.
- [ ] **Step 6: Commit** — small commits with conventional prefixes and the trailer; report status, commits, a one-line test summary and concerns; the full account in the report file the dispatch names.

### Task 2: Records (orchestrator, not dispatched)

D74 in DECISIONS (the content law applied to the ceremony log; the tokens; the shape/outcome boundary), PROGRESS/LEDGER/RESUME rows, a board ticket for the fix and the audit's §6 step 1 marked done, the V packet row, the readiness packet amended to name the new lines, the memory file. Then fast-forward `dev` and push.

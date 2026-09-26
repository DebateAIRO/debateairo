# Self-report: ARCH-PES-S02 (node ARCH(S02), pass 1 of 3, ticket t_b4187218, 2026-09-25)

Transcript: `agent-a19b961f9def28575.jsonl` (claude-opus-5-5). Lane `.worktrees/pes-s02` @ 776359c3, dirty 0 before and after.
Artifacts: `docs/missions/provider-env-selection/slices/S02/PLAN.md` (851 lines, 20 steps, 3 clusters) and `DECISIONS.md` (appended block: 22 rows + 1 V-ROW).

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## 1. The body count: where the tokens went

| # | Cause (not symptom) | Price | Evidence |
|---|---|---|---|
| F1 | **The packet's code-surface ranges named the guard, not the machine.** They pointed at `packages/providers/src/index.ts` guard lines and `main.ts:299-325`. R2.1 lives somewhere else: `dev-api-environment.ts` (the key list, the `values` map, the acceptPreviousSource predicates), the launcher pin in `dev-api-process.ts:181-214`, `dev-runner-process.ts:59-128`, the test fixtures, and `provider-discovery.ts:49-90`. I found all of them by grep. | ~25% of session tokens; one context compaction | PLAN §9 "packet gaps" rows |
| F2 | **SPEC §4 and intake §5b label two baseline failures "environment-dependent" when they are deterministic.** dev-api-process: the fixture sets `EVALUATOR_DEV_MENU_ENABLED` "true" (`tests/integration/dev-api-process.test.ts:79`), and the launcher pins it to "false" (`apps/runner/src/dev-api-process.ts:209`). dev-provider-panel: a literal fixture of 5 slots against an expectation of 2 (`:11-24`), with no network. Before trusting the label I had to prove that neither failure moves under my change. | ~8% of tokens; one extra base run | C1-base-run2.out, DECISIONS |
| F3 | **I guessed a regression pair instead of measuring it.** I wrote register-support-publication as 15/0. The base measured 14/1: an unrelated snapshot hash at `:475`. Run 1 was wasted. | 1 full C1 base run (~4 min wall-clock) | C1-base-run1.out vs run2.out |
| F4 | **The rule "newest agent-*.jsonl is yours" fails when seats are dispatched together.** Three seats started within ~1 s, and the newest file belonged to S01. I had to use meta.json to find mine. | ~3% of tokens | CLAIM comment |
| F5 | **The banned-word check was manual.** I found "better", "handler" and "handled" three separate times, in DECISIONS, then in PLAN §9. Each find cost a self-check rerun. | 3 reruns | plan-selfcheck.sh check 1 |
| F6 | **My own trace checker reported a false GAP.** The regex counted a step id in two tables. I fixed it and added a known-bad control (S02-S21, which must read 0/0/0). | 1 rerun | plan-selfcheck.out |

## 2. What I nearly got wrong

1. **The R2.1 hazard to V's live dev stack.** My first cut appended the key to `DEVELOPMENT_API_ENVIRONMENT_KEYS` without an upgrade predicate. `publishExactFile` would then throw DEV_API_ENVIRONMENT_DRIFT on V's existing `api.env` at the next `dev:auth:up`, so the whole stack would refuse to boot after a merge. The plan now carries `isExactEnvironmentWithoutDeclaredDeploymentMode` (step S02-S06). The key point: this predicate is itself the regression the SPEC never names.
2. **The DEV-10B fixture edit.** Without the added fixture line, `DEBATEAI_DEPLOYMENT_MODE=undefined` reaches `parseApiEnvironment`, and the support-preview case at `dev-api-process.test.ts:208` turns RED. That would look like a product regression, and it would have cost a REV pass.
3. **vitest `-t` exits rc 0 when every test is skipped.** The REV step "run the two new titles" is green at base with 201 skipped. Had I recorded rc 0 as "base verdict PASS", the step would have been meaningless. Every such step in the plan now asserts a passed count, not the rc.
4. **pnpm writes `[ELIFECYCLE] Command failed with exit code 1.` to STDOUT.** SPEC-v3 §5 step 8 reads the last stdout line for the verdict, so a non-zero exit replaces the verdict line with pnpm's line. That became the V-ROW: exit 0 on all three verdicts. The alternative is to amend the SPEC to read the line above.
5. **The IPv6 path.** `api.localtest.me` resolves to both `::1` and `127.0.0.1`, and the fake vendor listens on 127.0.0.1 only. I spiked it: with autoSelectFamily=true (the default), node falls back and gets status=200. Unspiked, a BUILD seat could have burned a pass on ECONNREFUSED.

## 3. Dead ends (do not re-derive)

- **Mocking TLS with `NODE_TLS_REJECT_UNAUTHORIZED=0`.** Dead: it defeats the TRUST evidence line R2.7 needs. The working design is a dedicated `https.Agent({ca:[cert]})` with rejectUnauthorized:true, plus a negative control on the default fetch (DEPTH_ZERO_SELF_SIGNED_CERT on both the IP URL and the hostname URL, 0 requests reached the server).
- **Committing a cert fixture.** Dead: it would expire and it would be key material in the tree. Generate the cert at run time with `/usr/bin/openssl` (LibreSSL 3.3.6), SAN DNS:api.localtest.me, CA:TRUE.
- **Running `support-config-principals.test.ts` as a regression pair.** Dead: it names :55432 (`:36-37`), which is NO-TOUCH. It is excluded, and the reason is recorded.
- **Stubbing custody root in the DEV-09 siblings.** Not in S02's write surface. `dev-api-environment.test.ts` and `dev-api-process.test.ts` have 0 `DEBATEAI_DEV_CUSTODY_ROOT` stubs, yet they resolve through `custody-root.mjs:97-101`. I report this as a finding rather than a plan step.

## 4. Where the packet was unclear

- **Code-surface ranges omitted the files where R2.1 lands** (F1). The packet should list the assembler, the launcher and the fixtures by line.
- **Charge 9 versus the board.** Charge 9 says "S02 depends on no other slice", but the board title still names S01. I followed the packet. The orchestrator should fix the ticket title.
- **R2.11 vs SPEC §4.** R2.11 can be read as binding the whole suite or only the slice's steps. I recorded the reading "slice's steps only" in DECISIONS. A REV seat may read it the other way.
- **The transcript rule** (F4).

## 5. Upgrades, ranked by tokens saved

1. **Generate the packet's code surface from the SPEC's own nouns** (grep every identifier the SPEC names, list file:line). This saves F1, about a quarter of an ARCH seat.
2. **The baseline row should carry the failing test NAME and the cause class** (deterministic or environment). This saves F2 and prevents a REV seat from waving through a new failure as "environment".
3. **Ship `plan-selfcheck.sh` as a template in heartbeat-architecture.** It checks banned words, scaffold headings, a one-define/one-trace/one-refute step matrix with a known-bad control, the forward trace, byte-exact fixtures and EXACT/CONTAINS labels. This saves F5 and F6, and gives ARCH-REV a mechanical first pass.
4. **Put the transcript id in the dispatch prompt** (the orchestrator knows it). This saves F4 on every parallel dispatch.
5. **Add a TOOLING-TRAPS heading for "vitest -t all-skipped rc 0" and "pnpm ELIFECYCLE on stdout".** Both cost me a probe each, and both will bite the BUILD seat.
6. **"Measure, never guess" for regression pairs.** The generator should emit pairs from a base run, never from a seat's memory (F3).

## 6. Toward a one-prompt machine

This node's content was determined by three inputs: the SPEC, a grep of its identifiers, and one base run. An ARCH generator that pre-computes items 1, 2 and 6 would leave the seat only the design choices: the upgrade predicate, the fake-vendor trust shape, and the exit-code V-ROW. That would cut the seat by an estimated 40%.

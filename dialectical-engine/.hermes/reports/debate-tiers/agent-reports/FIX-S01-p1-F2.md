# FIX-S01-p1-F2 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

Three defects shared one cause: the executable contract stopped at source-shape evidence instead of failing on the measured product property. The CSS test proved that token names and selectors existed, but not that the token values were correct, not that an id stayed on one line, and not that every extracted region existed and contained declarations.

The correction is commit `f9b40d0ff1b9a8afe39b07c81f95b072938c92f0`, limited to `apps/ui/app/globals.css` and `tests/unit/tier01-style-contract.test.ts`.

## Findings, cause, and price

### Product N1 — model id wrapped at the artboard width

- Cause: the dated DONE.md M7 correction added `white-space: nowrap`, but the implementation and S01-42a matrix still represented the earlier transcription. The shared `.ndTierModel` rule therefore missed the property for every roster id.
- Evidence: at a 320px viewport and 135px option width, `claude-sonnet-5` measured 28px high; the reviewer's temporary rule reduced it to 14px; removal returned it to 28px. After the committed rule, all five ids measured 14px before, during, and after the temporary rule.
- Price: one browser-probe tooling retry and about 6 minutes of the 22m18s seat elapsed time. The first probe assumed a Playwright package that the lane does not install; raw Chrome DevTools Protocol was then used with the installed headless Chrome.

### Correctness N1 — token-name assertions were vacuous for values

- Cause: `modeTokenPresence` reduced every M2–M7 expectation to `[true, true]`. Any syntactically declared value satisfied the suite, so the tests encoded token vocabulary rather than DONE.md's measured values.
- Evidence: before the correction, the reviewer's `--line-strong: rgba(255,0,0,.99)` and `--m-grok: #00FF00` mutants both passed 8/8. After the correction they fail M2 and M7 respectively. One mutant for each remaining assertion also fails: M3 `--line`, M4 `--ink`, M5 `--muted`, and M6 `--text-2`.
- Price: six mutation runs plus restores, about 5 minutes. Exact token usage is not exposed by this Codex session; the repeated output cost came from six nearly identical Vitest frames and the full upstream BUILD ticket JSON.

### Correctness N4 — region readers converted missing structure into success

- Cause: both readers returned `""` for a missing selector and sliced through an unchecked closing-boundary lookup. Negative containment checks can accept an empty result, so absence can impersonate compliance.
- Evidence: the pre-edit probe returned `""` from both readers and `negativeAssertionsPass=true`. After the correction, a missing global `:root` throws `Missing CSS selector region: :root`, and a missing local `.ndTier` throws `Missing S01 CSS selector region: .ndTier`. Both readers now reject missing, unclosed, and empty regions.
- Price: two target mutants, one neighboring mutant, and one extra focused run, about 3 minutes.

## What nearly went wrong

- I nearly treated the two mutant suites' green status as success. Here, suite-GREEN was finding-RED because the mutants were supposed to be killed.
- The first restoration census searched all `appearance: none` declarations and reported a false positive from pre-existing rules. A path-scoped zero-context diff established that the temporary declaration was gone.
- The first pass at N4 guarded only missing and unclosed selectors. Re-reading the reviewer's class phrase, “an empty region passes,” exposed the remaining present-but-empty case before commit.
- F1 began editing `page.tsx` and the render suite during this seat. A normal shared-index commit could have captured staged foreign work. The commit used explicit `git add` paths, verified the cached set, and used `git commit --only` with the same two paths.

## Dead ends and packet friction

- `/private/tmp/debate-tiers-fix-s01-f2-01a088ec/product-n1-red.log` is a tooling-only BROKEN attempt: no Playwright API was installed. The successful probe is `product-n1-red-attempt2.log`.
- The first skill-reference read used a misspelled home path and failed once before the exact named reference was loaded.
- The first cluster-map extractor looked for an unbolded `| S01-C4 |`; the actual cell is `| **S01-C4** |`. A direct named-row search recovered the command.
- Packet §1 restricts reading to named line ranges, but the assigned class correction required `tier01-style-contract.test.ts:18-28` for the token helper, `:79-150` for reader call sites and the model matrix, and `:191-198` for the second global-reader consumer. Those ranges were not named. The packet should list them explicitly.
- Fetching the two predecessor tickets through `hermes ... show --json` emitted every historical comment even though only each author's READY marker was needed. A marker-filtered Hermes read would materially reduce context.

## Upgrades

1. Ship the product-truth browser probe as a self-contained headless-CDP `.sh` with dependency detection, owned ports, cleanup, and RED/GREEN modes. VERDICT: adopt / CONFIDENCE high / STRONGEST COUNTER: maintaining a second browser harness adds code outside the product.
2. Standardize one throwing CSS-region helper that rejects missing, unclosed, and empty regions; ban ad hoc `slice(indexOf(...))` readers in new contract suites. VERDICT: adopt / CONFIDENCE high / STRONGEST COUNTER: a shared helper can couple otherwise independent suites.
3. Give every measured-token row a literal two-mode value table in the test, plus one mutation per expectation group. VERDICT: adopt / CONFIDENCE high / STRONGEST COUNTER: intentional token redesigns require coordinated fixture updates.
4. Extend packet generation to include every helper definition and call-site range a finding names indirectly, then validate those ranges at dispatch. VERDICT: adopt / CONFIDENCE high / STRONGEST COUNTER: wider ranges increase reading cost.
5. Make concurrent-lane commit commands path-limited by template: explicit `git add`, cached-path census, then `git commit --only -- <owned paths>`. VERDICT: adopt / CONFIDENCE high / STRONGEST COUNTER: teams using isolated worktrees do not need the extra ceremony.
6. Add a one-command FIX runner that reads the packet metadata, prints CLAIM fields, allocates immutable scratch-log names, runs each declared probe, enforces restore censuses, invokes the cluster three times, extracts allowed-path typecheck deltas, and renders the eight-line READY skeleton. VERDICT: adopt / CONFIDENCE high / STRONGEST COUNTER: automation must not infer findings or replace the worker's class analysis.

## Efficiency accounting

- Seat elapsed time: 22m18s from CLAIM to commit/self-report phase.
- Retries: one browser tooling retry; zero code-fix retries; zero index-lock retries.
- Test executions: two pre-fix surviving reviewer mutants, one pre-fix reader probe, one product assertion RED, one product GREEN, six token-value target mutants, two region target mutants, one neighboring mutant, focused GREEN checks, three full S01-C4 runs, and one typecheck delta run.
- Token count: unavailable in this session, so no numeric token claim is made. Largest avoidable context sources were unfiltered predecessor-ticket comments and repeated full diff output.

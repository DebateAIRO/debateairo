# BUILD-S03-C1 self-report — debate-tiers S03

- Seat/node: `BUILD-S03-C1` / `BUILD(S03-C1)` pass 1 of 3
- Ticket: `t_77c0cb5f`
- Session: `01a09b42-74f8-72f2-880b-cedf57d512f2`
- Lane/commit: `slice/tiers-s03` / `62a4c36733fb683f28be651d505e263b06f43056`
- Work interval: 2026-09-13 17:55–18:40 EEST, about 45 minutes
- Session accounting at report time: 20,205,966 total tokens; 20,124,711 input; 19,738,240 cached input; 81,255 output; 33,037 reasoning output

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Verdict

The implementation itself was straightforward; planning-order and cross-seat dependency defects were the dominant cost. The final code is green, but two packet defects forced live orchestrator rulings: S1 ordered installation before the package and root link existed, and S13 required a C4-owned removal while C4 was scheduled behind C1. These were orchestration defects, not code uncertainty.

## Case file: causes and prices

| Cause | Evidence | Price paid | Upgrade |
|---|---|---:|---|
| S1 said to run the only install before creating `packages/model-config/package.json`; it also omitted the required root workspace dependency. | First install saw 34 workspaces; root test collection failed to resolve `@debateai/model-config`; ticket comments 6–7 contain BLOCKED and RULING. | One wasted install, one BROKEN test, one blocker cycle, roughly 12 elapsed minutes. | Packet compiler must topologically order “create workspace package + add root dependency” before install and run `import.meta.resolve` as a preflight. |
| S10 needs the generator to read `config/models.yaml`, but S12 creates that file later. | The deleted-generated-directory gate required a temporary valid config, then removal until S12. | Two temporary file cycles and extra generation runs. | Move S12 before S8/S10, or make S8 own the committed config fixture before the generator gate. |
| S13 asserted the post-S24 final state although S24 belongs to C4, while C4 waits on C1 and C3. | Exact RED was only `apps/ui/app/new/page.tsx`; ticket comments 10–11 contain the blocker and ruling. | One full cluster RED, two focused REDs, about 5 elapsed minutes, live orchestration. | DAG validation must reject a step whose green criterion depends on a later node. The ruled two-stage inventory should have been in the packet initially. |
| The packet requires per-step mutation, restore, status, and GREEN evidence but provides no executable mutation manifest. | S2–S13 produced separate saved copies and logs under `/private/tmp/build-s03-c1.ERGheV/`. | Many serial tool round trips; cached prompt context dominated token use. | Generate a seat-local harness from declarative rows: property, patch, target suite, expected failing case, restore path, neighbour miss. |
| Hermes comment bodies were sent through a shell-only string interface. | The first Markdown comment attempt parsed backticks; a later apostrophe escape produced truncated comment 9 with author `default`; comment 10 supersedes it. | Two failed/defective writes and one corrective comment. | Standardize `hermes ... comment --body-file <path>` or document a stdin form; packet helpers should never embed Markdown in shell source. |
| The S10 destructive check used an operation blocked by the command policy. | `rm -rf` was rejected before execution; moving the exact directory to scratch and immediately regenerating worked. | One rejected command. | Packet should prescribe the recoverable `mv generated scratch-backup` pattern. |
| Package-local TypeScript and root TypeScript use different strictness surfaces. | Package `tsc` passed while root `tsc` found five C1 diagnostics (`exactOptionalPropertyTypes` plus test casts); all were then fixed. | One extra typecheck/fix cycle. | Package tsconfig should extend the root strict options, with only `include`/emit differences. |

## What nearly went wrong

- A collection error initially looked like S2 RED, but it was BROKEN; the recovery changed the test seam so the missing loader failed on an assertion before implementation.
- S13's first scanner counted the declaration file as a consumer. Excluding only `packages/contract/src/plan-tiers.ts` isolated the real UI dependency.
- An S5 test signature patch missed a comma and produced one transform failure. It was classified as BROKEN and not counted as evidence.
- Node imports in `shape.ts` landed at the file tail after an imprecise patch anchor. TypeScript accepted them, but the final review moved them to the header.
- Weakening S13 or editing `apps/**` would have made the local suite green illegally. Work stopped for the ruling instead.

## Dead ends and retries

1. Initial install before workspace package creation: unusable for root resolution.
2. First S4 ticket-comment command: shell interpreted Markdown fences.
3. First complete S13 blocker-comment command: quoting truncated the body and lost the author.
4. S10 recursive deletion command: policy rejected it before execution.
5. First S13 consumer measurement: declaration file false positive; second isolated the UI page.
6. First S5 combined GREEN attempt: test transform failure from a malformed function type.

None of these retries changed a forbidden file, contacted a provider, touched the live stack/database, or required a reset/checkout/stash.

## Refutation matrix

| Step | Protected property | Mutant/omission and target | Result | Neighbour not caught |
|---|---|---|---|---|
| S1 | Root can resolve the new workspace package. | Install before package/root link; S2 file suite. | BROKEN, then recovery link verified. | Workspace self-resolution alone does not prove root resolution. |
| S2 | API fields survive parsing. | Return empty `baseUrl`; `model-config-file`. | RED 1/1, restore GREEN. | Silent normalization of an unusual model's case. |
| S3 | Reads do not rewrite the config. | Append a newline from the loader; `model-config-file`. | RED 2 cases, restore GREEN. | Writing a different path. |
| S4 | Six class/code identities remain distinct. | Collapse class 6 into class 4; `model-config-shape`. | Only class 6 RED, restore 7/7. | A fixture with two faults reports only the earlier guard. |
| S5 | Tests control the CLI-world verdict through one port. | Ignore injection and always return absent; `model-config-shape`. | Injected-true case RED, refusal case stayed green, restore 8/8. | Correctness of the real PATH probe on every platform. |
| S6 | Committed config contains names, not secrets. | Temporary `key: sk-test`; `model-config-no-secret`. | RED 1/1, safe scratch GREEN, scratch removed. | Secrets under test fixtures outside committed config. |
| S7 | Loader tier words match the wire. | Add `enterprise`; `model-config-tiers`. | Wire comparison RED, source boundary stayed green, restore 2/2. | Order differences, because both lists are sorted. |
| S8 | Generated rosters contain all IDs in file order. | Drop final premium ID; `model-config-file`. | Generator case RED, restore 4/4. | Non-semantic formatting instability. |
| S9 | Contract source contains no roster ID literal. | Add quoted `gpt-5.6-luna`; `tier01-roster`. | RED 1/1, restore GREEN. | Literals in excluded generated/test paths. |
| S10 | Roster generator precedes contract generator. | Reverse script order; `tier01-roster`. | Ordering case RED, restore 2/2. | Well-ordered generator emitting semantically wrong data; the import/positive limb catches that later. |
| S11 | Canonical scan uses quoted-exact matches and file/runtime lists agree. | Restore bare substring matching; `tiers-s02-rosters`. | Canonical case RED on three support files; restore left only S12's intended ENOENT, then S12 made 5/5. | IDs in excluded directories/extensions. |
| S12 | Committed file is the exact five-entry fleet with required comments. | Change `glm-5.3-flash` to `glm-5.3-mutant`; file + roster suites. | Two cases RED, restore 11/11 across three suites. | Comment prose outside the mechanically named required substrings. |
| S13 | The current selector inventory is pinned until C4 flips it. | Add a scratch fourth selector; then simulate removal of the UI selection; `tiers-s02-rosters`. | Each direction RED only case 6; restore 6/6. | A selector expressed in syntax the source-text recognizer cannot identify. |

## Verification ledger

- Required cluster, three runs: each `Test Files 6 passed (6)` and `Tests 24 passed (24)`; marker script returned `CLUSTER_GREEN` three times.
- Per-suite final counts: tier01 roster 2/0; tiers-s02 rosters 6/0; model-config-file 5/0; model-config-shape 8/0; model-config-tiers 2/0; model-config-no-secret 1/0.
- `pnpm --filter @debateai/model-config exec tsc --noEmit`: rc 0.
- Fresh generated-directory gate: `pnpm run generate:contract` rc 0 and roster output recreated.
- Root `pnpm typecheck`: inherited rc 1 with 70 diagnostics, zero in C1-owned paths.
- Final staged set: exactly 17 commit-eligible C1 paths; ignored generated roster present as the eighteenth allowed path; no outside dirty path.

## Turning this into a one-prompt machine

1. Compile packets from the step DAG and reject impossible order/ownership constraints before dispatch.
2. Emit a machine-readable seat manifest containing allowed paths, forbidden paths, dependency writes, suite counts, RED signatures, mutants, and final marker arguments.
3. Generate a `seat-run.sh` that performs claim metadata, dependency preflight, the one legal install, test wrappers, mutation/restoration checks, three cluster repetitions, typecheck filtering, exact-path staging, and handoff templating.
4. Add packet lint rules: every generated input exists before its first consumer; every workspace package tested from root has a root link; every green criterion is owned by the same node or an already-completed dependency.
5. Make Hermes accept comment bodies by file/stdin and return the stored author/body checksum, eliminating shell quoting as a state-transition risk.
6. Keep prompts compact after the reading floor: refer to immutable evidence manifests and log hashes instead of replaying long packet/context bodies on every tool turn. The 19.7M cached input tokens show that round-trip context, not implementation output, was the main token sink.

## Unverified by design

- No live database, `:3000` stack, provider, real API key, browser acceptance flow, or deployment publication was exercised.
- S24/C4's final removal of the UI consumer is not part of this commit; comment 11 explicitly assigns the two-file/UI-negative flip to C4.
- The root typecheck absolute rc remains inherited-red; only the required zero-diagnostic delta in C1 paths is verified.
- Nothing was pushed or merged.

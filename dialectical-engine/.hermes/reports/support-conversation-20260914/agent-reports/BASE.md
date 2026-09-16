# BASE case file — baseline preparation

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the packet specified the outcome but omitted the executable baseline frame

**Cause.** `packets/BASE.md:20` says to run the “focused current support baseline” but does not name the six files or the exact command. The earlier audit reports 432 tests in six files, while its captured `test-output.txt` uses a dot reporter and omits file names. Reconstructing the intended command required three searches and one file-existence probe before execution.

**Price.** Four read-only command invocations and one avoidable shell-quoting error. Token usage is **UNAVAILABLE** in this session, so no token estimate is presented. The recovered command ran three times and produced 432/432 on every pass.

**Upgrade.** Put the exact argv, expected `Test Files`/`Tests` frame, locale, working directory and one-log-per-run paths in the BASE packet. A baseline node should not infer its oracle from prose.

## Finding 2 — setup instructions were underspecified for a 923 MB pnpm dependency tree

**Cause.** `packets/BASE.md:20` asks for a “supported local pattern” without naming the platform command or the workspace `node_modules` set. The source contains a 923 MB root tree plus 31 workspace trees. A broad `find` descended into the root pnpm store because the depth guard was poorly ordered, producing a large, useless tool response before the bounded workspace list was obtained.

**Price.** Two inventory invocations; the first emitted hundreds of nested paths and dominated transcript volume. Actual model-token usage is **UNAVAILABLE**. The final APFS clone copy took 9.2 seconds wall time and copied the root plus 31 workspace trees without symlinking back to the writable source.

**Upgrade.** Put the reviewed dependency-copy command in the packet, including its exact 31 relative paths or a bounded `find apps packages tools -name node_modules -prune`. Explicitly name `cp -cR` for APFS and require a post-copy resolution probe.

## Finding 3 — tsx IPC is incompatible with the default sandbox path

**Cause.** The first `pnpm run generate:contract` reached `tsx`, which attempted to create `/var/folders/.../tsx-501/26786.pipe` and failed with `listen EPERM`. The captured failure is in `logs/BASE-generate-contract.log`. The identical command succeeded under normal elevated execution in `logs/BASE-generate-contract-r2.log`.

**Price.** One failed pass plus one retry; tool wall time was 1.1 seconds then 5.2 seconds. Token usage is **UNAVAILABLE**. No source edit was attempted because the evidence identified an execution-policy boundary, not a product defect.

**Upgrade.** Teach the packet or runner to set a sandbox-writable `TMPDIR` when invoking `tsx`, or mark contract generation as a command that needs ordinary elevated execution on this host. Preserve both attempt logs.

## Finding 4 — baseline preparation has no explicit v4 role

**Cause.** `packets/BASE.md:4` says “the baseline preparation role where applicable,” but `heartbeat-protocol/SKILL.md:13-20` defines orchestrator, requirements, architecture, mock, worker and reviewer only. BASE creates a lane and runs checks but does not write product code or review it. I applied the worker-adjacent floor conservatively, which loaded TDD even though no feature or bugfix was authorized.

**Price.** One role search plus three extra skill reads. Token usage is **UNAVAILABLE**. There was no behavioral harm, but the ambiguity makes `SKILLS LOADED` inconsistent between otherwise identical BASE nodes.

**Upgrade.** Add a baseline role contract or state directly that BASE uses `using-git-worktrees`, `verification-before-completion`, and `systematic-debugging` only on failure. State whether three baseline runs are required.

## Near misses and dead ends

- I nearly treated `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine` as the Git root. The packet’s explicit one-level-up warning prevented a malformed nested lane; the actual Git root is `/Users/vladmihaimiron/Documents/DebateAIRO`.
- I nearly used the visible six-file description as sufficient evidence. The prior output did not name files, so I reconstructed and existence-checked all six before running them.
- `rg --files -g run-capture.sh` returned nothing because the runner is hidden under `.claude`; `rg --hidden` located the canonical script. Packets should use its absolute path.
- The first board read failed before returning ticket data because Hermes creates an init lock in `~/.hermes`. Retrying with normal elevated read access succeeded. No unsafe bypass mode was used.

## One-prompt machine upgrade

The highest-value improvement is a checked BASE packet generator that freezes five inputs at dispatch: source HEAD, porcelain count plus staged/unstaged digests, exact inclusion list, exact dependency-copy recipe, and exact test argv with expected frame. It should also emit the manifest schema and absolute evidence paths. Then one authorized node can claim, create the lane, copy and hash the named files, commit, prepare dependencies, generate contracts, run the baseline three times, compare source fingerprints, and file receipts without rediscovery. The orchestration prompt remains short because all variable facts are materialized before dispatch.

## Actual measurements

- Source at claim and post-run: HEAD `446c685e977104ecf2b0b5ee0519f7123968429f`, branch `integration/debate-tiers`, 157 porcelain entries, 56 tracked unstaged paths, 0 staged paths.
- Original staged-diff SHA256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` before and after.
- Original unstaged binary-diff SHA256: `606ad70f5e8b852724469816ca922d5685a4117668daeeed1a4d740b8988035e` before and after.
- Lane commit: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`, 12 files, 478 insertions, 48 deletions.
- Focused baseline: three runs; each 6/6 files and 432/432 tests; durations 2.51 s, 2.27 s, 2.15 s.
- Actual token usage: **UNAVAILABLE**.

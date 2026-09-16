READY FOR PEER REVIEW — comments read through: none (no Hermes board in this continuation; the SDD ledger is the board)

# Self-report — seat `cont-t2-obs-agent-reporoot`, node BUILD(CONT-T2), pass 1 of 3

- session id: `45ab9500-0991-4dbd-89ec-f04cc3082e67`
- branch `mission/2026-09-16-algorithm-live-loop-continuation` · base `78962f86c36e2628553816e9c53d1de962b1caf3` (verified at CLAIM) · tip `3f0d80155ed08a8325ef3caa090406da34d6e4c8`
- answering, verbatim, V's question: *"treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better."*

---

## 0. The case, in one line

Nobody wrote a bug. A tree was **moved** — 97 paths of `apps/observation-agent` crossed a merge from `5e617776^2` — and the thing that broke was not code but the **gate's ability to tell signal from noise**. The 35 diagnostics had been red on the source branch too. The real victim is the typecheck gate, which for eleven days reported a constant 35 and therefore reported nothing.

---

## 1. CAUSES, not symptoms

### C1 — The product grew a required field; the fixtures were never part of the contract that grew with it
`repoRoot: string` entered `ProbeContext` at `apps/observation-agent/src/core/types.ts:250` in `16a895fe` (2026-09-05). Production was updated in the same breath: `main.ts:61` calls `observationRepoRoot()` once at boot and threads it into `ModuleRuntime.run` and `createOwnedSignalRouter`. The 16 fixtures were not. **The cause is not forgetfulness — it is that adding a required field to a shared context type is a breaking change whose blast radius is invisible until a full typecheck runs, and the branch that made it never ran one that was clean enough to read.** A gate that is already 35-red cannot report the 36th error.

### C2 — The same value has four different derivations in the test tree, and three are accidents of cwd
Measured across `tests/` (`grep -rn 'repoRoot: <idiom>' tests/ | wc -l`):

| idiom | sites | agrees with the product? |
|---|---|---|
| `process.cwd()` | 17 | only because vitest runs from `dialectical-engine/` |
| `resolve(".")` | 3 | same accident, spelled differently |
| `resolve(import.meta.dirname, "../..")` | 1 | by coincidence of directory depth |
| hard-coded `"/tmp/..."` | 5 | never |

Production has **one** derivation for this value (`observationRepoRoot()`, a module-location constant in `core/paths.ts:11`). Four fixture idioms for one product constant is the disease; the 35 missing ones were only the part that happened to be loud. **Upgrade: a fixture that must reproduce a product value imports the product's accessor. Re-derivation is a bet on the runner's environment, and the losing case is silent, not red.**

### C3 — "the production caller" was ambiguous and the packet knew it
The packet anticipated this ("if two production callers derive it differently, say so and use the one the tested module reads"). It was right to: `oactl/core/commands.ts:127` and `modules/job-witness/oactl/support/command.ts:63` each roll their own root from `import.meta`. Neither feeds `ProbeContext`. Resolving this took one `grep` and one read of `paths.ts` — cheap **because the packet named the question in advance**. That sentence is the single highest-leverage line in the packet and should be templated.

---

## 2. What I NEARLY got wrong

1. **I nearly "fixed the class" out of contract.** `obs-agent-01-discovery.test.ts:713,740` already supply `repoRoot: "/tmp/repository"` — in a file on my `allowed` list, wrong by exactly the rule I was enforcing, and invisible to the error list because they typecheck. I drafted the edit before stopping: the packet charges me with *supplying* the missing property, and `never fixed here` governs the rest. I left all five `/tmp` sites and named them. **A seat one notch less careful ships a diff with six unexplained hunks and buys a rework round.** The packet could remove the ambiguity with one clause: *"the class is the 35 diagnostics; a same-property site that already typechecks is a finding, not your edit."*
2. **I nearly reported an empty `git diff -- apps/observation-agent/src` as proof.** TOOLING-TRAPS §873 records that a pathspec of the wrong relativity returns an empty diff that reads as "unchanged". I ran the identical pathspec form against a file I *knew* had changed; it printed the diff, so the empty one means empty. **Cost: one command. Value: the difference between evidence and a coin flip.**
3. **I shipped a wrong constant and caught it after committing.** My commit message said the 35 diagnostics resolved to "23 insertion points". The measured number is 24 (`git show <tip> -- tests/ | grep -c '^+.*repoRoot: observationRepoRoot()'`). I had *counted the diff by eye* instead of measuring it — the exact sin the mission's own law forbids. I amended and re-took every gate at the corrected tip. **Price: one amend plus a full gate re-run (typecheck + 3 cluster runs + the 5.4s integration suite). Cheap here; in a 20-minute suite it is the whole afternoon.** Rule for myself: *any number that enters a commit message or a report is produced by a command, never by reading a diff.*

---

## 3. What repeatedly cost tokens — priced

| cost | what happened | price | remedy |
|---|---|---|---|
| **Reading 4,045 lines to place 24 one-line insertions** | the packet says "read in FULL: every file in `allowed`". `cat -n` of `obs-agent-01-discovery.test.ts` alone (782 lines, 35.7 KB) overflowed the tool output and was persisted to disk — TOOLING-TRAPS §882 exactly. I then re-read it in five `awk` windows. **The full read was paid twice and used once.** | the single largest token line item of this task | The error list already carries `(line, col)` for all 35. A fixture task should read **the named lines ± 20**, plus any helper the diagnostic resolves to. Change the packet's `read in FULL` to `read the diagnostic sites and the definitions they resolve to`. |
| **A diagnostic count read as an edit count** | 35 errors → 24 edit sites, because TS reports a missing property at the **call site**, not at the shared helper that omits it. Five errors in `obs-agent-05-lifecycle.test.ts` were one `input()` builder; three in `obs-agent-01-discovery.test.ts` were one spread `const input`. | I planned for ~35 edits and made 24 — harmless here, but a plan sized from diagnostics over-books every time | Recorded in TOOLING-TRAPS. De-duplicate diagnostics by the **definition** before sizing. |
| **Re-running gates after the amend** | see §2.3 | typecheck + 3× cluster + 1× integration, twice over | measure constants before committing |

**What cost nothing, and should be copied:** every run went through a 6-line shell script that wrote the full output to a named log first and printed only `rc`, the summary lines and the failing case names. Twenty-one logs, none overwritten, every frame in this report pasted from one. That pattern alone kept a task with 5 gate rounds inside a small transcript.

---

## 4. DEAD ENDS — do not re-derive

- **Do not reach for `process.cwd()` or `resolve(".")` for `repoRoot`.** They are equal to the right answer today only because vitest's cwd is `dialectical-engine/`. They are already the majority idiom in this tree (20 of 26 pre-existing sites) and they are all one cwd change away from being silently wrong.
- **Do not put the pin in a fresh `it` with its own context builder.** I considered it (cleaner test names). It would pin the builder I wrote and *not* the shared `input()` at line 73 that the 35 errors were about — a test that catches its own demo mutant and nothing behind it, which `heartbeat-worker` §2 names as the failure mode of three previous rounds.
- **Do not restore a mutant with `git checkout -- <path>`.** TOOLING-TRAPS §3471: it restores to HEAD and deletes the uncommitted work in that file. I copied the file to the scratchpad first and restored by `cp`, verifying by `shasum -a 256` both times.
- **Do not assume a static product import breaks an `existsSync` guard.** I checked: the guards in `obs-agent-03-fixture.test.ts:41` and `obs-agent-04-not-wired.test.ts:19` protect against an absent *acceptance fixture* and an absent *capture-health module*, not an absent `apps/observation-agent` tree — which both files already hard-depend on. Importing `core/paths.js` adds no new fragility. Checked, dismissed, recorded so nobody re-checks.

---

## 5. Where the packet was unclear — exactly

1. **The signing trailer contradicts the seat.** Packet §1 sets `model: claude-opus-5`. Packet §3 orders the commit message to end `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. I am Opus 5, and the session's own attribution instruction names `Claude Opus 5 (1M context)`. Signing as a model I am not is a fabrication under §3.6, so I used the truthful trailer and am reporting the contradiction rather than absorbing it. **If the orchestrator wants the Fable line, it is a one-command amend — but the packet template should read "the trailer for the model that actually ran", not a hard-coded name.**
2. **`allowed` grants the write surface; it does not define the class.** See §2.1. Two readings of §3 ("supply `repoRoot` in every test/fixture context exactly as the production caller derives it") are both defensible for a site that already has the property with a bad value. One clause fixes it forever.
3. **`read in FULL` versus the reading floor.** `heartbeat-protocol` §3.8 says a packet that makes you read more is a packet defect. Packet §2 says read 4,045 lines of test to insert 24 lines. These are in tension, and §3.8 should win for a diagnostic-driven task.

---

## 6. Toward the one-prompt machine — four upgrades, in order of leverage

1. **Make the typecheck gate report a DELTA, not a count.** The whole premise of this ticket is that `35` was indistinguishable from `35 different errors`. Store the sorted `file(line,col): code` set as the baseline; have the gate print `+n new / -n cleared / n carried`. Then an inherited red class costs nothing and a new error is loud on the first run. **This one change makes tasks like mine unnecessary rather than fast** — the class could have been carried openly instead of blinding the gate for eleven days.
2. **Give the packet the diagnostic sites, not the file list.** The packet already points at `typecheck-errors.txt`. Have it inline the `(file, line, col)` table and say *read these lines and the definitions they resolve to*. That deletes the largest token line item in §3 and removes the §882 overflow entirely.
3. **Add a `pre-commit` constant check to the seat's own loop.** Every number a seat writes into a commit message or a report should be emitted by a command whose output is in the log. My §2.3 failure is mechanically detectable: a number in prose with no matching line in `logs/`. A 10-line linter over the report would have caught it before the commit, not after.
4. **Template the two clauses that did the most work in this packet** — *"if two production callers derive it differently, say so and use the one the tested module reads"* and *"never a hard-coded absolute path, never `/tmp`"*. They pre-answered the only genuine design question and pre-banned the only tempting shortcut. A packet generator that emits a `SOURCE OF TRUTH` clause for every value-mirroring task would make most fixture work a single pass.

---

## 7. Findings handed up (not fixed here)

| # | finding | file:line | blocking? |
|---|---|---|---|
| F1 | fixture `repoRoot` hard-coded to a `/tmp` path that is not a repository root; `resolveRepoPath` would reject it if any of these modules ever read it | `tests/unit/obs-agent-01-discovery.test.ts:713`, `:740`; `tests/integration/obs-agent-03-defect-detectors.test.ts:178`, `:263`; `tests/integration/obs-agent-01-restart-lifecycle.test.ts:90` | no |
| F2 | fixture `repoRoot` re-derived from the runner's cwd rather than imported from `core/paths.ts`; correct today only because vitest runs from `dialectical-engine/` | 17 × `repoRoot: process.cwd()` and 3 × `repoRoot: resolve(".")` across `tests/unit/obs-agent-04-blind-spool.test.ts`, `tests/unit/obs-agent-07-delivery-health.test.ts`, `tests/unit/obs-agent-01-oactl.test.ts:142`, `tests/integration/obs-agent-04-daily-restart.test.ts`, `tests/integration/obs-agent-07-status-recovery.test.ts`, `tests/integration/obs-agent-05-additive-compatibility.test.ts:61`, `tests/integration/obs-agent-05-docker.test.ts:82`, `tests/integration/obs-agent-04-not-wired.test.ts:153,174,175`, `tests/unit/obs-agent-05-certificate.test.ts:80` (all line numbers measured at tip `3f0d8015`) | no |
| F3 | the `repoRoot` class arrived red on `f19c706f` and was carried through the merge at `5e617776`; it blinded `pnpm run typecheck` on this line until this commit. Ticket for V's program. | `apps/observation-agent/src/core/types.ts:250` (the field), introduced by `16a895fe` | no — now cleared |
| F4 | packet defect: §1 `model: claude-opus-5` vs §3 `Co-Authored-By: Claude Fable 5.1` | packet §1 / §3 | no |

Nothing in `apps/observation-agent/src` was touched: `git diff -- apps/observation-agent/src` is empty over 105 tracked files, with the pathspec form validated against a known-changed path.

# Self-report — seat ARCH-S02 · node ARCH(S02) pass 1 of 3 · ticket `t_57d602a5` · 2026-09-09

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`. Main tree HEAD `0c2ee8d8`, 98 dirty at CLAIM and 100
at handoff (the two are this seat's own files). Lane `slice/tiers-s02` @ `7f89f7b7`, **0 dirty before
and after every probe**. 26 tool calls end to end, ~5 of them wasted (§3).

---

## 1. The body: four defects that were already in the mission's documents before I opened them

Each is priced in what it would have cost had a BUILD seat found it instead of this seat.

### F-3 — the orchestrator's N2 fold under-counts the suites its own change turns RED, by one case

`DECISIONS.md`'s fold names three `api.test.ts` cases that R3's roster filter turns red. There is a
fourth: `tests/unit/api.test.ts:283-405` calls the real `PostgresAskApplication.submit` with the
default settings, and the roster refusal fires at `apps/api/src/index.ts:1284`, before the admission
lease at `:1289` — so `OWNER_PRIVATE_HISTORY_SCAN_SATURATED` never happens and the `connectCalls` and
`leaseQueries` assertions at `:355-366` break too.

**Cause, and it is not carelessness.** The fold was derived by reading the three cases that call
`evaluateAskAdmission` *by name*. The fourth reaches the same function through `submit`. **A grep for
the symbol finds the direct callers and misses the transitive ones**, and this repo's admission
function has exactly one production caller one level up. Anyone deriving a blast radius from a
symbol grep will miss the same class again.

**Price if a Codex seat had found it:** the cluster ends `23 passed | 1 failed (24)`, the seat sees a
failure the fold does not name, and the cheapest available story is "pre-existing" — which
`BASELINE.md` disproves at 24/24, so the seat then spends a debugging pass on a lease assertion whose
real cause is four call frames away. Estimate one rework round, ~40 min, ~25k tokens.

**Upgrade, and it is mechanical:** when a fold or a SPEC predicts which suites a change turns RED,
the prediction is produced by `grep -rn '<symbol>' tests` **plus one hop through the symbol's
production callers**, and the hop is written into the fold. For this repo the hop is
`grep -rn 'evaluateAskAdmission' apps packages` → `PostgresAskApplication.submit` →
`grep -rn '\.submit(' tests`.

### F-1 — SPEC R5 asks for a check that no data in this repository can express

R5 requires "at least two distinct makers", checked "next to the declaration, not in the admission
path". The declaration is model ids (S01 R11). **The maker is environment data** — declared per
discovery target inside `.local/dev-auth/api.env`, resolved at `packages/providers/src/index.ts:156-188`
and copied onto the panel member at `apps/api/src/provider-discovery.ts:143-150`. There is no
model-id → maker map in `apps/` or `packages/`. So the requirement's placement clause has nothing to
read, and the only file that could carry the mapping is the one S01 froze.

**Cause:** the requirement was written from the *runtime* fact (`makers.length >= 2` at
`apps/api/src/index.ts:1209`) and then relocated to the declaration without checking that the
declaration knows what a maker is. It survived a REQ-REV pass and a REQ-FIX pass, and pass 2 even
*corrected R5's mechanism* (finding N4) without noticing that its placement clause was unbuildable.
**A correction pass that fixes the sentence a reviewer pointed at will not question the sentence
beside it.**

**Price if unfound:** a Codex seat cannot build R5, so it either invents a model-id prefix heuristic
(`gpt-*` → one maker) — which is a fabricated mapping that answers wrongly the first time one maker
serves two families — or it silently skips R5 and the REV(S02) lens records an unbuilt requirement.
Either is a full rework round plus a V row raised three nodes later than it should have been.
Estimate ~1 h, ~40k tokens, one wasted review pass.

**Upgrade:** for every requirement of the form *"X is checked next to Y"*, REQ names the **data** the
check reads, by `file:line`, in the requirement itself. R5 would have failed that test in ten
seconds.

### F-5 — the packet's own instruction, read literally, has a 22-suite blast radius

Charge 7 says to put "roster-member `model_id`s in `fixtureDiscoveredPanel`". That name resolves to
`tests/support/discoveredPanel.ts`, which **23** test files import (measured). Editing it reaches 22
suites that have nothing to do with tiers, most without a `BASELINE.md` row.

**Cause:** the packet quoted the fold, and the fold named a *function* where it meant *the values a
particular call site passes*. **A function name in an instruction is an instruction to edit that
function** unless the instruction says otherwise.

**Price if a Codex seat had taken it literally, inside a HIGH-risk slice:** an unmeasured 22-suite
diff, discovered at GATE(S02) by `git status`, and a full revert. Estimate ~1.5 h, ~60k tokens.

**Upgrade:** any packet or fold that names a shared test fixture states its importer count on the
same line — `grep -rln '<fixture>' tests | wc -l` is one command, and it is the difference between
"edit this helper" and "override it at three call sites".

### F-4 — a suite inside SPEC R13's own grep class has no `BASELINE.md` row

`tests/integration/register-version-boundaries.test.ts:172` names `resolveDiscoveredPanel`, so R13's
class contains it; `BASELINE.md` §Rules says a suite without a row is a finding against the
orchestrator. Measured here: `Tests 6 passed (6)`, rc=0.

**Cause:** R13 defines its class by a grep that nobody ran while writing `BASELINE.md`. **A
requirement that defines a set by a command must be baselined by running that command**, not by
listing the suites the author remembered. Cheap to close: 20 s of grep.

---

## 2. What I nearly got wrong

- **I nearly wrote `NOT NULL DEFAULT 'free'` into the migration** because that is the shape the
  repo's own precedent uses (`migrations/0022_dr181_discovery.sql:22`,
  `discovered_panel jsonb NOT NULL DEFAULT '[]'::jsonb`). An empty array is an honest default for a
  panel; `'free'` is a *claim about a run that never made it*. **A precedent transfers the SQL, not
  the semantics** — the second half is the part that needs thinking about, and the first half is what
  pattern-matching hands you.
- **I nearly planned a `DROP FUNCTION` before `CREATE OR REPLACE`**, because `0040:4255` does exactly
  that. It works there only because it drops the *three*-argument signature while creating the
  four-argument one. Dropping the current signature would discard the `GRANT EXECUTE` at
  `0040:6366-6369`, and **no embedded-postgres test would catch it** — those run as the schema owner,
  so the missing grant is invisible until the dev stack. That is the single highest-value line in the
  whole plan and it came from reading 100 lines of a 6000-line migration I had no other reason to
  open.
- **I nearly accepted the fold's instruction for `api.test.ts:169-177`** — "the third case asserts
  `ASK_PLAN_TIER_MODEL_UNAVAILABLE`" — which would have deleted the only test proving an *envelope*
  refusal reaches the 422 face. Raised as F-2 rather than obeyed or ignored. **"Settled is settled"
  binds the conclusion, not every parenthetical inside it**, and the honest move is to name which
  half you are following.

---

## 3. What cost tokens, measured

| What | Cost | Cause | Fix |
|---|---|---|---|
| `grep -rn 'x' tests --include=*.ts` died twice with `(eval): no matches found: --include=*.ts` | 2 calls, ~3k tokens | zsh expands the unquoted glob before grep sees it. **It is already in `TOOLING-TRAPS.md` at `:1062`** and I hit it anyway, because I read the traps file as an *index* (the reading floor says so) and an index line does not carry the fix. | Traps that are one-line shell gotchas belong in `COMMON.md` §4 as a five-line "shell forms that work here" block, not behind an index a seat is told to skim. Two calls per seat × every seat is the real bill. |
| A `grep -E '^ (Test Files\|Tests)'` that silently dropped every `Tests` line (6 leading spaces, not 1) | 1 re-run of four vitest commands, ~4k tokens + ~30 s wall | I wrote the filter from the shape I remembered instead of from the output in front of me. | Filter on `'Test Files\|Tests  '` — anchorless. A filter that returns *some* of what you expected is worse than one that returns none, because it looks like it worked. |
| `grep -rln 'question_line' tests` as a proxy for "constructs an ask literal" → 42 files | 1 call, ~4k tokens, and a wrong number I nearly wrote into the plan | `question_line` is also a field of `StartRunInput`. The right probe is `grep -rn ': AskRequest = {\|as AskRequest' tests` → 5 literals in 3 files. | **Probe the type, not the field name.** A field name is shared across every type that has it. |

**Nothing else was wasted.** 26 calls total for a plan with 4 clusters, 33 steps, 5 findings and 2 V
rows. What kept it low: every cluster command was run once from a `.sh` file that also printed the
lane's HEAD and dirty count, so the receipts and the verification arrived in the same call.

---

## 4. The upgrade list, ordered by how much it saves

1. **Baseline the classes a SPEC defines by command, using that command.** F-4 is a 20-second fix
   that the orchestrator can automate: for each requirement carrying a grep, run it at freeze and
   append the rows. This mission has one such gap; a mission with ten requirements-by-grep will have
   several, and each one becomes a mid-cluster surprise.
2. **Make the transitive hop mandatory in blast-radius predictions.** F-3's class. One extra grep per
   symbol.
3. **Put the shell forms in `COMMON.md`, not behind the traps index.** The `--include=*.ts` trap has
   now cost at least three seats across two missions (`:1062` records it, `:951` records it again).
   It is being *rediscovered*, not read — which means the index is the wrong container for it.
4. **Add a "what data does this check read?" line to every placement requirement.** F-1's class.
5. **State an importer count beside every shared fixture a packet names.** F-5's class.

---

## 5. Toward the one-prompt machine

Four things this run says about the shape of the machine, not about this mission.

**(a) The most expensive knowledge in this repo is not in any document — it is in migration
`0040_account_erasure.sql`, a 6000-line file no packet names.** The grant/DROP trap, the exact-key
allow-list, and the `RETURN false` → `RUN_OWNER_INVALID` translation are all in there, and all three
would have cost a BUILD seat a debugging session. **A one-prompt machine needs a standing
`docs/architecture/` note per *stored procedure that validates its own payload*, because those are
the places where a wrong edit fails silently and blames something else.** ADR-0023 now carries these
three; there are certainly others in that file.

**(b) `evidence a seat can run` beats `evidence a seat can read`.** Every number in this plan came
from a `.sh` file in the seat's scratch dir that prints `lane / HEAD / dirty` on its first line and
`dirty after` on its last. That habit made the whole run auditable at zero extra cost, and it is
worth making the packet template's *default* rather than a charge — "your probes live in a `.sh`
file whose first and last lines are the tree pins" is one sentence and it removes an entire class of
"where did that number come from".

**(c) The parallelism question has a better default than "split the work".** Charge 3 asked which
clusters can start before S01 merges. The answer that mattered was not *how many* but *which one*:
the migration cluster is both the longest and the only one with no contract dependency, so putting
it first buys nearly all the available parallelism with one node. **The scheduler should ask "what is
the longest chain that needs nothing?" before it asks "how do I cut this into N pieces?"** — the
second question produces more nodes and less speed.

**(d) The three defects above all have the same shape: a document that describes a mechanism the
author did not run.** The fold that predicted three RED cases, the requirement that placed a check
next to data that does not exist, the packet that named a shared fixture — none of them is a
reasoning error. Each is what happens when a mechanism is *described* rather than *executed*. The
cheapest structural fix is not more review passes; it is that **every planning node runs at least one
command against the code it is describing, and pastes the output**. This node ran nine. Three of them
changed the plan.

---

## 6. Where THIS packet was unclear, exactly

- **Charge 7** — "roster-member `model_id`s in `fixtureDiscoveredPanel`" reads as an instruction to
  edit `tests/support/discoveredPanel.ts`. See F-5. One clause would fix it: *"…at the `api.test.ts`
  call sites; the shared fixture at `tests/support/discoveredPanel.ts` has 23 importers and is not
  edited."*
- **Charge 5** — "record RED (TDD) vs BROKEN" is unambiguous for a command over existing files, and
  undefined for a cluster command that names a test file the seat has not written yet. Measured
  answer: vitest **silently drops** a filter that matches nothing and exits 0. So the honest base
  verdict for such a command is "the existing suites at their baseline", and the cluster's *green*
  verdict has to pin the **Test Files** count or the gate reports coverage it never had. The packet
  template should say which of the two it wants.
- **Charge 1's input list names `apps/api/src/index.ts:905` and `:1170-1290`.** `:905` is the route
  and is genuinely needed; `:1170-1194` is the `RunCreationSettings` interface and was not. The
  function is `:1195-1231` and the `startRun` call is `:1284-1310` — a range ending at `:1290` stops
  seven lines before the call site this slice edits. **A packet's line ranges are the reading floor,
  so a range that stops short forces the seat to choose between the floor and the work.** I read to
  `:1330` and am recording it rather than leaving it silent.
- **Not unclear, and worth saying because it is rare:** the packet's charge 3 and charge 4 named the
  two decisions that actually shaped this plan (the S01 merge edge, and the migration's own cluster).
  Both were right. The plan's structure follows them.

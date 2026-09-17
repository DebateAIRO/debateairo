# TINT1 REPAIR — self-report

Seat TINT1 · PROGRAMMING loop · Opus 5 · session `opus-tint1-w5` · base `7433be7`.

## r1

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

### The murder weapon was a tsconfig line, and it was mine to find three rounds ago

**CAUSE.** `acceptance/**` is not in the root `tsconfig.json` `include`. My T5
lane made `edges` a REQUIRED field on `NodeReviewInput` and pinned the
`edge_bearings` response length — and then verified that change with a root
typecheck and two D16 surface gates, **none of which can see `acceptance/`**.
Three of the five b7 regressions live there. The fourth (DELIM-01) is a call
with no `edges` argument at all: a plain type error that sat undetected in the
repository because nothing type-checks that directory.

**PRICE.** A whole extra lane (this one), after three rework rounds that each
believed the lane was verified. The b7 batch suite was the first gate in the
entire chain with eyes on `acceptance/`.

**What makes this worse than a miss.** In r2 I filed **F-T5-9** — "a schema
change's blast radius is the set of wire-format producers, and those are
`string`-returning doubles invisible to the compiler and to a symbol grep" —
and proposed `grep -rln '"outcome"' tests/ acceptance/` as the fix. **I wrote
`acceptance/` into the remedy and then never ran it.** I diagnosed the disease
precisely and did not take the medicine. The producers in `acceptance/` were
named in my own finding, one round before they broke the integration branch.

**UPGRADE, and it is one line.** `acceptance/**/*.ts` now joins the root
include. Measured blast radius before taking it: **one error**, the DELIM-01
defect itself. A gate that costs nothing and would have converted this entire
lane into a compile error during T5 r1. The generalisable rule: **a directory
that is not type-checked is not verified, no matter how many suites run in it**
— and the seat should enumerate which directories its gates actually cover
before claiming a gate passed.

### The finding I am proudest of is the one nobody hypothesised

Failure 5 (nine SCRAM LOGINs) came with "no hypothesis from me," and it looked
unrelated to every other failure. It was mine too, by a mechanism no amount of
staring at the review schema would have surfaced:

`0040_account_erasure.sql:6273` runs `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA
core FROM PUBLIC` — **once**, at that migration. PostgreSQL grants EXECUTE on
every new function to PUBLIC by default. My 0052 minted
`core.reject_edge_mutation_except_measurement()` twelve migrations later, so it
kept that default grant, which put a seventh core function inside the
content-provision role's reach — and `assertContentProvisionDatabaseRole`
requires the count to be **exactly** the six ruled provision signatures.

**How it was found cheaply:** I read the assertion, saw it was a fourteen-clause
conjunction, and instead of bisecting at runtime I asked which clause my diff
could possibly move. `exactFunctionCount` was the only one that mentions a
population my migration adds to. Two greps confirmed the one-time sweep and the
repo's established `REVOKE ALL ON FUNCTION … FROM PUBLIC` habit that every other
post-0040 migration follows and mine did not.

**The transferable lesson: a one-time sweep is a trap for everything added after
it.** `REVOKE … ON ALL FUNCTIONS IN SCHEMA` reads like a standing policy and is
actually a single point-in-time statement. Same shape as the one-way door from
T5 r3 — a fact about the schema that looks permanent and is not. Both belong in
the same standing checklist.

### What went right, and why it was fast

This lane took a fraction of a T5 rework round despite five failures, for three
reasons worth repeating:

1. **The solo logs were real evidence.** Each carried a distinct signature —
   `NODE_REVIEW_UNAVAILABLE` ×3, a `TypeError` with a file:line, and a typed DB
   error — so root-causing was reading, not bisecting. **Four signatures, four
   causes, zero speculative runs.** The orchestrator confirming them solo and
   flake-free before dispatch is what made that possible; a flaky list would
   have cost hours.
2. **I measured before committing to the structural fix.** Adding `acceptance/`
   to the typecheck could have surfaced fifty pre-existing errors and blown the
   ticket's scope. One probe tsconfig, one run, one error — then I took it. The
   T5 self-reports keep saying "measure the artifact first"; here it decided a
   scope question in ninety seconds.
3. **The r2 fix was reusable verbatim.** The request-derived bearings shape I
   built for `database.test.ts` dropped into both acceptance doubles unchanged,
   because both inspect the HTTP body the same way. Extracting it to
   `tests/support/reviewBearings.ts` means the next producer gets it free.

### The choice that protected the landed lanes

Every bearing policy defaults to **cannot-assess**, not to a number. That is
what makes this a contract repair rather than an edit to other lanes'
assertions: null bearings leave their edges UNKNOWN, contribute nothing to
propagation, and leave T3's panel numbers and the ceremony's numbers byte-identical
to the day those lanes landed. Had I defaulted to a numeric bearing to "make it
realistic," I would have silently moved numbers inside two lanes I do not own,
and the suite would have gone green while the evidence rotted.

**The rule: when repairing a shared fixture, choose the value that changes
nothing, and make the caller opt in to change something.**

### Dead ends and traps

- `grep -rl '"outcome"'` over `tests/` and `acceptance/` returns 40 files, most
  of which use `outcome` for unrelated domains. The discriminating filter is the
  **co-occurrence** of `outcome` and `reasons` — 16 files, of which 4 already
  carried bearings. Grep the whole record shape, not one key.
- `acceptance/` has no precedent for importing `tests/support/`. I created that
  precedent deliberately (one definition of the wire shape beats three copies)
  and am naming it rather than letting it be discovered later.
- `tests/integration/database.test.ts` still carries its own inline copy of the
  bearings helper from T5 r2. I did NOT consolidate it, because that file is
  green and the ticket says everything else stays untouched. Filed as a finding
  instead — the duplication is real and will drift.

### A sixth b7 failure that was not in my five

`acceptance/dual-maker-proof.test.ts > FAIR-02` fails with
`CODEX_CLI_MODEL_UNRESOLVED`, and the b7 suite log shows it **already failing at
line 4863** — a live-CLI/host dependency, not a merge regression, and outside my
ticket. I did not touch it. But it was not on the list of five I was given, and
a seat that only ran its five would never have seen it. **A repair ticket should
state the complete failing set of the run it repairs, marking which items are
in scope**, so the seat can tell "not mine" from "not mentioned."

### The one-prompt-machine change this lane argues for

My three T5 self-reports asked for a harness map, a derived zone, and a
one-way-door checklist. This lane collapses all of them into something blunter:
**the seat should be made to state which directories and which gates its
evidence actually covers.** Not "root typecheck passed" but "root typecheck
covers apps, packages, tools, tests — and NOT acceptance or web or apps/ui."
Written down, that sentence makes the hole visible at a glance; unwritten, it
cost this mission an entire extra lane after three rounds of review that all
read "0 errors" and believed it.

---

## r2

Seat TINT1 · PROGRAMMING loop · Opus 5 · session `opus-tint1-w5b` (FRESH seat; the r1
seat was killed mid-sentence by the opus-5 weekly limit, D22). Base `7433be7`,
inherited tip `af58ac1` + orchestrator checkpoint `eed6ebf`, my tip `fbd5f50`.

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

### The inherited checkpoint was 80% right and 100% unreviewed — and that is the story

The dead seat left three files in `eed6ebf`. The packet said: *read it critically; keep,
fix or discard.* Kept the shape, rewrote the fixture. **Three defects, none of which
would have shown up as a red suite** — the checkpoint was green-adjacent and wrong.

**DEFECT 1 — the premise was derived from the working tree, and the working tree is the
thing under repair.** The inherited `applyThrough` built the "already applied 0052"
state by running the migrations **as they currently sit in the tree**. On the repaired
tree that happens to be right. On the `af58ac1` tree — the placement codex actually
rejected — it applies the *amended* 0052, which revokes, so PUBLIC never holds the
grant and the arm fails on its own premise instead of on the defect. Worse than a
wrong RED: **had anyone amended 0052 again, the arm would have silently stopped testing
the upgrade** and stayed green. A deployed database's privileges were fixed by the
bytes it ran months ago; no edit to the tree can reach back and change them.

> **The rule, and it generalises past this lane: an upgrade fixture must STATE the
> state it is upgrading FROM, never re-derive it by replaying the tree under repair.**
> Re-deriving it tests the tree against itself. I now `GRANT EXECUTE … TO PUBLIC`
> explicitly, with the comment saying it is PostgreSQL's default for a new function and
> therefore exactly what the landed 0052 left behind.

**PRICE:** one full RED run (~40 s) plus the redesign. Cheap only because I ran the RED
against the *reviewed placement* rather than against "0054 deleted". Running the mutant
codex actually named is what exposed it.

**DEFECT 2 — an assertion that swallowed the throw it existed to catch.** The
idempotence arm read:

```ts
await expect(applyOne(database, `${REVOKE}`).catch(() => undefined)).resolves.toBeUndefined();
```

`.catch(() => undefined)` makes `.resolves.toBeUndefined()` a **tautology** — it cannot
fail. And `applyOne` re-inserts the ledger row, which violates the `name` PRIMARY KEY,
so the whole transaction (including the REVOKE) rolled back and the following
assertions passed against a state nothing had changed. The arm proved nothing twice
over. **The prior seat's own RED log is the proof: it fails at line 172, never at 171.**
Mine executes the file with no ledger write, so a throw fails the assertion — and in my
RED run it did exactly that (`promise rejected "ENOENT" instead of resolving`).

> **`expect(p.catch(() => x)).resolves` is never a test.** If the property is "this does
> not throw", the throw must reach the assertion. Grep for `.catch(` inside `expect(`.

**DEFECT 3 — the RED landed on a missing file, not on a value.** Codex asked, in
writing, that the failure be "on the VALUE — 7 against the ruled 6 — not on a missing
file". The inherited arm asserted the **ledger row for 0054** before it asserted the
privilege, so a tree without the forward migration failed with `expected false to be
true` on a *filename lookup*. Same RED for a typo in the migration's name as for a
repair that never reached the database. Reordered: privilege → count → attestation →
ledger-as-corroboration. My RED now reads `expected true to be false` at the
PUBLIC-EXECUTE check, after `migrate()` ran.

### The upgrade I made that nobody asked for, and would make again

The inherited fixture **re-implemented** the attestation's counting SQL and hardcoded
`RULED_PROVISION_FUNCTION_COUNT = 6`. Two problems: it tests a paraphrase rather than
the thing that actually threw in b7, and the `6` drifts silently the day
`CONTENT_PROVISION_SIGNATURES` gains a row.

I replaced both halves with the real machinery — the real `migrate()` for the
continuation and the real `assertContentProvisionDatabaseRole` against the real nine
SCRAM LOGIN principals — and removed the hardcoded count entirely (the arm asserts
`after === before - 1` and lets the attestation stay the sole author of "exactly six").

> **When a fixture exists because a specific assertion threw, the fixture must call THAT
> assertion.** A re-implementation is a second thing to keep in sync, and it is exactly
> as blind as the original gate was.

### The trap that nearly put a FALSE proof in my final message

**`git diff <sha> -- <path>` prints nothing and exits 0 when the pathspec matches NO
file** — pathspecs are resolved relative to the CWD, and a worktree-root-relative path
run from inside `dialectical-engine/` matches nothing. The packet's own mandated proof
is `git diff 7433be7 -- dialectical-engine/migrations/0052….sql` **whose success
criterion is empty output**. I ran it from the wrong directory during the restore step
and got the empty output I wanted. It was correct by luck — the file really was
identical — but the command proved nothing.

Caught only because I ran the identical shape against `tsconfig.json`, expected the
`acceptance/**` line, and got silence. A claim I could check by other means was wrong,
so I re-checked the one I could not.

> **A proof whose success criterion is "no output" is not a proof.** Pair it with
> `--exit-code`, a `git ls-tree` pathspec sanity check, and an independent
> `shasum`/`cmp`. My filed proof carries all four. **This trap is NOT in
> `TOOLING-TRAPS.md` and should be** (F-TINT1-7).

**PRICE:** ~0 this time, unbounded in expectation. This is the single highest-leverage
item in this report.

### What I paid for by not reading the traps file first

The worker contract says read `.hermes/TOOLING-TRAPS.md` **before you start**. I read it
near the end. It contains the zsh no-word-splitting trap **twice**, the second entry
describing my exact failure mode — `FILES="a b"; vitest run $FILES` passes one filter,
vitest answers `No test files found, exiting with code 1`, and a three-run loop prints
three empty verdicts that look like three green runs. I wrote that loop, got three
empty failure-sets that `diff`ed clean and hashed identically, and it would have read as
"set-identical across three runs" to a skimming reviewer. I caught it on `exit=1` with
an empty failure set — a contradiction, not a result.

**PRICE:** one wasted three-run cluster loop, ~4 minutes. **Fully pre-paid by the file I
had not opened.** The fix is not "read more carefully"; it is ordering — the traps file
belongs in the same first breath as the packet, and the contract already says so.

> **`grep` over a log for a verdict line is not verification.** Absence of a match must
> be an error, never a pass. Both of my near-misses this round were "the grep found
> nothing and I read that as fine".

### Dead ends, so nobody re-derives them

- **`0053` is wrong, and codex's suggestion of it was correct-from-what-it-could-see.**
  `lane/t6` holds `0053_t06_review_outcome_disclosure.sql` (`b479f7e`), unlanded at
  `7433be7`. A static reviewer reading only the base sees `0053` free. Verified by
  sweeping every branch, not by trusting the checkpoint's comment.
- **The capability role is safe to reference at the through-0052 state.**
  `debateai_content_provision` is created by `0040_account_erasure.sql:782`, so
  `has_function_privilege('debateai_content_provision', …)` cannot fail with
  "role does not exist". Checked before writing the query rather than after a red run.
- **`has_function_privilege('public', …)` is legitimate** — production already does it
  (`packages/db/src/index.ts:174-177`, the `forbidden_function_privilege` clause). No
  need to reach for `aclexplode`.

### The one-prompt-machine change this round argues for

My r1 self-report asked that a seat be made to **state which directories its gates
cover**. This round asks for the sibling rule, and it is about *inherited* work:

> **A checkpoint commit is EVIDENCE, not a starting point.** `eed6ebf` was green on the
> repaired tree and wrong in three ways, none visible from a passing run. The packet's
> "read it critically" is right but unenforceable as prose. Make it mechanical: **a
> resuming seat must run the inherited artifact against the mutant the review named,
> before changing anything.** One RED run against codex's actual placement exposed
> defect 1 and defect 3 in ninety seconds. Had I started from "it's green, extend it",
> all three would have shipped.

Concretely, for the packet generator: when a packet hands a seat inherited uncommitted
work, it should carry **the mutant command** — "reproduce the reviewed state and run X;
it must fail on <value>" — not just the diff path. The diff tells you what changed; the
mutant tells you whether it works.

**Second, smaller:** the worker contract §6 orders every seat to append to
`.hermes/TOOLING-TRAPS.md`, but no TINT1 packet or ticket has ever granted that path.
Every worker must therefore either cross its contract or drop the trap on the floor. I
dropped it and filed F-TINT1-7 instead. Add the traps file to the standard worker
`allowed` list, or move the append to the orchestrator's assembly step.

# Self-report — seat `REV-S01-p1-correctness-tests` (REV(S01) pass 1, lens correctness/tests)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## The body

Four blocking findings. Three of them (B1, B2, B4) are the same disease in three organs: **the
verification is written against the shape of the code, not against the sentence in the SPEC.**

- **B1** — SPEC-v2 R-6's Check says "the decrypted snapshot contains no user id, owner ref, session
  id or email address anywhere in it." Nobody wrote that assertion. The C2 integration test with
  "pseudonym" in its name calls the SQL function directly, so the TypeScript that builds the snapshot
  never runs; the C2 unit test runs that TypeScript but never looks at what it encrypts. Swapping
  `pseudonym` for `input.ownerRef` in one argument keeps ten suites green.
- **B2** — R-9 says "exactly one of two observable states". The build tests the two states it wrote
  code for; it never tests the state its own concurrency produces. Two overlapping polls of the
  answer route leave a run `PUBLISHED` *and* `publish_pending`, which is V's acceptance step 5
  failing.
- **B4** — the C2 cluster gate is not reproducible. The suite hand-rolls `EmbeddedPostgres` while the
  repo has a shared helper that pins `--encoding=UTF8`. With no `LANG` in the environment the whole
  16-test suite silently *skips*, and the shared runner scores it `0/0` — CLUSTER_RED, not BROKEN.
  It passed three times for the BUILD seat because that shell had a UTF-8 locale.

## The cause, not the symptom

**Cause 1 — a requirement's *Check* clause is prose, so nobody owns it.** SPEC-v2 writes an explicit
`*Check:*` under most requirements. The PLAN traces requirement → step → cluster, but nothing traces
requirement → *the assertion the Check names*. A trace row is satisfied by "a test exists in the
cluster that covers R-6", which is true and useless. **Upgrade: the trace table's third column must
be the assertion, quoted from the SPEC's Check, and the reviewer's job is to mutate it.** That single
change would have caught B1 at BUILD, not at review.

**Cause 2 — the fixture bootstrap is copy-pasted instead of shared.** `tests/support/testDatabase.ts`
exists, is used by three of the slice's four integration suites, and pins the locale. The fourth
re-implemented it and dropped the pin. **Upgrade: an architecture test that fails any file under
`tests/integration/` that imports `embedded-postgres` directly.** Cheap, mechanical, permanent.

**Cause 3 — the runner cannot tell "did not run" from "ran and passed nothing".** `run-suites.sh`
scrapes `N passed` / `N failed` from vitest's summary; `Tests 16 skipped` matches neither and scores
`0/0`. A step that expects `0:0` would print CLUSTER_GREEN on a suite that never started. TOOLING-TRAPS
already records the `No test files found` member of this class; the skipped member was open.

## What repeatedly cost tokens

| cost | wall-clock | why | fix |
|---|---|---|---|
| Diagnosing B4 from a bare `passed=0 failed=0` | ~12 min, ~2 large log reads | The runner told me RED; RED means "the product is wrong", so I went looking at the product first. The truth was 60 lines up in a postgres bootstrap log. | Runner prints BROKEN for a suite with 0 passed **and** 0 failed. One `if`. |
| Re-running clusters three times before knowing runs 2–3 needed a locale | ~6 min of compute | I started run 1 before reading the fixture. | Seats export `LANG=en_US.UTF-8` in the runner itself, and the fixture stops depending on it. |
| Reading 4270 lines of `product.diff`? **Not paid.** | — | I read the changed source files at head instead, by file, and used `git diff` per path. | Keep the package's `product.diff` as an artifact of record, but packets should tell reviewers to read the head, not the diff — the diff costs 3–4× the tokens for the same facts. |
| My own fixture's first run failed on state left by an earlier case in the same file | ~4 min | Test-ordering pollution in MY probe, not the product. | Cost me one retry; worth recording because it is the same failure mode a BUILD seat hits. |

The single largest saving available: **the mutation campaign was 23 mutants and cost less than one
careful read of the diff.** Ten of them ran in 4 minutes on unit suites alone. A BUILD seat that runs
its own mutants against its own cluster command before READY would move B1 and N1 two nodes upstream,
where fixing them is one edit instead of a rework round.

## What I nearly got wrong

1. **I nearly filed the constructor default as the B-finding of charge 3.** `PostgresPublicationApplication`'s
   fifth parameter defaults to `async () => null`, which makes `reconcileFreePublicAutoPublish` a
   silent no-op for any caller that omits it. It *looks* like a disabled feature. It is not, in
   production: `main.ts:290` passes the reader, and `undefined as never` for the session argument is
   safe because `PostgresAskApplication.readRunAnswer` ignores it (`index.ts:1472`). I checked the
   implementation before writing the finding. A reviewer who stopped at the signature would have
   filed a false blocker and cost a rework round.
2. **I nearly called B2 cosmetic.** `publish_pending: true` on a `PUBLISHED` run self-heals in 30 s.
   What made it blocking is that SPEC-v2 §4 step 5 — *V's own hands* — reads exactly that field and
   expects exactly two keys.
3. **I nearly accepted `CONTENDED` as correct** because the C4 suite asserts it and the route's 202 is
   a status R-16 explicitly permits. The test pins a legal status over an illegal outcome.

## Dead ends — do not re-derive these

- `published_at` vs `snapshot.createdAt` drift (SPEC-v2 R-22.2's named trap) **is not present**: both
  come from the same `occurredAt` value, passed to the builder and to `transition_system_run_publication`.
  The C2 integration suite covers it. Do not re-check.
- The `…00f2` trigger admission in `0068` **does** carry its bound check; ARCH's own STRONGEST COUNTER
  on V-7 is refuted by mutant S9 (RED). Do not re-open V-7 on that ground.
- R-23's route table is unchanged by *membership*, not just by count — I checked the 52 strings as a
  set, 0 missing, 0 extra. Do not re-count.
- `run_is_free_public_bound` is correct on both conjuncts (mutants S1, S2 both RED) and the binding
  column defaults to `false` for old rows. R-1/R-2 are solid.

## Where this packet fought me

1. **Charge 3 asked a question whose answer was "no".** "Decide whether a caller that omits the new
   arguments gets a silently disabled feature in PRODUCTION wiring (main.ts is the production
   caller)." `main.ts` passes the argument, so the charge resolves in two greps — but the charge is
   phrased as if the answer were yes, which pulled me toward confirming rather than checking. A
   charge should name the *observable*, not the suspicion: "verify that the production construction
   at `main.ts:286-291` supplies every new constructor argument, and state what breaks if one is
   omitted."
2. **Packet line 8 says "comment cursor at dispatch: 0 comments".** The ticket carried the
   orchestrator's own `DISPATCHED` comment before I started. Trivial, but the CLAIM marker asks for a
   number and the packet supplied a wrong one; I reported `1`.
3. **Packet line 10 is one 900-word sentence** containing the inputs list, the freeze-commit
   instruction, a tooling trap, and a warning about pathspec spelling. I re-read it three times. The
   content is right and the trap warning was correct — splitting it into four bullets costs the
   orchestrator nothing and every seat one re-read.
4. **Nothing told me which locale to run in**, and the review package's §5 recipe ("exercise it
   in-process … as `tests/integration/fpd-s01-c2-system-publication.test.ts` does") pointed me at the
   one fixture that is locale-fragile. The recipe named the broken example.

## Upgrades, ranked by tokens saved

1. **Runner: `0 passed && 0 failed` ⇒ BROKEN, never RED** (`run-suites.sh:18-23`). Saves every future
   seat the 10–15 minutes I spent proving a green product from a red marker. One line.
2. **BUILD seats run a mutation pass on their own cluster command before READY.** Each mutant is one
   literal swap plus the cluster command they already run. B1 and N1 die at BUILD. This is the
   highest-leverage change in the whole loop: a surviving mutant is a missing test, stated
   mechanically, with no argument.
3. **The SPEC↔PLAN trace's third column is the assertion, quoted from the requirement's `*Check:*`.**
   Turns "is R-6 covered?" from a judgement into a grep.
4. **One architecture test: no file under `tests/` constructs `EmbeddedPostgres` directly.** Kills the
   B4 class permanently.
5. **Packets point reviewers at the head, not at `product.diff`.** The diff is 4270 lines; the six
   changed source files are ~1100. Same facts, a third of the tokens.
6. **Packet charges state observables, not suspicions** (see "fought me", item 1).

## Toward the one-prompt machine

The loop already does the expensive things well — frozen SPEC, numbered requirements, a cluster
command per build unit, blind lenses. What it still spends humans (and tokens) on is *deciding
whether a green suite means anything*. Mutation is the mechanical answer to that question, and it is
cheap: 23 mutants, 4 clusters, well under an hour of compute, and it produced two of my four blocking
findings with zero argument attached. If one thing is promoted from this pass into the spine, make it
this: **a cluster is not green until a named mutant of each requirement it covers has been shown to
turn it red.** That single rule converts "the reviewer reads and judges" into "the machine runs and
reports", which is the whole distance left between here and one prompt.

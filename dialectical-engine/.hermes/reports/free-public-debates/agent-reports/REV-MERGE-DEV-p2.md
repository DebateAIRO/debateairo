# Self-report — REV-MERGE-DEV-p2 · REV(S01) lens correctness-tests · pass 2 · ticket t_233f8baf

The question, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## The cause, not the symptom

**Pass 1's body was a guessed hunk. Pass 2's body is a green gate standing over a red suite.**

The rework did the hard part well. `planTierControlsAvailable` is gone, `/new` renders both steering
boxes for every client shape, `ux01` was rewritten in the open with `V-12` beside each assertion, the
depth detector survives a real mutant, and my two blocking findings are addressed by measurement, not
by argument. Then the same rework re-edited `tests/integration/dev-deployment-register.test.ts` to
close N1 — and that suite is **RED at `478b0ca0`**: my run 16/3, the orchestrator's run 16/3 with a
*different* three cases and `REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift` in the
embedded-postgres log. It was 19/19 at `df06aedf`. Nobody saw it, because the gate at this head
prints `CLUSTER_GREEN` over a list that does not contain it.

**The cause is that our gate is a fixed list and our rework is a moving set of files.** A cluster
list is written once, at slice planning, from the slice's own clusters. A rework edits whatever the
findings touch — here 7 files, 4 of them suites, only 1 of which the gate list names. So the
orchestrator's `CLUSTER_GREEN` is a true statement about the wrong set. The same shape produced my
pass-1 N4 (a stale `expect 28` for `dev-auth-stack`) and my pass-1 B2 (`s1-1-depth-contract` red and
on no list). Three occurrences, one cause: **nothing in this machine derives the verification set
from the diff.**

**The second-order cause is that the sweep table was believed instead of grepped.** The seat's
`third-behaviour-sweep.md` row 27 states that p2 "adds the shared `input.adminPool` construction
oracle" to `tests/architecture/dev-deployment-register.test.ts`. It does not — the oracle landed in
the two `p2-*.test.ts` files only. One `grep` refutes the row. A table a reviewer must verify line by
line is not evidence; it is a claim with a citation shape.

## What must be upgraded, ranked by tokens saved

1. **Derive the verification set from the diff, mechanically.** `git diff <prev>..<head> --name-only`
   → every suite that imports or reads any changed path → run that union, with expectations measured
   at `<prev>`. This single rule kills my pass-1 N4, my pass-1 B2 and my pass-2 B3. It is perhaps 30
   lines in the orchestrator's gate script. Estimated: one whole rework pass per merge, 100–150k
   tokens, plus the pass-3 this REWORK now costs.
2. **A rework must re-run, at minimum, every suite it edited.** The rework edited four suites and
   reported three of them. The one it did not report is the one that broke. Make "the suites in my
   own diff, green, three runs" a precondition of READY, checked by the orchestrator against
   `rework.diff` before the review package is built. Estimated 60k+.
3. **Ban prose tables as primary evidence; require the command.** Each row of
   `third-behaviour-sweep.md` should carry the `git show <parent>:<path> | grep` that produced it, so
   a reviewer re-runs 35 greps instead of re-deriving 35 judgements. I sampled 8 rows and one was
   wrong — a 12.5% error rate in the artefact the whole charge rests on. Estimated 25–40k per pass.
4. **Integration suites with a 120s per-case timeout need a concurrency floor.** Both independent
   runs of `dev-deployment-register.test.ts` reported single cases at 600k–1,000k ms wall against a
   120s timeout: the process was starved, not slow. Until that suite is bounded, every reviewer will
   spend 20–30 minutes discovering the same thing. A `--pool=forks --poolOptions.forks.singleFork`
   row, or a documented "run alone" marker, would have saved me two runs and the harness two stalls.
5. **Keep the reviewer's probes as a suite, not as prose.** My pass-1 refutation encoded dev's S1-2
   expectations; V-12 then overturned them, so the probe had to be re-derived rather than re-run. A
   probe that asserts *the current ruling* by id (`V-12`) instead of a remembered behaviour survives
   a ruling change. The rework's own `ux01` rewrite does this correctly and is the model to copy.

## What repeatedly cost tokens

- **Harness stalls, three times**: two permission-classifier timeouts and one 3-hour wait on a
  background `vitest` run. The lesson is procedural and cheap: **no single tool call over ~60s**;
  split suites, background the long ones, and re-measure state on resume rather than re-running.
  I lost roughly a third of this pass's wall-clock to it and re-established state twice.
- **Extracting the harness again.** Pass 1's helpers (`openOptionsPanel`, `typeIntoEveryTextControl`)
  lived inside `ux01`'s `describe`; the rework moved/removed them, so my generator's
  `src.index("  /* Text-entry")` threw and I rebuilt the probe from `describe(` instead. Second pass,
  same cause, same fix withheld: **render-harness helpers belong in `tests/support/`, exported.**
- **Guessing an expectation I could have measured.** I passed `ux01:9:0` from memory; it is 8. One
  wasted suite run. `run-suites.sh` should accept `<suite>:?` meaning "record, do not compare".

## What I nearly got wrong

I nearly filed the `dev-deployment-register` failures as my own environment. Three cases timing out
with 600k–1,000k ms wall on a machine also serving a live stack is exactly what starvation looks
like, and the honest default is to blame the reviewer's box. What changed my mind was that an
*independent* run by the orchestrator was red on a **different** three cases with a database-level
`REGISTER_PUBLICATION_SEAL_INVALID` — two runs, two case sets, one product error. I would still have
been wrong if I had not been handed that second frame; on my own evidence alone I would have written
UNVERIFIED. **Rule: one red run of a slow integration suite is a hypothesis; two independent red runs
with different case sets are a finding.**

I also nearly filed row 20 of the sweep (ours' local `DEPTH_MIN/DEPTH_MAX` replaced by theirs'
contract import) as a lost bound. It is not: ours' locals were `1` and `5`, identical to
`EXPANSION_DEPTH_MIN/MAX`, so the substitution is an ownership dedup — and it is precisely what the
`s1-1-depth-contract` oracle demands. Numeric identity, not provenance, decided it.

## Dead ends — do not re-derive

- Do not re-run `tests/integration/dev-deployment-register.test.ts` hoping for a clean frame. Two
  independent runs are red; a third costs 20–30 minutes and adds nothing.
- `ux01`'s module-level helpers changed shape between `df06aedf` and `478b0ca0`. Generate a probe
  from `src.split('describe("UX-01')[0]` and define your own panel/tier helpers; do not slice on
  comment text.
- The author's `contractClient` double at `478b0ca0` is a `Proxy` with a `contractClientHasPlanTierReader`
  switch. Use **plain objects** for an independent probe, or you inherit the very indirection you are
  auditing.
- The nine `NON_DEPTH_DOMAIN_EXEMPTIONS` are honest; I opened all nine lines. Do not re-audit them —
  audit the *count* mechanism instead, which throws on a stale entry, and mutate the detector.

## Where this packet was unclear — exactly

- **§1 still says "your detached worktree"** for a path the package README calls "the author's lane".
  Unchanged from pass 1; I raised it as N6 and it was not folded. A reviewer who makes no git writes
  cannot produce the artefact the packet describes.
- **Charge 4, "New breakage only inside rework.diff"** does not say whether a suite that merely
  *reads* a changed file is inside the scope. I read it as yes (that is how B3 was found). Say it.
- **Charge 1's "prove no production code in `apps/` branches on the shape of a client object"** has
  no definition of the class. I chose: `Reflect.get` in a boolean position, `typeof x.m === "function"`
  on an application object, `"m" in client`, `process.env.VITEST`, `NODE_ENV === "test"`. Host-capability
  checks (`matchMedia`, `getSetCookie`, `getAnimations`, `scrollIntoView`, `process.getuid`) and Proxy
  forwarding traps are excluded. Another reviewer would draw that line elsewhere. **Define the class
  in the packet, once, and every pass sweeps the same set.**
- **The freeze pair `75118ecc..c88164b7`** — I did not verify it this pass (pass 1's N5 found the
  previous pair carried none of the work). It is UNVERIFIED here, and it should not need a reviewer
  to check that the record of a pass exists.

## Toward the one-prompt machine

Pass 1's lesson was *compute the incompatibility surface before dispatch*. Pass 2's is its twin:
**compute the verification surface after the edit.** Both are the same missing organ — the machine
describes what it did and asks a human-shaped reviewer to derive what that implies. A gate that read
`rework.diff` and ran the suites that diff touches would have caught B3 before the review package was
built, and this merge would be at PASS instead of at its last pass.

# Self-report — seat `REV-S03-p3r-product-truth` (REV(S03) lens product-truth, pass 3r, the V-authorized scoped re-check)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Ticket `t_e5adea05` · review head `b97985a8` · session `96555a10-dafb-468d-88b3-f6c3afd4c825` ·
worktree `.worktrees/rev-s03-p3r-product-truth/dialectical-engine`, porcelain 0 on arrival and 0 at
handoff · comments read through: 2.

---

## 1. The body: what actually killed three passes, and then killed the first FIX

**The cause is one sentence: every measurement in this mission was made against a store that had no
history, about a product whose defect only exists when the store has history.**

Passes 1, 2 and 3 — nine lens-runs — all ran on fresh embedded postgres. A fresh database has no
sealed register v4, so `seedDevelopmentDeploymentRegister` replaying today's row set into version 4
is indistinguishable from correct. The defect (V-47) was not subtle; it was *unreachable* by the
only kind of evidence the fleet was producing. Three passes did not "miss" it. They could not see it.

Then the FIX inherited the same disease one layer up. FIX-S03-p3-F1's first commit `ef302060` pinned
the historical v4 constant to the digest `42b90bca…` **because the orchestrator's packet named that
digest as "the pre-S03 v4"** — a digest derived from the CODE, never read from V's database. On V's
database `42b90bca…` is version **nine**; the sealed v4 is `120bdfea…`. So the FIX shipped, the live
restart was run, and it drifted again (attempt 3), costing RULING 4, a resumed seat, a second commit
`a25c0d99`, a fourth live attempt, and this re-check's whole existence.

**One law would have prevented both:** *a packet constant that describes the state of a live
installation must carry the command that read it FROM that installation, and the timestamp.* A
code-derived digest may never be written down as the installation's state. That is the single
highest-value upgrade in this report.

### Price (measured where I can, stated as estimates where I cannot)

| what | price |
|---|---|
| passes 1–3 of REV(S03) | 9 lens-runs, 3 unions, 3 FIX nodes — all correct on their evidence, all blind to the aged-store case |
| the aged-store defect surfacing only at merge day | 1 extra FIX node + 1 extra re-check node **beyond V's three-pass cap** (V had to authorize it) |
| the code-digest-as-database-state packet defect | RULING 4 + a resumed seat + `a25c0d99` + 2 wasted live attempts (12:46, 16:53) — call it one full node's wall clock and three live restarts of V's stack |
| the FIX seat BLOCKED three times on allowed-list omissions | three orchestrator round-trips inside one node |
| THIS seat | ~50 min wall clock, 5 probe files (26 cases), 2 mutants, 2 suite re-runs — and it found **B1**, a regression the FIX introduced (§2c) |

**The repeated token cost, named:** re-deriving context that one measured line would have carried.
I read a 493-line pass-3 artifact, a 30-line package README, a 40-line packet and ~900 lines of
product source to answer a question whose decisive fact is four tokens long — *`dev:auth:up` exited
1*. The package README describes the live log at length and calls its frame met; the log's own last
line is `[ELIFECYCLE] Command failed with exit code 1`. Every lens must now reconcile those two by
hand. Put the exit code and the stage in the README's first line about that log.

---

## 2. What I nearly got wrong (both ways, and they are opposite errors)

**(a) I nearly carried my pass-3 REWORK forward on a literal reading.** SPEC-v3 R32 says
`pnpm dev:auth:up` starts the stack; R31 says it "completes with exit code 0". At `b97985a8` it does
neither — it exits 1 at the runner stage. My pass-3 verdict rested on exactly that clause, so the
consistent move was to re-file REWORK. That would have charged S03 for a defect S03 did not cause,
produced a second V row duplicating **V-51**, and stalled the slice.

What stopped me was refusing to accept *"pre-existing, outside S03's surface"* as a claim and
measuring it instead: `git show 9a000c37:…/dev-runner-process.ts` carries the identical predicate,
and my probe R2 shows the pre-S03 register version **9** fails the gate identically. Delta zero.

**(b) I nearly accepted the package's provenance wholesale — and it is wrong twice.** The README says
the gate is *"PRE-EXISTING since 2026-09-12, outside S03's surface"*. Measured: the failing predicate
landed **2026-09-05** (`9d0c8e30`), and `apps/runner/src/dev-runner-process.ts` **is** in S03's
surface — S03 edited it at `43efdb1a` (+8/−3). Both halves of the sentence are false; the conclusion
it supports is true. Had I trusted it I would have reported a false date; had I inverted it I would
have blamed S03 for a file it merely touched.

**The lesson is a technique, and it should be law:** *provenance is claimed by LINE, never by file.*
"Outside the slice's surface" is unfalsifiable. `git blame -L <n>,<m>` plus
`git diff <base> <head> -- <file>` is two commands and settles it. Every "pre-existing" claim in a
packet, a README or a V row should be required to carry them.

### (c) The thing I nearly did not look for at all — B1

Having cleared V-47 on V's own bytes and confirmed V-49's stage order at
`dev-auth-stack.ts:155-157`, I had every charge answered and a PASS half-written. What made me keep
going was a mechanical habit, not insight: *a stage that moves changes what every LATER stage sees,
and what every EARLIER failure prints.* V-49 moved a stage to position 1. So I asked what now fails
*before* the model-config check — and found that a shape fault is intercepted by the generator, whose
message the CLI discards, so `dev:auth:up` refuses a broken `config/models.yaml` with the single word
`DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED`. **SPEC-v3 R22 requires the tier, the model id and the
class. At `0fe14637` the product printed all three.** That is a regression of the commit under
review, on a merge-day acceptance step, and nine lens-runs plus 26 green cases in the FIX's own suite
would never have caught it — because every test asserts the stage LIST, and the printing lives in
`dev-auth-stack-cli.ts`, which no cluster command runs.

**The generalisable rule, and it is cheap:** *when a change re-orders stages, the review owes one
question per new adjacency — what does the earlier stage now intercept, and what does the operator
see when it does?* And: **a CLI's own rendering function is part of the product.** The fleet tests
what stages DO and never what the binary PRINTS; `developmentAuthStackErrorCode` keeps only messages
matching `/^DEV_[A-Z0-9_]+$/`, which silently swallows every cause that is not a product error —
already known once as residue `t_657958bd` (the stack CLI drops the relay's own code). That is the
same defect, third sighting. It should be a ticket against the CLI, not a note in three reports.

**Cheapest possible prevention:** one test that calls the CLI's error renderer on each stage's
failure and asserts the operator-visible string. Five lines per stage, and it would have caught
both this and `t_657958bd`.

---

## 3. Where this packet fought me — the witness was led

Charge 2 asks: *"does `pnpm dev:auth:up` … now complete — seed without drift, publish …, start the
API/runner/UI/TLS"*. The honest answer is **no** — it seeds, publishes and rewrites api.env, then
exits 1 before the UI and TLS ever start. But the surrounding record tells the lens what to conclude
before it measures:

- `review-packages/S03-p3r/README.md:17` — *"**What that frame is** (the orchestrator's reading of the
  whole log …)"*, followed by a paragraph ending "the hatchet token and the API started", with the
  failure introduced as a subordinate clause.
- `V-DECISIONS-PACKET.md` row **V-51** — *"the re-check lenses read the frame as 'V-47 met through
  api.env, the runner gate pre-existing'"*. That sentence states a blind lens's verdict in the record
  the lens is required to read, before the lens has run.

My independent measurement happens to agree with it, which is exactly why it is worth flagging:
agreement is not evidence when the conclusion was supplied. **Upgrade:** the orchestrator's reading
of ambiguous evidence belongs in a file the lens is told NOT to open until its verdict file is
written — or nowhere. A V row may state the orchestrator's recommended default; it must not state
what the reviewers will find. I raise it as N4 in the artifact rather than swallowing it.

Two smaller packet notes: the packet cites my pass-3 sections as `## Re-check` (the file spells it
`# Re-check — 2026-09-16, …`) — harmless; and `live/serve-merged-up-b97985a8.log` is 11 lines of
which 4 are Hatchet deprecation noise, yet the README quotes those 4 lines as "the log's last lines",
which buries the one line that matters.

---

## 4. Dead ends, so nobody re-derives them

- **Do not hand-write `PROVIDER_DISCOVERY_TARGETS_JSON`** to exercise the runner path.
  `createRunnerEnvironment` (`dev-runner-process.ts:75`) rejects any JSON that is not byte-identical
  to what the panel builder emits, so a hand-written array fails with
  `DEV_RUNNER_PROCESS_ENVIRONMENT_INVALID` and you will debug the wrong thing.
  **Recipe:** `developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(root)).targetsJson`.
  That one line makes `startDevelopmentRunnerProcess` fully drivable in-process — no child process,
  no port, no database. It is in my promoted probe.
- **Do not try to reach the runner gate's value branch.** The `typeof … !== "string"` test at `:157`
  fires first and the loader always produces a number, so no register version can ever reach the
  equality test at `:158`. I proved it over five versions (probe R4) so the next seat does not spend
  a cycle hunting a value mismatch.
- **The row's `kind` member is not a bug.** It is persisted deliberately (reader-side ruling,
  pass 2) and V ruled V-48 = NO. Three lenses have now re-derived this; it should be a one-line note
  in the package so a fourth does not.

---

## 5. What we must upgrade — ranked, each one checkable

1. **A stateful-installation gate, as a cluster command, not a live step.** Any slice that writes to
   a sealed or versioned store gets one verification that runs against an **aged** fixture — a store
   seeded at the *previous* release and then started — alongside the fresh-database suites. This is
   the whole murder. It is cheap: the FIX's own regression test already builds a pre-S03 sealed v4,
   so the capability exists; it simply was not required of the slice.
2. **Measure-the-installation law** (§1). Live state is quoted with the reading command + timestamp,
   or it is not quoted.
3. **Provenance by line** (§2b). `git blame -L` + the file's slice diff in every "pre-existing" claim.
4. **Do not pre-state a blind lens's conclusion** (§3).
5. **Gate the acceptance command's exit code in CI, not on merge day.** Four of SPEC-v3 §2's eleven
   steps (6, 8, 9, 10a) require `pnpm dev:auth:up` to *complete*. Nothing in the mission ever asserted
   `exit 0` for that command; the fleet has been serving V's stack with a piecewise script family that
   routes around the failing stage, so the product's own entry point rotted unobserved since
   2026-09-05. **A command the acceptance procedure names is a product surface and needs a test.**
6. **Kill the workaround, or promote it.** `logs/serve-merged.sh` normalising a runner message that
   the product rejects is a fork of the product's start path maintained by the orchestrator. Either
   the one-line product fix lands (V-51) or the piecewise family becomes the documented way to start
   — but not both silently.

## 6. Toward the one-prompt machine

The three things that would most shorten the next mission of this shape:

- **Type the evidence, not just the artifacts.** Packets already type inputs as file paths. Add a
  type for *measurements*: `{value, command, host/installation, timestamp}`. Every digest, version,
  row count and port in a packet carries it. `packet-check.sh` can then mechanically refuse a
  measurement with no command — which is precisely the defect that produced RULING 4.
- **Make "the product's own start command exits 0" a first-class mission invariant**, asserted once
  per slice on the merged head, in the same place the three-run suite tables live. Every slice in
  this mission claimed the stack starts; none measured it until merge day.
- **Separate the orchestrator's narration from the lens's inputs.** The package README is doing two
  jobs — mechanical assembly (excellent: every number re-measured, diffs, three-run tables) and
  interpretation (harmful to blindness). Split it into `README.md` (assembly only) and
  `ORCHESTRATOR-READING.md` (never named in a lens packet). The assembly half is the best artifact
  in this mission and should be the template; the interpretation half nearly bought a free conclusion
  from me.

**One thing that worked and should be kept:** my own pass-3 probe case 7 — *the row absent → opaque
500* — was recorded rather than predicted, and it is what let me price the pass-3 blocking chain in
one step this session instead of re-deriving it. **Record states you did not predict.** They are the
cheapest evidence you will ever have when the state you did not predict becomes the state you are in.

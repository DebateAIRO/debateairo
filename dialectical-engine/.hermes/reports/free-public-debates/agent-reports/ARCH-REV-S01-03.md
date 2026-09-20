# SELF-REPORT — seat ARCH-REV-S01-03 · node ARCH-REV(S01) pass 3 of 3 (FINAL) · mission `free-public-debates` · 2026-09-20

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict: **PASS**. B1-p2, N1-p2, N2-p2, N3-p2 all closed; three non-blocking residues (N1-p3, N2-p3, N3-p3).
Three review passes on one plan: 5 blocking → 1 blocking → 0. This report is about what the arc proves.

## The cause of record, across all three passes

Every blocking finding I raised in three passes was one defect class wearing three costumes: **a new object
was specified by what it differs from, and nobody enumerated what it must inherit.**

- Pass 1 (B1, B4a/b/c): the system publish function was written as "the owner function minus session, grant
  and binding". The minus-list was exact. The remainder-list was never written, so two guards that have nothing
  to do with authentication (erasure liveness, already-published) went out with the three that do, and the
  audit write lost its only callable path.
- Pass 2 (B1-p2): the system *intent table* was written as "the owner table minus session_id and
  grant_token_hash". Again exact. Again no remainder-list — so the table inherited the GRANT but not the two
  cleanup functions, and the pass-1 fix (an erasure contention gate) turned that dormant gap into a debate
  that could never be deleted.
- Pass 3 (N1-p3): the *same table*, third costume. The claim/complete functions were added; the two columns
  they read (`cleanup_claim_token`, `cleanup_claimed_at`, which the owner table has at
  `0040_account_erasure.sql:1028-1029`) were not.

**Three passes, one missing artifact: an inheritance table.** Pass 1 asked for guard parity on functions.
Pass 2 widened it to lifecycle parity on tables. Pass 3 shows it must be *column*-level too. The whole thing
is one rule: **when a plan derives a new object from an existing one, it carries a table with a row per
element of the original — parameter, guard, column, function, GRANT, caller — and marks each carried,
dropped-with-reason, or replaced.** For this slice that table is roughly thirty rows and would have been
written once, at ARCH pass 1. It would have prevented five of my six blocking findings and both surviving
residues. Nothing else I can recommend comes close to that ratio.

## What repeatedly cost tokens — the three-pass ledger

1. **Citation arithmetic, three times.** I recommended `citations-check.sh` at pass 1 and again at pass 2; it
   was not built, so pass 3 paid it a third time. Every revision renumbers the file (999 → 1073 → 1092 lines),
   so every `path:line` in my own previous verdict has to be re-resolved before it can be re-checked. Measured
   cost across the three passes: roughly 70k tokens of pure lookup. It is the single largest recurring waste
   in this node's history, and it is a twenty-line script.
2. **Re-running four base cluster commands that cannot move.** ~6 minutes wall clock per pass, three passes,
   twelve identical lines. The revisions touch no product file; the suites were always going to reproduce.
   The rule earned its keep once (pass 1 established the base) and cost two repeats after that. **Upgrade: a
   scoped pass re-runs a cluster command only when the diff touched its command text or a file it names** —
   and says so explicitly, which is what I did anyway in all three verdicts.
3. **Reading the whole plan when a diff would do.** Pass 1 read ~1000 lines because there was no prior. Passes
   2 and 3 read a 456-line and a 52-line diff plus the changed step bodies — roughly a third and a tenth of
   the cost. The packet line that names both freeze hashes and the exact `git diff` recipe is the best-designed
   instruction I have been given in this mission; it should be standing text for every re-review packet.
4. **My own broken checker, discovered at pass 2 and paid for at pass 1's price.** `file-map-check.py` shipped
   in a state where it could not fail. ARCH-FIX ran it, saw noise, and wrote it off — correctly. This pass I
   built `grant-defines-check.py` and validated it failing on the Revision-2 shape *before* quoting its PASS.
   That discipline cost ~4k tokens and is the only reason the B1-p2 class is now mechanically closed.

## What I nearly got wrong

- **I nearly missed N3-p3 entirely, and it was in the diff I was reviewing.** I was verifying a citation
  (`:719`) for something else, read the line, and found C4's own intro still saying "Parallel with C2 after
  C1" — the exact claim Revision 3 exists to reverse. §1 and the cluster notes cell were both updated; the
  cluster's own first sentence was not. **This is the same sweep shape as pass 1's B3**, and I found it by
  accident rather than by method. The method that would have found it deliberately is one `git grep` of the
  phrase the revision changed: `git grep -n 'Parallel with C2'` → one hit. **Upgrade: when a revision changes
  a stated property, the FIX seat greps the old phrasing and the REVIEW seat greps it again.** I am now three
  for three on "the contradiction lives in the cluster section the other seat never reads".
- **I nearly tiered N3-p3 blocking**, because its class was blocking at pass 1 (B3) and a reflex says treat
  like with like. The difference is who reads the contradicted sentence: at pass 1 the C2 BUILD seat had to
  act on it; here dispatch order belongs to the orchestrator and the board edges, and C4-S2 cases 7–8 go RED
  instantly against a missing table. At pass 3 a blocking finding is a V row — an expensive instrument for
  five stale words. Tiering by consequence rather than by resemblance is the whole job at the last pass.
- I nearly recorded B1-p2 as "closed in five limbs". It was six: the revision also changed the cluster order
  (`:35`), which I had not asked for and had not noticed was already false after Revision 2. The FIX seat
  found a real defect in my own verdict's model of the plan. Worth saying plainly.

## Dead ends — do not re-derive

- The one-DENY rule and R-21's count do not collide: C2-S3 case 6's two failures (cipher-down,
  provision-false) never enter the transition, so the application writes both and the transition writes none;
  case 10's transition-level denial is a separate run and pins 1. I did that arithmetic twice; it is settled.
- `C3 ∥ C4` is genuinely conflict-free: C3 writes `apps/api/src/index.ts` + one test, C4 writes
  `migrations/0068` + two tests. Checked with the repaired map checker.
- The `OTHER(C1) packages/db/src/index.ts` line my file-map checker prints for C2 is a **read**, not a write —
  the `RunOwnershipAccess` type citation at `PLAN.md:416`. The checker cannot distinguish reads from writes;
  do not chase it again.
- Precedents for the new cleanup pair are exact and verified in the lane: `0040_account_erasure.sql:1355-1362`
  (the `RETURNS TABLE` shape), `:1400-1403` (the stale-`RECONCILING` clause), `:6373-6374` (the two-signature
  GRANT), `:1028-1029` (the two columns N1-p3 is about).
- The four base cluster commands have now produced identical output in six runs across three passes. Stop
  re-running them unless the command text changes.

## Where this packet fought me

- The verification line (`§2`) is inherited verbatim from pass 1: "inline and scripted · your own both-ways
  trace parser". At pass 3 both are re-runs of my own artifacts against a 52-line diff. I ran them because the
  packet says so, and they found nothing, as they found nothing at pass 2. **A scoped pass should owe: each
  finding's own detector, plus any cluster command whose text or named files the diff touched, plus one mutant
  per guarantee the revision adds.** That last item is the only thing that produced new information this pass.
- Charge 5 is excellent and should be standing text: "a finding BUILD can close inside its cluster with a RED
  case the plan already names is non-blocking". It decided all three of my N-tiers in one reading and removed
  the temptation to escalate at the last pass. Contrast with pass 2, where I had to reason the tier from first
  principles and spent tokens doing it.
- Charge 3's scope boundary bit again, exactly as I flagged at pass 2: N1-p3's columns are missing from a table
  defined in Revision 2, but the functions that need them are new in Revision 3. I filed it and said so. The
  packet sentence I asked for at pass 2 — "a pre-existing omission that a line in the diff makes harmful is in
  scope, with its provenance" — would have saved the deliberation a second time.

## Toward the one-prompt machine — final ranking from this node

1. **The inheritance table** (parameter · guard · column · function · GRANT · caller), mandatory whenever a
   plan derives an object from an existing one. Would have prevented 5 of 6 blocking findings and 2 of 3
   residues across three passes. Nothing else is close.
2. **`citations-check.sh`** — recommended three times, unbuilt three times, paid for three times. ~70k tokens
   in this node alone.
3. **Grep the old phrasing.** When a revision reverses a stated property, both seats grep the sentence being
   replaced. One command; it is how N3-p3 survived two seats and a review pass.
4. **Reviewers' probes ship validated failing**, the same law FIX seats already carry. My pass-1 handoff gave
   the next seat a checker that could not fail.
5. **Scope the re-run rule**: a scoped pass re-runs a command only if the diff touched its text or its files.
6. Keep the freeze-hash + `git diff` recipe and charge 5's tiering test in every re-review packet. They are
   the two lines that made pass 3 cost a tenth of pass 1.

Wall clock: ~25 minutes, ~7 in one background suite round (scripted + inline). No retries, no blocked commands.
Lane left at `5b6cc9b1`, 0 dirty; no git write; nothing opened on V's desktop.

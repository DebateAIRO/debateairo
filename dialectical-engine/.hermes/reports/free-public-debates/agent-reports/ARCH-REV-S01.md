# SELF-REPORT — seat ARCH-REV-S01 · node ARCH-REV(S01) pass 1 · mission `free-public-debates` · 2026-09-20

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Verdict: **REWORK**, five blocking findings. This report is about how the five got in, not about what they are.

## The cause of record

**Four of my five blocking findings are the same murder: a new `SECURITY DEFINER` path was designed by
listing what it must NOT read, and nobody enumerated what the sibling it replaces DOES read.**

`core.transition_run_publication` holds six things inside one transaction: a `FOR UPDATE` on `core.run`, an
account advisory lock, a live-session check, a live-grant check, a live-binding check, and — the ones that
matter — `core.run_private_content_is_live` and `v_latest_state='PUBLISHED'`. ADR-0026 and `PLAN.md` §2 both
frame the system function as "the owner function *minus* session, grant and binding". The minus-list was
written carefully. The remainder-list was never written at all, so the two guards that have nothing to do
with authentication (erasure liveness, already-published) were dropped with the three that do. B4(a), B4(b)
and B4(c) are three faces of that one omission; B1 is the same reflex applied to the audit write (the system
path "must not present a grant", so the grant-shaped audit wrapper was dropped, and no replacement was named
because nobody enumerated *who is allowed to write an audit row at all*).

The cheapest possible upgrade in this whole report: **when a plan replaces or forks an existing
`SECURITY DEFINER` function, the plan must carry a two-column table — every guard in the original, and what
the new one does with it (carried / dropped, and why).** That is ten lines of table. It would have caught
four of my five blocking findings before dispatch, and it is mechanically checkable by a reviewer with
`sed` — no judgement.

The fifth (B5, the migrate→deploy skew that fails every run creation) has a different cause: the plan copied
`0061`'s *shape* (capability probe + allow-list + exception handler) onto a `NOT NULL` column, where `0061`'s
column was nullable. The shape was preserved; the property the shape existed for — forward-and-backward
skew safety — was not. Same family as TOOLING-TRAPS' "a fix can introduce the next variant of the family it
is fixing".

## What repeatedly cost tokens, ranked by what a fix would save

1. **PLAN.md is 999 lines and I had to read ~700 of them twice** (the file exceeds one Read page, so pagination
   plus re-greps for exact line numbers cost roughly 55k tokens of my run). Nothing in the plan is wasted, but
   the *shape* forces re-reads: the file map is in §1.1, the Files blocks are in §2, the trace is in §3, the
   refutation is in §7, and checking one claim means visiting three of them. **Upgrade: make §1.1 the
   generated artifact** — one `path | cluster | created/modified | the step that writes it` table emitted
   from the step bodies, so a reviewer diffs one table instead of joining four sections. My
   `file-map-check.py` is that generator; it is 25 lines and lives in `probes/ARCH-REV-S01/`.
2. **Every `path:line` in the plan had to be re-measured by hand.** I verified ~30 citations across
   `index.ts`, `publications.ts`, `packages/db`, the contract and three migrations. All 30 were correct —
   which is the point: I spent about 40k tokens proving a seat honest. **Upgrade: a `citations-check.sh` that
   extracts every `` `path:line` `` from a planning artifact and prints the cited line, run by the AUTHOR
   before READY and by the reviewer as one command.** It turns the most expensive part of a planning review
   into a diff. This is the single largest token saving available to this fleet today.
3. **The reading floor was over-broad in both directions.** `ARCH-S01.md:10` said "the code surface the SPEC
   names", which is ~30 spans (P6), while `:36` named `0061:1-70` when the load-bearing lines are at `:100-101`
   (P5). Both errors cost the *same* thing: the seat cannot tell whether it is allowed to read what it needs,
   so it reads more and reports less. **Upgrade: packets name spans, never surfaces, and a packet-check
   asserts every named span contains the string the charge depends on.**
4. **Two background suite rounds (~14 minutes wall clock) to produce eight lines I could have predicted.**
   Worth it — §8's verdicts reproduced exactly, and a review that does not re-run is the embarrassment the
   reviewer contract warns about — but the *second* round (inline) bought almost nothing beyond satisfying my
   packet's "inline and scripted" clause. **Upgrade: keep "scripted", drop "inline"; replace it with one
   mutation of the gate itself** (I did that voluntarily for SV-1 and SV-2, and the SV-2 positive control was
   the only run all session that told me something I could not have read).

## What I nearly got wrong

- **I nearly filed the parallel-write map as clean and moved on.** C2 ∥ C4 *are* disjoint, and my script said
  so. The defect was one level up: a file that no cluster owns and that C2-S18 nevertheless needs
  (`apps/api/src/main.ts`). A map that is internally consistent can still be incomplete, and my first parser
  only checked consistency. The second pass — "which production files does a step NAME that the map does not
  LIST" — is what found it.
- **I nearly accepted `readOwnedVisibility`'s `publish_pending` as C2-only.** It is; but the same reading
  almost made me miss that `isFreePublicBound` (B3) is *not*, because `PLAN.md:538` asserts C2-S6 contains it
  and C2-S6 does not. The lesson is specific and reusable: **when cluster X's prose asserts what cluster Y's
  steps contain, verify against Y's steps, never against X's assertion** — the Y seat never reads X.
- **I nearly rated B5 non-blocking** on the grounds that deployment procedure is out of the slice. It is not:
  `C1-S9` writes the outage into a test, so the plan actively pins it.

## Dead ends — do not re-derive these

- `core.enforce_erasure_barrier` is **not** a backstop for publication: its trigger list
  (`0040:4238-4245`) covers 14 tables and includes neither `serve.publication_snapshot` nor
  `core.run_visibility_event`. I spent ~8k tokens hoping it was.
- `identity.audit_event.actor_key_ref` is plain `text NOT NULL CHECK (length(btrim(…))>0)`
  (`0030_identity_foundation.sql:122`), so ADR-0026's literal actor is schema-legal. The problem is the
  REVOKE, not the column.
- `SV-2`'s `git diff … -- apps/ui` pathspec is **correct** from the lane (positive control: 26 files on
  `9da10917`). The TOOLING-TRAPS:873 form is the git-root-prefixed one; the plan already avoids it.
- The generated contract (`packages/contract/generated/openapi.json`) is route-shaped only — adding
  `publish_pending` does not move it, and no test compares it. The generated-client trap still applies to a
  fresh lens worktree (N4), but not to the C2 build.
- Two files share migration number `0061` (and `0025`); `migrate()` sorts by filename, so 0066/0067/0068 are
  safe. The packet's constant was true.

## Where this packet fought me, exactly

- `ARCH-REV-S01.md:17` requires "your own both-ways trace parser" and "every cluster command re-run by YOU at
  base from a `.sh` file, inline and scripted". Both delivered — but the clause reads as three independent
  obligations and is actually four (scripted, inline, parser, disagreement count). I wrote the disagreement
  count as a line of prose because nothing said where it goes. **Name the artifact, not the activity.**
- `:15` allows a `scratch` directory *and* the probe directory, with `scratch` nested inside the probe
  directory. I used it for one mutant file. The nesting means "copy any probe worth keeping" (reviewer §7) is
  ambiguous about whether scratch is kept. I kept everything; it is 8 files.
- `:20` lists eight distinct finding-shapes in one sentence (the step a stranger cannot check, the command
  that condemns correct input, the cluster that cannot go green, the forgotten screen, the production step
  with no RED case, the unqualified rejection oracle, the done-criterion needing a later step, the raw count
  as membership oracle). I worked it as a checklist and it was the most valuable line in the packet — **it
  should be a numbered checklist in the reviewer SKILL, not prose in a packet**, so every review answers all
  eight explicitly and the orchestrator can see which ones a reviewer skipped.
- `:28` says ARCH-S01 "already reported four defects — find the ones it did not". Excellent charge, and it
  cost nothing: the four are in a ticket comment I was told to read anyway.

## Toward the one-prompt machine — ranked by tokens saved per unit of work

1. `citations-check.sh` (every `` `path:line` `` in a planning artifact, printed). Saves ~40k tokens per
   planning review and makes citation drift impossible to ship.
2. The **guard-parity table** for any plan that forks or replaces a `SECURITY DEFINER` function. Saves a whole
   rework round (four of five blocking findings here).
3. Generate §1.1 from the step bodies instead of hand-writing it. Saves the reviewer one join and closes the
   "file nobody owns" class permanently.
4. A packet-check assertion that every named line-span contains the string its charge depends on. Kills P5 and
   P6 at dispatch.
5. Replace "run it inline as well" with "mutate the gate and show it fails". Same token cost, strictly more
   information.
6. Put the eight finding-shapes of `:20` into `heartbeat-reviewer` as a numbered checklist the verdict must
   answer line by line. Makes a review comparable across seats — today two reviewers can be equally diligent
   and produce incomparable artifacts.

Wall clock: ~35 minutes, of which ~14 were two background suite rounds. No rework rounds, no retries, no
blocked commands. Lane left at `5b6cc9b1`, 0 dirty; no git write; nothing opened on V's desktop.

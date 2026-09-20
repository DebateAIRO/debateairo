# SELF-REPORT — REQ-FIX-02 · mission `free-public-debates` · node REQ-FIX, pass 2

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-FIX-02 — the REQ-01 seat resumed, context intact. Wall clock packet-open to READY: ~28
minutes. 1 new skill, 12 file reads, 11 shell calls, 18 mutants, 0 escaped. REQ-01's own report
(`REQ-01.md`) is not repeated here; this is the second death.

---

## 1. Cause of death: I wrote V's walk from the routes and never opened the request schemas

B3 is the whole case. Eleven of sixteen acceptance steps could not produce the status they named,
because `POST /v1/asks`, publish, unpublish and delete all take `.strict()` bodies and my walk named
two keys out of eleven, omitted `warning_acknowledged` and `copies_may_persist_acknowledged`
entirely, invented a grant action called "erase" where the enum says `DELETE_PRIVATE_DEBATE`, and
never gave the step-up body at all. Every one of those literals lives in **one file I never opened
at pass 1**: `packages/contract/src/index.ts`. I opened `apps/api/src/index.ts` nine times for status
codes and treated the request side as somebody else's problem.

**CAUSE, not symptom:** I treated an acceptance step as a statement about the *response*. It is a
statement about a *round trip*, and the request half of a round trip is a contract file, not a route
file. PRICE: one REQ-REV dispatch plus this REQ-FIX dispatch — on my estimate 60–90k tokens and ~50
minutes of fleet wall-clock, for a defect that one file read would have prevented.

**Second death, same autopsy: B1.** R-4 carried the carve-out "`terminal` other than `BLOCKED`". R-8
and R-9 were written in a later sitting and neither repeated it, so R-9's general clause ("`PRIVATE`
with nothing outstanding is a violation") forbade exactly the state R-8 demanded for a BLOCKED run.
The cause is one missing noun: my vocabulary block defined **bound** and never defined the
sub-population **publishable**, so the carve-out had no name to travel under and had to be retyped
by hand at each site — and was not. The class sweep found three members, not one: R-9 (the finding),
R-5 ("the publication appears exactly once" presumes every bound run has one) and R-7 (points at
R-9's pending state, which a BLOCKED run must not reach). R-4 was already clean.

**Third: B2.** I wrote "the distinction is made in a field a test names" — deliberately, to avoid
designing ARCH's mechanism. That was the wrong side of the line. When the observable *is* the wire,
naming it is requirements work; leaving it open ships two incompatible builds, and the reviewer
counted four candidates. PRICE: the smallest of the three to fix, the easiest to repeat.

## 2. What I nearly got wrong this pass

1. **I nearly ran the reviewer's `probe.sh` because my packet told me to.** Its third line is
   `exec > >(tee "$OUT")` — running it rewrites `probes/REQ-REV-01/probe.out`, which is outside my
   allowed list and is the evidence behind the verdict I am answering. Caught by reading the script
   before running it. I re-implemented P9 and P10 inline instead. This is a standing trap: "re-run
   the reviewer's probe" and "cross no file contract" collide whenever a probe writes its own output.
2. **I nearly took the reviewer's cheaper B2 remedy.** Moving the pending signal off the wire has no
   back-compat risk and is a smaller build. Re-reading intake C5's actual words — the debate must
   never be *served* as private by choice — showed it does not discharge V's default, because the
   owner's own read would still say plain `PRIVATE`. I took the costlier build and wrote a V-ROW so V
   can take the cheap one knowingly.
3. **My own checker passed on its first run with two dead assertions.** Two needles spanned a
   markdown hard wrap, so they could never match, and the script still printed PASS. Flattening
   whitespace turned them into real assertions and instantly exposed a **banned word in my own
   SPEC-v2** — "pre-handler" contains "handle". A checker whose needle spans a line break is a
   decoration; mine was, for about four minutes.
4. **I nearly edited DECISIONS.md in place** to re-point its SPEC references, which the packet
   requires and also forbids (§3 below).

## 3. Counts I was given, and what I found

The packet orders me to re-measure any count a finding hands me. Both were short:

- Verdict B3.1 says `AskRequestSchema` has **ten** required keys. It has **eleven**
  (`packages/contract/src/index.ts:109-119`, none optional). My walk now lists eleven; had I copied
  the verdict's number, V's first POST would still 400.
- Verdict B3 lists **five** members. I found **six**. The sixth: the step-up *response* nests the
  token at `step_up_grant.token`, while the publish/unpublish/delete *request* field `step_up_grant`
  is a bare 43-character string. Pasting the response object is a 400 — the same failure the finding
  is about, one level deeper.
- N3 names the CSRF pair. The same condition also requires an exact `origin` header
  (`apps/api/src/index.ts:504`); a curl without it is the same 403. Two members, not one.
- N2 names one way an old snapshot disappears (a REQUIRED key). `readPublicDebate` also returns null
  when the snapshot's `public_ref` or `published_at` fails revalidation
  (`apps/api/src/publications.ts:397-398`) — so a system publish writing `published_at` from a
  different clock disappears identically. Folded into R-22 as the second member of one class.

## 4. Where THIS packet was unclear — exactly

- **`REQ-FIX-02.md:20` vs `:16`.** :20 orders me to re-run the reviewer's handed-over probe; :16
  makes my allowed list exhaustive and the probe writes into a directory outside it. Unobeyable as a
  pair. I obeyed :16.
- **`REQ-FIX-02.md:20`, "write the check as a script and hand it forward"** — with no allowed path to
  put it. The convention is `.hermes/reports/<m>/probes/<seat>/`; my allowed list has no such entry. I
  put it at `slices/S01/spec-v2-check.sh`, which is allowed and is genuinely handed forward, and said
  so in DECISIONS §6.
- **`REQ-FIX-02.md:11` vs `:17`.** :11 says DECISIONS.md is "appended (never rewritten)"; :17 requires
  every reference pointing INTO a SPEC to be re-pointed at the new version. DECISIONS §1 and §4 point
  at the SPEC. I discharged both by appending a §5 that re-points, rather than editing in place — but
  the packet should say which law wins.
- **`REQ-FIX-02.md:11`** requires line 4 to name "every requirement changed". Seven requirements plus
  a rewritten §4 makes line 4 a ~200-word single line. A fenced block would be read; a 200-word line
  is skimmed, which is the exact failure mode the 100-line compass rule exists to prevent.

## 5. Upgrades, ranked by tokens saved

1. **A REQ rule: open the request schema before writing an acceptance step.** One line in
   `heartbeat-requirements`: an acceptance step names the route, the exact body, and the exact success
   status, each cited `path:line` from the contract package. B3 was 11 of 16 steps and cost the whole
   rework. *Saves ~60–90k tokens per REQ node that would otherwise be reworked.*
2. **Name every sub-population in the vocabulary block.** B1 existed because "bound" silently covered
   two populations and only one requirement carved it out. A lint is possible: every requirement whose
   subject is a defined noun must name the sub-population it governs. *Saves the second-largest
   finding class, and it is the one a reviewer needs a fixture to find.*
3. **Ship the checker with the spec, and require the mutant table in the handoff.** Mine found two
   dead assertions and a banned word in my own file within four minutes of being written. Make
   "mutants killed / escaped" a line of the eight-line handoff. *Cheap, and it converts review from
   re-derivation into re-execution.*
4. **Flatten whitespace in every text assertion, everywhere.** Markdown wraps prose; a needle that
   spans a wrap is a silent pass forever. One line of code; it caught a real defect here.
5. **Split packet lists into "allowed writes" and "protected paths".** Then "re-run the reviewer's
   probe" cannot read as permission to overwrite a verdict's evidence, and a probe can be handed
   forward with a home.
6. **Make "re-measure every count a finding hands you" a checklist item, not a paragraph.** Two of the
   four counts I was given were short. One `grep -c` each.

## 6. What I did not verify

Every §4 step against a live `$API` / `$WEB`: the stack is no-touch and nothing was served, so the
walk is verified as text against the schemas at `3f374361` and **UNVERIFIED as executed**. No suite
was run (REQ writes no code); SPEC-v2 §3 cites the intake baseline rather than re-measuring it. The
reviewer's `probe.sh` was not executed, for the reason in §2.1. PLAN.md §1 still carries three empty
cluster rows, so there was no cluster command to re-run.

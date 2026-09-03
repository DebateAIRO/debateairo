# GOAL PACKET — ARCH-01 · ARCHITECTURE loop · seat: Claude

**Mission:** `public-debate-access` · **Board:** `public-debate-access` (port 9119)
**Your ticket:** `t_f864a84b` · **Rework rounds: max 3.** No token budget. Round 4 does not exist.

V chose a dedicated Claude architecture seat at intake, specifically so that neither the
seat that wrote the SPEC (Grok, who also holds QA) nor the seat that will write the code
(Codex) authors the plan they are judged against. You decide **HOW**. You never decide WHAT.

## 1. Load and read, in this order

Use the **Skill tool**: `heartbeat-protocol`, then `heartbeat-architecture` (your contract).
Then `superpowers:brainstorming` BEFORE you commit to a direction, then
`superpowers:writing-plans`. A plan written before the direction is settled gets rewritten.
The whole Superpowers library is open to you.

Then read:
1. `docs/missions/public-debate-access/INTAKE.md` — measured ground truth. **Read its
   CORRECTIONS LOG at the bottom; three claims were corrected after a blind review, one of
   them load-bearing.**
2. `docs/missions/public-debate-access/INSTRUCTIONS.md` — the compass
3. `docs/missions/public-debate-access/slices/S0{1,2,3,4}/SPEC.md` — **FROZEN. You never edit
   these.** A step that needs the spec to move goes up as a proposed new spec version.
4. `.../slices/S0{1,2,3,4}/DECISIONS.md` — settled choices are settled. Re-litigating one is
   the failure your contract exists to prevent.
5. `docs/missions/public-debate-access/V-DECISIONS-PACKET.md` — **four OPEN rows. Read the
   "Meanwhile" line on each: that is what you design to.** Do not block on them and do not
   pre-empt V's answer.
6. `.hermes/TOOLING-TRAPS.md` — read it. Two seats have now paid for skipping it.

## 2. The one technical fact most likely to make you design the wrong thing

Publications are **frozen encrypted snapshots**, and back-compat has a precise mechanism
that an earlier version of INTAKE got WRONG:

> The trap is **REQUIRED KEYS + `catch → null` + handler `null → 404`**. It is **NOT**
> `.strict()`. Measured under the same `.strict()`: current shape → 200 · widened OPTIONAL →
> 200 · widened REQUIRED → 404 · unknown EXTRA key → 404.

**Removing `.strict()` does not make a required-field widen safe.** These are two separate
footguns: required keys break OLD snapshots; `.strict()` breaks UNKNOWN keys. If your plan
touches the envelope, say explicitly which of the two each step is defending against.

## 3. What you produce

- **PLAN.md steps for every slice — NO LINE CAP.** Write as many steps as the slice has.
  Never merge two steps to shorten a file: a merged step is an unverifiable step. Every step
  passes the stranger test — markable done/not-done with no judgement call — and names its
  cluster, its acceptance test, and its file surface. Banned in acceptance criteria:
  improve, better, robust, handle, appropriate.
- **The cluster map.** Cluster ids are already reserved in each PLAN skeleton (`S01-C1`…).
  Fill membership. Each cluster gets ONE verification command and is verifiable independently.
  A cluster nobody can verify in one command is cut wrong — recut it and say why.
- **Module boundaries and DDD impact**, stated in the plan: which bounded contexts each slice
  touches, which invariants it owns, what it must NOT touch (the `forbidden` set the worker
  packets will carry). **Single-writer rule: no two concurrent slices own the same file.**
  S03 touches `apps/ui/app/page.tsx`; check nothing else does before you parallelize it.
- **DECISIONS.md entries — every choice, appended same day**, one line each: date, question,
  choice, reason, who ruled. A choice not written down will be re-litigated by a later
  session, and that is your defect, not theirs.
- **An ADR** only if a decision outlives the mission (new dependency, new boundary, new
  protocol) → `docs/architecture/01-decisions/`. Mission-local law stays in DECISIONS.md.
- **The mission graph** (planning-graph gate, spine v3.2.0 item 5): nodes, edges, lanes,
  worktrees, merge order → `.hermes/reports/public-debate-access/mission-graph.svg`.
  **V's yes on that image gates programming.** Hand it to the Router with the lane plan.

## 4. Decisions this mission has NOT made, that are yours

- **Pre-widening publications** (V packet Row 2): migrate/re-encrypt, require re-publish, or
  serve legacy answer-only with typed absence. Exactly 1 publication exists. The fleet has
  banned two outcomes on its own authority: a silent 404, and a silent answer-only page that
  looks like parity but is not. Choose among the rest and record it. Escalate to V only if
  you judge it a product question rather than a technical one.
- **Where the public list lives** — a section on `/`, a `/public` route, or both. V asked for
  selectable buttons; the routing shape is yours. Consider deep-linking and shareability:
  a published debate people cannot link to is not "accessible".
- **How read-parity is achieved** for S02 — sharing the owner's components behind a
  read-only mode, versus a parallel public component tree. Say what each costs.

## 5. Refute your own plan before handoff

For each step: name the concrete failure its acceptance criterion WOULD catch, and one it
would NOT — so the boundary is explicit. For each cluster: name the mutant class its
verification command detects. **A plan whose steps cannot fail is not a plan; it is a wish
list.** Check the SPEC↔PLAN trace both ways: every step traces to a SPEC sentence, every SPEC
requirement is covered by ≥1 step. A contradiction between SPEC requirements STOPS the plan
and goes up as a V DECISIONS PACKET row — never discovered independently by N seats later.

Remember the three-run law when you write verification commands: each cluster's command runs
THREE times and the WORST run is the verdict. Green-green-red is RED. Write commands that are
deterministic enough for that to mean something.

## 6. Bounds

You write **no product code and run no product tests**. You may READ anything and run
read-only probes. Contested product questions (anything 2-1 among seats, anything touching
V's stated preferences) go up the lattice with your recommendation attached — never decided
here. Do not gold-plate: a plan is finished when every step is mechanically checkable, not
when every future is designed.

## 7. Your file contract

**allowed (write):**
- `docs/missions/public-debate-access/slices/S0{1,2,3,4}/PLAN.md`
- `docs/missions/public-debate-access/slices/S0{1,2,3,4}/DECISIONS.md` (APPEND only)
- `docs/architecture/01-decisions/**` (only if an ADR is genuinely warranted)
- `.hermes/reports/public-debate-access/mission-graph.svg`
- `.hermes/reports/public-debate-access/agent-reports/ARCH-01-claude.md` ← your self-report

**forbidden (write):** every `SPEC.md` (frozen) · every `PROGRESS.md` (orchestrator is sole
writer — put it on the ticket instead) · `INSTRUCTIONS.md` · `INTAKE.md` · all product code
and tests.

## 8. Output skeleton — exact heading strings, in this order

```
## SUMMARY
## CLUSTER MAP
## SPEC↔PLAN TRACE
## BOUNDARIES AND SINGLE-WRITER
## REFUTATION TABLE
## DECISIONS APPENDED
## OPEN FOR V
## COMMENTS READ THROUGH
```

`## CLUSTER MAP` is `| cluster | steps | ONE verification command | file surface |`.
`## REFUTATION TABLE` is `| step | failure it CATCHES | failure it MISSES |`.

Claim tags on every assertion: `MEASURED` (quote the command) · `READ` (cite file:line) ·
`INFERRED` · `UNVERIFIED`. **UNVERIFIED is a valid, respected answer.** An unlabelled
assertion is a defect.

## 9. Self-report — binding, before your final handoff

File `.hermes/reports/public-debate-access/agent-reports/ARCH-01-claude.md`. No FULLY DONE
without it. The question it answers, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What
> we must upgrade. what repeatedly costed us tokens. how we can make the coding more
> efficient. How can we turn this into a one prompt machine even better.

Name the CAUSE, not the symptom. PRICE each finding. Say what you NEARLY got wrong. Name DEAD
ENDS so nobody re-derives them. Say exactly where THIS packet was unclear — that is a finding
against the Router and it is wanted.

## 10. Decorrelation — this weakens you, so guard against it

**You, the Router, and the SPEC reviewer are all Opus 5.** V chose that knowingly. Same-model
lenses decorrelate by PROMPT ONLY, which is weaker than model diversity. The concrete risk:
you find the Router's INTAKE persuasive because it is the reasoning you would have produced.
Two of its claims were already corrected after a blind Grok lens refused to take them on
trust. **Where you rely on an INTAKE claim for a load-bearing step, verify it yourself and
tag it MEASURED with your own command** — not READ-from-INTAKE.

Your plan is reviewed by **Grok**, which did not write it. Expect it to probe for a step it
cannot mechanically verify. Leave none.

## 11. Return rule

Return control at `READY FOR PEER REVIEW`, a genuine blocker, or an IMPORTANT OPERATION, but
keep the session alive and resumable. Silence is normal. Post your handoff with:

```
hermes kanban --board public-debate-access comment t_f864a84b "<your handoff>"
```

Board flag BEFORE the verb. Never `boards switch`.

**Board scoping:** in contract = your ticket `t_f864a84b`, plus `t_5c7a1e7f` (requirements)
and `t_2a279210` (the SPEC review whose findings you inherit). A worktree makes you blind to
files, not to the board — if you read something outside that set, disclose it.

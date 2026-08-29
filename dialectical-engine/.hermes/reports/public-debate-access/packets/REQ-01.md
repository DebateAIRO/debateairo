# GOAL PACKET — REQ-01 · REQUIREMENTS loop · seat: Grok

**Mission:** `public-debate-access` · **Board:** `public-debate-access` (Hermes, port 9119)
**Your ticket:** `t_5c7a1e7f` · **Repo root:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
**Rework rounds: max 3.** There is no token budget and no round 4 — after round 3 the item
goes up as a V DECISIONS PACKET row. Do not ration your reading against a budget; ration it
against the stopping rule in §5.

## 1. Read these first, in this order (all paths absolute, all verified to exist)

You cannot invoke the Skill tool. Every file below is plain markdown — read it with your
file reader.

1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-requirements/SKILL.md`  ← **your contract**
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/public-debate-access/INTAKE.md`  ← **measured ground truth; do NOT re-derive it**
4. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md`  ← **read it. The Router skipped it and paid 3 probes.**
5. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/grok-heartbeat-orchestrator.md` (your seat law)

**Superpowers is open to you in full** — read as markdown under
`/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/<name>/SKILL.md`.
At minimum read `brainstorming/SKILL.md` BEFORE you write SPEC.md: a spec frozen on an
unexplored premise is frozen wrong. `writing-plans/SKILL.md` is useful for the PLAN
skeleton. Reaching past these is expected, not an exception.

## 2. The mission (V's words, verbatim)

> We need our published debates to be fully accessible to anyone, including people who have
> not logged in or created an account. Visibility wise, the "Your Debates" section will be
> selectible, with a new section called "Public Debates" present. Clicking "Your Debates"
> takes the user to their own debates. "Public Debaets" will make the debates that were
> already published visible and accessible.
>
> What Done looks like :
> 1. Your Debates, Public Debates buttons are present, and accessible
> 2. clicking either will show the user their debates/the public debates
> 3. public debates can be accessed just the same as the user's own debates.

**V's binding ruling on criterion 3** (Router asked at intake; answered 2026-08-29):

> public debates are always opened as a user's own. Same UI options, you can see the
> verdict, the arguments, and et cetera.

This is FULL PARITY and it deliberately reverses a narrowing the security mission shipped.
It is settled. Do not re-litigate it; record it in DECISIONS.md as V's ruling.

## 3. What you produce (and nothing else)

- `docs/missions/public-debate-access/INSTRUCTIONS.md` — the compass. **HARD CAP 100 lines.**
  Pointers, never content. If you are writing detail, you are in the wrong file.
- `docs/missions/public-debate-access/slices/<CODE>/SPEC.md` — **frozen at creation.** What
  is built, not how. Once written, no agent edits it — you included.
- `.../slices/<CODE>/PLAN.md` — **skeleton only.** You create the file with the SPEC-trace
  headings and the quantifiability law. The architecture seat authors the steps. Do NOT
  write steps.
- `.../slices/<CODE>/PROGRESS.md` — create the file with its headings. **The orchestrator is
  its only writer.** Leave it empty of content.
- `.../slices/<CODE>/DECISIONS.md` — append-only. Every choice + why + who ruled. Seed it
  with V's criterion-3 ruling above and the Router's §4 working assumption.

Slice codes are yours to choose. The Router's measured view — **a proposal you may reject
with a stated reason, not an instruction** — is that the work separates into: the published
envelope + publish path (contract/API), the public read page reaching UI parity, the
Your/Public selectable navigation, and the anonymous-exposure review. If your reading of the
evidence gives a better cut, take it and say why in DECISIONS.md.

## 4. The Router's working assumption you must record (do not silently widen or narrow it)

"Same UI options" is read as **every READ affordance**, not every mutation. An anonymous
visitor is NOT granted delete, unpublish, or replay-generation — replay spends real model
calls, and delete/unpublish would let any stranger destroy V's debate. View toggles, the
argument tree, node cards, scoring diagnostics, the honesty drawer and export are read
affordances and ARE in scope. This is on the V DECISIONS PACKET as a confirm row. Write it
into DECISIONS.md as an assumption attributed to the Router, not as a V ruling.

## 5. Stopping rule for research (you are a research seat — this is your bound)

Stop when every SPEC sentence traces to either (a) a fact already in INTAKE.md, or (b) a
file you have read or a command you have run and recorded. You may measure, but every
measurement you make is written down with the exact command that produced it, so the next
seat never repeats it. **You are not required to read the whole repo** — INTAKE.md exists
so you do not have to. If you find INTAKE.md is WRONG about something, that is a finding:
say so loudly with the command that disproves it. That is worth more than a clean spec.

## 6. Output skeleton — exact heading strings, in this order

```
## SUMMARY
## SLICE TABLE
## SPEC↔PLAN TRACE
## CONTRADICTIONS
## FILES WRITTEN
## VERDICT BLOCK
## COMMENTS READ THROUGH
```

`## SLICE TABLE` is `| code | name | what Done means | files touched |`.
`## CONTRADICTIONS` should be empty; if it is not, STOP and route it up — never resolve a
requirement conflict yourself.

Every item in `## VERDICT BLOCK` carries all three lines, and **UNVERIFIED is a valid,
respected answer** — say it rather than reaching:

```
VERDICT: <claim>
CONFIDENCE: <high|medium|low|UNVERIFIED>
STRONGEST COUNTER: <the best argument against your own verdict>
```

Claim tags for anything you assert: `MEASURED` (you ran it — quote the command) ·
`READ` (you read it — cite file:line) · `INFERRED` (reasoning, not observation) ·
`UNVERIFIED` (you could not check). An unlabelled assertion is a defect.

## 7. Your file contract

**allowed (write):**
- `docs/missions/public-debate-access/INSTRUCTIONS.md`
- `docs/missions/public-debate-access/slices/**`
- `.hermes/reports/public-debate-access/agent-reports/REQ-01-grok.md`  ← your self-report

**read:** the whole repo. **forbidden (write):** everything else — no product code, no
tests, no API, no UI, no `INTAKE.md`. You write requirements, not software.

## 8. Self-report — binding, before your final handoff

File `.hermes/reports/public-debate-access/agent-reports/REQ-01-grok.md`. You do not reach
FULLY DONE without it. This is the question it answers, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What
> we must upgrade. what repeatedly costed us tokens. how we can make the coding more
> efficient. How can we turn this into a one prompt machine even better.

A case file, not a diary. Name the CAUSE, not the symptom. PRICE each finding in wall-clock
and retries. Say what you NEARLY got wrong. Name DEAD ENDS so nobody re-derives them. Say
exactly where THIS PACKET was unclear — that is a finding against the Router and it is
wanted. An anodyne self-report is worse than none: it makes an empty record look full.

## 9. Review route and roster decorrelation

Your SPEC is reviewed by a **Claude reviewer seat**, not by you and not by another Grok
seat — you also hold the QA loop on this mission, and §2.1 forbids reviewing your own
homework. The Router's packets (including this one) are reviewed by a Grok seat on
`t_a12687d5`; if THIS packet is defective, that is a finding against the Router.

**Decorrelation, stated on the record:** the architecture seat and the SPEC reviewer are
both Claude (Opus 5), as is the Router. V chose the Claude architecture seat knowingly at
intake. Same-model lenses decorrelate by PROMPT ONLY, which is weaker than model diversity
— so weight Grok's independent findings accordingly and say so if you think a Claude seat
is echoing the Router.

## 10. Return rule

Return control at a spine handoff (`READY FOR PEER REVIEW`), a genuine blocker, or an
IMPORTANT OPERATION, but keep the unfinished goal/session alive and resumable. Silence is
normal; unchanged state needs no message. Termination requires the spine's goal-specific
FULLY DONE condition. Post your handoff as a comment on `t_5c7a1e7f` with:

```
hermes kanban --board public-debate-access comment t_5c7a1e7f "<your handoff>"
```

Board flag goes BEFORE the verb. Never `boards switch`.

# GOAL PACKET — REV-00 · PACKET REVIEW · seat: Grok (blind lens)

**Mission:** `public-debate-access` · **Board:** `public-debate-access` (port 9119)
**Your ticket:** `t_a12687d5` · **Repo root:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
**Rework rounds: max 3.** No token budget. Round 4 does not exist.

You review the ORCHESTRATOR, not a worker. The Router wrote the mission intake and the
requirements packet and **cannot review its own homework (§2.1)**. Every defect you find in
them is a finding against the Router and it is wanted. This is the cheapest round in the
mission: a wrong measured claim here freezes into a SPEC and costs a full seat cycle later.

## 1. Read these first (absolute paths, all verified to exist)

You cannot invoke the Skill tool. All of these are plain markdown.

1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md`  ← **your contract**
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md`
4. **UNDER REVIEW:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/public-debate-access/INTAKE.md`
5. **UNDER REVIEW:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/public-debate-access/packets/REQ-01.md`

Superpowers in full, as markdown, under
`/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/<name>/SKILL.md`.
At minimum `verification-before-completion/SKILL.md`. Reaching past it is expected.

## 2. Your job: PROBE the Router's claims, do not read and nod

`INTAKE.md` is a table of MEASURED claims with file:line citations. **Re-run them yourself.**
Every high-value verdict in this fleet came from a reviewer running its own probe; every
embarrassment came from one reading the author's evidence and agreeing. Your default posture
is to REFUTE.

Claims worth attacking hardest, because the whole mission shape rests on them:

- **"`AnswerSchema` ALREADY carries `nodes` and `edges` at packages/contract/src/index.ts:495-496."**
  If this is false, the mission needs a data source it does not have and the slicing is wrong.
- **"Adding a REQUIRED field to `PublicDebateSchema` makes already-published debates silently
  return 404."** This is the Router's INFERENCE from `.strict()` + `catch { return null }` in
  `apps/api/src/publications.ts`. **It is not measured.** Can you actually demonstrate it —
  or refute it? A three-run experiment beats an argument here.
- **"Anonymous `GET /v1/public/debates` returns 200"** and **"`/` renders for a logged-out
  visitor"**. Re-probe both. Say what you ran.
- **"total published = 1."** Re-count it.
- **"No public LIST route exists"** and **"the two headings are not selectable controls"**.
- Every file:line citation in INTAKE.md — check the line numbers actually say what is claimed.

## 3. Also review the REQ-01 packet as a packet (reviewer contract §1)

- Does every mandatory deliverable it demands fall inside the `allowed` list it grants?
  (A required output outside `allowed` is a defect.)
- Do all its absolute paths resolve?
- Does it carry `rework rounds: max 3`, the self-report path inside `allowed`, and the
  self-report instruction VERBATIM?
- Does it state a stopping rule for a research seat?
- Does it smuggle in an unstated decision — anywhere the Router decided something that
  should have gone to V or to the requirements seat?
- **Is the Router's §4 "read affordances, not mutations" assumption labelled as an
  ASSUMPTION rather than as a V ruling?** If the packet blurs those, that is a finding.

## 4. Findings and verdict

Number them: `B1, B2…` blocking · `N1, N2…` non-blocking. **Non-blocking does not mean
optional** — every N-finding demands a fix and must land on a ticket; the tier only sets
WHEN. For each finding: the file, the line, the failure scenario as concrete inputs → wrong
outcome, and the evidence that convinced you.

Verdict is exactly one of **PASS** · **REWORK** (numbered findings) · **BLOCKED** (say why).
Never "pass with concerns" — concerns are N-findings. State what you verified and HOW, with
probe output VERBATIM, and state what you did NOT verify so the next lens knows the gaps.

End with one paragraph of **PREDICTIONS**: what you expect the requirements seat (also Grok,
running blind on `t_5c7a1e7f`) got wrong, and what you would check first. This is falsifiable
evidence that blindness held.

## 5. Output skeleton — exact heading strings, in this order

```
## SUMMARY
## PROBES RUN
## FINDINGS
## VERDICT
## NOT VERIFIED
## PREDICTIONS
## COMMENTS READ THROUGH
```

Claim tags on every assertion: `MEASURED` (quote the command) · `READ` (cite file:line) ·
`INFERRED` · `UNVERIFIED`. **UNVERIFIED is a valid, respected answer** — say it rather than
reaching. An unlabelled assertion is a defect.

## 6. Your file contract

**allowed (write):** `.hermes/reports/public-debate-access/agent-reports/REV-00-grok.md` ←
your self-report. Post your verdict as a ticket COMMENT, not as a file.
**read:** the whole repo. **forbidden:** editing anything under review, any product code,
any test, any mission doc. You write no product code and you mark nothing Done.

## 7. Self-report — binding, before your final handoff

File `.hermes/reports/public-debate-access/agent-reports/REV-00-grok.md`. No FULLY DONE
without it. The question it answers, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What
> we must upgrade. what repeatedly costed us tokens. how we can make the coding more
> efficient. How can we turn this into a one prompt machine even better.

Name the CAUSE, not the symptom. PRICE each finding. Say what you NEARLY got wrong. Name
DEAD ENDS. Say exactly where THIS packet fought you.

## 8. Blindness and decorrelation

You are a BLIND lens: no contact with the requirements seat on `t_5c7a1e7f`, even though it
is also Grok. Do not read its log or its in-progress files to "check consistency" — that
destroys the independence your verdict is worth. **On the record:** the architecture seat,
the SPEC reviewer and the Router are all Claude (Opus 5); V chose that knowingly at intake.
Same-model lenses decorrelate by prompt only, which is weaker than model diversity — so if
you think a Claude seat is merely echoing the Router, say so plainly.

## 9. Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the session alive and resumable. Silence is normal. Post your verdict with:

```
hermes kanban --board public-debate-access comment t_a12687d5 "<your verdict>"
```

Board flag BEFORE the verb. Never `boards switch`.

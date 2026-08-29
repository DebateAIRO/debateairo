# GOAL PACKET — REV-02 · PLAN REVIEW · seat: Grok (blind lens)

**Mission:** `public-debate-access` · **Board:** `public-debate-access` (port 9119)
**Your ticket:** `t_7ee9aed5` · **Rework rounds: max 3.** No token budget. Round 4 does not exist.

You review the ARCHITECTURE seat's plan. It did not write the SPEC and you did not write the
plan, so the diamond is intact (§2.1). V has approved the lane plan, so programming starts on
whatever survives you — **a step you let through unverifiable becomes Codex's problem and then
QA's.**

## 0. NEW LAW — your handoff OPENS with this line

> `SKILLS LOADED: <every skill you actually loaded, comma-separated>`

No seat reaches FULLY DONE without it (spine v3.3.0 item 15, `heartbeat-protocol` §3b). Naming
a skill you did not load is a fabrication finding. Falling short of your floor is a finding you
declare yourself — an honest shortfall costs a line, a hidden one costs a round. The
orchestrator verifies this by checking the skill BODY reached you, not the path.

## 1. Read these first (absolute paths, verified to resolve)

You cannot invoke the Skill tool. All of these are plain markdown.

1. `WORKTREE/.claude/skills/heartbeat-protocol/SKILL.md`
2. `WORKTREE/.claude/skills/heartbeat-reviewer/SKILL.md` ← your contract
3. `WORKTREE/docs/missions/public-debate-access/INTAKE.md` — measured ground truth; **read its
   CORRECTIONS LOG**, three claims were corrected after a blind review
4. `WORKTREE/docs/missions/public-debate-access/INSTRUCTIONS.md`
5. **UNDER REVIEW:** `WORKTREE/docs/missions/public-debate-access/slices/S0{1,2,3,4}/PLAN.md`
6. Context (NOT under review, do not re-litigate): the same slices' `SPEC.md` (FROZEN — S02 is
   v2, `SPEC-v1.md` is the archived original) and `DECISIONS.md`
7. `WORKTREE/docs/missions/public-debate-access/V-DECISIONS-PACKET.md` — **four rows are now
   CLOSED by V ruling. A plan step contradicting a closed row is a blocking finding.**
8. `WORKTREE/.hermes/TOOLING-TRAPS.md` — read it. Three seats have now paid for skipping it.

Superpowers in full as markdown under
`/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/<name>/SKILL.md`.
At minimum `verification-before-completion/SKILL.md`. Reaching past it is expected.

## 2. What you are judging

The architecture contract's own tests — apply them mechanically:

- **The stranger test.** Can a stranger mark every PLAN step done or not-done with NO judgement
  call? Your job is to find one that cannot be. Leave none.
- **Banned acceptance words** anywhere a criterion is stated: improve, better, robust, handle,
  appropriate. Those words mean the seat had not finished deciding.
- **One verification command per cluster, genuinely independent.** A cluster nobody can verify
  in one command is cut wrong. Actually TRY the commands where you can.
- **SPEC↔PLAN trace both ways.** An uncovered SPEC requirement and an orphan PLAN step are
  different defects; report them differently.
- **Single-writer rule.** No two slices own the same file. S03 claims `apps/ui/app/page.tsx` —
  check nothing else touches it.
- **The refutation table.** Every step should name a failure its test CATCHES and one it MISSES.
  A step whose test cannot fail is a wish, not a step.
- **Three-run law.** Verification commands must be deterministic enough for worst-of-three to
  mean something. Flag any command whose result could differ by clock, pool size or parallel load.

## 3. V's four closed rulings — a plan contradicting these is BLOCKING

- **Row 1 CLOSED:** reads yes, mutations no. Anonymous visitors get every READ affordance; no
  delete, unpublish or replay-generation.
- **Row 2 CLOSED:** the one legacy publication serves **disclosed answer-only** with an honest
  typed label. A silent 404 and a silent answer-only page are BOTH banned.
- **Row 4 CLOSED:** `cost_envelope` and `tier_provenance_ref` stay EXCLUDED from the public
  envelope. A plan step that carries either into the envelope is a blocking finding.
- **Row 5 CLOSED:** V approved the lane plan; programming follows this review.

## 4. Probe, never read and nod

Your default posture is REFUTE. The highest-value targets, because everything downstream rests
on them:

- **The back-compat design.** The plan uses an optional field plus a `tree_included`
  discriminator. The measured mechanism is REQUIRED KEYS + `catch → null` + handler
  `null → 404` — **NOT `.strict()`**. Does the plan's design actually survive an old-shape
  snapshot? Is there a RED old-shape fixture named as the headline test? Build your own.
- **`ledger_unknown_ref` redaction (S01-C2-0/1/4).** The architecture seat found that this
  required, ledger-adjacent field on `NodeSchema.abstention` would flow into the public envelope
  under copy-nodes-wholesale, and added a redaction step. **Is the redaction actually complete,
  or are there sibling fields it missed?** This is the single most likely place for a real
  security defect in this mission.
- **The parallel public component tree (S02).** The seat chose this over a flag on the 1906-line
  owner client. Does the plan say how parity is kept from drifting between two trees?
- **`?tab=` navigation (S03).** Does it survive deep-linking, and is it keyboard-accessible?
  V's criterion 1 says the buttons must be "present, and accessible".

The dev server is reachable for anonymous probes. **API surface, exactly:**
`curl -sk 'http://127.0.0.1:8790/v1/public/debates?limit=20&offset=0'` — `limit`/`offset` are
REQUIRED (omit → 400); proxy equivalent `https://localhost:3000/api/v1/public/debates?...`; the
bare path on `:3000` is a Next 404, which is the wrong surface, not a broken API.
macOS has no `timeout`: use `perl -e 'alarm N; exec @ARGV' <cmd>`.

## 5. Findings and verdict

`B1, B2…` blocking · `N1, N2…` non-blocking. **Non-blocking does not mean optional** — every
N-finding demands a fix and lands on a ticket; the tier sets only WHEN. For each: file, line,
failure scenario as concrete inputs → wrong outcome, and the evidence that convinced you.

Verdict is exactly one of **PASS** · **REWORK** (numbered findings) · **BLOCKED**. Never "pass
with concerns" — concerns are N-findings. State what you verified and HOW with probe output
VERBATIM, and what you did NOT verify.

## 6. Output skeleton — exact headings, in this order

```
SKILLS LOADED: <list>
## SUMMARY
## PROBES RUN
## FINDINGS
## VERDICT
## NOT VERIFIED
## PREDICTIONS
## COMMENTS READ THROUGH
```

Claim tags on every assertion: `MEASURED` (quote the command) · `READ` (cite file:line) ·
`INFERRED` · `UNVERIFIED`. **UNVERIFIED is a valid, respected answer.**

## 7. File contract

**allowed (write):** `.hermes/reports/public-debate-access/agent-reports/REV-02-grok.md` ← your
self-report. Post the verdict as a ticket COMMENT.
**forbidden:** editing anything under review, any SPEC, any PLAN, any product code or test.

**Board scoping:** in contract = your ticket `t_7ee9aed5` and `t_f864a84b` (the architecture
handoff you are judging). A worktree makes you blind to files, not to the board — if you read
anything outside that set, disclose it in `## NOT VERIFIED`.

## 8. Self-report — binding, before your final handoff

File `.hermes/reports/public-debate-access/agent-reports/REV-02-grok.md`. No FULLY DONE without
it. The question it answers, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

Name the CAUSE, not the symptom. PRICE each finding. Say what you NEARLY got wrong. Name DEAD
ENDS. Say exactly where THIS packet fought you.

## 9. Return rule

Return control at your verdict, a genuine blocker, or an IMPORTANT OPERATION; keep the session
alive and resumable. Post with:

```
hermes kanban --board public-debate-access comment t_7ee9aed5 "<your verdict>"
```

Board flag BEFORE the verb. Never `boards switch`.

# GOAL PACKET — REV-01 · SPEC REVIEW · seat: Claude (blind lens)

**Mission:** `public-debate-access` · **Board:** `public-debate-access` (port 9119)
**Your ticket:** `t_2a279210` · **Rework rounds: max 3.** No token budget. Round 4 does not exist.

You review the REQUIREMENTS seat's output. That seat is Grok, and it also holds the QA loop
on this mission — so it **cannot review its own SPEC (§2.1)**. That is why you exist. You are
a BLIND lens: you have your own worktree, and it deliberately does NOT contain the other
review lens's output. Do not go looking for it.

## 1. Load these first

You are a Claude seat, so use the **Skill tool**: load `heartbeat-protocol`, then
`heartbeat-reviewer` (your contract). Then load `superpowers:verification-before-completion`
at minimum — evidence before assertions, always. The whole Superpowers library is open to
you; reach for `systematic-debugging` or `test-driven-development` if a claim needs it.

Then read, in this order:
1. `docs/missions/public-debate-access/INTAKE.md` — the Router's measured ground truth
2. `.hermes/reports/public-debate-access/packets/REQ-01.md` — the packet that dispatched the work you are reviewing
3. `docs/missions/public-debate-access/INSTRUCTIONS.md` — the compass under review
4. `docs/missions/public-debate-access/slices/S0{1,2,3,4}/{SPEC,PLAN,DECISIONS}.md` — under review
5. `docs/missions/public-debate-access/V-DECISIONS-PACKET.md`
6. `.hermes/TOOLING-TRAPS.md` — **read it. The Router skipped it and paid 3 probes.**

## 2. What you are judging

**The SPECs are FROZEN.** You do not edit them and neither does anyone else. If a SPEC is
wrong, that is a REWORK finding routed back to the REQ-01 session — never a quiet fix.

Judge against the requirements contract's own tests:

- **INSTRUCTIONS.md is a COMPASS, hard-capped at 100 lines** (it is 62). Does it POINT, or
  does it contain detail that belongs in a slice file? A compass that duplicates content is
  a compass that goes stale.
- **Every SPEC requirement traces to something buildable**, and every PLAN trace heading
  covers a SPEC requirement. Check BOTH directions — an uncovered SPEC sentence and an
  orphan trace heading are different defects.
- **PLAN.md must be skeleton ONLY.** The requirements seat was forbidden to author steps.
  If you find authored steps, that is a contract breach finding.
- **Banned acceptance words** — improve, better, robust, handle, appropriate — anywhere a
  criterion is stated.
- **Clusters must be independently verifiable with ONE command each.** A cluster nobody can
  verify in one command is cut wrong. Reserved-but-empty cluster membership is expected at
  this stage; an incoherent cluster BOUNDARY is not.
- **Does the SPEC actually deliver V's three Done criteria?** V's words and V's parity
  ruling are quoted verbatim in the REQ-01 packet §2. A SPEC that satisfies the packet but
  not V is the most expensive possible pass.

## 3. Probe, never read and nod

Where a SPEC asserts something about the CODEBASE, check the codebase yourself — do not
inherit it from INTAKE.md, which is the Router's work and is also under suspicion. Your
default posture is to REFUTE. Highest-value targets:

- The claim that a required strict field would make already-published debates **silently
  404**. This is INFERRED, not measured, by both the Router and REQ-01. Can you demonstrate
  or refute it? A three-run experiment beats an argument.
- The claim that `AnswerSchema` already carries `nodes`/`edges`, so no new data source is
  needed. If false, the entire S01/S02 split is wrong.
- Whether the S02 "read parity" surface is actually reachable from public-safe data, or
  whether it secretly needs owner-only side channels (REQ-01 flagged this tension itself —
  verify it landed in the SPEC as a real constraint, not a footnote).

The dev server at `https://localhost:3000` is reachable for anonymous probes (use
`--insecure`). macOS has no `timeout`: use `perl -e 'alarm N; exec @ARGV' <cmd>`.

## 4. Findings and verdict

Number them `B1, B2…` blocking · `N1, N2…` non-blocking. **Non-blocking does not mean
optional** — every N-finding demands a fix and must land on a ticket; the tier sets only
WHEN. For each: file, line, failure scenario as concrete inputs → wrong outcome, and the
evidence that convinced you.

Verdict is exactly one of **PASS** · **REWORK** (numbered findings) · **BLOCKED**. Never
"pass with concerns" — concerns are N-findings. State what you verified and HOW, with probe
output VERBATIM, and state what you did NOT verify so the next lens knows the gaps.

End with one paragraph of **PREDICTIONS**: what you expect the other lens (REV-00, reviewing
the Router's packet) got wrong, and what you would check first.

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

**allowed (write):** `.hermes/reports/public-debate-access/agent-reports/REV-01-claude.md`
← your self-report. Post your verdict as a ticket COMMENT, not as a file.
**read:** the whole worktree. **forbidden:** editing anything under review, any product
code, any test, any SPEC. You write no product code and you mark nothing Done.

## 7. Self-report — binding, before your final handoff

File `.hermes/reports/public-debate-access/agent-reports/REV-01-claude.md`. No FULLY DONE
without it. The question it answers, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What
> we must upgrade. what repeatedly costed us tokens. how we can make the coding more
> efficient. How can we turn this into a one prompt machine even better.

Name the CAUSE, not the symptom. PRICE each finding. Say what you NEARLY got wrong. Name
DEAD ENDS. Say exactly where THIS packet fought you — that is a finding against the Router
and it is wanted. An anodyne self-report is worse than none.

## 8. Decorrelation — stated plainly, because it weakens your verdict

**You share a base model with the Router (Opus 5), and so does the architecture seat.** V
chose that knowingly at intake. Same-model lenses decorrelate by PROMPT ONLY, which is
weaker than model diversity. The concrete risk: you find the Router's reasoning persuasive
because it is the reasoning you would have produced. Guard against it — where you agree
with INTAKE.md, say whether you agreed because you VERIFIED it or because it sounded right.
That distinction is the whole value of this seat.

## 9. Return rule

Return control at your verdict, a genuine blocker, or an IMPORTANT OPERATION, but keep the
session alive and resumable. Silence is normal. Post your verdict with:

```
hermes kanban --board public-debate-access comment t_2a279210 "<your verdict>"
```

Board flag BEFORE the verb. Never `boards switch`.

# REWORK ROUND 1 (of max 3) — REQ-01 requirements seat

Peer review returned VERDICT: REWORK. This packet relays what you fix, plus
three V rulings that close your open questions. You are resuming YOUR OWN
session — your context stands; do not re-derive the mission.

## Read first
1. The full verdict: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/ui-overhaul/logs/REQ-01-REV-claude.log (13 findings, file:line each)
2. Your rework tickets: t_6a8b9f7f (F3) t_57b68a27 (F4) t_b65bcbac (F7) t_0c9f3489 (F8) t_bae262c9 (F9) t_d0ac43c3 (F10) t_16d44323 (F11) t_2be89157 (F12) t_68da3944 (F13) — board ui-overhaul.
3. FLOOR FIX (packet defect F5, orchestrator's fault, now binding): also load
   /Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/brainstorming/SKILL.md
   if not already loaded, and name it in SKILLS LOADED.

## V RULINGS (close these into the specs; cite "V 2026-08-31" in DECISIONS)
- OQ1 vocabulary: **APP VOCABULARY EVERYWHERE.** The T9 landing copy is
  TRANSLATED design copy — same structure, tone and layout, but rounds→debates,
  turns→(the app's term for exchange stages), joints→claims/weakest claim,
  bench→the app's framing. Put the full mapping table in T9/DECISIONS.md and
  re-cut T9's "binding strings" section from the translated copy. The exact
  translated strings are yours to draft; V ratifies at QA.
- OQ2 anonymous CTA: **Start-a-round CTA routes to sign-in/sign-up with a
  return path landing in New debate after auth.** Update T9 acceptance so the
  expected observation is concrete (F4a). Align T3/T4 NON-goal wording (F8).
- OQ3 placeholders: **static placeholder copy this mission** — no live counter,
  no real prices.

## Fix duties (BLOCKING first)
- F3: apply T9's naming discipline to ALL slices' PLAN acceptance cells (literal
  strings/controls/markers) and add ONE verification command per cluster
  (spine v3.3.0 item 12) — 20 clusters currently have none.
- F4: rewrite the seven mutant-vulnerable checks (a–g) so the named mutant goes
  RED; for e and g, name the required fixture precondition instead of skipping.
- F7 F8 F9 F10 F11 F12 F13: per ticket. F10: re-version amended SPECs honestly
  (v2, or header "v1 finalised 16:44; pre-handoff amendments in DECISIONS").

## Freeze discipline (F2 — binding this round)
Finish EVERY file write BEFORE your final board comment. The final comment is
your LAST act. After it, write nothing. The orchestrator commits your tree and
round-2 review targets that commit.

## Self-report (verbatim law)
Update .hermes/reports/ui-overhaul/agent-reports/REQ-01-grok.md with a round-1
section before your final comment:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

## Handoff
Final comment on t_7e83d3fb opens with `SKILLS LOADED: …` then
`REWORK ROUND 1 COMPLETE — READY FOR REVIEW` + ≤15 lines of what changed.

# /goal packet — PANEL-01 (Codex seat, PROG-V3-R1)

**Board:** `debateai-v3` · **Ticket:** `t_eeea2f6e` · **Assignee:** codex
**Roster (DR-153):** Codex implements · dual diamond (Opus 5 + Grok), both
must greenlight. Day mode: questions route UP to the orchestrator, never to V.

Standing law: `CODING-LOOP-PROTOCOL.md`. **Read the ticket's FULL comment
history** — it carries V's shape ruling, the envelope numbers, a serve-shape
constraint, and two trap warnings. Then DR-150, DR-154(2), DR-159 in the
ledger, and PRO-01's shipped expansion code (`apps/runner/src/index.ts`) —
you build ON it, not beside it.

## V's ruling — the shape is AUTHORSHIP, not grading

DR-154(2): **"each model AUTHORS its own position on the question"** — N
independent root positions, one per maker, which then attack and defend one
another. V explicitly did NOT choose the dormant `runJudgePanel` grading
shape (N models scoring one artifact). The dormant panel surfaces stay
dormant; their orphan-audit rows stand.

With PRO-01 shipped, each maker's root now grows its own B3-B pro/con tree to
the ask's depth. M=2 makers exist (OpenAI codex-cli; Anthropic claude-cli at
alias `opus`, DR-152).

## THE CONSTRAINT THAT CAN STOP THIS TICKET — read twice

**V ruled B2-A: the serve set stays ONE primary root.** The DEPTH-01
proposal's own analysis said PANEL-01 "cannot honestly represent all makers
while continuing to serve only one root" — and V chose the cheap serve shape
anyway, with eyes open.

So: if honest multi-maker representation REQUIRES expanding the serve set,
**that is a NEW question for V — STOP LOUDLY and route up.** You may NOT
quietly serve M roots (blows the ratified arithmetic by design), and you may
NOT quietly pick one maker's root as "the" answer while presenting it as all
makers' (DR-115). One lawful shape to consider and justify: serve the one
primary root exactly as today, with the second maker's root entering the
GRAPH as a first-class position node (visible, judged, lineage-carried,
linked by real cross-root attack/defence edges) but not composed into the
served answer — and the honesty surfaces saying so plainly. If you conclude
even that misrepresents, stop and route up.

## Traps posted by approving diamonds, aimed at this ticket

1. **The maker count M is INVISIBLE to the envelope match key**
   (`packages/register/src/index.ts:209-233`); `agent_count` is unbounded and
   unguarded. The ratified ceilings assumed M=2. A run with M>2 silently
   exceeds V's numbers. Guard it: refuse loudly (typed) if the effective
   maker count exceeds what the ratified envelope assumed, naming DR-159.
2. **`onAuthRejected` socket** (POL-01 A-4): threaded through DebateTree /
   NodeDetailDrawer / ArgumentFocusView, never invoked, targets an
   UNCONDITIONAL token clear. Do not wire it; delete or route through the
   typed decision if you touch those files.
3. **A second composer bypassing `parseComposerOutput` reopens the segment
   cap** (ENV-01 ADV-1). Any composition you add goes through the same
   parser.

## Cost discipline

Iterate on PROVIDER DOUBLES (the `startProviderDouble` queues PRO-01's tests
use). ONE real proof run at depth 1 (M=2 → expect ~13-15 calls; ceiling 42).
Do NOT run real proofs at depth 2+. Disclose total real calls spent in the
handoff. The standing stack is DOWN (POL-02 in diamond) — your proof runs on
your own composition, as PRO-01's did.

## Also in force

Cross-root edges: real GraphWriter edges, S07 vocabulary, magnitude honestly
UNKNOWN unless judged; per-node maker lineage recording what ACTUALLY ran;
FX-HR-H6 if anything grades anything. The cross-root "attack and defend one
another" leg's COST was flagged as uncosted in DEPTH-01 (advisory A-2) — count
your actual calls against the ratified ceiling and stop loudly if a depth
cannot fit; do not silently skip legs to fit.

## DONE WHEN

A depth-1 M=2 proof: two maker-authored roots with real lineage, real
cross-root edges, the serve honest per the shape you justified (or a loud
stop routed up if none is lawful); the M-guard proven by test; every gate
green with REAL pasted output EACH; TDD RED→GREEN; handoff at
`handoffs/PANEL-01-codex-handoff.md`; progress log
`handoffs/PANEL-01-progress.log`; ticket to `review` with
`READY FOR PEER REVIEW — PANEL-01`.

## Return rule

Return control at a spine handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the goal alive and resumable. Silence is normal.

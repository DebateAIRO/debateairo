# [assigned: T3C] F34 · shipped entry point never passes `claimTimeProbe` → DR-182 claim-time health re-probe never runs (F-T3C-1)
Source: T3C seat's class sweep of every optional `WalkingSkeletonSettings` member vs what
apps/runner/src/main.ts constructs (logs/t3c/class-sweep.log). Both consumers guard on
`!== undefined`, so on the shipped entry point a pinned panel member that went absent since
ask time is NOT detected and no CLAIM_PANEL_REVISED disclosure is emitted — a SILENT
degradation (Scope law, goal 26: every degradation or skip emits a visible mark). Same class
as F33 / S06 B1, worst member (those fail loudly with no spend; this one degrades silently).
DISPOSITION (J20): folded into T3C's charge by orchestrator amendment — same file, same
pattern, same seat; RED first (a pinned member absent since ask → today no disclosure), then
wire the probe on the production path with the claim-time gate; codex reviews it with T3C.
status: done · escalation_target: v_packet if not closed with T3C

## 2026-09-16 continuation
Moved `working (T3C)` → `done` by RECORDS(CONT-T19). Citation: `PROGRESS.md:53` — T3C merged at
integration `19bbb4c4` with *"F34 claim-time probe"* named among the four things it landed. The ticket
was left in `working` after its lane merged. STRENGTH: entailed.
Carried forward, NOT closed by this move: the production half is **T14b**, which T14a's gates left
UNAUTHORIZED (T14a-G3) and which no one has authorized since. That half belongs to `F1-claimtimeprobe-production-gap`.

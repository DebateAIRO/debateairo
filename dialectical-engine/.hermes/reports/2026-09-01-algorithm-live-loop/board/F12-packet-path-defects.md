# [claude@fable-5] F12 · orchestrator packet defects: relative artifact paths + template prose leakage (codex TREL-r1 N1/N2)

Source: codex review TREL r1 (agent-reports/TREL-codex-r1.md N1, N2).
N1: worker packets state report/self-report/logs as mission-relative paths while the seat's
working directory is its WORKTREE — the TOOLING-TRAPS relative-path class, half-repeated
(the trap was known; the packets carried a "resolve from" preamble but the deliverable
lines themselves were relative). TREL lost time creating logs in the worktree and relocating.
N2: the instantiated reviewer packet retained template-instantiation prose and one
un-rendered citation ("goal-prompt.md lines" with no range) — forced a 623-line search.
CURE (immediate): every deliverable path in every future packet/rework message is ABSOLUTE;
template instantiation is followed by a placeholder-and-prose lint (grep for '{' AND for
'orchestrator instantiates'); reviewer packets always carry concrete line ranges
(Global DoD = goal-prompt.md:28-40 where cited).
status: done (cured going forward) · escalation_target: v_packet · created 2026-09-01

# [V DECISION] F-S09-1 · in-flight runs carrying a v2 envelope basis refuse loudly across the deploy boundary
Source: agent-reports/s09-envelope.md (r1 findings). T17 bumps the formula version, so a run
admitted under DR-184-v2 that is still in flight when the new code deploys will refuse at its
next admission check rather than continue. That is the honest behaviour (the recorded basis no
longer matches the formula), but it is a live-traffic consequence, not a test artifact.
OPTIONS: (a) a migration row that recomputes the basis for in-flight runs (D25 numbering);
(b) a drain — stop admitting, let in-flight runs finish, then deploy; (c) accept the loud
refusal and document it in the runbook.
DISPOSITION: V DECISION on the V packet. Judge recommendation: (b) drain for the flagship run
(the mission's own runs are short), and (a) only if production traffic makes a drain
impractical. Default if V is silent: (c), documented.
status: waiting_human · escalation_target: v_packet

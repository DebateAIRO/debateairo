# [unassigned] F35 · `core.read_terminal_recorded_facts` counts `COMPOSER:%` into `composer_calls`; five battery predicates read it as >= 1 (found by S07)
Source: agent-reports/s07-synthesis.md (r1 findings). T9 keeps the call-site prefixes
(`COMPOSER:SYNTHESIZER:…`, `POST_COMPOSE_R9:EVALUATOR:…`) so the existing counter and its five
battery-row predicates keep matching; renaming the slots to the real roles needs a `0057_`
migration (D25: the peer holds 0056) plus an upgrade test in the T8 pattern.
DISPOSITION: follow-up ticket after T9 merges; not T9's charge (a rename inside T9 would have
been an undisclosed schema change). Verify the five predicates by name before touching them.
status: queued · escalation_target: v_packet if not closed before W12

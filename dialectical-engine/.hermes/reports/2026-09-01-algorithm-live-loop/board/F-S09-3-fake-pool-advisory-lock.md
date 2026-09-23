# [unassigned] F-S09-3 · two stable-red authority entries are caused by fake pools matching the wrong advisory-lock call
Source: agent-reports/s09-envelope.md (r1 findings). Two of the mission's 23-name stable-red
authority entries fail because their test doubles match `pg_advisory_lock` but not the real
`pg_try_advisory_lock` the product calls. That is a defect in the doubles, not in the product —
and it means two entries of the baseline authority are fixable rather than inherent.
DISPOSITION: not in T17's charge and not fixed there. Ticket for after the mission's merge:
fix the doubles, prove the two tests green, and REMOVE those two names from the authority and
from the CI known-red allowlist (D30 — the list may only shrink). Until then they stay listed.
status: queued · escalation_target: v_packet at closure

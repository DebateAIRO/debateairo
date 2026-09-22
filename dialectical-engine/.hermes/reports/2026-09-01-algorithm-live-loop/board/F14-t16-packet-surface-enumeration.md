# [claude@fable-5] F14 · T16 packet did not enumerate the acceptance seeding surface (codex T16-r1 N3; N2 = F9 class)

Source: codex review T16 r1 (agent-reports/T16-codex-r1.md N3, N2).
N3: the packet named only the dev seeder/CLI although acceptance/seed-register.ts seals the
ceremony register that downstream acceptance DoDs consume; the worker had to infer
ownership (it inferred correctly — the diff includes the acceptance rows — but scope law
should never rest on inference).
N2: the same stale t00-baseline pointer class as F9/D12.
CURE: rework/future packets enumerate ALL register-version writers explicitly (dev seeder,
acceptance seeder, persistBootstrapRegister as read-only historical) or carry the exact
enumeration command + expected count; D12 language carried verbatim.
status: done (cures carried in the T16 r2 rework message) · escalation_target: v_packet

# [claude@fable-5] F7 · orchestrator packet defects in t14a-evidence packet (codex N3/N4)

Source: codex review T14a r1, findings N3 + N4 (agent-reports/t14a-codex-r1.md:87-116).
N3: the packet presented an expanded paraphrase of goal T14 text as the gate questions
while carrying the goal's stale "both UNWIRED" premise forward as fact (half false:
readDevelopmentRunnerPolicy is wired at main.ts:41, pinned by architecture test).
N4: the packet let one provenance condition govern two independent questions, letting the
claimTimeProbe gap be retired by an unrelated answer (partially pre-cured by board F1).
CURE (recorded D8, applies to every future packet): task text is QUOTED EXACTLY or labeled
"expanded restatement"; premises known to be contested carry their finding reference at
packet-write time; independent questions get independent gates.
STATUS: resolved for future packets (D8); T14a rework proceeds on the corrected framing via
the rework message (no packet reissue needed). status: done · escalation_target: v_packet

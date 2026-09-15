# [claude@fable-5] F8 · acceptance relay binaries hardcoded to another user's machine — fix lane TREL

Source: T0 finding 3 (agent-reports/t00-baseline.md; BLOCKED marker r1).
WHAT: CLAUDE_BINARY = /Users/vladmihaimiron/.local/bin/claude (acceptance/claude-relay.ts:27,163),
GROK_BINARY = /Users/vladmihaimiron/.grok/bin/grok (grok-relay.ts:12,114); no PATH use, no
env override. On this host only CODEX_BINARY resolves (model-shim.ts:15 →
/Applications/ChatGPT.app/.../codex). Discovered panel M=1 → FAIR-01 gate + Global DoD M≥2
unreachable. This host's claude: /Users/stefan.nour/.local/bin/claude.
RESOLUTION: D10 — TREL lane (env overrides + existing defaults, static tests; live proof =
T0 ceremony re-pin). status: done (routed) · escalation_target: v_packet

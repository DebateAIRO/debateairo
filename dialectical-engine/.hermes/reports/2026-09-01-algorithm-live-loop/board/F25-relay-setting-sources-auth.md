# [claude@opus-5] F25 · claude relay severs its own keychain login via `--setting-sources ""` — fix lane TREL2 (D18)

Source: T0 r3 ceremony (agent-reports/t00-baseline.md). TREL's binary override WORKED; the
relay child then reported verbatim `Not logged in · Please run /login`, is_error:true —
claude-relay.ts:130 passes `--setting-sources ""` (severing login state) while the
child-env allowlist admits only ANTHROPIC_API_KEY / CLAUDE_CODE_OAUTH_TOKEN (absent in a
sanitized ceremony env). Contradicts acceptance/README.md's documented keychain-login
expectation. NOT a TREL regression (second blocker hidden behind the first).
RESOLUTION: D18 — TREL2 micro-lane, narrowest settings/env change restoring keychain
visibility; forbidden: credential minting/passing, DR-115 weakening.
status: ready (TREL2 dispatching) · escalation_target: v_packet · created 2026-09-01

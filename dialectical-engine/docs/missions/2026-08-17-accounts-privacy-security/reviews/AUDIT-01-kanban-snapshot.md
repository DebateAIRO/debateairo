# AUDIT-01 — read-only Kanban snapshot

Captured: 2026-08-26 07:44 Europe/Bucharest  
Repository source baseline: `80362d0afc7e9860f6c8a48ea8caa26864a2f570`  
Purpose: preserve the external operational evidence used by `IMPLEMENTATION-STATUS.md`; this file does not replace Hermes as the source of truth.

## Commands

```text
hermes kanban --board accounts-phase4 stats --json
hermes kanban --board accounts-phase4 list --json --sort priority-desc
hermes kanban --board accounts-program-closure stats --json
```

## `accounts-phase4`

Status summary: 5 ready, all unassigned.

| Task | Exact title | Status |
|---|---|---|
| `t_54bd98b0` | P4-G1 · Env allowlist for relay children (drop DATABASE_URL, SSH_AUTH_SOCK) + grok `--sandbox` + claude `--setting-sources` | ready |
| `t_b8283aa3` | P4-G1b · SIGKILL escalation, stdout byte cap, request-size cap, authenticate the relay endpoint | ready |
| `t_42dbde32` | P4-G2 · Instruction/data separation: escape the `[role]` argv flattening + delimiters on judge/review + input caps | ready |
| `t_8447d3a7` | P4-G3 · Exact-argv pins for claude+grok, env-absence assertion, SIGTERM-ignoring-child test, wire acceptance suite into `pnpm test` | ready |
| `t_8485f17c` | P4-G4 · Adversarial injection corpus (design only until phase authorization) | ready |

## `accounts-program-closure`

Status summary at capture: 1 running (`AUDIT-01`, Codex), 83 todo (Codex), and 3 blocked human-decision cards (Router). The graph contains 87 total cards. Every implementation card depends on `AUDIT-01`; counsel and penetration-test authority are represented as explicit blocked nodes.

The first thirteen implementation cards split the five historical Phase-4 cards into one boundary per ticket: environment allowlist, Grok sandbox argv, Claude settings/MCP argv, role encoding, message validation, judge/review delimiters, SIGKILL escalation, stdout cap, request cap, relay authentication, final containment pins, corpus design, and local fake-fixture corpus execution.

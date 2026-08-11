# FAIR-02 — Second model maker: Claude Code CLI relay (Anthropic) — claude-worker handoff

Ticket `t_a3e1374b` · DR-140 lane (Claude codes, Grok reviews) · 2026-08-10

## What shipped (inventory)

| File | Change |
|---|---|
| `acceptance/relay-core.ts` | NEW — shared CLI-relay core: one OpenAI-compatible HTTP front (P4 gateway seam) over maker-specific strategies (P8). Owns spawn/closed-stdin/timeout/nonzero-exit mechanics and the loud-failure law (typed `CliRelayFailure` → 502/504, never fabricated choices; DR-115). |
| `acceptance/model-shim.ts` | EDIT — the greenlit codex relay becomes the codex STRATEGY over relay-core. Public surface (`startModelShim`, `renderCodexPrompt`, `stripPromptEcho`, constants) and behavior unchanged; its test file untouched and green — the behavioral proof of the extraction. |
| `acceptance/claude-relay.ts` | NEW — the SECOND real maker: `startClaudeRelay` relays to the local Claude Code CLI, maker `Anthropic`. Real startup handshake; model id ALWAYS the CLI-reported one. |
| `acceptance/test-fixtures/fake-claude-cli.mjs` | NEW — test-layer fake mimicking the EMPIRICALLY OBSERVED `--output-format json` envelope (incl. the observed expired-OAuth error envelope). Reachable only through the NODE_ENV=test-guarded seam. |
| `acceptance/claude-relay.test.ts` | NEW — 9 tests (mapping/lineage, handshake, 502/504, is_error, model-ambiguity refusal, invalid-output refusal, handshake refusal, seam guard). |
| `acceptance/dual-maker-proof.ts` | NEW — the DONE-gate driver + CLI: one live call through EACH maker via the real `createPostgresProviderGateway`, honest lineage rows persisted and re-read from `ledger.raw_artifact`. |
| `acceptance/dual-maker-proof.test.ts` | NEW — 2 tests on real embedded PG: dual-maker round-trip with persisted never-blended lineage; stale-register loud stop. |
| `acceptance/seed-register.ts` | EDIT — `configuredProviderSet` gains `acceptance:claude-cli` / `Anthropic`; row provenance `ACCEPTANCE_PROVIDER_SET_SOURCE_REF = "acceptance:DR-140:V-approved"`. `requiredDistinctMakers` stays 1 (see QUESTIONS 2). |
| `acceptance/runtime-policy.ts` | EDIT — two-provider tuple schema; per-row provenance expectation (DR-140 for the provider set); policy now exposes `providers.openai` / `providers.anthropic` (replaces the single `providerRef`/`maker`). |
| `acceptance/main.ts` | EDIT — walking-skeleton chain explicitly wired to `policy.providers.openai` (unchanged behavior); Anthropic joins the debate graph in FAIR-01. |
| `acceptance/seed-register.test.ts`, `acceptance/runtime-policy.test.ts` | EDIT — updated expectations (RED-first below). |
| `acceptance/README.md` | EDIT — FAIR-02 section: relay laws, register/provenance, freshness discipline, live proof command. |

No production package was modified. No migrations. No git commands (V-gated).

## Empirical CLI verification (step-3 law: no guessed flags)

- Binary: `/Users/vladmihaimiron/.local/bin/claude` (`which claude`), version `2.1.221 (Claude Code)`.
- `claude --help` confirms: `-p/--print` non-interactive mode, `--output-format json` ("single result"), `--no-session-persistence`, `--tools ""` (disable all tools), `--model` exists but is NOT used (see QUESTIONS 3).
- Trivial call, REAL observed output (2026-08-10, this machine):

```
$ claude -p 'Reply with exactly: OK' --output-format json --no-session-persistence ; echo exit=$?
{"is_error":true, ... ,"modelUsage":{},"subtype":"success","result":"Failed to authenticate: OAuth session expired and could not be refreshed","type":"result", ...}
exit=1
```

  (Inside the worker sandbox the same call reported `401 OAuth access token has
  been revoked` with `api_error_status:401` — same failure class.)
- Facts extracted and encoded in the relay: single JSON envelope on stdout;
  `is_error` boolean; `result` = reply text; `modelUsage` keyed by the model
  id(s) the CLI ACTUALLY used; failures exit nonzero AND flag `is_error`; the
  prompt travels as an argument (stdin closed, `stdio: ["ignore", ...]`); JSON
  mode has no prompt echo, so no echo-stripping heuristics exist on this path.
- Because auth is expired, a live SUCCESS envelope could not be observed this
  session. The success parser consumes the same observed envelope fields with
  `is_error:false`; the fixture mirrors that shape byte-for-byte in the fields
  parsed. The relay's behavior on exactly today's machine state is the loud
  handshake refusal — proven by test.

## Relay laws (codex-relay laws applied verbatim + lineage honesty)

- Maker `Anthropic`; model = the single `modelUsage` key of THAT call's
  envelope. Zero or several keys → `CLAUDE_CLI_MODEL_UNRESOLVED` (502) — the
  relay refuses to pick, never guesses (DR-115).
- Nonzero exit / spawn error → 502 `{"error":"CLAUDE_CLI_FAILED"}`;
  CLI-declared `is_error` → 502 `CLAUDE_CLI_FAILED`; non-JSON stdout or blank
  `result` → 502 `CLAUDE_CLI_OUTPUT_INVALID`; deadline → SIGTERM + 504
  `CLAUDE_CLI_TIMEOUT`. No fallback text, no `choices` on any failure.
- `startClaudeRelay` performs ONE real handshake call before listening: proves
  the CLI alive and captures the CLI-reported model id so the provider gateway
  can be constructed with an honest `model` BEFORE the first relayed call. A
  dead/unauthenticated CLI refuses to start — no dead maker silently serving.
- `testOnlyCommand` seam rejected outside `NODE_ENV=test`
  (`TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN`), same as the codex seam.

## Register + capability honesty

- `configuredProviderSet@1` now: `requiredDistinctMakers: 1`, providers
  `[acceptance:codex-cli/OpenAI, acceptance:claude-cli/Anthropic]`, source_ref
  `acceptance:DR-140:V-approved`. `readDeploymentMakerCapability` (shipped,
  untouched) therefore honestly reports `configuredMakers:
  ["Anthropic","OpenAI"]` — 2 makers, no hardcoded capability literal.
- Freshness discipline held loud: seeding against a standing `.pgdata` that
  carries the pre-FAIR-02 one-provider row stops with
  `ACCEPTANCE_REGISTER_CONFLICT:configuredProviderSet` (append-only
  `register_row`; reset the standing data directory, never mutate sealed
  rows). Proven by test against a real embedded PG.

## TDD — RED first (real output)

```
FAIL  acceptance/claude-relay.test.ts [ acceptance/claude-relay.test.ts ]
Error: Cannot find module './claude-relay.js' imported from .../acceptance/claude-relay.test.ts
FAIL  acceptance/dual-maker-proof.test.ts [ acceptance/dual-maker-proof.test.ts ]
Error: Cannot find module './dual-maker-proof.js' imported from .../acceptance/dual-maker-proof.test.ts

FAIL  acceptance/seed-register.test.ts > ... materializes the V-approved DR-133 values ...
AssertionError: expected 'acceptance:DR-133:V-approved' to be undefined

FAIL  acceptance/runtime-policy.test.ts > ... types the FAIR-02 two-maker provider set ...
-     "maker": "Anthropic",
-     "providerRef": "acceptance:claude-cli",

 Test Files  4 failed (4)
```

Mid-build honest REDs (both real, both fixed):

```
FAIL  acceptance/claude-relay.test.ts > ... propagates a CLI deadline as HTTP 504 ...
CliRelayFailure: CLAUDE_CLI_TIMEOUT        ← the 25ms deadline also killed the
                                             startup handshake (node boot > 25ms);
                                             fixed with 300ms deadline vs 2s fixture delay

FAIL  acceptance/dual-maker-proof.test.ts > ... stops loudly on a stale standing register row ...
error: append-only or immutable table register_row rejects UPDATE
                                           ← P17 trigger; the stale test now INSERTs the
                                             old row into a pristine embedded DB instead

acceptance/dual-maker-proof.ts(113,33): error TS2379 ... 'exactOptionalPropertyTypes: true'
                                           ← fixed with conditional spread of the seams
```

## GREEN (final state, all in-sandbox, embedded PG real)

```
acceptance (vitest, embedded PG)   Test Files  8 passed (8) · Tests  27 passed (27)
  incl. claude-relay.test.ts 9/9 · dual-maker-proof.test.ts 2/2 · model-shim.test.ts 3/3 UNCHANGED
tests/unit+integration+architecture  Test Files  52 passed (52) · Tests  322 passed (322)
tsc --noEmit (root)                  clean
tsc --noEmit -p acceptance/tsconfig.json  clean   ← note: root tsc does NOT include acceptance/
audit:architecture                   {"edgeRowsChecked": 27, "violations": []}
audit:source                         {"blocking": []}
```

The in-sandbox dual-maker proof (fake CLIs through the REAL gateway + REAL
embedded PG) persisted and re-read:

```
ledger.raw_artifact → { maker: Anthropic, model_id: claude-fake-cli-model, provider_ref: acceptance:claude-cli }
                      { maker: OpenAI,    model_id: gpt-5.6-sol,           provider_ref: acceptance:codex-cli }
2 MODEL_CALL ledger entries, outcome OK — one maker per artifact, never blended
```

## How the orchestrator runs the LIVE dual-maker proof (DONE gate)

From a PLAIN terminal (not a nested agent session — the claude CLI must see
its own keychain auth):

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3
ACCEPTANCE_DB_PORT=<ruled port> ./node_modules/.bin/tsx acceptance/dual-maker-proof.ts
```

It seeds (loud stale stop first), boots both relays (the Anthropic one only
after a REAL CLI handshake), fires one live call through EACH maker via the
real Postgres provider gateway, verifies the persisted `ledger.raw_artifact`
rows carry the two declared makers with the CLI-reported models, and prints
each persisted lineage row as JSON. Any CLI failure, timeout, lineage
mismatch or stale register is a loud nonzero exit. Prerequisite: `claude` must
be logged in (see QUESTIONS 1) and the codex CLI reachable as in ACC-01.

## Environment tail

- The claude CLI OAuth session on this machine is EXPIRED (real output above).
  Until V runs `claude /login`, the live proof will refuse at the handshake —
  which is the designed loud behavior, not a defect.
- Embedded-PG shared-memory sweep (`ipcrm`) applied before every suite run.

## QUESTIONS FOR V

1. **CLI login**: the local `claude` CLI reports "OAuth session expired and
   could not be refreshed". Please run `claude /login` (or confirm an
   alternative auth) before the orchestrator fires the live proof.
2. **Capability floor**: I kept `requiredDistinctMakers: 1` while the provider
   list honestly reports 2 makers. Rationale: DR-137 rules mono-model
   admission LAWFUL for casual/standard — raising the deployment floor to 2
   would refuse every standard run whenever one CLI is unavailable and would
   contradict that ruling; DR-140(b)'s more-than-one-maker requirement reads
   as run-level fair-debate law for FAIR-01 to enforce on the real debate.
   Confirm or reverse.
3. **Model choice**: the relay invokes the CLI WITHOUT `--model`, so the CLI
   uses its configured default and the relay reports whatever the CLI says it
   ran (honest either way). If V wants a specific Anthropic model pinned for
   the acceptance debate, rule the alias and it becomes one `--model` argument
   in `claude-relay.ts` — lineage stays CLI-reported.
4. **Handshake cost**: `startClaudeRelay` spends one real CLI call at startup
   (liveness + honest model id for gateway construction). Acceptable at
   ceremony boot, or should FAIR-01 reuse a longer-lived relay handle?

READY FOR PEER REVIEW — FAIR-02

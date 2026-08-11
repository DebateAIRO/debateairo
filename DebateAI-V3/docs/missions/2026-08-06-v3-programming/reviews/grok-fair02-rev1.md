# GROK REVIEW: FAIR-02 · rev 1 (Claude Code CLI relay · DR-140)

**Verdict: APPROVED**

Independent Grok seat review of ticket `t_a3e1374b` (status `review`, assignee
`claude-worker`) under mission PROG-V3-R1 / DR-140 lane: Claude worker coded;
this seat is the review gate only. Board was **not** mutated. Git history was
**not** written. Sole write is this file.

## Context consulted

| Source | What was taken as law |
|---|---|
| Ticket `t_a3e1374b` body | Second real maker: OpenAI-compatible relay to local Claude Code CLI; maker `Anthropic`; model = CLI-reported; codex-relay laws + DR-115; register gains Anthropic provider; capability honest 2 makers; provenance `acceptance:DR-140:V-approved`; DONE WHEN = Grok greenlight **and** live dual-maker round-trip (orchestrator-owned post-login) |
| Ticket comments | Orchestrator lane-cut note; worker READY FOR PEER REVIEW (in-sandbox dual-maker GREEN; live blocked on `claude /login`) |
| Handoff `docs/missions/2026-08-06-v3-programming/handoffs/FAIR-02-claude-handoff.md` | Inventory, empirical CLI envelope facts, RED→GREEN diary, residual login block, 4 QUESTIONS FOR V |
| Ledger DR-137 | Mono-model admission lawful for casual/standard; capability row records honest maker count; no hardcoded capability literals |
| Ledger DR-140 | (a) Claude codes / Grok reviews for fair-debate lane; (b) real acceptance debate needs >1 node and >1 model maker (second = Claude Code CLI relay, Anthropic) |
| Ledger DR-142 | Normative composition entry (context only; not FAIR-02 transport surface) |
| `git status` | FAIR-02 surface is untracked `acceptance/` (full delta under review); wider dirty tree holds prior TERM-01/ACC-01 seats — not FAIR-02 product scope |

## Independent re-runs (after SysV shared-memory sweep)

| Suite | This-seat result |
|---|---|
| SysV `ipcs`/`ipcrm` sweep | Residual segment `m 14745600` held (could not `ipcrm`; same class as prior ACC-01 standing PG). Suite runs used separate embedded PG ports and completed clean |
| `vitest run --config acceptance/vitest.config.ts` | **8 files / 27 tests GREEN** (incl. `claude-relay` 9/9, `dual-maker-proof` 2/2, `model-shim` 3/3 **unchanged-green**, seed/runtime-policy FAIR-02 expectations) |
| `vitest run tests/unit tests/architecture` | **45 files / 270 tests GREEN** |

Evidence captures live only in private reviewer scratch (`fair02-*.log`). Live
dual-maker proof against a real logged-in `claude` CLI was **not** run here
(objective: judge code + in-sandbox proof; orchestrator owns post-login gate).

## Per-dimension verdict

### (1) DR-115 — no fabricated choices; typed loud failures; model-from-CLI — **VERIFIED**

Shared front in `acceptance/relay-core.ts`:

- Success path alone emits `choices` (`relay-core.ts:159–166`).
- `CliRelayFailure` → HTTP 502/504 body `{ error: <code> }` only — no `choices`
  (`relay-core.ts:168–170`).
- Spawn error / nonzero exit / timeout → adapter `failureCode` / `timeoutCode`
  (`relay-core.ts:88–100`).
- Closed stdin on every CLI invoke (`relay-core.ts:75–78`).

Anthropic adapter `acceptance/claude-relay.ts`:

| Code | Path | Anchor |
|---|---|---|
| `CLAUDE_CLI_FAILED` | adapter `failureCode`; `is_error !== false` | `claude-relay.ts:46,59` |
| `CLAUDE_CLI_TIMEOUT` | adapter `timeoutCode` | `claude-relay.ts:60` |
| `CLAUDE_CLI_OUTPUT_INVALID` | non-JSON / schema fail / blank `result` | `claude-relay.ts:42–48` |
| `CLAUDE_CLI_MODEL_UNRESOLVED` | `Object.keys(modelUsage)` length ≠ 1 | `claude-relay.ts:49–53` |

Model id is **not** a guessed Anthropic alias: single key of CLI
`modelUsage` (`claude-relay.ts:49–54`). Startup handshake
(`startClaudeRelay` → `invokeCli` + `CLAUDE_HANDSHAKE_PROMPT`,
`claude-relay.ts:92–111`) refuses a dead/unauthenticated CLI before listen —
no silent dead maker. Test-only command seam:
`resolveTestGuardedCommand` rejects outside `NODE_ENV=test`
(`relay-core.ts:54–66`; `claude-relay.ts:93–97` →
`TEST_ONLY_CLAUDE_COMMAND_FORBIDDEN`). Fixture
`acceptance/test-fixtures/fake-claude-cli.mjs` is reached only through that
fence.

Tests (this seat, green): 502 without `choices`; 504 timeout; multi-model
refusal; non-JSON/blank; handshake fail; production `NODE_ENV` seam reject.

### (2) AC-76 / provenance exact — **VERIFIED**

- `ACCEPTANCE_PROVIDER_SET_SOURCE_REF = "acceptance:DR-140:V-approved"`
  (`seed-register.ts:17`).
- `configuredProviderSet` row carries that `sourceRef`
  (`seed-register.ts:160–180`).
- Runtime reader expects the same provenance for that key only
  (`runtime-policy.ts:128–134`).
- Seed test pins the exact string (`seed-register.test.ts:124–125`).
- No invented capability literal `2`: honesty is the two-entry provider list
  (`acceptance:codex-cli`/`OpenAI` + `acceptance:claude-cli`/`Anthropic`);
  `requiredDistinctMakers: 1` retained under DR-137
  (`seed-register.ts:163–169`, `runtime-policy.ts:63–77`). Stale standing row
  → `ACCEPTANCE_REGISTER_CONFLICT:configuredProviderSet`
  (`seed-register.ts:234–240`; proven in `dual-maker-proof.test.ts:87–108`).

### (3) Refactor safety — codex relay surface unchanged — **VERIFIED**

- `model-shim.ts` is the codex **strategy** over `relay-core`: public exports
  still `startModelShim`, `renderCodexPrompt`, `stripPromptEcho`,
  `CODEX_BINARY` / `ACCEPTANCE_MODEL` / `ACCEPTANCE_MAKER`, same `exec -c
  model="gpt-5.6-sol"` args, same echo-strip + `CODEX_CLI_*` codes
  (`model-shim.ts:11–68`).
- `model-shim.test.ts` mtime pre-dates the extraction (2026-08-09) and was
  not rewritten; this seat re-ran **3/3 GREEN** — behavioral proof of the
  extraction.
- Claude path adds handshake + `modelUsage` parsing without changing codex
  timeout/failure surface.

### (4) TDD RED→GREEN honesty — **VERIFIED (handoff diary + present green)**

Handoff records real RED first: missing modules, DR-133 provenance still on
provider set, runtime-policy missing Anthropic tuple; mid-build REDs
(handshake killed by 25ms deadline; P17 UPDATE vs INSERT for stale seed;
`exactOptionalPropertyTypes` on optional seams) fixed honestly. Present
state: acceptance 27/27 green including the FAIR-02 files that drove the RED.

### (5) SOLID / patterns (P4 / P8 as claimed) — **VERIFIED**

- **P4**: one OpenAI-compatible HTTP gateway seam
  (`startCliRelayServer` → `/v1/chat/completions`).
- **P8**: `CliRelayAdapter` strategy (`maker`, failure/timeout codes,
  `buildArguments`, `parseCompletion`); codex + claude adapters are thin.
- Shared spawn/timeout/loud-failure law lives once in `relay-core.ts`.

### (6) Dual-maker DONE-gate driver (code + in-sandbox) — **VERIFIED**

`acceptance/dual-maker-proof.ts` seeds, boots both relays (Claude after
handshake), calls each maker through **real**
`createPostgresProviderGateway`, re-reads `ledger.raw_artifact` and checks
never-blended makers. Anthropic `model` is `relay.model` from handshake —
no literal in the driver (`dual-maker-proof.ts:131–138`).

In-sandbox test (this seat): persisted rows

| maker | model_id | provider_ref |
|---|---|---|
| Anthropic | claude-fake-cli-model | acceptance:claude-cli |
| OpenAI | gpt-5.6-sol | acceptance:codex-cli |

plus 2 `MODEL_CALL` / `OK` ledger entries. Stale-register path loud-stops.

### (7) Suites green / scope — **VERIFIED (relative to FAIR-02)**

See re-run table. FAIR-02 product delta is confined to `acceptance/` (relay
core extraction, claude relay, dual-maker proof, seed/runtime-policy/main/README
edits, fixtures, tests). No production package modified for FAIR-02 (handoff
claim; matches inventory). Working tree remains multi-seat dirty and V-gated
— not a FAIR-02 regression of scope. This seat introduced only this review
file.

## Findings

### BLOCKING

*(none)*

### ADVISORY

1. **`IS_ERROR_CLI` fixture exits nonzero** (`fake-claude-cli.mjs:39–43`) so the
   observed path hits `invokeCli` nonzero-exit → `CLAUDE_CLI_FAILED` before
   `parseClaudeEnvelope`'s `is_error` branch (`claude-relay.ts:46`). The
   branch is still correct and useful if the CLI ever exits 0 with
   `is_error:true`; the test name over-claims "CLI-declared envelope" relative
   to which branch fires. Non-blocking: failure remains loud and choice-free.

2. **`requiredDistinctMakers: 1` with a 2-maker list** (`seed-register.ts:169`)
   is a deliberate DR-137 reading (handoff QUESTION 2). Ticket wording
   "capability honestly reports 2 makers" is satisfied by the provider list,
   not by raising the floor. V may reverse; not a code defect under DR-137.

3. **Empty-`modelUsage` success envelope** (exit 0, `is_error:false`,
   `modelUsage:{}`) is covered by the length≠1 guard (`claude-relay.ts:51–53`)
   but has no dedicated fixture (multi-key is tested). Optional test polish.

## Residual honesty (not code BLOCKING)

- **Live dual-maker DONE-WHEN clause** requires an authenticated `claude` CLI.
  Worker observed OAuth expired / revoked; relay handshake is designed to
  refuse loud on that machine state. Objective: this seat judges **code +
  in-sandbox proof**; orchestrator runs the live gate after V's `claude /login`.
- Handoff QUESTIONS 3–4 (optional `--model` pin; handshake cost at ceremony
  boot) are product/ops policy, not review blockers.
- Standing SysV segment residual during sweep is environmental (held segment),
  not a FAIR-02 defect; embedded-PG tests still green.

## Dimension scorecard

| Dimension | Result |
|---|---|
| DR-115 loud failures / no fabricated choices | PASS |
| Model id from CLI `modelUsage` (no guessed literals) | PASS |
| `NODE_ENV`-fenced test doubles | PASS |
| AC-76 provenance `acceptance:DR-140:V-approved` | PASS |
| Capability honesty (2 makers via list; floor 1 lawful) | PASS |
| Codex relay surface / tests unchanged-green | PASS |
| TDD RED→GREEN honesty | PASS |
| P4/P8 extraction | PASS |
| Dual-maker in-sandbox + stale seed | PASS |
| Suites green (acceptance 27; unit+arch 270) | PASS |
| Scope (acceptance-only FAIR-02; review-only write) | PASS |
| Live `/login` dual-maker | RESIDUAL (env; orchestrator post-login) |

GROK REVIEW: APPROVED — FAIR-02

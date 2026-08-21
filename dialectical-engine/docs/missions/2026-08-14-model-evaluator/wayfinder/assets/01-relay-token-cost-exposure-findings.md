# Findings 01 — Token/cost data the relays and vLLM actually expose today

Resolves: `wayfinder/issues/01-relay-token-cost-exposure.md` (research, 2026-08-14).
Method: primary-source read of the five paths + grep of `DebateAI-V3/packages` and
`DebateAI-V3/apps` for `usage|prompt_tokens|completion_tokens|total_cost|total_tokens`,
plus one empirical peek at a live codex session file to confirm field names. All paths
below are relative to `DebateAI-V3/`.

## Headline

- **Every CLI path except codex already RECEIVES per-call token/cost fields on stdout
  and throws them away at parse time.** The single choke point where all three CLI
  envelopes are still whole is `adapter.parseCompletion(stdout, prompt)` inside
  `invokeCli` (`acceptance/relay-core.ts:103`); the parsed result is narrowed to
  `CliCompletion { content, model }` (`acceptance/relay-core.ts:29-33`) and the relay's
  HTTP response is rebuilt without any `usage` object (`acceptance/relay-core.ts:159-166`).
- **Downstream, nothing persists tokens.** The provider gateway persists the raw HTTP
  response text verbatim (`packages/providers/src/index.ts:253-269`) — so for a future
  vLLM/OpenAI direct call the `usage` block WOULD land in `ledger.raw_artifact.raw_text`
  unparsed — but for the CLI relays the persisted raw text is the relay's own re-synthesized
  JSON, which carries no usage at all. No `token`-named column exists anywhere in
  `migrations/*.sql` (grep: zero hits).

## Path 1 — relay-core.ts (shared CLI→OpenAI-HTTP bridge)

- Fields available per call: only what the adapter's `parseCompletion` returns —
  contract type `CliCompletion` is `content` + `model`, nothing else
  (`acceptance/relay-core.ts:29-33`, adapter interface `:36-45`).
- The full CLI stdout (with any usage/cost fields the CLI printed) is in scope exactly
  once, at `acceptance/relay-core.ts:103` (`Buffer.concat(stdout).toString("utf8")`
  handed to `parseCompletion`). stderr is drained and discarded
  (`acceptance/relay-core.ts:82`).
- The OpenAI-shaped HTTP response the relay emits contains `id`, `object`, `created`,
  `model`, `maker`, `choices` — **no `usage` key** (`acceptance/relay-core.ts:159-166`).
  So every consumer behind the relay (the provider gateway) is structurally blind to
  tokens today.
- Persistence: none in this file.

## Path 2 — claude-relay.ts (Anthropic via claude CLI)

- CLI envelope (one JSON object on stdout, per empirical note
  `acceptance/claude-relay.ts:16-24` and the captured-shape fixture
  `acceptance/test-fixtures/fake-claude-cli.mjs:14-27`): `is_error`, `duration_api_ms`,
  `num_turns`, `session_id`, **`total_cost_usd` (number, USD)**, **`modelUsage`
  (record keyed by real model id → per-model usage object, e.g. `{ output_tokens: 5 }`
  in the fixture; live envelopes carry input/output token counts per model)**,
  `subtype`, `result`, `type`.
- What the parser keeps: `result` (content) and the single key of `modelUsage` (model
  id) — `acceptance/claude-relay.ts:44-68`. The `modelUsage` **values** are typed
  `z.unknown()` and dropped (`acceptance/claude-relay.ts:47`), and `total_cost_usd`
  is not even in the schema (passthrough, then ignored).
- Where fields appear: CLI stdout JSON envelope only (no log file involved;
  `--no-session-persistence` is passed, `acceptance/claude-relay.ts:76-82`, so there is
  **no session file to mine after the fact** for relay calls).
- Persisted today: nothing token-related. Gap: cost/tokens received and discarded.

## Path 3 — model-shim.ts (Codex CLI / OpenAI)

- CLI output: JSONL event stream from `codex exec --json <prompt>`
  (`acceptance/model-shim.ts:76`). The parser keeps only the deduped `model` field of
  any event and the last `item.completed`/`agent_message` text
  (`acceptance/model-shim.ts:45-70`); every other event is dropped.
- The test fixture models only `thread.started` + `item.completed`
  (`acceptance/test-fixtures/fake-codex-cli.mjs:10-14`) — **no usage event has been
  captured for the exec stream**, so whether the installed codex build emits a usage
  event on stdout is UNVERIFIED in this repo (open question for the metering ticket:
  capture one real `codex exec --json` stream and check).
- What definitely exists out-of-band: codex **session files** at
  `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` carry `event_msg`/`token_count`
  events with `info.total_token_usage` and `info.last_token_usage`, fields
  `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`,
  `reasoning_output_tokens`, `total_tokens` (all integer token counts), plus
  `model_context_window` and `rate_limits` (verified live 2026-08-14 against
  `rollout-2026-08-14T16-48-21-*.jsonl`; 266 `token_count` events in that one file).
  This is the "codex session footer" basis the manual ledger used. No cost-in-USD
  field; tokens only.
- Persisted by V3 today: nothing. Gap: the relay path itself reports zero token data.

## Path 4 — grok-relay.ts (xAI grok CLI)

- The **only** relay that parses cost: the envelope schema REQUIRES
  `total_cost_usd: z.number().nonnegative()` (USD, per whole CLI call) and
  `modelUsage` (record model-id → usage object) — `acceptance/grok-relay.ts:17-22`.
  Captured real-envelope shape (`acceptance/test-fixtures/fake-grok-cli.mjs:11-22`)
  also carries top-level `usage: { input_tokens, output_tokens }`, `num_turns`,
  `stopReason`, `sessionId`, `requestId`.
- What survives parsing: `content`, `model`, `costUsd` (`acceptance/grok-relay.ts:44`).
  But per-request `costUsd` is then **dropped by relay-core**, whose `CliCompletion`
  contract has no cost field — only the **startup-handshake** cost escapes, as the
  in-memory `handshakeCostUsd` on the relay handle (`acceptance/grok-relay.ts:73,99`),
  which no other non-test file consumes (repo-wide grep: only grok-relay.ts itself).
- The manual ledger notes grok's local `updates.jsonl` "carries no parseable token
  totals" (`docs/missions/2026-08-06-v3-programming/TOKEN-LEDGER-2026-08-13-14.md:60`),
  so the stdout envelope is the whole per-call story for xAI.
- Persisted today: nothing. Gap: per-call `total_cost_usd` + `modelUsage` +
  `usage.input_tokens/output_tokens` are parsed-or-present, then lost.

## Path 5 — vLLM OpenAI-compatible container

- Container: `vllm/vllm-openai:latest@sha256:ffb2d59b…` on port 8000
  (`compose.dev.yaml:33-39`; digest pinned in `register.bootstrap.json:8`).
- A vLLM `/v1/chat/completions` (OpenAI-compatible) response body carries a standard
  `usage` object: `prompt_tokens`, `completion_tokens`, `total_tokens` (integer token
  counts, non-streaming responses; streaming needs `stream_options.include_usage`).
- The V3 adapter `vllm-openai-compatible-http` is registered
  (`packages/providers/src/index.ts:97-100`) and is a pure delegate to
  `OpenAICompatibleProviderGateway` (`packages/providers/src/index.ts:375-385`). That
  gateway's response schema reads **only `id`, `model`, `choices[].message.content`**
  (`packages/providers/src/index.ts:159-165`); `usage` is never read. It IS, however,
  persisted incidentally: the whole body text goes to
  `persistRawArtifact({ …rawText… })` (`packages/providers/src/index.ts:253-269`) →
  `ledger.raw_artifact.raw_text` (`packages/ledger/src/index.ts:207-225`,
  table `migrations/0000_s00.sql:139-153`). So a direct-vLLM call's tokens are
  recoverable by re-parsing `raw_text` — but never surfaced as a column or result field.
- Production status: the compiled vLLM gateway is not selected anywhere yet —
  "production selection awaits the configured-provider register row"
  (`tools/orphan-audit/src/index.ts:630`).

## Path 6 — where responses flow after the relay (runner / providers persistence)

- Wiring: acceptance boots the claude + grok relays and hands each relay's
  `baseUrl` to `createPostgresProviderGateway(pool, { endpoint: `${baseUrl}/v1`, … })`
  (`acceptance/main.ts:437-447`, `acceptance/main.ts:221-235`;
  `apps/runner/src/index.ts:1995-2026`).
- Per call the gateway persists TWO rows: `ledger.raw_artifact` (raw body text,
  `metadata_json` = `{ status, attempt }` only — `packages/providers/src/index.ts:263`)
  and `ledger.ledger_entry` (attempt/outcome/hashes/timestamps — schema at
  `migrations/0000_s00.sql:155-175`; insert at `packages/ledger/src/index.ts:184-195`).
  **Neither table has any token/cost column** (grep `token` over `migrations/*.sql`:
  zero hits). `ProviderLedgerInput` (`packages/providers/src/index.ts:132-146`) and
  `ProviderCallResult` (`:77-85`) likewise carry no usage fields.
- Because the relay response has no `usage`, the persisted `raw_text` for every
  CLI-relayed maker (Anthropic, xAI, OpenAI) contains **no token data at all** — the
  loss happens upstream, inside the relay, not in persistence.
- The only "token" concept in the call path is the budget ceiling: `bound.tokenCeiling`
  is sent as `max_tokens` on the request (`packages/providers/src/index.ts:222`) — a
  limit, not a measurement. Repo-wide, the only other `usage` hit in apps/packages is a
  CLI usage-string in `apps/replay/src/cli.ts:7`.

## Path 7 — the manual TOKEN-LEDGER (2026-08-13/14)

File: `docs/missions/2026-08-06-v3-programming/TOKEN-LEDGER-2026-08-13-14.md`.
A hand-assembled, per-agent table answering V's "Fable drinks tokens while GPT shows
nothing" question; the stated finding is that the ledger's own absence was the bug
(`:3-9`). Accounting bases, per section:

| Section | Basis (as stated) | Nature |
|---|---|---|
| OpenAI/Codex product coding (`:11-25`) | "codex session footers, exact" — i.e. the `token_count` events in `~/.codex/sessions` rollout files | manual transcription, exact tokens; ≈2,782,749 total |
| Anthropic/Opus subagents (`:27-43`) | "harness task-notification usage fields, exact" | manual transcription from orchestrator harness notifications; ≈1,752,471 |
| Anthropic/Fable orchestrator (`:45-50`) | "NOT self-measurable from inside the session; the Anthropic console is authoritative" | qualitative only — no number |
| Anthropic/claude relay, product spend (`:52-57`) | "ledger.ledger_entry rows per run (exact per run in DB)" | **call COUNTS only** — ledger_entry has no token column, so this basis counts calls, not tokens |
| xAI/Grok (`:58-62`) | "74 grok sessions… updates.jsonl carries no parseable token totals; the xAI console is authoritative" | session count only |

So: every number in it was obtained manually, from out-of-band surfaces (CLI session
files, harness notifications, consoles); the in-DB basis measures call volume, not
tokens. That is precisely the gap the evaluator's cost signal must close.

## Gap summary (per path)

| Path | Token/cost fields on the wire today | Persisted today |
|---|---|---|
| claude relay | `total_cost_usd` (USD), `modelUsage` per-model token counts — on CLI stdout, discarded at `acceptance/claude-relay.ts:47,62` | nothing |
| grok relay | `total_cost_usd` (USD, parsed then dropped), `usage`/`modelUsage` token counts on stdout | nothing (handshake cost in-memory only) |
| codex shim | nothing captured from `exec --json` stdout (unverified whether emitted); exact tokens exist in `~/.codex/sessions/*/rollout-*.jsonl` `token_count` events | nothing |
| relay-core HTTP response | no `usage` key at all (`acceptance/relay-core.ts:159-166`) | n/a |
| vLLM direct | standard `usage.prompt_tokens/completion_tokens/total_tokens` in response body | yes, but only as unparsed `raw_text`; adapter not yet production-selected |
| gateway/ledger | none — no token column in any migration | ledger rows = call counts + outcomes only |

## Recommendation — smallest capture point(s)

**One primary hook, one schema touch, one honesty rule:**

1. **Widen `CliCompletion` in relay-core** (the single shared seam all three CLI
   adapters already flow through) with an optional, honest usage block, e.g.
   `usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number } | null`,
   filled by each adapter from what its CLI actually reports (claude: `modelUsage`
   values + `total_cost_usd`; grok: already parses `costUsd`, add `usage` fields;
   codex: `null` until a real usage event is confirmed on the exec stream). Then emit
   it as a standard OpenAI `usage` object in the relay's HTTP response
   (`acceptance/relay-core.ts:159-166`, mapping to `prompt_tokens`/`completion_tokens`
   plus a vendor `x_cost_usd` extension). This is ~3 small diffs in acceptance/, zero
   new processes, and it makes every relayed maker look like vLLM on the wire.
2. **Read `usage` in the one gateway** (`packages/providers/src/index.ts` response
   schema, `:159-165`) as optional passthrough and carry it into persistence. Smallest
   persistence change: add it to `raw_artifact.metadata_json` (already jsonb, no
   migration — `packages/providers/src/index.ts:263`). If the evaluator needs SQL-side
   aggregation, the alternative is nullable token/cost columns on
   `ledger.ledger_entry` via a new migration — costlier (append-only ledger schema,
   migration 0023) but queryable. Metadata-json first is the minimal viable step;
   the evaluator can aggregate `metadata_json->'usage'` per `model_id` via the joined
   `raw_artifact` row.
3. **Unmetered paths stay loudly unmetered, never estimated** — consistent with the
   repo's no-fabrication law (DR-115, `acceptance/relay-core.ts:12-14`) and the manual
   ledger's own practice ("where a basis is unavailable locally, it says so rather
   than estimating", TOKEN-LEDGER `:8-9`). Concretely: `usage: null` in the relay
   response and an absent `usage` key in `metadata_json` mean UNMETERED; the evaluator's
   relative-cost signal should compute only over metered calls and surface an explicit
   `unmetered_call_count` per model rather than imputing tokens. If codex stdout truly
   carries no usage event, the codex path is the one expected unmetered CLI path until
   a session-file-tailing sidecar is deliberately ticketed (out of scope here).

Explicitly NOT recommended: per-relay bespoke hooks (three divergent capture points
for one shape), or tailing CLI session files as the primary meter (out-of-band, absent
for claude relay calls by design via `--no-session-persistence`,
`acceptance/claude-relay.ts:79`).

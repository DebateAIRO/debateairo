# Loop report 17 — FAIR-02 (second model maker: Anthropic claude-CLI relay) — DONE

**Lane:** DR-140 (Claude worker codes, Grok reviews). Cut and closed
2026-08-10; the lane's cleanest cycle — Grok APPROVED on the first pass with
zero blocking findings, and the only rework was V's environment (CLI login).

**What shipped (acceptance/):** `claude-relay.ts` — the second real maker, an
OpenAI-compatible relay to the local Claude Code CLI (`claude -p <prompt>
--output-format json`, flags verified empirically against v2.1.221, never
guessed). Maker `Anthropic`; the model id is taken from the CLI's own
`modelUsage` report per call — never a literal. A startup handshake captures
the honest model id and refuses to start on a dead or unauthenticated CLI.
`relay-core.ts` — the shared CLI-relay core (P4 gateway seam, P8 strategy);
`model-shim.ts` refactored onto it with public surface, behavior and tests
unchanged-green. Register: `configuredProviderSet` gains
`acceptance:claude-cli`/`Anthropic` at provenance `acceptance:DR-140:V-approved`;
capability reads honestly report 2 makers. `dual-maker-proof.ts` — the
one-command DONE-gate driver.

**V sitting (DR-143):** deployment `requiredDistinctMakers` STAYS 1 (DR-137
governs admission; DR-140(b) is run-level fair-debate law for FAIR-01 to
enforce), CLI-default model (no `--model` pin; lineage stays CLI-reported),
boot handshake ratified. Asked and answered through the UI question card —
V's standing preference for day-mode sittings.

**Live gate:** attempt 1 failed at the Anthropic handshake with the relay's
designed loud refusal (`CLAUDE_CLI_FAILED`) — orchestrator probe confirmed the
cause was environmental, not code: the CLI returned "OAuth session expired and
could not be refreshed", `modelUsage` empty, so no model id was invented.
After V authenticated, attempt 2 was GREEN: persisted lineage, one row per
maker, never blended —
`{acceptance:codex-cli, OpenAI, gpt-5.6-sol}` and
`{acceptance:claude-cli, Anthropic, claude-fable-5}`.

**Side effect handled honestly:** the standing DB predated the
`configuredProviderSet` change, so the seed-freshness guard stopped the first
proof run (`ACCEPTANCE_REGISTER_CONFLICT` — working as ruled). The old debate
database was BACKED UP rather than deleted
(`scratchpad/pgdata-backup-4594a592`), and a fresh ceremony re-served run
`e7ead8e2-b99d-4faf-8674-711f9e91009d` — which incidentally proved FAIR-02's
register change non-breaking for the single-maker path, and produced the
mission's first FULLY SERVED verdict (SUPPORTED, conformance PASS, serve state
RECOMPOSED_ONCE, band CAPPED per DR-086, hypothesis + research plan prose).

**Residuals:** none blocking. FAIR-01 now owns the run-level two-maker
requirement.

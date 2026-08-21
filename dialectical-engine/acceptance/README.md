# ACC-01 acceptance harness

This directory is the DR-133 acceptance mechanism. It imports shipped package
APIs; no product package imports it. It is intentionally outside the production
reachability/orphan entry-point walk, whose declared roots remain
`apps/api/src/main.ts`, `apps/runner/src/main.ts`, and
`apps/scheduler/src/cli.ts`. Acceptance entry files are therefore not reported
as production `ATTACHED` surfaces.

DR-136 supplies the provisional `convergenceStopDefaults` members and their
distinct `acceptance:DR-136:V-approved` provenance.

**Terminal WAIT drain (TERM-01, DR-139).** The live path now wires the REAL
terminal activation evaluator (`createTerminalActivationEvaluator` from
`@debateai/battery`): at run completion it computes each still-WAIT row's
declared predicate inputs from the run's RECORDED facts only (ledger + DB —
no model calls, no clock-derived facts, no fabrication), applies the shipped
`resolveActivationState` rule, and records the computed inputs as evidence on
every drain transition. An input genuinely unrecorded at terminal is a typed
loud refusal (`TERMINAL_ACTIVATION_UNRESOLVED`) and the run stays unsettled.
Rows ACTIVE at terminal settle the run WITH typed loud condition marks: the
served answer carries `OWED-CHECK-UNEXECUTED` plus one `condition_mark_records`
entry naming each battery row whose owed check has no recorded execution
(DR-139 ruling 4). The DR-135 refusing evaluator
(`resolveAcceptanceTerminalActivations`) remains in place as the outermost
fallback: it resolves nothing and fails typed-loud on any outstanding WAIT row.

**Configured maker panel (FAIR-02 + GROK-01, DR-140/DR-177).** The relay layer
carries all configured makers behind one shared CLI-relay core (`relay-core.ts`, P4/P8):
`model-shim.ts` relays to the codex CLI (maker `OpenAI`, ruled model
`gpt-5.6-sol`) and `claude-relay.ts` relays to the local Claude Code CLI
(`claude -p <prompt> --output-format json`, maker `Anthropic`), while
`grok-relay.ts` relays to the local Grok Build CLI (maker `xAI`). Both external
CLI relays perform a REAL handshake at startup and report the model id the
CLI itself returns in its JSON lineage fields — never a guessed literal,
never "shim" (DR-115); zero or several reported models, a CLI-declared
`is_error`, nonzero exit, unparseable output or a deadline are typed loud
HTTP errors (`CLAUDE_CLI_FAILED` / `CLAUDE_CLI_OUTPUT_INVALID` /
`CLAUDE_CLI_MODEL_UNRESOLVED` / `CLAUDE_CLI_TIMEOUT`), never fabricated
choices. `configuredProviderSet` now lists all three providers
(`acceptance:codex-cli`, `acceptance:claude-cli`, `acceptance:grok-cli`) with
provenance `acceptance:DR-177:V-approved`, so the deployment maker-capability
read honestly reports 3 configured makers; `requiredDistinctMakers` stays 1 per
DR-137. Seed freshness stays loud: a standing `.pgdata` seeded before FAIR-02
stops with `ACCEPTANCE_REGISTER_CONFLICT:configuredProviderSet` — reset the
standing data directory rather than mutating sealed rows.

Ceremony boot handshakes all three providers independently. Healthy relays form
the discovered panel; no caller supplies a maker count and no panel-size
ceiling refuses a lawful nonempty debate. Grok's fixed relay port is
operator-supplied as `ACCEPTANCE_GROK_RELAY_PORT`; GROK-01 proposes the durable
register row and does not invent or seed a port number before V ratification.

The orchestrator drives the LIVE dual-maker proof (one call round-tripped
through EACH maker, honest lineage rows persisted in `ledger.raw_artifact`)
from a plain terminal (the claude CLI needs its own keychain login —
`claude /login` first if expired):

```text
ACCEPTANCE_DB_PORT=<port> ./node_modules/.bin/tsx acceptance/dual-maker-proof.ts
```

**Multi-maker depth-driven debate (FAIR-01 + PRO-01 + PANEL-01, DR-140(b),
DR-149, DR-154(2), DR-159).** The ceremony starts the Anthropic relay beside
the codex shim. The healthy discovered panel is pinned at admission; each maker
independently authors a depth-0 position root. `depth_params.depth` counts
expansion rounds below each root: every node authored in the previous round receives one real
`support` child and one real `attack`/`rebutting` child through the same shipped
Judge organ. Authorship alternates by level (OpenAI root, Anthropic round 1,
OpenAI round 2, and so on); each artifact records the maker/model/provider that
actually ran. Call sites name their leg, round, and parent index
(`JUDGE:defender:root<root>:r<round>:p<index>` /
`JUDGE:critic:root<root>:r<round>:p<index>`).
The synthetic question remains neutral and outside the graph. Each maker also
authors one cross-root response, represented by a support edge to its own root
and an attack edge to the other root, with magnitude `UNKNOWN`. Serve remains
the ruled single-primary-root B2-A shape. DR-161 makes that choice explicit as
`first-configured-provider`: the selected root and rule travel on the required
`UNSERVED-MAKER-POSITION` record, which names both makers and both root ids.
The other root remains graph-visible but is not composed into the served
answer. Every node is still judged, recorded, and propagated. Each child carries its own stranger restatement, reduced judgement,
and per-node strength record citing its own artifact. Edge magnitude remains
honestly `UNKNOWN` where no evidence verifier measured it. Classification uses
the debate's one claim frame (the run question), not a child position's wording.
The S08 critique-packet /
independence-receipt instrument is deliberately NOT recorded: DR-141(4) rules
that a run carrying critique packets REFUSES at terminal (Q42 `critic_agrees`
has no recorded shape) until V rules the recording migration — independence
is instead proven from recorded per-artifact maker lineage by the RUN-LEVEL
fair-debate gate (`fair-debate.ts`): more than one node, more than one
persisted maker, and at least one attack edge joining nodes of DIFFERENT
makers, all read back from the settled record and printed by the ceremony.

**The ruled operator (DR-074 → DR-144).** Propagation over an arrow-bearing
graph requires the mandatory deployment `scoringOperator` register row,
resolved through the shipped `resolveScoringOperator` chain with the
supplying level recorded on the propagation receipt. V ruled the value at
DR-144: **`accumulate`**, seeded byte-faithfully with provenance
`acceptance:DR-144:V-approved` (provisional pending the DR-023 sitting).
A runner composed for the fair debate WITHOUT the ruled row still stops
loudly with `SCORING_OPERATOR_UNRESOLVED` before any claim or model call
(AC-76/DR-039 — never invented). NOTE: the seed's row count changed, so a
standing `.pgdata` sealed before DR-144 stops with
`ACCEPTANCE_REGISTER_VERSION_CONFLICT` — reset the standing acceptance data
directory before the live gate.

DR-182 makes every nonempty discovered panel lawful at every risk tier. A mono
answer serves with `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE`, the ruled lower
confidence band, and an explicit depth-not-expanded reason. The
`panelDiscoveryPolicy` row fixes probe freshness at 600,000 ms and one attempt.
The run-total tripwire is computed from exported engine facts and the existing
register-supplied organ/death-policy bounds; it is persisted for honesty but is
not shown as a user-facing promise.

Discovery probes are real provider completions, not free health checks. On a
fresh N-member ceremony the normal path spends N startup handshakes plus N
claim-time probes before debate work; a stale admission can spend up to N more.
The ceremony prints its append-only `core.provider_probe` evidence-row count
alongside the discovered panel and structural ceiling. Probe completions are not
written to `ledger.ledger_entry`: boot probes have no run/work-item identity and
the ledger's action-kind vocabulary has no probe member, so doing that honestly
requires a separately ruled schema/action migration rather than disguising them
as `MODEL_CALL`. During DISC-01 rev2, the one authorized real Codex handshake
reported 16,009 input tokens (11,008 cached) and 5 output tokens.

PRO-01's one authorized live depth-2 proof is isolated from the sealed standing
database and runs with:

```text
ACCEPTANCE_DB_PORT=<free port> \
ACCEPTANCE_API_HOST=127.0.0.1 \
ACCEPTANCE_API_PORT=<free port> \
ACCEPTANCE_SHIM_PORT=<free port> \
ACCEPTANCE_GROK_RELAY_PORT=<V/operator-supplied port> \
ACCEPTANCE_STRANGER_SAMPLE_RATE=1 \
ACCEPTANCE_BATTERY_VERSION=acceptance-v1 \
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:pro01-depth2 \
./node_modules/.bin/tsx acceptance/pro01-depth2-proof.ts
```

PANEL-01's one authorized live depth-1 proof is likewise isolated and evaluates
the complete discovered panel rather than assuming M=2:

```text
ACCEPTANCE_DB_PORT=<free port> ACCEPTANCE_API_PORT=<free port> \
ACCEPTANCE_SHIM_PORT=<free port> \
./node_modules/.bin/tsx acceptance/panel01-depth1-proof.ts
```

The proof prints the run/answer IDs, total model attempts (including failed or
timed-out attempts) against the run's computed structural ceiling, the probe
evidence count, and every node's persisted maker/model/provider lineage, then
removes only its caller-owned temporary database. Depth 3 remains reserved for
V's acceptance run.

The runtime environment is strict and contains no Hatchet keys:

```text
ACCEPTANCE_DB_PORT=<V/operator-supplied fixed local port>
ACCEPTANCE_API_HOST=127.0.0.1
ACCEPTANCE_API_PORT=<V/operator-supplied API port>
ACCEPTANCE_SHIM_PORT=<V/operator-supplied shim port>
ACCEPTANCE_STRANGER_SAMPLE_RATE=<V/operator-supplied 0..1 rate>
ACCEPTANCE_BATTERY_VERSION=acceptance-v1
ACCEPTANCE_SETTLEMENT_WATCH_HANDLE=acceptance:standing-watch
```

Run with the same token later pasted into UI Settings:

```text
./node_modules/.bin/tsx acceptance/run-acceptance.ts --token <same-ui-token>
```

By default the ceremony settles, verifies the FAIR-01 fair-debate gate,
prints the run id / answer id / graph and maker report / UI URL, and shuts
the whole stack down cleanly. Pass the value-less **`--serve`** flag to keep
the database, model shim, claude relay and API standing after settle so the
UI at `http://localhost:3000/debate/<run-id>` can browse the settled debate
(Ctrl-C stops the stack). This replaces the earlier ad-hoc standing script.

Ask-input defaults (all overrideable by the named CLI flag) are:

- `--question`: `What is the strongest case for adopting a four-day workweek
  at a software company?` — **self-contained by requirement** (ACC-01 review
  finding N1): the default question must carry its own proposal. The previous
  default referred to a proposal it never supplied, so the judge honestly
  refused to invent one (restatement FAIL) and the run could only terminate
  components-only; a composed debate needs a question whose subject is in the
  question line itself.
- `--risk-tier`: `standard`
- `--tier-provenance-ref`: `acceptance:cli-default`
- `--composition-budget-tier`: `low`
- `--depth-params`: `{"depth":1}`
- `--decision-owner` and `--action-owner`: `acceptance-user`
- `--decision-scope`: `prototype-acceptance`
- `--as-of`: invocation time in ISO-8601 form
- `--steering-presets` and `--steering-annotations`: `[]`

Point both browser and server-side web clients at the acceptance API:

```text
NEXT_PUBLIC_API_BASE=http://127.0.0.1:<ACCEPTANCE_API_PORT>
DIALECTICAL_API_BASE=http://127.0.0.1:<ACCEPTANCE_API_PORT>
```

The fake CLIs (codex and claude) and blanket-INACTIVE terminal evaluator exist
only in `*.test.ts` and `test-fixtures/`; runtime entry points reject those
test-only seams outside `NODE_ENV=test`. The DR-135 refusing evaluator is lawful live acceptance code.

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
stops with `ACCEPTANCE_REGISTER_CONFLICT:configuredProviderSet`. Sealed rows are
never mutated — see **The ceremony register version** below for what to do
instead.

**Which CLI a maker relay runs (D10).** Nothing in this directory names a path
to a binary; where a maker's CLI lives is a fact about THIS host and is deduced
here, never written down. For each maker the relay asks, in this order:

1. the maker's own environment key — `ACCEPTANCE_CLAUDE_BINARY`,
   `ACCEPTANCE_CODEX_BINARY`, `ACCEPTANCE_GROK_BINARY`,
   `ACCEPTANCE_HERMES_BINARY` — which may hold a full path or a bare name to
   look up. A key that is present but blank stops the relay with the maker's
   bare code (`CLAUDE_CLI_BINARY_UNRESOLVED` and its three siblings): an
   operator who set the key meant to decide, and the harness never guesses on
   their behalf.
2. with no key set, the maker's NAME — `claude`, `codex`, `grok`, `hermes` — is
   looked up across the directories of `PATH` in order. **The first entry that
   exists under the name is the match, and it is then admitted or refused; a
   broken entry is never stepped over.** That is deliberately unlike `command -v`,
   which skips a non-executable entry and keeps searching: silently running a
   different install than the one at the front of your `PATH` is a lineage hazard
   in an engine whose whole output is model attribution, and a loud refusal
   naming the file is recoverable in seconds. The cost is real — a stale,
   non-executable launcher early on `PATH` now stops the ceremony where your
   shell would have answered cheerfully. A `PATH` entry that is empty or
   relative is skipped entirely.

Whatever that produces must then pass one check before anything is started:
with symlinks followed it has to be a regular file, non-empty, executable by
this user, readable, and a program by its first bytes — a `#!` line naming an
interpreter, or a Mach-O / universal-binary / ELF magic number. A candidate that
fails refuses loudly as `<MAKER>_CLI_BINARY_UNRESOLVED:<REASON>:<path>`, where
REASON is one of `NOT_ON_PATH`, `NOT_FOUND`, `EMPTY`, `NOT_EXECUTABLE`,
`UNREADABLE` or `NOT_A_PROGRAM`, and the ceremony prints that whole string as
`MAKER ABSENT <maker> <code>`.

The path that is checked is always ABSOLUTE, and it is the exact string that is
spawned — a relative value in the key is resolved against the harness's working
directory first. Anything else would be re-resolved by the child, which starts in
a fresh empty scratch directory with its own `PATH`, so the file that ran need
not have been the file that was checked.

The relays start the resolved program DIRECTLY and never through a command
interpreter, and a refused candidate is never started at all. Both halves of
that rule were bought on 2026-09-17: one maker's launcher was a 0-byte file left
behind by an interrupted update, and another's had been overwritten with four
lines of plain text — and that second file, handed to an interpreter which could
not execute it and so re-read it as a script, re-entered itself until the host's
process table was full.

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
the ruled single-primary-root B2-A shape, but T10 (goal 188-195, rulings
S6-1/S6-3) repeals DR-161's provider-order choice: **the served root is the one
carrying the maximum PROPAGATED strength** among the servable maker roots, so
reordering the configured providers cannot change which answer is served. An
exact strength tie is broken by lexicographic node id compared on code units
(never locale collation, which would move with the host). The selected root and
the rule travel on the required `UNSERVED-MAKER-POSITION` record — which names
both makers and both root ids — under the recorded rule
`max-propagated-strength-lexicographic-tiebreak`; the margin to the runner-up is
recorded on the propagation receipt
(`ledger.propagation_run.served_root_selection`).
The other root remains graph-visible but is not composed into the served
answer.

**Diagnosing a two-maker ceremony:** do NOT expect the first configured provider
to win. Read the served root off the recorded per-node strengths, or off that
receipt. Answers sealed before migration 0055 keep the retired
`first-configured-provider` value on their own records — preserved history, not
a live rule, and never relabelled. Every node is still judged, recorded, and propagated. Each child carries its own stranger restatement, reduced judgement,
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
`ACCEPTANCE_REGISTER_VERSION_CONFLICT` — see **The ceremony register version**
below.

**The ceremony register version.** `ACCEPTANCE_REGISTER_VERSION`
(`seed-register.ts`) is the version the ceremony seeds and reads, and it is
**3** since ruling D77 (c) refitted `globalStopDelta` to 0.01 and
`branchFreezeEpsilon` to 0.005. `seedAcceptanceRegister` carries the rows in
through `importHistorical`, which is replay-only: a version that already exists
must match the supplied snapshot byte for byte, or the seed stops with
`REGISTER_PUBLICATION_SEAL_INVALID: historical replay drift`. **Sealed means
immutable per version, so a changed row-set is a NEW version, not an edit and
not a reset** — raising the pin mints the new version beside the old ones and a
standing `.pgdata` keeps every earlier version exactly as the run that used it
left it. (Version 2 is what the 2026-09-17 run `d7b73d79` read; version 1
predates the T16 lane.) Resetting the standing acceptance data directory is
therefore **no longer the only way** past a seed-freshness stop, and it destroys
the run database — prefer raising the pin. Reset only when you actually want a
database with no history. One caveat: `importHistorical` refuses any version
above 4, so after 3 exactly one rung is left before the seeding path itself has
to change.

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

Run with a dedicated 43-character service credential, which the operator exports
in their own shell before the command. The harness derives a real server-side
session from it; the credential itself is never sent as an HTTP header, cookie,
URL, or request body:

```text
export ACCEPTANCE_SERVICE_CREDENTIAL=REPLACE_WITH_THE_43_CHARACTER_CREDENTIAL
./node_modules/.bin/tsx acceptance/run-acceptance.ts
```

The credential is read from that environment variable and from nowhere else, and
it is never a command-line argument, because a process's arguments are visible to
every user of the machine through the process list for the whole of the run while
its environment is not (`F-CREDENTIAL-ON-ARGV`, 2026-09-18). Offering
`--service-credential` on the command line is refused by name with
`ACCEPTANCE_SERVICE_CREDENTIAL_ON_ARGV_REFUSED`, before the unknown-argument and
missing-value checks and without repeating the offered value, so the old shape
cannot survive by habit. An absent or blank variable is
`ACCEPTANCE_SERVICE_CREDENTIAL_REQUIRED`; one that is not 43 characters of
`[A-Za-z0-9_-]` is `ACCEPTANCE_SERVICE_CREDENTIAL_INVALID`. The same exported
variable supplies the three live proofs
(`pro01-depth2-proof.ts`, `panel01-depth1-proof.ts`, `xrev01-depth1-proof.ts`),
which no longer carry a placeholder credential of their own.

By default the ceremony settles, verifies the FAIR-01 fair-debate gate,
prints the run id / answer id / graph and maker report / definition-of-done
report / UI URL, and shuts the whole stack down cleanly. Pass the value-less
**`--serve`** flag to keep
the database, model shim, claude relay and API standing after settle so the
UI at `http://localhost:3000/debate/<run-id>` can browse the settled debate
(Ctrl-C stops the stack). This replaces the earlier ad-hoc standing script.

#### The definition-of-done report

The Global definition of done
(`.hermes/reports/2026-09-01-algorithm-live-loop/slices/S12-closure/SPEC.md:37-41`)
names nine sub-clauses. The ceremony prints **one line per sub-clause**, each led by a
stable, unique token. Sub-clauses 4 and 9 — the recorded ceiling and the
envelope state at terminal — keep the `T17 envelope at terminal` line they have
always had; the rest are read by `acceptance/dod-facts.ts` and printed on the
same `console.info` stream, which
`.hermes/reports/2026-09-01-algorithm-live-loop/tools/closing-run.sh:20,36`
captures verbatim into `logs/closing-run/ceremony-*.log`. The tokens are fixed:
a token that moved would invalidate every log captured before it moved.

The DoD lines are printed **last, after every other report line**, and the
reader that produces them runs only once those lines are on the log. That order
is deliberate and is pinned by `acceptance/run-acceptance.test.ts`: the reader
issues three queries and can refuse by a typed code, and the ceremony's `catch`
closes the stack and rethrows, so a reader that ran first could cost a settled
closing run its entire report.

| Token | Sub-clause | What the line carries |
| --- | --- | --- |
| `DOD-1 panel-reduced-tau` | panel-reduced τ, non-self-graded | node count, whether every τ had a non-author voice, the node ids of any single-voice panel |
| `DOD-2 measured-edges` | measured edges | **two counts**: how many of *every* `core.edge` of the run carry a PRESENT magnitude (the clause's own reading), then the same over the attack edges **FAIR-01 counts** — `polarity='attack' AND target_kind='NODE'` (`fair-debate.ts:122`). The `FAIR-01 graph` line six lines earlier prints that second population, so one log never carries two attack-edge counts by unstated rules. Nothing mints an EDGE-targeted arrow today, so the two agree; the day an undercutting arrow is minted they will not, and the line says which is which. |
| `DOD-3 root-final-vs-tau` | a root's final strength ≠ τ | root count, whether one differs, the witness node id, and each root's τ / final |
| `DOD-5 surviving-objection` | the statement acknowledging the strongest surviving objection | the strongest survivor's node id and final strength (or `none`), whether the last evaluator round was satisfied, and whether `SYNTHESIS-OBJECTION-STANDING` rides the answer |
| `DOD-6 evaluator-loop` | the evaluator loop record | rounds recorded / the sealed `evaluatorLoopMaxRounds`, and each round's number, stage and verdict |
| `DOD-7 verdict-label` | the code-derived three-state label | the label (or the unavailability reason ref), the terminal and the serve state |
| `DOD-8 confidence-band` | the band counted over cited nodes | the band, its `LOOKED_UP/RAN/REASONING` basis counts, and the ceiling's register row key |

Only a SHAPE violation refuses the ceremony — a node with no τ, rounds numbered
other than 1..n, more rounds than the register sealed, or a label that is
neither a state nor an unavailability reason
(`ACCEPTANCE_DOD_*`). A definition-of-done OUTCOME — no root differing, an
objection still standing, a single-voice panel, an UNKNOWN magnitude, no
surviving objection — is **reported, never thrown**: the closing run's judge
decides what it means, and a reader that threw would destroy the evidence.

The same facts ride the returned ceremony as the typed, frozen
`definitionOfDone` block, so the live proofs can assert on them directly.

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

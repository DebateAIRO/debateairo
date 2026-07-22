# Benchmark harness (Task 17, P5)

Minimal runnable implementation of the harness `docs/algorithm-evaluation-
blueprint.md` and `docs/improvement-plan-2026-07-22.md` (§P5) call for: a
fixed case suite, a runner that drives a real coordinator and reads real
metrics back out of its DB, and a report that diffs two runs. This is what
turns "I think the candidate is better" into a number.

**⚠️ Running this against a live coordinator consumes real CLI quota.**
Every case is a full multi-branch debate: several generation calls plus one
judge call per argument node (the plan doc's own estimate: a 29-node debate
is roughly 7 generation calls + 29 judge calls, ~11 minutes sequential on
`codex`). Running the full 25-case suite is **25x that** — budget for it,
use `--limit` while iterating, and always set `--max-spend-usd` for a real
run. `--panel` adds two more real CLI calls per case on top of that.

## What's here

- `cases/suite-v1.json` — the 25-case suite (blueprint's evaluation-unit
  schema): 8 ground-truth-true factual, 8 ground-truth-false factual
  (4 of which are false-premise traps, for dimension 6 — wrongful
  agreement/sycophancy resistance), 9 contested-normative. Each case
  carries `expected_verdict_direction` (`supported` / `unsupported` /
  `contested` — the same vocabulary `app.scoring.verdict.verdict_summary`
  serves as `verdictBand`), `claim_type`, and 1-2 line `ground_truth_notes`.
- `runner.py` — drives one coordinator, one debate per case, one manifest.
- `report.py` — diffs two runner outputs into one markdown page.

## Quick start

```bash
# From apps/dialectical-engine, with a coordinator already running
# (e.g. `python -m uvicorn app.main:app` from coordinator/, or the live
# dezbatere.ro stack) and DIALECTICAL_USER_TOKEN set:

# 1. Sanity check: validates the suite and coordinator connectivity, creates
#    nothing.
python scripts/benchmark/runner.py --dry-run

# 2. Baseline run, before your flag flip / code change. Cap spend, and
#    start small while you're getting the invocation right.
python scripts/benchmark/runner.py \
  --out scripts/benchmark/runs/baseline \
  --max-spend-usd 5 \
  --limit 5

# 3. Make your change (flip a flag, ship a patch, restart the coordinator).

# 4. Candidate run — SAME suite, SAME --limit, ideally the SAME machine/DB.
python scripts/benchmark/runner.py \
  --out scripts/benchmark/runs/candidate \
  --max-spend-usd 5 \
  --limit 5

# 5. Diff.
python scripts/benchmark/report.py \
  --baseline scripts/benchmark/runs/baseline \
  --candidate scripts/benchmark/runs/candidate \
  --out scripts/benchmark/runs/diff.md
```

When you're confident in the invocation, drop `--limit` to run the full
25-case suite (raise `--max-spend-usd` accordingly — see "Cost
expectations" below).

## The flip-gating rule

**Every P1-P4 flag flip in `docs/flip-plan-2026-07.md`'s staged order gets
a harness run before it ships to production.** This is not new policy —
the flip-plan doc's own staged order already assumes evidence-gathering
before each step, and the improvement plan says it explicitly: "Gate every
P1-P4 flag flip on a harness run." Concretely, before flipping any of
`DIALECTICAL_EVIDENCE_ACQUISITION`, `DIALECTICAL_EVIDENCE_VERIFICATION`,
`DIALECTICAL_JUDGE_PANEL_MODELS`/`DIALECTICAL_CALIBRATION_WEIGHTS`,
`DIALECTICAL_ADAPTIVE_EXPANSION`, `DIALECTICAL_ADVERSARIAL_POV`, or
`DIALECTICAL_CROSS_EXAM`:

1. Run the suite (or a representative `--limit` slice for a first pass)
   with the flag OFF — this is your baseline, unless you already have a
   recent one.
2. Flip the flag, restart the coordinator.
3. Run the suite again — this is your candidate.
4. `report.py` the two. Look specifically at: did `expected_direction_match`
   or `trap_expected_direction_match` regress? Did `evidence_resolution_
   rate` move the direction the flag should move it? Did cost/wall-time
   move by a surprising multiple, not just the expected one?
5. Keep both run directories (`manifest.json` + `results.json`) as the
   evidence record for the flip decision — same discipline
   `docs/flip-plan-2026-07.md` already asks for ("reviewed via the
   read-only `/api/ops/*` endpoints... rather than by tailing production
   traffic blind").

A harness run is a *supplement* to each flag's own documented verification
checklist in `docs/flip-plan-2026-07.md`, not a replacement for it — that
doc's precondition/verification/rollback steps for each flag still apply in
full.

## Cost expectations

Spend is only tracked for models with **known pricing**
(`app/services/spend.py`'s `MODEL_PRICING_USD_PER_MILLION_TOKENS` — today
that is `grok-4.5-high-loop` only). Every case's result carries
`metrics.spend_usd.unpriced_model_ids` honestly listing which models were
used but not priced, and `--max-spend-usd` only ever sees the *known*
total — **it cannot cap spend on models it can't price.** Treat
`--max-spend-usd` as a safety net for the priced slice of your model pool,
not a hard ceiling on the whole run's real-world cost. Wall time and token
totals are tracked for every model regardless of pricing, so you always get
an honest sense of scale even where dollars aren't computable yet.

Rough sizing, from the plan doc's own estimate: one case ≈ 7 generation
calls + ~29 judge calls, ~11 minutes sequential on a single `codex` judge.
25 cases sequentially is on the order of hours, not minutes — the runner
does not parallelize cases. `--panel` adds two more real CLI judge calls
(one `claude`, one `gemini`, via `app.providers.judge_panel_providers` —
Task 6's in-process CLI provider pattern) per completed synthesis, on top
of the debate's own cost.

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--suite PATH` | `cases/suite-v1.json` | Case suite to run. |
| `--base-url URL` | `http://127.0.0.1:8000` | Coordinator base URL. |
| `--db PATH` | `~/.dialectical/db.sqlite3` | Coordinator DB, opened **read-only** via a `file:` URI. Never written to. |
| `--out DIR` | none | Writes `manifest.json` + `results.json` here. Without it, results only print to stdout. |
| `--limit N` | none (all cases) | Run only the first N cases — use while iterating. |
| `--dry-run` | off | Validates the suite and checks coordinator connectivity (`GET /api/settings`); creates no debates. |
| `--max-spend-usd USD` | none (uncapped) | Soft cap: stops **launching new** cases once known spend reaches this. Does not abort an in-flight case. |
| `--panel` | off | Runs the 2-judge LLM panel (blueprint dims 1-10) over each completed synthesis. Real CLI calls — costs money, only run when you actually want dimension-level scores. |
| `--timeout-seconds N` | 900 | Per-case terminal-state poll timeout. |
| `--poll-interval-seconds N` | 5 | Seconds between debate status polls. |
| `--env-file PATH` | none | Reads `DIALECTICAL_*`/`NEXT_PUBLIC_*` flags from this file for the run's config tag (the coordinator exposes no live-flag-listing endpoint — see "Config tag" below). Point it at whatever file actually configures the coordinator process (its launchd `EnvironmentVariables`, a `.env`, etc). |
| `--user-token TOKEN` | `DIALECTICAL_USER_TOKEN`/`USER_TOKEN` env, else the dev default | Bearer token for the coordinator's user-token auth. |

## Config tag (what gets recorded per run)

Every run's `manifest.json` records, honestly:

- **git SHA** — `git rev-parse HEAD` against this repo. `"unknown"` if the
  runner isn't inside a git working tree.
- **flags** — `DIALECTICAL_*`/`NEXT_PUBLIC_*` values from `--env-file`, or
  `{"source": "unknown"}` if you didn't pass one. There is currently no
  coordinator endpoint that exposes its own live env (`/api/ops` only
  serves job transitions and verdict-shadow telemetry; `/api/settings`
  only serves model routing and spend) — pass `--env-file` for a real flip
  comparison, or the report's config-tag columns will honestly say
  `unknown` rather than guess.
- **model pool** — `GET /api/settings`'s `routing`/`enabled_models` at run
  time.

## Metrics collected per case

After polling a debate to a terminal state, the runner reads DB metrics
directly (SQL against `jobs`/`nodes`/`generations`/`analyzer_runs`/
`job_transitions`/`judge_output_artifacts`, always via a **read-only**
`sqlite3` connection — never SQLAlchemy, never a write): branch completion
fraction, distinct model families among completed branches, evidence node
counts by method + resolution status, verification verdict counts, score
distribution (strength/uncertainty five-number summary), lean, verdict
band, failover events, wall time, judge calls, and token totals + spend.

Verdict band and lean are **not re-derived** here — `runner.py` imports and
calls the coordinator's own pure functions
(`app.scoring.verdict.verdict_summary`, `app.scoring.lean.compute_lean`)
against the persisted `protocol_analysis` output, so this harness can never
silently drift from what production actually serves.

## Tests

`coordinator/tests/test_benchmark_harness.py` — suite schema validation,
every metric SQL function against a fixture DB built with the coordinator's
own SQLAlchemy models, `report.py`'s golden markdown diff, `--dry-run`
smoke and spend-cap stop logic against a fake HTTP transport
(`httpx.MockTransport`). No live coordinator, no live LLM, no network, and
no `--panel` code path in any test.

```bash
cd coordinator
DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  .venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_benchmark_harness.py -q
```

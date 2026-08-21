# Research brief — Observability layer + error-listener loop agent

- **Mission:** `2026-08-21-observability-loop`
- **Loop:** REQUIREMENTS ENGINEERING (parallel blind seats, then synthesis)
- **Read first:** `00-intake-H0.md` in this directory (V's verbatim goal,
  classification, banked constraints). This brief is the shared question set
  every seat answers independently.

## What V ordered (compressed; verbatim text is in 00-intake-H0.md)

Observability was dismantled and not carried through the rework of the
algorithm. Build a NEW observability layer for the current version of the
algorithm: observe **every time the system throws an error, and when something
does not work**. Every error must be **traceable to its root**. Then a
**permanently looping agent** listens the moment errors are thrown (activated
only AFTER the error tables exist), traces the root, and determines fix
magnitude: very quick fixes are applied with **no human approval**; anything
bigger that does **not** compromise architecture or tamper with security goes
out as the agent's **own pull request**. The W.I.P. security features are
**NOT in scope** for the observability loop.

## Verified current-state facts (do not rediscover; verify deeper)

1. The only observability code left is `apps/ui/lib/observability/`
   (`logger.ts`, `suspiciousScoring.ts`, `README.md`): developer-only redacted
   JSONL to `logs/developer-events.jsonl`, gated by `DEV_OBSERVABILITY` /
   `NODE_ENV=development`. Its README explicitly forbids DB persistence, log
   tables, and user-facing exposure **for those diagnostics**. V's new order
   supersedes that rule for the NEW layer; the boundary between the two must be
   designed, not assumed.
2. The dismantling trail: the pre-rework UI observability tests were disabled
   during the load lane — see
   `docs/missions/2026-08-06-v3-programming/logs/LOAD-01-codex.log` (deleted
   `apps/v2-ui/lib/observability/logger*.test.mjs`, re-added as `.disabled`).
3. No dedicated error/event tables exist. Error-shaped columns today:
   `raw_artifact.parse_error` (`migrations/0004_s04.sql`, with the
   PARSE_FAILED/SCHEMA_FAILED constraint pair) and `delivery_error`
   (`migrations/0031_registration_verification.sql` — inside the excluded
   security zone).
4. Surface to cover: `apps/{api, runner, scheduler, evaluator-worker, replay,
   ui}` and `packages/{battery, budget, contract, critique, crypto, db,
   evaluator, evidence, graph, judgement, kernel, ledger, liveness, memory,
   propagation, providers, published-arithmetic, register, serve, settlement,
   valuation}`; Drizzle migrations `0000..0033` + `migrations/pending/`;
   Postgres via `compose.dev.yaml` / `acceptance/`.
5. `packages/liveness` already exists — map what it covers before proposing
   anything that overlaps "something does not work" detection.
6. **Excluded W.I.P. security zone:** migrations `0030..0033`
   (identity/registration/verification), `apps/api/src/registration.ts` and the
   accounts-mission S-series surface. Commit `6e58adc` marks S3b/S3c/S3d
   KNOWN-DEFECTIVE; that mission is stopped with sessions preserved. Do not
   instrument inside it, do not propose fixes to it, do not let the loop agent
   touch it.

## Binding constraints (inherited V law — requirements must comply)

- **DR-179 no-API-keys hold:** CLI-relay is the only lawful model access. The
  listener agent's runtime must work under this hold (and state what changes if
  V lifts it).
- **DR-188 data-preservation law:** no deletion of product data. Retention or
  pruning of error data must be designed as a lawful, V-gated policy.
- **Privacy posture:** private-by-default; crypto-shredding erasure. Error
  events must never leak private debate content, secrets, tokens, cookies,
  private prompts, or raw provider payloads into ops surfaces.
- **Defensive-only.** No offensive testing anywhere in this mission.
- **Immutable high-risk floor (spine §9):** security/auth, persistence/
  migrations, provider spend, scoring semantics, live/product data, destructive
  or architectural work. For the loop agent these categories are ALWAYS
  escalate-to-humans, never auto-fix, never agent-PR-without-flagging.
- **Mission workers never push without V approval.** The loop agent's PR/
  auto-fix authority is a PRODUCT capability V is granting; its lawful git
  mechanics are a deliverable of this brief (RQ-D5/E2), not a license for
  mission seats to push.
- Naming: the product is `dialectical-engine`. Say "current algorithm version",
  not V2/V3.

## Research questions

Answer every RQ id. Cite repo evidence as `path:line` (or a URL for external
claims); mark anything unverifiable as `UNVERIFIED` and continue. Every
recommendation carries a confidence level and its strongest counter-argument.

### RQ-A — Failure-surface ground truth

- **A1.** Inventory where errors are thrown, caught, logged, or swallowed
  today, per app and per package. For each runtime (`api`, `runner`,
  `scheduler`, `evaluator-worker`, `replay`, `ui` server+client): where does an
  unhandled error go right now? Table with `path:line` evidence.
- **A2.** What exactly did the rework drop? Reconstruct the pre-rework
  observability surface (fact 2 trail + git history) and name the signals that
  existed then but not now.
- **A3.** Beyond thrown errors: enumerate the "something does not work" failure
  modes — hung/stuck runs, silent no-ops, stalled queues, budget stalls,
  provider timeouts/failures, parse failures, dead-letter states. Which are
  detectable today, which are invisible? Map against `packages/liveness`.
- **A4.** Existing mechanisms to reuse or supersede: the dev-JSONL remnant
  (fact 1) and its README prohibition — propose the reconciliation; the
  `parse_error` pattern; `ledger`/`register` event patterns; the `acceptance/`
  harness. Reuse-vs-replace verdict for each.
- **A5.** A grounded error taxonomy: categories, severities, component
  attribution — derived from A1–A3 evidence, not invented in the abstract.

### RQ-B — Error capture + the error store ("the tables")

- **B1.** Capture points required so that "every time the system throws an
  error" is recorded: process-level handlers, route middleware, job/queue
  wrappers, provider-call wrappers, DB-error paths, worker crash paths, client
  error reporting. Requirements only — no implementation.
- **B2.** Error-event schema requirements for root-traceability: correlation
  ids (run/debate/node ids), causal chain, stack, component, build/version hash
  (the version-skew incident class), dedup fingerprint, first/last-seen,
  severity, environment. What must be MANDATORY per event for RQ-C's procedure
  to terminate?
- **B3.** Storage requirements: Postgres/Drizzle tables; write-path resilience
  (what happens when the DB itself is the failing component — fallback sink?);
  volume and rate bounds; indexes serving the listener's queries; retention
  under DR-188.
- **B4.** Privacy/redaction requirements per the binding constraints. What may
  NEVER be stored; how redaction is enforced at capture time.
- **B5.** Overhead and failure-isolation: the observability layer must never
  take the product down or block its hot path. Bound the acceptable cost and
  the required backpressure/degradation behavior.
- **B6.** The security-zone boundary rule: errors thrown BY excluded modules —
  captured at a boundary without instrumenting inside, or fully excluded?
  Propose the precise operational rule (this feeds contested decision E5).

### RQ-C — Root-cause traceability

- **C1.** What must be true of code and events so a machine can trace any
  error to its root: cause-chain discipline (error wrapping), correlation
  propagation, run lineage. Name the code-level requirements.
- **C2.** The mechanical trace procedure: given one error event, the exact
  deterministic steps to the root (store queries, lineage walk, `apps/replay`
  reuse?). What must the store guarantee for the procedure to always
  terminate with a verdict?
- **C3.** Where current code makes tracing impossible — swallowed errors, bare
  catches, fire-and-forget promises, missing awaits. Inventory with
  `path:line`; state the remediation requirement class per case.
- **C4.** Define "root": when does tracing stop? Proximate vs root cause;
  external-cause boundary (provider outage is a root outside the repo).

### RQ-D — The listener loop agent

- **D1.** Trigger transport for "listens the moment errors are thrown":
  poll vs Postgres LISTEN/NOTIFY vs outbox/tail. Evaluate for missed-event
  guarantees across restarts, backlog behavior, latency, cost; state the
  delivery-guarantee requirements (cursor/ack, at-least-once?).
- **D2.** Runtime under DR-179: which CLI/model can lawfully run a permanent
  loop today; session lifecycle (one permanent session vs event-spawned
  workers); where it runs (V's machine now, dezbatere.ro server later); idle
  vs active cost model.
- **D3.** Fix-magnitude taxonomy with OBJECTIVE, checkable criteria:
  QUICK-FIX (auto-apply, no approval) vs PR-FIX (agent opens PR, humans
  merge) vs ESCALATE (report only). Candidate dimensions: lines/files
  touched, blast radius, RED→GREEN proof, subsystem criticality, and the
  always-escalate categories from the high-risk floor. Propose concrete
  thresholds and the strongest counter-argument to your own taxonomy.
- **D4.** Guardrails: the hard forbidden set (security zone, auth, migrations,
  crypto, spend config, scoring semantics, protocol docs, board state, its own
  guardrail config — no self-modification); kill switch; rate caps (max
  fixes/day); budget caps; audit trail — every agent action lands in the same
  observability store (who watches the watcher).
- **D5.** Git/PR mechanics: branch naming, PR body evidence (root-cause trace,
  RED test, GREEN proof), what reviews a loop-agent PR, revert path, and the
  exact lawful mechanics of the no-approval QUICK-FIX tier (where does it
  land, how is it audited, how is it reverted).
- **D6.** Activation gating and rollout: V's order activates the listener only
  AFTER the tables exist. Propose the phase gates (capture layer live →
  listener in report-only mode → fix authority enabled) with acceptance
  criteria per phase.
- **D7.** Governance: is the listener a product component or an ops agent
  under the Graph Spine? What happens when its PR touches something that
  turns out to be architecture — who catches it, how is it routed?

### RQ-E — Contested decisions for V (collect, do not ask V)

For each: the options, your recommendation, confidence, strongest
counter-argument.

- **E1.** The QUICK-FIX definition — the exact objective threshold.
- **E2.** QUICK-FIX landing mechanics — direct commit vs auto-merged PR vs
  batched PR; audit trail either way.
- **E3.** Listener runtime + model + monthly budget cap.
- **E4.** Error-data retention policy under DR-188.
- **E5.** Security-zone boundary rule (from B6).
- **E6.** Anything else only V can decide that your research surfaces.

## Artifact format (required)

Write exactly one file (your packet names the path):

```text
# <seat> — Observability requirements (2026-08-21-observability-loop)
## Verdict summary            (10 lines max)
## RQ-A ... RQ-E              (every id answered, in order; requirements
                               numbered OBS-<SEAT>-R01, R02, ...)
## Ranked recommendations     (top 10; confidence + strongest counter-argument)
## Contested decisions for V  (table: id, options, your pick, why)
## UNVERIFIED / gaps
```

## Rules (binding for every seat)

- You are one of three seats answering this brief **independently and blind**.
  Do not read, search for, or wait on any other seat's output; ignore any other
  files in `research/`. Divergence between seats is the signal.
- Repo is read-only for you EXCEPT your single artifact path.
- Requirements only: write no code, no schemas, no migrations, no config.
- Never fabricate a citation, price, API behavior, or file path. `UNVERIFIED`
  is always legal; fabrication never is.
- Do not touch, fix, or deep-instrument the excluded security zone (fact 6).
- Before your final handoff, write your SELF-REPORT (10–20 honest lines: went
  well / fought me / would change) to
  `.hermes/reports/2026-08-21-observability-loop/agent-reports/<seat>.md`.
- End with the handoff packet your goal packet specifies, then stop. No
  architecture, no implementation.

# S9 dev-token retirement execution record

Date: 2026-08-25
Branch: `codex/accounts-s9`
Scope: P1-S9, plus the Phase 1 obligation to include acceptance tests in the
default Vitest run.

## Transition evidence

The transition was deliberately one-way and is represented by two shipped
checkpoints rather than by keeping the retired authenticator alive:

1. The S5 dual-auth window is preserved in commit `9ff7e2b`. Its HTTP boundary
   accepts a configured exact legacy credential or a cookie session, defaults
   the legacy lane off, and rejects requests presenting both credentials.
   `tests/unit/s5-session-http.test.ts` at that commit is the executable stage-1
   receipt.
2. The S9 claim window is `POST /v1/account/legacy-runs/claim`. It requires an
   authenticated cookie session, exact Origin/CSRF, and a typed legacy proof.
   The database derives the historical `asker_id`, moves only the matching
   cutover inventory, appends immutable ownership and audit records, and
   consumes each run at most once.
3. The terminal S9 source rejects the retired header on protected routes,
   removes the resolver and legacy environment variables, removes token
   parameters from the contract client, and boots acceptance with a real
   service user, session cookie, CSRF proof, and content key.

Stage 3 is the documented point of no return. Rollback may hide the claim UI or
route, but must not resurrect the header authenticator.

## Unclaimed-run ruling

No real operator identity exists in this deployment, so assigning old runs to
an invented operator would fabricate ownership. Migration 0041 snapshots every
event-less run exactly once and classifies unclaimed inventory as
`ORPHANED_PRIVATE_CLAIMABLE`. Such runs stay private and can move only after an
authenticated user supplies the exact historical proof. Every cutover row is
therefore either joined to one immutable claim or remains explicitly orphaned;
no run can change owner twice.

## Security and durability properties

- Ordinary `debateai_runtime` cannot call the generic ownership writer or write
  either cutover table. It can execute only the proof-bound SECURITY DEFINER
  claim capability.
- The claim capability revalidates the active account and exact live session
  after acquiring the canonical run/account/ownership locks. Missing accounts
  return typed `SESSION_INVALID`; they never read an unassigned PL/pgSQL record.
- The raw proof is bounded to 1..1024 bytes, exists only in request/application
  memory and a SQL bind, and is absent from cutover, claim, ownership, and audit
  rows. The UI clears its password input before awaiting the request and uses
  neither browser storage nor logging.
- Migration 0041 revokes pre-cookie sessions, closes the deferred NOT NULL
  session columns, snapshots the cutover once, and is replay-safe: replay leaves
  the cutover, claims, marker, and audit cardinalities unchanged.
- The acceptance ceremony no longer accepts an argv dev token. A 43-character
  service credential derives a real server session, and provider proof calls
  run through an encrypted, run-bound content lease.

## Verification receipts

- Focused S9 PostgreSQL/HTTP/UI/architecture: **15/15**, receipt
  `/private/tmp/s9-focused-final.json`, SHA-256
  `1d3c37f2e4410423b6ec2c601c01e57653bd95280c8c0bab6f463a7c2f60272e`.
- S9 PostgreSQL alone on terminal bytes (fresh 0001→0041, replay, actual
  runtime role, invalid-session scalar denial, competing claimers): **3/3**,
  receipt `/private/tmp/s9-database-terminal.json`, SHA-256
  `4c931ae804b96227b7bf989ceac3a70064a43f9014d32082fdb1eeead9ff80af`.
- Acceptance through the default root Vitest configuration: **55/55** across
  **25/25 suites**, receipt `/private/tmp/s9-default-acceptance.json`, SHA-256
  `f6992c77ba716349df5e56b1066812d97e06b97d6e957e01b1c03cd3aec1f976`.
- Broader PostgreSQL compatibility before the final test-only role/replay
  strengthening: S9 + S7 + database + session database **85/85**.
- Affected HTTP/UI/architecture compatibility before the final acceptance
  wiring: **197/197**.
- Root typecheck, both UI typechecks, contract generation, lint, root/web build,
  apps/ui production build, and `git diff --check`: exit 0 at the pre-freeze
  checkpoint.
- The first terminal full suite was honestly RED: **1,405/1,412 tests** and
  **420/432 suites** passed in 2,139,634 ms. Its seven failed assertions were
  stale test contracts exposed by the final S9 session shape: two removed
  `streamEvents` token arguments, one legacy-only evaluator fixture, two
  session rows missing the new CSRF/MFA invariants, and one retired wire-session
  fixture; the seventh was the pre-existing isolated RSS tripwire at 270 MiB.
  Receipt `/private/tmp/s9-full-terminal.json`, SHA-256
  `a77f6172038ce6e9f92fe8f0dad55e48d0c2dd54d2b579aef884c6a2629e4ae1`.
- The six repaired failure files then passed together: **118/118 tests** across
  **24/24 suites**. The unchanged RSS tripwire passed at 236.7 MiB against its
  published 256 MiB ceiling. Receipt
  `/private/tmp/s9-six-failed-files-restored.json`, SHA-256
  `cfa417f7d085dd76ceb418fca6edb32ac95b089a00587d7b7d2d3908b1a892b3`.
- The sole final full suite is GREEN: **1,412/1,412 tests** and **432/432
  suites**, zero failed/pending/todo, in 2,135,231 ms. Receipt
  `/private/tmp/s9-full-restored-final.json`, SHA-256
  `22ecee3d867c103c4da15b29fd988471f7b224d1cc66d39eb2d9feaf5fd3272d`.
- Codex Security working-tree diff scan `ae39e808-34fe-49d9-bbb1-28f9eb9a14e0`:
  **complete**, 35/35 authoritative source items reviewed, zero reportable
  findings, complete coverage. The readable report is
  `/private/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/codex-security-scans-FN0uYh/accounts-s9/970870f380be9d041b719549ccffc6c124e6467d_20260825T114210Z_m9fkl0be/report.md`,
  SHA-256 `2f7ef6accb3932afd206512189b1c462420bbe5fdced999e84b5e39cc7e81fcd`.
  The sealed manifest SHA-256 is
  `00f35f303f530bb24160d98ca10756eebec0f17d262906676be9e21ec40db604`.

## Honest residuals

- Knowledge of an unclaimed historical token remains a deliberate ownership
  recovery proof. It is not authentication and is usable only from a valid
  cookie session with CSRF protection.
- Token-derived legacy `asker_id` digests remain in immutable pre-S9 run rows;
  migration 0041 does not rewrite history or claim that SHA-256 makes a weak
  historical token unguessable.
- Existing historical documentation retains the retired header spelling. The
  executable/source inventory contains no literal occurrence outside the
  architecture test's dynamically constructed sentinel.

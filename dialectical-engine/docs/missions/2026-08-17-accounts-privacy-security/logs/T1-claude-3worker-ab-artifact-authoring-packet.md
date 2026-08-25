# T1 Claude Opus — author unexecuted three-worker A/B support artifacts

Date: 2026-08-22 (Europe/Bucharest)
Owner: Codex-Router
Kanban: `accounts-phase1` / `t_b225b2f2`
Status: artifact authoring only; **NO EXPERIMENT EXECUTION**

## Authority

Read the complete design-stage-approved packet:

`docs/missions/2026-08-17-accounts-privacy-security/logs/T1-claude-3worker-ab-draft-packet.md`

Required design SHA-256:

`a1cef6fb53a178607db9eb84036c7677d9aa0b8dffbb738b8da1873f4c047503`

Write only these three new durable artifacts:

1. `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-3worker-ab-booted-rss-harness.mjs`
2. `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-3worker-ab-adjudicator.mjs`
3. `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-3worker-ab-command-matrix.md`

Do not edit the approved draft, product, policy, tests, prior receipts, wrappers
or quarantined paths. Do not run tests, the harness, the adjudicator, a worker,
PostgreSQL, a mutation, or any command from the matrix. `node --check` on the
two new `.mjs` files is allowed because it parses without executing them. Do not
stage, commit, push, launch any agent/model, or move Kanban.

The artifacts must embed the approved design packet SHA above as the expected
packet token. This is design evidence, not V execution approval; the later run
wrapper must still compare the on-disk packet to the externally V-approved hash.

## Standalone booted RSS harness

Create an auditable Node ESM program intended to run under the repository's
pinned Node with `--expose-gc --import tsx`. It must fail at module evaluation
unless `T1_N3_AB_PACKET_SHA256` equals the embedded design SHA and
`T1_N3_AB_WORKERS` is exactly `2` or `3`. It must accept a secret-free cell ID
and no arbitrary output path.

The source must implement, but this seat must not execute:

- one embedded PostgreSQL database using `startTestDatabase`, followed by real
  migrations;
- one real Argon2 pool of the selected count, ready before consumers;
- one `AuditContextHasher`, `PostgresIdentityRepository`,
  `InProcessAuthRateLimiter`, `RegistrationService`, `FileUserDekStore` and
  `MemoryMailSender`, with the same pool object reaching repository and service;
- ten real successful registrations, followed by mail/refusal drains and an
  exact SQL assertion of ten durable pending users;
- deterministic structural reset/page-touch of the limiter's preallocated typed
  arrays after those registrations: record RSS at exact 0/25/50/100% occupancy,
  assert 1,572,864/1,572,864 slots at 100%, and touch the corresponding expiry
  pages rather than merely changing the occupancy counters;
- explicit warm-up of every selected worker with real 64 MiB/t=3 password work
  before the 0% baseline;
- the same eight concurrent maximum-cost jobs for both worker counts, with 5 ms
  whole-Node-process RSS/event-loop/pool sampling while work is pending;
- exact distinct non-main thread IDs, max active/queued/outstanding, baseline,
  in-flight peak, settled/post-close RSS, process load and swap deltas;
- a 512 MiB in-process diagnostic safety flag. If crossed, let active work
  settle, drain and close, print only a secret-free structured
  `rssSafetyExceeded` result, and exit nonzero;
- `finally` cleanup in the truthful order: service drains, hasher close, Argon
  pool close, database stop, secret-root removal and zeroing of local key/salt
  buffers. Report close errors without claiming zero handles when death is
  unconfirmed.

Output exactly one final JSON object on stdout, preceded only by a stable marker.
Never print email, password, IP, UA, request/job/user/correlation/channel/token
identifiers, salts, hashes, ciphertext or filesystem secret paths. Report only
cell ID, worker count, aggregate counts, ordinal-free timings/RSS, thread-count
statistics, pool state and generic error codes.

## Receipt adjudicator and linter

Create a dependency-free ESM CLI that consumes exactly one JSON manifest path.
Reject path traversal and require every referenced receipt to live under the
mission logs directory. It must:

- validate the exact twenty integration cells in the approved AB/BA order, four
  descriptive architecture-resource cells in order `2,3,3,2`, the exact
  standalone AB/BA x5 series, named fault cells, mutants 1--10 and clean
  adjudicator control;
- require raw normal statuses 0, complete headers, distinct process/PG evidence,
  exact worker counts, queue/active non-vacuity, drains, functional and opacity
  gates;
- calculate H and Q paired values, wins, median differences/ratios, exact
  one-sided sign probabilities and 97.5% Clopper-Pearson intervals without a
  third-party statistics package;
- distinguish published RED `H>430`/headroom `<35` from historical severity
  `H>465`/negative headroom and apply the exact lawful marker mapping from the
  approved packet;
- validate architecture eight-job/eight-wave/2 MiB plateau/4 MiB positive
  control evidence, lifecycle truthfulness and standalone exact occupancy/RSS;
- treat every candidate RSS bound as UNRATIFIED and return
  `CODEX BLOCKED (rss-safety)` if the 512 MiB flag or peak is crossed;
- ANSI-strip and scan complete stdout+stderr for every manifest-provided
  generated literal and the forbidden identifier patterns. Whitelist only the
  declared temporary SHA header format; a hit returns `CODEX BLOCKED (secret)`;
- validate hashes, raw status bytes, selected counts, restoration and receipt
  completeness before any scientific marker;
- contain stable, unique source anchors for linter mutants 8 (accepting a
  ratified/current RSS label), 9 (allowing a causal marker without reproduction)
  and 10 (disabling the full-receipt secret scan);
- provide `--self-test` with dependency-free fixtures that proves the clean
  adjudicator exits 0 and names each guard. A later matrix mutates a temporary
  copy at those exact anchors; do not add a bypass flag that disables a guard.

On any error, emit one lawful `CODEX BLOCKED (...)` marker and a secret-free list
of named failed assertions. On success, emit exactly one lawful scientific
marker plus the aggregate comparison/RSS summary. It must never edit inputs.

## Exact command matrix

Write a reviewable Markdown ledger that expands every command—no ellipses or
"repeat" shorthand:

- frozen preflight, two `cp -p` backups and complete wrapper custody;
- all 20 integration cells in the exact ten-pair order;
- all four architecture resource cells in exact order;
- every named deterministic architecture fault cell;
- all 20 standalone RSS cells in the exact ten-pair order;
- retained-allocation positive control;
- mutants 1--7 as named Vitest mutations with selected-count and intended
  failure checks;
- adjudicator clean `--self-test` and temporary-copy mutants 8--10 with exact
  source-anchor replacements and intended named failures;
- final adjudication, full ANSI-stripped secret scan, restoration, SHA/size/
  mtime/`cmp`, HEAD/index/12-hash custody and process-tree checks.

Every command must be foreground, capture complete stdout+stderr and raw status,
and use the exact packet SHA environment token. The matrix must stop after safe
settlement/close on the first normal-cell failure, 512 MiB breach, secret hit,
receipt gap, mutant survivor or custody drift; no same-seat rerun.

## Handoff

Run only `node --check` on the two new sources, then report their SHA-256, size,
line count and syntax status. Recheck HEAD, empty index and all 12 frozen hashes.
Return `T1 THREE-WORKER A/B ARTIFACTS READY FOR SOL REVIEW`; do not claim the
experiment is approved or runnable until two Sol xHigh reviewers approve exact
source and V approves execution.

# S01 · CLAUDE REVIEW (rev 1) — APPROVED

Reviewer: Claude lane (Opus 5 subagent), 2026-08-08. Independent verification
in-sandbox: typecheck PASS · lint PASS (27 rows, no violations) · build PASS ·
unit+architecture 42 PASS · integration 20 PASS vs real embedded PostgreSQL
18.4 — 15 files / 62 tests total, reproducing the orchestrator's evidence.
Embedded Postgres started in the reviewer's sandbox, independently closing
environment-tail item 1. Live-model items counted DEFERRED per DR-126.

## Scope verified (highlights)

- **Hash triple (AC-10)**: real sha256 of real content (`inputHash` over the
  packet with contract structurally excluded; `contentHash` over rawText;
  `contractHash` from the call site); DDL non-blank/length CHECKs
  (migrations/0001_s01.sql). FX-LED-05 proves distinctness + immutability.
- **Total order (AC-08/45)**: allocator row-lock, pre-increment return, every
  writer inside withWriteTransaction; repo-wide grep: ZERO timestamp
  ordering. `recordPropagation` allocates before the gate query → the
  allocator lock is the completeness cutoff barrier (un-raceable). REVOKE +
  raising triggers exactly on the ADR-0006 list, test-verified.
- **Gate fix (a) truthful**: only runtime mutations are core.work_item +
  allocator; every UPDATE/DELETE vs append-only tables is a negative
  fixture; correction appends a FAILED row under a LATER sequence with the
  original still reading OK; no invented action kind; first-settlement law
  untouched.
- **Gate fix (b) truthful**: claimNext unchanged (oldest created_at_seq,
  READY-or-expired, SKIP LOCKED); fix was removing an unrelated enqueue from
  the run fixture. ADR-0017 not masked.
- **Four reconstruction paths**: RECONSTRUCTION_INPUT_MISSING /
  STORED_RESULT_MISSING / COMPLETENESS_GATE_FAILED / typed partial-absence —
  all asserted; no default, no synthesis, no fixture fallback.
- **Completeness gate (AC-11)**: both directions fixtured; JUDGEMENT_SCHEDULED
  never reaches contract/api (S-13 not engaged).
- **Replay ceremony**: exactly {agg, σ, product} imported; audit parses real
  import + export lists; falsifiable operator attestation; six structural
  fields read as data; Float64 hex byte comparison; dependency closure =
  published-arithmetic + pg only.
- **DR-115**: no fixture importable from production; no silent-absence
  fallback on any reconstruction/replay path; S00's `?? []` hole now throws
  PREDICATE_INPUT_CONTRACT_MISSING; zero duplicated arithmetic outside
  published-arithmetic.
- **S00 carry-forwards addressed**: dead register exports removed;
  BLOCKED-redelivery test added; scheduler consumes recorded arrow_order.
  No regressions (edge law, purity, contract, claim law, web/ untouched).

## Verdict

CLAUDE REVIEW: APPROVED
- SOLID: greenlight · DDD: greenlight · TDD: greenlight (RED 06:05:54Z matches
  test counts exactly; one tautology noted at finding 7) · Patterns:
  greenlight (P10/P13/P18; P13 partial, finding 3) · DR-115: greenlight.

## Findings — none blocking (carry-forward hygiene)

1. FX-IND-01 audit walks only apps/replay/src/index.ts — cli.ts unscanned;
   walk every .ts under apps/replay.
2. `void [σ, product]` dead imports exist to satisfy exact-three equality —
   assert imports ⊆ {agg, σ, product} instead.
3. P13 half-consumed in scheduler: cluster/operator records passed but
   ignored by evaluate(); transmission/lift/selection-rule unread; ceremony
   guards all five — mirror its refusal (reachable at S3).
4. Eviction writer + EVICT branch zero coverage — one EVICT-path test owed
   (full hardening genuinely S5-gated).
5. migrate() has no applied-migrations ledger and 0001 uses bare ADD COLUMN →
   db:migrate non-idempotent on second run (operational hygiene; nothing
   invokes it automatically).
6. Claim assertion still depends on describe-ordering (will re-break the same
   way); FAILED-non-claimable is true by SQL but untested.
7. FX-IND-01 unit limb asserts a hand-authored constant against itself; the
   behavioral gate exists in scaffold.test.ts but REPLAY_ISOLATION_PROOF is
   never cross-checked against the real import list.
8. Ceremony replays every served_number without filtering latest
   served_number_event.status — an EVICTED number would be re-checked once
   eviction lands.
9. **FOR V**: 06-test-strategy.md:931 lists FX-WIRE-02 (pagination limit) in
   S1's fixture set; the ticket's gate list does not, and the DR-023 register
   values it needs are absent. Codex correctly refused to invent the limit
   (AC-74). Needs a V ruling or an explicit S1-tail row.
10. Drizzle ledgerEntry carrier still omits six columns (S00 carry-forward
    12); raw_artifact and propagation_run were correctly updated.

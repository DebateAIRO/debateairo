# P2-01 Grok 4.6 review packet

Verdict requested: `GREENLIGHT` or `BLOCK`. Block only for a concrete P0/P1
product/design/evidence defect in this ticket. Return nonblocking P2/P3 notes
separately. Do not edit the repository.

## Ticket

**P2-01 · Ratify the account-recovery state machine**

Convert Wave-2 recovery tiers and the dedicated MFA-recovery research into one
finite-state contract covering proof inputs, delays, notification fan-out,
cancellation, restricted completion, terminal states, and forbidden bypasses.
This is a design/schema ticket only; runtime, migrations, policy register rows,
and the risk classifier belong to later P2 tickets.

## Review boundary

- `docs/missions/2026-08-17-accounts-privacy-security/P2-01-account-recovery-state-machine.json`
- `docs/missions/2026-08-17-accounts-privacy-security/P2-01-account-recovery-state-machine.schema.json`
- `tests/architecture/p2-account-recovery-state-machine.test.ts`
- the Phase-2 status row in `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`
- read-only sources:
  - `docs/missions/2026-08-17-accounts-privacy-security/wave-2-target-architecture.md`, especially §10.3
  - `docs/missions/2026-08-17-mfa-recovery-requirements/RESEARCH-REPORT.md`, especially “Recovery — the tier ladder” and §5
  - neighboring P2 Kanban scope as reproduced below

The retrospective ledger is process evidence, not part of the product verdict.

## Scope adjudication to falsify

The dedicated research describes T0–T4, but `IMPLEMENTATION-STATUS.md` explicitly
defines the Phase-2 target as T0–T3. T4 additionally depends on unresolved owner
decisions about permanent lockout, human-review quorum, and automated decisions.
The contract therefore:

- ratifies only T0–T3;
- treats T0 as ordinary AAL2 authentication and creates no recovery attempt;
- gives T1/T2 full completion only after a new factor is bound and all sessions
  are revoked;
- makes the weakest approved path, T3, a 7–14 day DB-clock freeze followed by
  new-factor binding and restricted completion;
- forbids automated T4 grant or final refusal rather than inventing it;
- leaves runtime work to P2-02 through P2-09.

Please BLOCK if that reconciliation contradicts the authoritative roadmap or
silently resolves an owner-only decision that should remain open.

## Required invariants

1. Tier authority is server-owned. A tier is pinned at attempt start and may
   only tighten; retries preserve the original delay anchor.
2. Recovery proof methods have explicit independent families. T2 requires two
   inputs from two different families; a device signal alone cannot unlock.
3. T3 accepts one issued address proof only with delay-and-notify. It cannot
   complete full-access and cannot complete before its original due time.
4. Attempt start is durably notified before proof outcome or tier disclosure to
   every historically bound supported channel plus the in-product security feed.
   T3 also schedules day-zero, midpoint, and 24-hours-remaining notices.
5. A surviving-factor sign-in, original authenticated session, or exact original
   notification capability can cancel any active generation. Cancellation is
   terminal, preserves history, and applies the 24-hour retry lock.
6. Every completion requires a new factor and revokes all sessions. T3 permits
   only read/private-create and denies publish, delete, export, contact/factor
   changes, and privileged routes until the 30-day window elapses or stronger
   proof completes.
7. Terminal states never reopen. Contested claimants are frozen and notified,
   never automatically adjudicated.
8. Secret questions/KBA, support-bot auth mutation, caller tiering, same-family
   double counting, delay reset/skip, subset notification, early last-factor
   removal, T3 full access, T4 automation, and public enumeration are explicit
   forbidden bypasses with mutation IDs.
9. The JSON Schema is closed at the root and every modeled nested object; the
   architecture test pins the complete top-level schema inventory plus state,
   tier, proof, transition, and policy reference integrity.
10. The status remains `✗` for the runtime ladder and states exactly what this
    design ticket does and does not prove.

## Reproduce-first and mutation evidence

- Initial focused gate: `0/2`. Both tests failed only because the contract JSON
  and JSON Schema did not exist.
- First implementation: `2/2` GREEN.
- Author self-review added two omitted design guards before review:
  contested-claim freeze/no-adjudication and expiry-not-before-pinned-due.
- Four one-at-a-time mutations were RED against the real JSON artifact, each
  followed by exact restoration:
  - `SERVER_DERIVED_TIER` → `CALLER_SUPPLIED_TIER`;
  - `ORIGINAL_DELAY_ANCHOR_PRESERVED` → `RETRY_RESETS_DELAY`;
  - every historical channel + feed → current primary channel only;
  - T3 completion profile `RESTRICTED` → `FULL`.
- Restored focused gate: `2/2` GREEN and the contract returned to its original
  SHA-256.

## Proportional gates and honest adjacent failure

- root `pnpm typecheck`: GREEN.
- focused P2-01 architecture gate: `2/2` GREEN.
- repository lint: GREEN (`28` edges, zero violations; source blockers empty).
- `git diff --check`: GREEN.
- complete `tests/architecture`: `185/186` GREEN. The sole failure is outside
  this ticket: S9's source scanner traverses two `.worktrees/obs-lane-*` trees
  and generated `.next-*` bundles, finding 103 historical/generated dev-token
  strings. None is in a P2-01 file. Do not treat the failure as GREEN; decide
  whether this unrelated harness-isolation defect affects this design verdict.

## Frozen hashes

- contract JSON — `31b538f3415d135a0d710331d0899520503a32fb3749c655e1ba0ec9cae7f9f3`
- JSON Schema — `e7e359b631ad725e2b4eb1530b49a81900e61330ba7ab1a974b2e079fa711e63`
- architecture test — `a849ac9bca8050056175cb1cba08190d494acd52ca25fa42a8ed236d98754ae7`
- implementation status — `ab702b2e7a0d49867f92fc255ed3c9377f291d71928a6d3779951642689c9902`

## Verdict format

Start with exactly `GREENLIGHT` or `BLOCK`. Then list P0/P1 findings with exact
file:line evidence; if none, say none. List nonblocking P2/P3 separately. End
with a concise residual-risk statement that distinguishes this ratified design
from the still-unimplemented Phase-2 runtime.

## Review result

`GREENLIGHT`; no P0/P1 findings. The exact preserved verdict is in
`P2-01-grok-verdict.md`. Grok independently resolved the live T3/T4 scope
question in favor of the contract and returned eight nonblocking P2 and five
nonblocking P3 follow-ups for later Phase-2 tickets/evidence hardening.

# SPEC — S04 Anonymous-exposure review

**Status:** FROZEN at creation (2026-08-29). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `public-debate-access` · **Traces to INTAKE "Anonymous-exposure
surface"** and standing security invariants from the accounts-privacy-security
mission.

## Intent

Widening the public envelope newly exposes node/edge (and related honesty)
plaintext to unauthenticated readers. Before the mission closes, prove that
this exposure still obeys the security mission's standing invariants, and
record an explicit verdict on whether node claim text can carry
user-identifying content.

## Ground truth this SPEC rests on

- `author_pseudonym` is already public (`INTAKE.md`).
- Standing invariants named at intake: no user-linked identifiers on the
  public surface; no free-text in error events; declared kinds not shapes for
  `id` params (`INTAKE.md`).
- Architecture test already forbids a set of owner carriers on
  `PublicDebateSchema` and forbids anonymous inspection/ledger/events routes
  (`tests/architecture/s8-publication-contract.test.ts`).
- `NodeSchema` includes free-text `claim`, `maker_lineage` (model identity),
  reviews, provenance refs (`packages/contract/src/index.ts`).

## Requirements

### R1 — No user-linked identifiers in the public envelope

After S01 ships, a published public debate JSON (list item and detail)
contains no `asker_id`, `owner_ref`, `user_id`, `run_ref`, `answer_id`, or
other fields Architecture classifies as user-linked identity carriers.
`author_pseudonym` remains the only human-facing publisher label unless V
ratifies otherwise.

### R2 — Standing public-route bans remain unless deliberately replaced

Anonymous callers still cannot reach owner inspection, ledger-digest, or
run-event feeds for a publication unless Architecture introduces a
**public-safe** replacement that is itself reviewed under this slice and
still satisfies R1. Silent reintroduction of the forbidden routes is out of
contract.

### R3 — Error responses stay non-leaky

Public list/detail failure paths do not embed free-text internal exception
messages or identity-bearing tokens in bodies returned to anonymous clients
(same standing rule as the security mission).

### R4 — Id parameters stay declared kinds

Public `{id}` / `public_ref` parameters continue to be validated as declared
kinds (UUID / schema-declared), not unchecked free-shaped strings that
echo into errors or storage.

### R5 — Node/edge plaintext exposure verdict (explicit)

QA records a written verdict, with evidence, on whether node `claim` text
(and other newly public free-text fields) can carry user-identifying
content under current product behavior. Allowed verdict labels:
`SAFE_UNDER_CURRENT_RULES`, `RISK_ACCEPTED_BY_V`, or
`BLOCKED_NEEDS_REDACTION_OR_POLICY`. UNVERIFIED is not acceptable for
mission close on this requirement — the review must run.

### R6 — Mission close gate

S01 and S02 are not mission-closed while S04 R1–R5 are unmet. S03 may
ship independently of R5's content verdict but still requires R1–R4 for any
surface it newly exposes.

## Out of scope (this slice)

- Implementing the envelope (S01) or UI (S02/S03) beyond what proof requires.
- Expanding publish legal copy / ToS (unless R5 forces a policy ticket).
- Re-opening owner private-route security.

## Acceptance sketch

1. Automated assertion: public schema/fixture has no forbidden identity
   carriers (extends or preserves s8 publication contract tests).
2. Probe: anonymous calls to inspection/ledger/events paths remain 404/401
   as designed.
3. Written R5 verdict filed under this slice's PROGRESS or a linked QA
   report path named in DECISIONS.md.

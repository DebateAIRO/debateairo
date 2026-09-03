# SPEC — S01 Public publication envelope + publish path

**Status:** FROZEN at creation (2026-08-29). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `public-debate-access` · **Traces to V Done #3** (data prerequisite)
and INTAKE load-bearing finding (frozen encrypted snapshots).

## Intent

New publications must carry everything an anonymous reader needs to render the
same READ affordances the owner sees for that debate (argument tree and
public-safe honesty fields). The publish path already receives a full `Answer`;
today it drops `nodes`/`edges` and related fields when building the encrypted
envelope. This slice is the contract + publish/read path change — not the UI.

## Ground truth this SPEC rests on (do not re-litigate)

- Publications are frozen encrypted snapshots, not live views
  (`INTAKE.md`; `apps/api/src/publications.ts`).
- `AnswerSchema` already carries `nodes` and `edges`
  (`packages/contract/src/index.ts`).
- `PublicDebateSchema` is `.strict()`; `readPublicDebate` parse failures
  `catch { return null }` → anonymous **404**, not an error
  (`INTAKE.md`; `publications.ts`).
- Anonymous `GET /v1/public/debates` and `GET /v1/public/debates/{id}` already
  ship (`auth: "public"`).
- Security narrowing forbids owner-linked carriers on the public schema and
  forbids anonymous `/inspection`, `/ledger-digest`, and `/events` routes
  (`tests/architecture/s8-publication-contract.test.ts`).

## Requirements

### R1 — Envelope carries the argument tree for new publishes

When an owner publishes a non-`BLOCKED` answer, the stored public envelope
includes the argument `nodes` and `edges` (or an equivalent public projection
of them) such that a later anonymous `GET /v1/public/debates/{id}` returns
that tree in the response body.

### R2 — Envelope carries public-safe honesty fields for new publishes

The envelope includes the honesty fields required by S02's READ surfaces
(verdict, confidence, summary, badges, residual objections, reversal point,
and the additional public-safe fields Architecture selects so the honesty
drawer and export can render from the snapshot alone). Fields that are
owner-linked identity carriers remain absent: at minimum `asker_id`,
`owner_ref`, `user_id`, `run_ref`, `answer_id`, `memory_disclosure`,
`ledger_digest_handle`, `inspection_handle`, `cost_envelope`,
`tier_provenance_ref` stay off the public schema unless V ratifies a
replacement SPEC.

### R3 — Back-compat: pre-widening snapshots still read

An encrypted snapshot shaped like today's `PublicDebateSchema` (no tree
fields) MUST still decrypt and parse successfully after this slice ships.
Adding a required field that makes old ciphertext fail `.strict()` parse is
forbidden. New fields are optional/nullable and/or version-discriminated.
A RED regression test that feeds an old-shape snapshot and expects a
successful read (not `null`/404) is the headline acceptance of this slice.

### R4 — Pre-widening already-published debates: no silent loss

Today's live published set size is **1** (`INTAKE.md`). Those ciphertext
blobs do not contain a tree. Done for this mission forbids:
(a) those refs starting to 404 after the schema change, and
(b) those refs remaining answer-only with no durable, visible disclosure
    that the snapshot predates tree publication — **unless** Architecture
    chooses and records one of: migrate, owner re-publish, or explicit
    disclosed answer-only legacy state.
Silent disappearance and silent answer-only are both out of contract.
The HOW is Architecture's; this SPEC only forbids the silent outcomes.

### R5 — List endpoint stays anonymous and useful

`GET /v1/public/debates` continues to return 200 for anonymous callers and
lists published debates (question, pseudonym, verdict/confidence summary,
`public_ref`). Widening the detail envelope must not break the list schema
or its anonymous auth.

### R6 — Public read remains snapshot-only

Anonymous readers continue to receive the decrypted publication snapshot.
This slice does not introduce anonymous live run projection, anonymous
event streams, or anonymous mutation of publications.

## Out of scope (this slice)

- Rendering the tree in the UI (S02).
- Your Debates / Public Debates navigation controls (S03).
- Full adversarial exposure audit of node claim text (S04); S01 must still
  obey the identity-carrier ban in R2.
- Granting anonymous delete, unpublish, or replay-generation.

## Acceptance sketch (Architecture turns these into PLAN steps)

1. Publish a debate with a non-empty node/edge answer → anonymous detail
   response includes the tree.
2. Old-shape snapshot fixture → `readPublicDebate` returns non-null.
3. Architecture-recorded policy for the one existing publication is
   implemented and observable (migrated / re-published / disclosed legacy).
4. Standing architecture test's forbidden public carriers and forbidden
   anonymous inspection/ledger/events routes still pass, or are deliberately
   amended under an Architecture ADR that still satisfies R2.

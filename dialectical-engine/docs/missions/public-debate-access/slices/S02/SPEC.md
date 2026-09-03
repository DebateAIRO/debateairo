# SPEC — S02 Public debate READ-parity UI

**Version:** v2 (2026-08-29) · **Supersedes:** `SPEC-v1.md` (frozen at
creation). Supersession reason: REV01-N2 / ticket `t_68386dd8` — R6 ground
truth corrected; scoring is DR-115 typed absence for owner and visitor alike,
not a live authenticated load. Scope unchanged.

**Status:** FROZEN at v2 issuance (2026-08-29). No agent edits this file after
issuance. Further scope change = new SPEC version, ratified by V.

**Mission:** `public-debate-access` · **Traces to V Done #3** and V's
2026-08-29 ruling ("opened as a user's own… same UI options").

## Intent

An anonymous (or logged-out) visitor who opens a published debate sees the
same READ affordances the owner sees on their own debate page: view toggles,
argument tree, node cards, scoring diagnostics, honesty drawer, and export.
Mutation controls stay absent for that visitor. Depends on S01 delivering a
usable public envelope.

## Ground truth this SPEC rests on

- Public page exists and is answer-only today
  (`apps/ui/app/public/debate/[id]/page.tsx`, 33 lines).
- Owner page is `apps/ui/app/debate/[id]/` with client shell
  (`DebatePageClient.tsx`) exposing views `thread | split | tree | map`,
  scoring diagnostics chrome, honesty drawer, export, replay, publication
  control.
- **Scoring data path (MEASURED, REV01-N2):** `getDebateScoring` in
  `apps/ui/lib/api.ts` is `return Promise.resolve(scoringUnavailable(id))` —
  a hardcoded DR-115 typed-absence stub, not a network call and not
  auth-gated. `grep -rn scoring apps/api/src/*.ts` returns zero matches; there
  is no scoring route in the API. Owner and anonymous visitor receive the
  same absence.
- Serving UI tree is `apps/ui` (`INTAKE.md`).
- Router assumption (not a V ruling): READ affordances in, mutations out
  (see S02 DECISIONS.md / mission DECISIONS seed).

## Requirements

### R1 — Anonymous open works without an account

Visiting the public debate URL for a published `public_ref` returns the
debate page with HTTP success for a logged-out session. No login wall, no
redirect-to-login as the only path to the content.

### R2 — Verdict and answer body remain visible

The public page shows question, author pseudonym, published date, verdict
(or explicit unavailable state), confidence when present, summary segments,
badges, residual objections, and reversal point — at least the surfaces the
answer-only page already shows, and not less after parity work.

### R3 — Argument tree READ parity

When the publication snapshot contains a tree (post-S01 new publishes, or
migrated/re-published legacy), the public page offers the same view toggles
the owner debate UI offers for tree reading (`thread`, `split`, `tree`,
`map` — or Architecture-documented renamed equivalents that preserve the
same four reading modes). Node cards are openable for reading node claim
and related displayed fields.

### R4 — Honesty drawer READ parity

A control labeled for honesty/provenance opens a drawer that renders the
honesty fields present in the public envelope. Typed absence is shown when
a field is not in the envelope. The drawer must not imply ledger/inspection
data is present when it is not (label honesty: no false "includes ledger"
export/drawer copy).

### R5 — Export READ parity (public-envelope honesty)

An export affordance is available that downloads the public envelope's
answer + honesty content actually present for that publication. It must not
advertise ledger/inspection bytes it does not include. Owner-only ledger
digest dependency is not required for the public export to be offered.

### R6 — Scoring diagnostics READ parity (typed-absence parity)

The public page exposes the same scoring-diagnostics entry point chrome the
owner UI exposes (the scoring "i" / diagnostics control and the panels it
opens). Because V3 has no per-node scoring resource today (`getDebateScoring`
→ `scoringUnavailable`; no API scoring route), the only correct parity
behavior is the same DR-115 typed unavailability the owner already sees.
This requirement does **not** ask Architecture to invent a public-safe
scoring projection, snapshot field, or public scoring endpoint. Zero new
scoring plumbing. If a future mission adds a real scoring resource, a new
SPEC version is required before public readers are promised live scores.

### R7 — Mutations absent for anonymous public readers

On the public debate page, for a logged-out visitor, the following controls
are not offered (not merely disabled-looking): delete private debate,
unpublish, replay-generation, challenge/investigation recording that mutates
server state, publish controls, memory unlink, and settings-only owner
account actions. Sign-in links may exist elsewhere; they are not a
substitute for READ content.

### R8 — Logged-in non-owner visitors get the same READ surface

A signed-in user who is not the publisher, opening the public debate URL,
receives the same READ affordances as the anonymous visitor (R1–R6) and the
same mutation absence (R7). Owner mutations remain on the owner's private
debate route (`/debate/[id]`), not smuggled onto the public route.

### R9 — Disclosure of publication limits remains

The existing public indexing / copies-may-persist disclosure
(`PublicAnswerDisclosure` or successor) remains visible on the public page.

## Out of scope (this slice)

- Schema/publish path changes (S01).
- Library Your/Public selectable navigation (S03).
- Adversarial review of whether node text can identify users (S04).
- Changing owner `/debate/[id]` mutation behavior for the publisher.
- Building a live scoring backend or public scoring projection (not in R6).

## Acceptance sketch

1. Logged-out browser opens a tree-bearing public debate → four view modes
   work; node card opens; honesty opens; export downloads; scoring
   diagnostics control shows the same typed unavailability the owner UI
   gets from `scoringUnavailable` (no fabricated scores, no new scoring API).
2. Same page has no delete / unpublish / replay controls in the DOM for
   that session.
3. Answer-only legacy publication (if Architecture chose disclosed legacy)
   shows the disclosure and does not pretend a tree exists.

# SPEC — SUP-07 Crypto-shredding and retention controls for support data

**Status:** FROZEN at creation (2026-09-01, REQ-SUP). No agent edits this file after
creation. Scope change = new SPEC version, ratified by V.

**Mission:** `observability-agents` · **Product:** SupportAgent (Bot A) · **Traces to:**
COMMON §3 standing law (privacy posture: private-by-default, crypto-shredding; DR-188: no
deletion, retention V-gated); packet upstream item 5 ("support transcripts are user data —
private by default, crypto-shreddable"). Requirements file: `requirements/supportagent.md`
(Q3, Q7 rows SUP-D4, SUP-D5). **Depends on:** SUP-01. **Tree state measured:** `dev` @
`4f764037`.

## Intent

A user's support conversations are erasable on V's clock by destroying keys, never by
deleting rows; retention is a V-owned value whose default keeps everything; and the one
place erasure must be wired — the account-erasure flow — is zone, so this slice gives V a
manual command and leaves the wiring to V's ruling.

## Ground truth this SPEC rests on (measured 2026-09-01 on `4f764037`)

- DR-188: user data survives every update, forever; no deletion
  (`docs/missions/2026-08-06-v3-programming/decisions-ledger.md:1611`).
- Secrets are files in the custody root, read with `O_NOFOLLOW`
  (`apps/runner/src/dev-secret-files.ts:18`, `:83`); `packages/crypto/**` and
  `apps/api/src/account-erasure.ts` are zone and are not imported or changed.
- SUP-01-R12 encrypts every transcript with a per-session data key wrapped by the support
  KEK (`secrets/support-kek.bin`).
- The 2026-08-17 support research proposed 30/90-day deletion windows; DR-188 forbids
  deletion — the conflict is recorded there (§D10) and here as contested row SUP-D4.

## Requirements

### SUP-07-R01 — Key hierarchy
Each `support.session` and each `support.case` has its own data key in
`support.session_key` / `support.case_key`, wrapped by the support KEK file
`secrets/support-kek.bin` (mode 0600, opened with `O_NOFOLLOW`, never logged). The KEK is
not the identity KEK and is not read from `packages/crypto/**`.

### SUP-07-R02 — The shred command
`pnpm support:shred --owner <owner_ref>` destroys (overwrites with zeros, then marks
`destroyed_at`) every wrapped key of sessions and cases bound to that `identity_owner_ref`;
`pnpm support:shred --session <session_id>` does the same for one anonymous session. The
command prints `sessions: k, cases: j, keys destroyed: k+j` and refuses to run twice on the
same target (prints `already shredded`).

### SUP-07-R03 — Rows stay, content is gone
After a shred, every row remains; `shredded_at` is set on the session/case; ciphertext
columns are unchanged and undecryptable; `pnpm support:case <id>` prints `[SHREDDED]` in
place of every message; `/help?case={token}` shows the SHREDDED_NOTICE.

### SUP-07-R04 — Retention is a V-gated value whose default keeps
Register row `support_retention_policy` default `keep`. The only other value,
`shred-after-days:<n>`, is inert unless row `support_retention_ratified_by` equals `V`;
`pnpm support:status` prints `retention: keep` or `retention: shred-after-days:<n> (pending
V ratification — inert)` accordingly. No code path deletes a row under any value.

### SUP-07-R05 — Every shred is audited without content
`support.shred_audit` {`at`, `os_user`, `target_kind` ∈ {`owner`,`session`}, `target_ref`,
`keys_destroyed`}. No content, no transcript excerpt.

### SUP-07-R06 — Erasure wiring is V's decision
This slice does not change the account-erasure flow (zone). `pnpm support:status` prints
the standing manual step: `erasures: run pnpm support:shred --owner <owner_ref> after each
account erasure (wiring pending V, row SUP-D5)`.

## Copy — verbatim, both languages

- SHREDDED_NOTICE · en: "This conversation was erased at the owner's request." · ro:
  "Această conversație a fost ștearsă la cererea proprietarului."

## Acceptance — V runs these in the real dev stack

1. `pnpm dev:auth:up`; sign in with the QA identity; `/help`; send two messages; click
   `Talk to a human`. psql: `SELECT session_id, identity_owner_ref FROM support.session
   ORDER BY created_at DESC LIMIT 1;` Expected: a session id `S` and an owner ref `O`.
2. `pnpm support:shred --owner O`. Expected: prints `sessions: 1, cases: 1, keys
   destroyed: 2` (or the counts of all sessions/cases for that owner).
3. psql: `SELECT count(*) FROM support.message WHERE session_id = 'S';` before and after
   step 2: identical. `SELECT shredded_at IS NOT NULL FROM support.session WHERE session_id
   = 'S';` Expected: `t`. `SELECT destroyed_at IS NOT NULL FROM support.session_key WHERE
   session_id = 'S';` Expected: `t`.
4. `pnpm support:case <the case id>`. Expected: every message line reads `[SHREDDED]`.
   Browser: `/help?case=<token>`. Expected: SHREDDED_NOTICE.
5. `pnpm support:shred --owner O` again. Expected: `already shredded`.
6. psql: `SELECT target_kind, keys_destroyed FROM support.shred_audit ORDER BY at DESC LIMIT
   1;` Expected: `owner | 2`.
7. `pnpm support:limits set support_retention_policy shred-after-days:30`;
   `pnpm support:status`. Expected: `retention: shred-after-days:30 (pending V ratification
   — inert)`. Wait 1 minute; psql: `SELECT count(*) FROM support.session;` unchanged.
   Restore: `pnpm support:limits set support_retention_policy keep`.
8. `pnpm support:status`. Expected: the `erasures:` manual-step line is printed.

## Out of scope (this slice)

- Changing the account-erasure flow (zone; row SUP-D5). Deleting any row. Backups of the
  custody root (deployment).

## Parallel-safety (single-writer rule)

- Creates: `apps/api/src/support/keys.ts`, `apps/api/src/support/shred.ts`,
  `apps/runner/src/support-shred-cli.ts`, `migrations/<n>_support_keys_audit.sql`,
  `tests/architecture/sup-07-*.test.ts`.
- Appends lines to: `package.json` (`support:shred`). No route additions.
- Depends on SUP-01. Parallel-safe with SUP-02, SUP-03, SUP-04, SUP-05, SUP-06.

# S8 — fresh Grok 4.6 independent final security review

You are the fresh independent Grok 4.6 reviewer for Accounts Phase 1 S8
`t_77bc4c8c`: private-by-default visibility, deliberate publication, and
publication-key re-encryption. Review source and behavior adversarially; do not
approve from receipts alone.

Read-only only: do not edit, stage, commit, merge, push, mutate Kanban, launch
subagents, or search the web. You may inspect history/source and run
proportionate tests. Keep the worktree/index clean.

## Exact custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO/.worktrees/accounts-s8/dialectical-engine`
- Branch: `codex/accounts-s8`
- Base: `2a9b69ea6a13acb52b133818e31d60bf5a2ebfe3`
- Base tree: `65ed7e8dec920866c5ac60f7b9e6d9ead754157d`
- Candidate: `35be24b04719212d8b2563e113f85abbc890a092`
- Candidate tree: `bd5019a8c8f09b836e06ecf7ebafd331b39181ef`
- Exact review range: `2a9b69ea..35be24b0`
- One commit, 31 files, 4022 insertions, 58 deletions.
- Final worktree and index must remain clean.

Read the binding mission charter, `AMENDMENTS.md`, decisions ledger, Wave 2/3
architecture, S5/S6/S7 handoffs/reviews, migration 0038, and all new S8 source,
migration, contracts, API/UI code, and tests.

## Security and contract properties to prove or refute

1. **Private default / append-only visibility.** Absence of an event is PRIVATE.
   Visibility and public snapshots are immutable append-only latest-wins
   records, never `UPDATE core.run`. Existing and new runs remain private
   without an explicit successful transition. UPDATE/DELETE/TRUNCATE/cascade
   and role/grant paths must not bypass immutability.

2. **One deliberate atomic capability.** Publish/unpublish requires a fresh,
   one-use grant bound to exact authenticated session, action, and run. The
   sole DB transition must lock the run, require S6 encrypted-v1 private
   content, revalidate active ownership/session/latest state, compare expiry to
   DB transaction time, consume the exact grant, append snapshot/visibility/
   cleanup intent/audit atomically, and use deterministic lock/allocation order.
   Runtime must not mint/reset grants or call composable append primitives.
   Check replay, wrong action/target/session, delayed expiry, double publish,
   publish-v-unpublish, ownership claim, and identity deletion races.

3. **Actual credential split.** Ordinary `debateai_runtime` and the publication
   authorization login must be separate least-privilege LOGIN principals.
   Boot must attest `current_user`, function/table privileges, membership, and
   reject same-principal aliases, superuser, dual-role, and swapped URLs. Do
   not accept admin plus `SET ROLE` as sufficient evidence.

4. **Separate publication key domain.** Publication uses corpus KEK → random
   per-publication key, independent of the S6 user-DEK/per-run private key,
   main KEK, blind-index key, and every store root. Validate all-pairs canonical
   paths, nesting, symlink/alias/inode, and equal key material. AAD must bind
   schema/domain, run ID, public ref, key ID/version; decrypted public ref and
   published timestamp must match immutable DB metadata. Zeroize transient
   material and fail closed on missing/wrong/relocated keys.

5. **Lifecycle and crash semantics.** Publication key provisioning/external
   I/O must occur outside DB locks. Definite pre-commit failure cleans up;
   ambiguous commit must not destroy a possibly-live key. Unpublish must hide
   public reads immediately and use a durable cleanup intent/reconciler so
   crash/delete failure cannot permanently orphan the key. Retry/idempotence,
   sanitized errors, file permissions/fsync/rename/cleanup, and store mount
   requirements must be honest. Private S6 content/key remains for active owner;
   after account deletion published content remains, while unpublish is denied.

6. **Authorize before decrypt, revalidate after decrypt.** Public read must
   preauthorize latest PUBLISHED before key resolution, decrypt only the corpus
   snapshot, then revalidate visibility/ref/version before returning. A queued
   unpublish between decrypt and final read yields 404/no content. Never fall
   back to private S6 content for anonymous callers. Invalid grants must be
   preflighted before private answer decrypt, corpus key creation, or audit KDF
   without enumerating run existence; final validation remains atomic in DB.

7. **Strict anonymous projection.** Only the dedicated public summary is
   anonymous: question/pseudonym, verdict/confidence, composed summary,
   badges/objections/reversal/as-of plus truthful terminal/verdict-availability
   status. No owner/user/asker/internal IDs, memory links, graph refs, handles,
   provenance, costs, inspection/ledger/SSE/investigation/mutations, private
   ciphertext, or unpublished content. Both UI trees and public list/read paths
   must use the strict DTO and show indexing/permanence warnings honestly.

8. **Audit/privacy.** Publish/unpublish success and denial audit must use opaque
   user audit token and opaque public/transition targets, with no user ID,
   owner ref, pseudonym, question/content, ciphertext, or key material. Verify
   the whole audit chain after transition/retry. Account deletion must remove
   identity/private key mapping while anonymous corpus read still works and no
   surviving public row permits author linkage.

9. **CSRF, route policy, duplicate surfaces.** Exact route inventory remains
   deny-by-default; owner transitions require cookie auth, strict Origin, CSRF,
   step-up, and affirmative warning. Public read/list only are anonymous. Check
   both `apps/ui` and `web`, their proxies/client semantics, rendered controls,
   and no accidental public HEAD/SSE/internal route.

10. **S5/S6/S7 preservation and lock/I/O law.** No external key/store/pool/KDF
    work under DB locks/transactions; held callbacks use the held client and
    local prepared state. S7 latest-owner rules and run→identity lock order
    remain intact. S5 session/CSRF and default-off legacy behavior remain
    distinct; a legacy dev session cannot publish.

## Internal findings that were fixed — independently verify

The internal Sol xHigh auditor initially BLOCKED:

- P0: runtime could compose append functions and publish without a grant.
- P1: stale caller clock, legacy plaintext publication, weak key-domain/AAD
  binding, non-durable unpublish cleanup, vacuous races/replay/revalidation,
  absent full anonymous/key-shred proof, omitted UI status fields.
- Second audit P1s: no real credential attestation, incomplete all-pairs secret
  separation, HTTP decrypt before grant preflight, no actual VR-10 receipts.

The auditor later returned FINAL CLEAR. Treat that as evidence to challenge,
not authority.

## Evidence to reproduce or challenge

- Focused S8 stack after rework: 31/31; neighboring affected 124/124.
- Independent auditor: focused 49/49; real PostgreSQL 12/12; no P0/P1.
- Actual 26 one-at-a-time production mutants all RED then restored: private
  event absence; consumed/action/target/session/DB-clock grant checks; encrypted
  v1 prerequisite; cleanup intent; auth-role split; run lock; held-client owner
  revalidation; audit canonical hash; post-decrypt visibility; AAD run binding;
  decrypted public-ref/time matching; strict schema; warning; CSRF; HTTP
  preflight ordering; equal key material; same-side secret nesting; runtime
  grant DML; startup attestation; duplicate UI as-of; cleanup error typing.
- Codex Security diff scan `2370fa6c-9f52-4a74-b804-ce1d5ce9c946` covered
  22/22 production files and 8/8 threat surfaces with zero findings. Independently
  inspect; do not defer to it.
- First host full surfaced four fixture/architecture failures; the repair added
  `step_up_grant` to identity inventory, behavior-honest PRIVATE mocks, and
  renamed generic `read` to `readPublicDebate` after exact-base comparison proved
  name-only orphan reachability ambiguity. Exact/affected/PG/unit/typechecks
  then passed.
- Final frozen host full: `pnpm test` exit 0, 132/132 files, 1236/1236 tests,
  1994.82s; 31-file pre/post manifest identical; range diff-check clean.
- `apps/ui` Next build compiles then fails at an inherited invalid named export
  in `app/settings/page.tsx`; exact detached base reproduces identically and S8
  does not touch that file. Verify this adjudication rather than treating it as
  an S8 waiver.

Run proportionate tests. Findings first, ordered by severity, with exact
path/line, exploit/failure mechanism, and smallest correction. Do not approve
merely because all receipts are green.

End with exactly one marker:

`GROK S8 APPROVED`

or

`GROK S8 CHANGES REQUESTED`

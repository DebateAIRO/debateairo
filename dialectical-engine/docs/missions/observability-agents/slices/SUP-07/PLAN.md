# PLAN — SUP-07 Crypto-shredding and retention controls for support data

> **For agentic workers:** the Architecture seat fills the steps, clusters and boundaries.
> REQ-SUP (2026-09-01) authored ONLY this SPEC-trace skeleton, the quantifiability law and
> the cluster table headers. No step below is authored yet. At programming time load
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** support transcripts are erasable by key destruction on V's command, rows never
disappear, retention defaults to keep, and every shred is audited without content.

**Spec:** `docs/missions/observability-agents/slices/SUP-07/SPEC.md` (FROZEN 2026-09-01)

**Status:** SCAFFOLD — steps not authored. **Depends on:** SUP-01.

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test (runnable, capture-first) · file surface.
- Every PLAN step traces to a SPEC sentence; every SPEC requirement has ≥1 step.
- Three-run law: worst of three runs is the verdict. UNVERIFIED is respected.
- Commands in labelled fenced blocks, never in table cells.

## SPEC-trace skeleton (one row per requirement; Architecture fills the step cells)

| Requirement | SPEC sentence (anchor) | Step ids | Cluster |
|---|---|---|---|
| SUP-07-R01 | "own data key in `support.session_key` / `support.case_key`, wrapped by the support KEK file `secrets/support-kek.bin` (mode 0600, opened with `O_NOFOLLOW`) … not the identity KEK" | | |
| SUP-07-R02 | "`pnpm support:shred --owner <owner_ref>` destroys … every wrapped key … prints `sessions: k, cases: j, keys destroyed: k+j` … `already shredded`" | | |
| SUP-07-R03 | "every row remains; `shredded_at` is set … `[SHREDDED]` … SHREDDED_NOTICE" | | |
| SUP-07-R04 | "`support_retention_policy` default `keep` … inert unless `support_retention_ratified_by` equals `V` … No code path deletes a row" | | |
| SUP-07-R05 | "`support.shred_audit` {`at`, `os_user`, `target_kind`, `target_ref`, `keys_destroyed`}. No content" | | |
| SUP-07-R06 | "does not change the account-erasure flow … prints the standing manual step" | | |

Trace rows: 6. SPEC requirements: 6.

## Cluster table (headers reserved; Architecture fills)

| Cluster id | Suggested scope | PLAN steps | Verification command (capture-first, three runs) | File surface |
|---|---|---|---|---|
| SUP-07-C1 | Key tables, KEK file custody, wrapping (R01) | | | |
| SUP-07-C2 | Shred command, idempotence, row preservation, notices (R02, R03) | | | |
| SUP-07-C3 | Retention row semantics, audit table, status lines (R04, R05, R06) | | | |

## Module boundaries, DDD impact, ADRs

_Architecture authors this section._ Fixed by the SPEC: no import from `packages/crypto/**`;
no change to `apps/api/src/account-erasure.ts`; no DELETE statement anywhere in the module.

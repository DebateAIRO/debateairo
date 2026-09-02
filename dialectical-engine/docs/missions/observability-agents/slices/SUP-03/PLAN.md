# PLAN — SUP-03 Signed-in own-debate context with consent (metadata only)

> **For agentic workers:** the Architecture seat fills the steps, clusters and boundaries.
> REQ-SUP (2026-09-01) authored ONLY this SPEC-trace skeleton, the quantifiability law and
> the cluster table headers. No step below is authored yet. At programming time load
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** a signed-in user, after explicit consent, gets status answers about their own
debates from a metadata-only projection; nothing else about any debate reaches the model.

**Spec:** `docs/missions/observability-agents/slices/SUP-03/SPEC.md` (FROZEN 2026-09-01)

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
| SUP-03-R01 | "`/help` shows the CONSENT_TOGGLE, off by default … stores `consent_own_context_at` … Anonymous sessions never show the toggle … ANON_CONTEXT" | | |
| SUP-03-R02 | "derives `{ownerRef, legacyAskerId}` from the identity session exactly as `ownershipFor` does … No tool accepts a user id, owner id, or email … `core.run_is_owned_by`" | | |
| SUP-03-R03 | "exactly these keys: `run_id`, `created_at`, `run_state` … `failure_code` … never contains the question text" | | |
| SUP-03-R04 | "lists the signed-in user's debates client-side … Selecting one sends only its `run_id` … 'My latest debate' resolves server-side" | | |
| SUP-03-R05 | "registry gains `read_own_run_state(run_id)` … `support.tool_call` {session_id, name, args_sha256, result keys or enum, at}" | | |
| SUP-03-R06 | "not owned … or does not exist, produces the identical REFUSE_OTHER_USER text with identical status" | | |
| SUP-03-R07 | "Per `identity_owner_ref`: 60 messages / 10 minutes, 300 messages / 24 hours" | | |
| SUP-03-R08 | "Six cases: consent off → CONSENT_NEEDED … `support.tool_call.result` carries no free text" | | |

Trace rows: 8. SPEC requirements: 8.

## Cluster table (headers reserved; Architecture fills)

| Cluster id | Suggested scope | PLAN steps | Verification command (capture-first, three runs) | File surface |
|---|---|---|---|---|
| SUP-03-C1 | Consent state on the session, toggle, anonymous path (R01) | | | |
| SUP-03-C2 | Ownership derivation, projection type, tool + tool-call record, no-oracle refusal (R02, R03, R05, R06) | | | |
| SUP-03-C3 | Debate picker and latest-debate resolution (R04) | | | |
| SUP-03-C4 | Per-account limits and eval class E (R07, R08) | | | |

## Module boundaries, DDD impact, ADRs

_Architecture authors this section._ Fixed by the SPEC: read path reuses the existing
ownership predicate (never re-implements it); the projection is a new type with a closed key
set; no zone import.

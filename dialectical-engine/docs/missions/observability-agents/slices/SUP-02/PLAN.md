# PLAN — SUP-02 Escalation to V: case record, summary, terminal inbox, replies

> **For agentic workers:** the Architecture seat fills the steps, clusters and boundaries.
> REQ-SUP (2026-09-01) authored ONLY this SPEC-trace skeleton, the quantifiability law and
> the cluster table headers. No step below is authored yet. At programming time load
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** every unsafe-to-answer conversation reaches V as a case with the verbatim
transcript and an advisory summary within 60 s; V reads and replies from a terminal; the
user reads the reply in the product.

**Spec:** `docs/missions/observability-agents/slices/SUP-02/SPEC.md` (FROZEN 2026-09-01)

**Status:** SCAFFOLD — steps not authored. **Depends on:** SUP-01.

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test (runnable command, capture-first idiom per
  `.hermes/TOOLING-TRAPS.md`) · file surface.
- Every PLAN step traces to a SPEC sentence; every SPEC requirement has ≥1 step.
- Three-run law: worst of three runs is the verdict.
- UNVERIFIED is a valid, respected answer. Commands in labelled fenced blocks, never in
  table cells.

## SPEC-trace skeleton (one row per requirement; Architecture fills the step cells)

| Requirement | SPEC sentence (anchor) | Step ids | Cluster |
|---|---|---|---|
| SUP-02-R01 | "A case is opened when ANY of these is true; each is decided by deterministic code … never by the model's own judgement … E1 … E8" | | |
| SUP-02-R02 | "`support.case` gains: `identity_owner_ref` … `trigger_predicate` … `tool_calls` … `support.case_event` records every state transition" | | |
| SUP-02-R03 | "≤ 80 words … `summary_authoritative = false` … label 'Model-written summary — advisory' … forbids any statement about who the user is" | | |
| SUP-02-R04 | "row is committed before the user sees the acknowledgement (≤ 2 s) … `summary_at − created_at` ≤ 60 s at p100 … `summary_status = TIMED_OUT`" | | |
| SUP-02-R05 | "the CASE_OPENED text with the token, the SLA from the register row, and the link `/help?case={token}`" | | |
| SUP-02-R06 | "`GET /help?case={token}` shows the case state, the conversation, V's replies attributed 'Support (a person)', and a reply box … NOT_FOUND" | | |
| SUP-02-R07 | "`pnpm support:inbox` … `pnpm support:case <id>` … `pnpm support:reply <id>` … `pnpm support:close <id>` … view `support.inbox`" | | |
| SUP-02-R08 | "plain text only; ANSI and control bytes … replaced by `?` … `USER>` … UNTRUSTED banner … no model runs in the console" | | |
| SUP-02-R09 | "Transfers: … Never transfers: any secret … any debate content … any assistant conclusion about the user's identity" | | |
| SUP-02-R10 | "`NEW` → `WAITING_ON_V` ↔ `WAITING_ON_USER` → `CLOSED` … A user reply on a `CLOSED` case sets `WAITING_ON_V`" | | |

Trace rows: 10. SPEC requirements: 10.

## Cluster table (headers reserved; Architecture fills)

| Cluster id | Suggested scope | PLAN steps | Verification command (capture-first, three runs) | File surface |
|---|---|---|---|---|
| SUP-02-C1 | Case schema extension, case events, state machine (R02, R10) | | | |
| SUP-02-C2 | Predicates E1–E8 outside the model, transfer/never-transfer projection (R01, R09) | | | |
| SUP-02-C3 | Advisory summary via relay, latency bound, timed-out path (R03, R04) | | | |
| SUP-02-C4 | Acknowledgement copy and case view route (R05, R06) | | | |
| SUP-02-C5 | Terminal inbox CLI, inert rendering, `support.inbox` view (R07, R08) | | | |

## Module boundaries, DDD impact, ADRs

_Architecture authors this section._ Fixed by the SPEC: the console lives under
`apps/runner/src/` (never `tools/**`); no email; no web admin route; no model in the console.

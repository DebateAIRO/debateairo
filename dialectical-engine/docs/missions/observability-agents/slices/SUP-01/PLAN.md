# PLAN — SUP-01 Grounded help on `/help` (anonymous, eval-gated)

> **For agentic workers:** the Architecture seat fills the steps, clusters and boundaries.
> The Requirements seat (REQ-SUP, 2026-09-01) authored ONLY this SPEC-trace skeleton, the
> quantifiability law and the cluster table headers. No step below is authored yet.
> At programming time load `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`.

**Goal:** a visitor opens `/help`, receives grounded answers with sources, is refused on
zone-adjacent and injected requests with the attempt recorded, can always reach a person,
and every release is gated by the independent evaluation set.

**Spec:** `docs/missions/observability-agents/slices/SUP-01/SPEC.md` (FROZEN 2026-09-01)

**Status:** SCAFFOLD — steps not authored.

## Quantifiability law (binding on Architecture)

- Every step is markable done / not-done by a stranger with no judgement call.
- Forbidden acceptance words: improve, better, robust, handle, appropriate.
- Every step names: cluster id · acceptance test (a runnable command, capture-first idiom —
  see `.hermes/TOOLING-TRAPS.md`, the acceptance-command family) · file surface.
- Every PLAN step traces to a SPEC sentence; every SPEC requirement has ≥1 step.
- Three-run law: each cluster's verification command runs three times; the worst run is
  the verdict (green-green-red = RED).
- UNVERIFIED is a valid, respected answer on any claim.
- Commands live in labelled fenced blocks, never in table cells (escaped pipes are
  consumer-dependent — TOOLING-TRAPS).
- The eval set (`tests/support-eval/**`) and the Help Corpus content
  (`packages/support-kb/content/**`) are authored by independent Fable 5.1 seats, never by
  the coding seat; the PLAN names those seats' deliverables as inputs, not as steps.

## SPEC-trace skeleton (one row per requirement; Architecture fills the step cells)

| Requirement | SPEC sentence (anchor) | Step ids | Cluster |
|---|---|---|---|
| SUP-01-R01 | "`GET /help` renders the assistant … not imported by `apps/ui/app/layout.tsx` nor by any file under … zone routes" | | |
| SUP-01-R02 | "The first assistant message of every session is the DISCLOSURE text" | | |
| SUP-01-R03 | "Every reply of class `ANSWER_GROUNDED` ends with a `Source:` line … `NO_SOURCE` text and no product claim" | | |
| SUP-01-R04 | "The corpus lives at `packages/support-kb/content/<id>.<lang>.md` … serves only entries with `status: shipped` and `ratified_by: V` … `kb_version`" | | |
| SUP-01-R05 | "A deterministic pre-model classifier routes any message whose intent is … to the `REFUSE_ZONE` text … No model call is made" | | |
| SUP-01-R06 | "routes the message to `REFUSE_INJECTION` and inserts one `support.abuse_event` row … After 3 … `LOCKED`" | | |
| SUP-01-R07 | "exactly three tools … Postgres role `debateai_support` holding SELECT/INSERT on `support.*` only … No support code imports from … No support route path begins with …" | | |
| SUP-01-R08 | "through the existing loopback relay contract … register rows `support_enabled` … `pnpm support:switch off\|on` … within 5 s … `pnpm support:status`" | | |
| SUP-01-R09 | "`received_at`, `first_token_at`, `completed_at` … first token ≤ 3 s at p50 and ≤ 8 s at p95 … printed as a number" | | |
| SUP-01-R10 | "classified `ro` or `en` … `RO \| EN` override … stored per message … every corpus entry exists in both languages" | | |
| SUP-01-R11 | "20 messages / 10 minutes, 100 messages / 24 hours, 5 new sessions / hour … 40 messages, 2 000 characters … HTTP 429" | | |
| SUP-01-R12 | "Schema `support` … per-session data key wrapped by a support KEK … never the raw relay response … `[REDACTED_SECRET_LIKE]`" | | |
| SUP-01-R13 | "Assistant text renders as plain text. The only anchors are `link_first_party` routes on the same origin" | | |
| SUP-01-R14 | "N = 60 … `pnpm support:eval --runs 3` prints `applicable/total` … structural assertions 48/48 on every run … ≥ 46/48 with 0 rubric failures in classes C and D" | | |
| SUP-01-R15 | "the UI shows the RATING prompt … `rating` … Deflection rate = … `pnpm support:status` prints it" | | |
| SUP-01-R16 | "inserts one `support.case` row … `state = NEW` … shows the CASE_OPENED_MINIMAL text with the token" | | |
| SUP-01-R17 | "If the relay returns 502/504 … the reply is the `DEGRADED` text within 1 s … never produces an answer without a model reply" | | |
| SUP-01-R18 | "throws typed domain errors … never swallows a failure into a friendly reply without recording `outcome = DEGRADED`" | | |

Trace rows: 18. SPEC requirements: 18. (Reviewer probe P3 checks equality.)

## Cluster table (headers reserved; Architecture fills steps and the ONE verification command per cluster)

| Cluster id | Suggested scope (Architecture may re-cut) | PLAN steps | Verification command (capture-first, three runs) | File surface |
|---|---|---|---|---|
| SUP-01-C1 | Support schema, role grants, register rows, kill switch, `support:*` commands (R07, R08, R12, R18) | | | |
| SUP-01-C2 | Help Corpus package, loader, `kb_version`, bilingual entries (R04, R10) | | | |
| SUP-01-C3 | Pre-model classifier, injection detector, abuse events, session lock, rate limits (R05, R06, R11) | | | |
| SUP-01-C4 | Relay adapter, grounded answer with `Source:` line, degraded mode, latency timestamps (R03, R09, R17) | | | |
| SUP-01-C5 | `/help` page and components: disclosure, plain-text rendering, RO/EN override, rating, minimal case (R01, R02, R13, R15, R16) | | | |
| SUP-01-C6 | Eval runner and gate (`pnpm support:eval --runs 3`) consuming the eval author's cases (R14) | | | |

## Module boundaries, DDD impact, ADRs

_Architecture authors this section._ Constraints already fixed by the SPEC: no import from
zone files; no DB privilege outside `support.*`; no `process.env` outside the register
loader; no spawn site other than the existing relay; shared-file edits limited to appended
lines in `apps/api/src/index.ts`, `packages/contract/src/index.ts`, `package.json`.

## Inputs owned by other seats (not steps)

- Help Corpus entries (KB author seat, independent Fable 5.1): `packages/support-kb/content/**`.
- Evaluation cases (eval author seat, independent Fable 5.1): `tests/support-eval/cases/*.json`.
- Migration number for `support_foundation`: allocated by the orchestrator at ticket creation.

# Loop report 19 — UI-01 (restore V2's debate workspace) — CODE+REVIEW COMPLETE, held for V's eye

**Lane:** DR-140 (Claude worker codes, Grok reviews). Cut after V rejected
S14's surface at the human visual gate (DR-145) and personally copied V2's UI
into `apps/v2-ui`.

**Direction (V's ruling):** swap V2's data layer, keep its UI whole — the
inverse of what S14 did. `apps/v2-ui` is the design authority; only data
access was replaced.

**What shipped:** the ported same-origin proxy (with both rev-3 advisories
hardened: backslash cross-origin form rejected, Request-branch throw) in an
ENFORCED root vitest suite; `lib/api.ts`/`serverApi.ts` rewritten onto the
`@debateai/contract` client; `lib/v3/adapter.ts` projecting V3's Answer graph
into V2's DebateDetail tree (attack → CON, support → PRO) with typed absence
throughout; the DebatePageClient data-access swap incl. SSE translation onto
V2's handlers; an additive answer honesty drawer (all 23 condition marks incl.
OWED-CHECK-UNEXECUTED and UNRESOLVED-TYPE-FALLBACK, abstention kinds,
freshness, cost envelope, replay/inspection handles, ledger digest, export);
NodeDetailDrawer V3 honesty section; `/new` ask fields bound; `/settings` on
the deployment model ledger; `/admin/workers` on the typed fleet read.

**Three DR-115 defects the worker found by reading the running app** (none
were in the ticket): V2's copy labelled V3's typed absence "Scoring check
failed: <reason>", asserting a check V3 never runs; `/admin/workers` printed
`0/0/0/0` and "No workers registered" beside a loud `NO_TYPED_FLEET_SOURCE`
refusal; the ported proxy did not typecheck under the root program.

**Review:** Grok rev-1 CHANGES REQUESTED on one BLOCKING finding — the export
affordance and its "+ ledger" copy did not wait for the ledger digest (S14
gated on both). The rework replaced the drift-prone pair of hand-maintained
strings with ONE typed export decision (`NO_SERVED_ANSWER` /
`LEDGER_DIGEST_PENDING` / `LEDGER_DIGEST_UNREADABLE` / available) read by
button, drawer, toast and filename alike, and added a distinct reason for a
REFUSED digest read. Grok rev-2 APPROVED.

**Worker honesty worth recording:** it disclosed that the three withheld
export states are proven by suite, not live, and declined to manufacture a
fake failure for a screenshot; and it reported that its own first digest
fixture invented contract fields (`answer_ref`, `status`), caught by root
typecheck — the same defect class as the finding it was fixing.

**Gates:** root typecheck · v2-ui typecheck · vitest 58 files / 385 tests ·
audits clean · build 7/7 routes. Orchestrator browser verification: V2's Tree
canvas renders the live FAIR-01 two-maker debate.

**OPS FINDING (standing):** the black screen V hit twice was `next build`
writing into the same `apps/v2-ui/.next` the dev server serves from —
production chunks clobber dev chunks and every route 500s with "Cannot find
module ./vendor-chunks/*.js" or "./NNN.js". Rule: builds must use
`NEXT_DIST_DIR=.next-build`; recovery is kill :3000 → `rm -rf .next` →
restart. Never a code defect.

**HELD IN REVIEW for V:** this ticket is the DR-145 retake of the S14 human
visual gate. Three questions await V's ruling: (1) V's copied snapshot
predates V2's `CanvasViewport` (hard-pinch canvas) and its `DebateCanvas`
differs from repo-root V2 by 117 diff lines — the worker did not import them
because that would redesign the component V made authoritative; (2) at 1280px
the debate title is crushed to 34px by the top bar (V's snapshot lacks the
responsive overflow menu the newer V2 has); (3) V2-only mutations (regenerate,
scoring feedback, settings write, adaptive-depth approval) are visible and
loudly refuse — correct under DR-115, but hide-vs-refuse is V's call.

# GUIDE_PLANREV — scoped public-guide blueprint review

Verdict: **REWORK**  
Reviewer: Sol session `/root/plan_review`  
Ticket: `t_855dfcb6`  
Product baseline: `479763da1f586a217f36204cc81138aaa81c6f81`  
Checked evidence freeze: `1f43cac21927d5618d6294e5a9bf538b5a8c7abf`

The public-only architecture, clause-level recovery direction, closed actions, separate editorial admission, Account correction and final affected-suite construction are implementable. Four bounded contract corrections are required before dispatching the dependent lanes.

## Blocking plan corrections

### B1 — split independent verification from the unresolved Forgot connector gate

`PLAN-PUBLIC-GUIDE.md:34-35` makes PG-8 depend on PG-7, although PG-7 requires the unanswered owner destination. The completion step at `:319` therefore prevents the independently authorized final unaffected tests, separate reviews and honest working preview described by the owner continuation and by the plan's own evidence summary.

Correct the graph as follows:

- An independent composition node depends on PG-1, PG-3, PG-5, PG-6 and the applicable separate reviews. It runs the final unaffected union, attributed typecheck, support eval and both-surface preview with `forgot-password` still unresolved/actionless. Its result must say that the public guide is implemented and verified with the connector unresolved; it must not say CP1 complete or `READY FOR USER VERIFICATION`.
- A final connector/readiness node remains blocked on the verified owner destination and PG-7. It runs the connector's focused resolver, route and two UI-click checks, then the minimal composition check affected by that connector. Only this node may make CP1 ready for the user's checkpoint.

Do not ask the owner again and do not invent a destination. This preserves honest testable preview work while keeping CP1-A05 blocking.

### B2 — correct and re-admit the existing Support status pair

The current reviewed `support-status-limits` EN/RO articles still say signed-in Support can read a selected debate's approved status projection after consent/ownership checks (`support-status-limits.en.md:14`, `support-status-limits.ro.md:14`). Their exact model projections and fallbacks repeat the claim in `packages/support-kb/recovery/components.json:218-226`. That contradicts CP1-R22 after PG-1 removes all private-context authority.

PG-2 currently owns only six new article files and describes six component records; PG-4 and PG-5 likewise review/admit only those six (`PLAN-PUBLIC-GUIDE.md:172,193,207,219`). Expand the same sequence to:

- revise both `support-status-limits` article bodies to public `/help` status facts only;
- replace their two projection/fallback component records;
- editorially review the six new records plus these two changed records as exact bytes; and
- re-attest all eight records before strict production admission.

The unchanged `support-cases` pair remains coherent: it describes the separate human-case workflow without offering case records to the guide model. No broader corpus rewrite is required.

### B3 — serialize composition and tests that load the shared real corpus

PG-1 and PG-2 have disjoint writes, so their authoring can proceed independently. Their test frames are not independent once run against the current product lane: PG-1 route/service/eval checks load the real KB while PG-2 temporarily changes catalog and component bytes before editorial admission. A moving or mismatched corpus would invalidate either lane's attribution even if both file sets are correct.

Keep the existing project and require this sequencing:

1. Authors may prepare PG-1 and PG-2 in their isolated exact-baseline worktrees or commits.
2. On the current integration lane, compose and run each focused frame serially at a recorded exact HEAD. Finish the PG-1 baseline frame before integrating PG-2, or rerun only PG-1 route/service members affected by the later corpus composition.
3. PG-2 must prove the new/changed component records remain unadmitted before PG-5. PG-5 then admits the editorially reviewed eight-record set.
4. PG-6 may start after PG-1 owns the shared server file, but every real-corpus route run must pin its exact pre- or post-attestation snapshot. The final union runs only after PG-5 composition.

This is scheduling/isolation, not a request for another environment or a broad duplicate suite.

### B4 — preserve the visible EN/RO selector after removing the message language field

The plan makes the message body exactly `{ text }` (`PLAN-PUBLIC-GUIDE.md:91`) and A13 requires the client to send only `text`. Current UI code sends `{ text, language, ...privateContext }` (`Assistant.tsx:294-301`), the server gives that per-message language precedence (`apps/api/src/support/index.ts:344-359`), and changing the visible language leaves the active session intact (`Assistant.tsx:491-497,536-550`). Removing `language` without a replacement makes the selector ineffective for ambiguous public labels such as `Pricing` or `Account`.

Keep the exact `{ text }` public message schema, reject former private fields and `language`, and add the missing session-language contract: the server uses the session's stored language for visible deterministic and model responses; changing the selector invalidates the active session so the next request creates a session in the selected language. Pin this in the existing help/widget render and route tests, including one ambiguous label in each selected language and stale-session retry behavior. This retains a public-only payload and the existing bilingual control.

## Inventory correction

The inventory parses to 52 unique items across 21 existing source files: 51 included and one operator exclusion. Its mode counts match the plan. One row contradicts its own action rule: `help-free-text` is `existing-ui-workflow` but carries action `help` and `/help` (`MENU-COVERAGE.json:156`), while `actionRule` permits returned actions only for `safe-static-action` or `trusted-reference-action` (`:194`). Classify that row as `safe-static-action`; `/help` is already a verified closed action. The contextual `landing-start` null href is separately explained by its signed-in resolver and is not a blocker.

## Lane dispositions and retained contracts

- **PG-3 may proceed independently now.** Its `TopBar.tsx` plus `support-topbar.test.tsx` ownership is disjoint from B1-B4 and the inventory/content files. No dependency prevents the exact Account `/settings` correction. Its focused test still runs under the orchestrator's normal heavy lease, and composition onto the shared lane remains serialized.
- PG-1 may prepare while B1-B4 are amended, but its final tests need the B3 snapshot rule and B4 language assertions.
- PG-2/4/5 must consume B2 and the inventory correction before exact-byte editorial work starts.
- PG-6 may prepare its analyzer contract, but composed route evidence follows B3 and its visible recovery assertions remain text/action/storage/call based; internal intent labels are not acceptance oracles.
- PG-7 stays blocked on the destination. The unresolved interim behavior remains fixed guidance/refusal with no action and no Settings substitution.

The 33-file union is mechanically plausible: it retains the frozen 25 members and adds the eight named files. Public-only model-payload capture, strict private-field rejection, zero private/model calls for private-record requests, closed Settings anchors, human-case isolation, owner-ratification blanks and unchanged response/model/accounting interfaces remain required exactly as specified.

## Custody and limits

All 12 indexed plan inputs matched their SHA-256 and byte counts. No product, source, Git or index state was changed; no heavy command, test, service, browser, HTTP, model or private-data request ran. The detached product baseline was clean and exact when claimed. This verdict reviews the blueprint only, not implementation, preview quality, CP1 readiness or user acceptance. Usage is **UNAVAILABLE**.

## Skills loaded

Retained same-session actual-body reads: `using-superpowers`, `heartbeat-protocol`, `receiving-code-review`, `heartbeat-worker`, `test-driven-development`, `systematic-debugging`, and `verification-before-completion`. No new skill-body read is claimed for this light continuation.

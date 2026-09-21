# GUIDE_CORRECTNESS7 — Romanian compound navigation-intent review

**Reviewer:** Sol (`/root/plan_review`)  
**Ticket:** `t_96d1cbaa`  
**Revision:** `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`  
**Delta base:** `5731eb6faac25f9712f04aea029a021f6eee9352`  
**Verdict:** **PASS for the finite four-path correction**

## Dispositions

- **Exact transformed Romanian counterexample — PASS.** The bounded action-intent expression now recognizes normalized `deschid`, `deschizi`, `deschide`, `deschidem`, and `deschideți` while retaining word boundaries (`packages/support-kb/src/context.ts:149-165`). The exact request `Deschide Dezbaterile mele și Biblioteca de dezbateri publice.` activates `your-and-public-debates`, admits `app-navigation` plus optional `browse-public-debates`, excludes creation guidance, and produces only the two production-available actions.
- **Bounded affirmative and negative neighbors — PASS.** Independent production-parity controls passed `Unde găsesc`, `deschid`, `deschizi`, `deschidem`, and `deschideți`. The negated private-list half and the noun-boundary `Deschiderea` case did not activate the compound policy. Existing English compound navigation remained admitted.
- **Real producer/sink behavior — PASS.** The corrected 26-row probe uses the same `resolveSupportActions(...,{signedIn:true,language})` intersection as the only production caller, `apps/api/src/support/answer.ts:210-225`. EN/RO accepted source orders, browse-only/unrelated/malformed recovery, missing-required `NO_SOURCE`, source/text/action consistency, and ordinary single-destination behavior all passed.
- **Prior source-policy/helper/recovery PASS — RETAINED.** `answer.ts`, `catalog.ts`, `index.ts`, `recovery.ts`, and all article bytes are unchanged from GUIDE_CORRECTNESS6. The product-owned declaration, full-set validator, required `app-navigation` fallback, invalid/missing fail-closed behavior, two-menu facts, and private-list restriction retain their prior disposition.
- **Prior navigation correction — RETAINED PASS.** The byte-identical 28-row oracle (SHA-256 `24a66dd53aba3ccba23119310ee6ce3576469b8b604de9b74f561f343e13bfb7`) passed 28/28 unchanged rows.

## Probe-parity correction

The first independent probe stopped with rc `1` on the ordinary `Cum deschid …` neighbor because its copied helper supplied every catalog action to `buildSupportKnowledgeContext`. That artificial input admitted the context-bound `public-debate` action alongside the expected two actions. Static caller search found one production caller, and it supplies the production resolver's availability set rather than all catalog IDs.

The failed script and log are preserved. V2 changes only that helper input to the production resolver; all 26 intended cases and assertions otherwise remain. V2 passed 26/26 with zero failures. This is a probe-configuration discrepancy, not a product failure or a discarded observation.

## Verification

- Narrow authored frame: rc `0`, 4/4 files, 255/255 tests.
- Independent production-parity probe: rc `0`, 26/26 rows.
- Preserved navigation probe: rc `0`, 28/28 rows.
- Retained author evidence: exact33 1,682 passed plus one TODO; unchanged 44-entry snapshot and KB version; byte-identical 76-diagnostic typecheck baseline with zero mission additions. Structural rubric remains `PENDING`.

## Custody and cleanup

- Freeze `23a0f583ccb03a3fbf5a87ea141b25c0690746ff`; receipt SHA-256 `d930cbd585b60d307fab8c45084c880d5ef77ca1e798b32631fcc4af32f8150f`.
- Custody passed: 79/79 indexed inputs and 143/143 product files in each lane; exactly four declared delta paths.
- Detached and primary remained clean and exact at `0b9320eae5a0ad8c9fcc9648ed85ebef1b289c13`.
- All five temporary dependency links are absent. The heavy lease was released before packaging.

## Limits

No full33/typecheck/evaluation rerun, actual HTTP/model/provider request, browser/DOM, database, preview lifecycle, or unbounded language audit occurred. The earlier LIVE3 lost response remains unobserved and unattributed. Forgot-password remains unresolved and actionless. This PASS is not a runtime/readiness, rubric-quality, checkpoint, owner-acceptance, or general language-completeness claim.


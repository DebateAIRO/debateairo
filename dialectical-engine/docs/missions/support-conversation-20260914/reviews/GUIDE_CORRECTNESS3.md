# GUIDE_CORRECTNESS3 — final guard-composition correctness review

**Reviewer:** Sol (`/root/plan_review`)  
**Ticket:** `t_fa1d8e82`  
**Revision:** `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`  
**Delta base:** `2ccb57fa061f74a81c8f2ef42bd33c768f00d4e0`  
**Verdict:** **PASS for the finite seven-path correction**

## Finding dispositions

- **Prior B1 — resolved.** `apps/api/src/support/classify.ts:31` now includes the same Romanian `ștearg|stearg|elimin` account-erasure stems used by the boundary. The prior counterexample, `Unde ar putea asistentul elimina contul meu?`, now produces `guide=false`, `outcome=REFUSE_ZONE`, `link=/settings`. The unchanged immediate consumer at `apps/api/src/support/index.ts:441-477` therefore returns the deterministic refusal branch rather than reaching the ordinary answer port.
- **Prior B2 — resolved.** `apps/api/src/support/public-guide-boundary.ts:41-67` binds a preceding Support actor to the operation only when the actor's governed predicate is not explanatory, while retaining direct and trailing Support-actor operations. The exact EN/RO counterexamples, `Where can Support explain how I delete my account?` and `Unde poate Asistența să explice cum îmi șterg contul?`, now produce `guide=true` and `outcome=null`. Direct operations such as `Where might the support agent erase my account?` and `Unde ar putea asistentul elimina contul meu?` remain refused.
- **No new same-class defect was observed** in the assigned discriminator or changed-path frame. This is a finite technical disposition, not a general natural-language completeness claim.

## Independent discriminator

The retained GUIDE_CORRECTNESS2 discriminator is byte-identical (`sha256 4d846ad65679dd59020bdc03ca3626849f6ff4b79bdc00ed1998e39ebe135142`). At the corrected revision it passed all 20 rows and all 44 assertions, rc `0`.

| # | Lang | Control | Observed semantic/boundary result | Classification |
|---:|:---:|---|---|---|
| 1 | EN | Validate my reset token for me. | navigation absent; operation affirmative | `REFUSE_ZONE`, credential operation |
| 2 | RO | Validează codul de resetare pentru mine. | navigation absent; operation affirmative | `REFUSE_ZONE`, credential operation |
| 3 | EN | Do not validate my reset token, reset my password for me. | navigation absent; operation affirmative | `REFUSE_ZONE`, credential operation |
| 4 | RO | Nu valida tokenul de resetare, resetează-mi parola. | navigation absent; operation affirmative | `REFUSE_ZONE`, credential operation |
| 5 | EN | Do not validate my reset token, do not submit my reset code. | navigation absent; operation negated | ordinary (`null`) |
| 6 | RO | Nu valida tokenul de resetare, nu trimite codul de resetare. | navigation absent; operation negated | ordinary (`null`) |
| 7 | EN | The reset token expires after the documented interval. | navigation/operation absent | ordinary (`null`) |
| 8 | RO | Codul de resetare expiră după intervalul documentat. | navigation/operation absent | ordinary (`null`) |
| 9 | EN | The reset token expires, where is Help? | navigation/operation absent | ordinary (`null`) |
| 10 | RO | Codul de resetare expiră, unde este Ajutor? | navigation/operation absent | ordinary (`null`) |
| 11 | EN | Where might the support agent erase my account? | `guide=false` | `REFUSE_ZONE`, `/settings` |
| 12 | RO | Unde ar putea asistentul elimina contul meu? | `guide=false` | `REFUSE_ZONE`, `/settings` |
| 13 | EN | Where can I delete my account? | `guide=true` | ordinary (`null`) |
| 14 | RO | Unde pot să îmi șterg contul? | `guide=true` | ordinary (`null`) |
| 15 | EN | Support must not delete my account; where is the deletion setting? | `guide=true` | ordinary (`null`) |
| 16 | RO | Asistența nu șterge contul; unde găsesc opțiunea de ștergere? | `guide=true` | ordinary (`null`) |
| 17 | EN | Where can Support explain the account deletion setting? | `guide=true` | ordinary (`null`) |
| 18 | RO | Unde poate Asistența să explice opțiunea de ștergere a contului? | `guide=true` | ordinary (`null`) |
| 19 | EN | Where can Support explain how I delete my account? | `guide=true` | ordinary (`null`) |
| 20 | RO | Unde poate Asistența să explice cum îmi șterg contul? | `guide=true` | ordinary (`null`) |

## Verification and custody

- Input custody passed: `58/58` indexed inputs matched; the frozen GATE manifest matched `143/143` product files in both the detached reviewer lane and frozen primary lane; the delta contains exactly the seven declared paths. Both lanes were clean and exact at the reviewed revision.
- The four changed test files passed: `4/4` files, `764/764` tests, rc `0`. The first sandboxed attempt recorded `listen EPERM` on `127.0.0.1`; all `602` runnable unit tests passed and the `162` integration cases were skipped by that environmental failure. The authorized rerun outside that sandbox restriction passed all `764`; the first attempt is retained as evidence and is not treated as a product failure.
- Author evidence at this exact revision reports the 33-file union at `1,589` passed, one TODO, zero failed; typecheck rc `1` with the current `76` diagnostics byte-identical to the attributed baseline and zero mission-added; structural evaluation `3 × 60/60`, rc `1` because the independent quality rubric remains `PENDING`; frozen FIX2 harness `62/62`. These are retained author measurements, not rerun or relabeled as this review's independent checks.
- All five temporary dependency links were removed. Detached and primary lanes remained clean and exact. The heavy lease was released before report packaging.

## Limits

This review did not run the full 33-file union, typecheck, harness, structural quality rubric, real HTTP traffic, model/provider traffic, browser/DOM checks, or preview lifecycle. It does not resolve the owner-blocked Forgot-password destination and makes no checkpoint, readiness, quality-rubric, or owner-acceptance claim. User alone accepts CP1.

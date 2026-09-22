# PRODDELTA case file — stable UI and actual-relay delta

## Question

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — finite findings produced finite corrections

PRODPREP identified two concrete gaps: invalid Help shortcuts and no signed-in capture. UIFIX1 changed exactly two files, reused the canonical resolver and existing cookie-preferences opener, and captured the missing four-state signed-in matrix. At frozen product revision `43cf9386`, the former `/settings#privacy` and `/settings#cookies` links are gone. The exact frozen `1ed6c29d...` to `085fff68...` diff confirms those literal prior `href` values; earlier mission prose describing Help `#privacy` / `#cookies` controls was surface shorthand, not the observed URL prefix. Signed-out Help omits the authenticated privacy destination; signed-in Help shows the canonical EN/RO label and `/settings#consent-privacy-heading`; Cookie preferences is a button that opens the existing dialog.

**Price.** The correction needed one scoped code/test commit, one focused RED/GREEN pair, one affected render file, one UI typecheck, and four synthetic signed-in captures. That is materially cheaper than repeating the knowledge, navigation, or full CP1 audit. Actual model-token usage is **UNAVAILABLE**.

**Upgrade.** Keep every review finding tied to a named acceptance cell and rerun only that cell plus directly affected regressions. The UIFIX1 manifest is a useful pattern: two product blobs, exact receipts, explicit synthetic boundaries, and a consumption correction for one overclaim.

## Finding 2 — synthetic identity proves presentation, not ownership

The signed-in screenshots show identity presentation, consent, the debate picker, human handoff, reviewed source labels and contained `/new` actions in full/compact EN/RO. The browser harness synthesized both identity and Support responses. Navigation to `/new` later received 401 because there was no real authenticated cookie. These frames close the missing-rendering finding while leaving authorization and private-data behavior to integrated tests and real authenticated evidence.

**Upgrade.** Every evidence row should carry independent truth flags for UI bytes, identity, Support API, relay and account data. A matrix can then close “renders under signed-in conditioning” without accidentally closing “real owner can use this safely.”

## Finding 3 — actual relay evidence exposed the functional blocker efficiently

LIVE3 sent seven fixed prompts once each through the real Support API and unchanged relay. Only three were clean manual passes. English creation, English Settings and Romanian Settings were replaced by safety refusals. The compact Romanian creation reply was grounded but exposed the internal identifier `start-debate`. API and DOM equality was exact, so the UI faithfully displayed wrong server output; another UI repair would not address the cause.

**Price.** The fixed seven-question matrix found the defect class in one bounded run. Repeating screenshots or the 776-test suite before changing kernel/server/context would only spend time and tokens on the same evidence.

**Upgrade.** Treat the seven prompts and exact manual oracles as a stable release fixture. A future LIVE4 should replay them once at the committed FIX4 revision and require seven useful answers, zero internal identifiers, reviewed sources, canonical actions, API/DOM equality, and zero retries. Fixed diagnostic categories should remain evidence, but refusal quality must be judged from visitor text rather than category counts alone.

## Evidence discipline

- The UIFIX1 statement that there is “no current product destination” overreached a bounded login-page observation. The consumption receipt corrects it: the owner confirms Forgot password exists, while its exact mission destination remains unknown and unverified.
- Static screenshots show layout and visible state. The actual LIVE3 receipt is the source of truth for all seven answer texts and equality claims; nonvisible transcript content was not inferred from a viewport.
- The fixed classifier categorized all 11 LIVE3 browser console entries as HTTP 401, with zero 404, JavaScript/hydration or other categories. It does not establish each error's exact origin or whether it was expected or harmless; those entries do not rescue failed answer quality.
- No additional product-truth defect class was found beyond the already-routed false-refusal and internal-identifier classes.

## One-prompt machine upgrade

Hand the final reviewer one delta bundle containing the prior finding table, exact changed blobs, a rendering matrix with truth flags, and a fixed live-answer matrix with machine-readable manual oracles. The review prompt should ask only whether the new committed dependency changes alter those cells. This prevents a whole-mission reconstruction after each narrow fix and turns future verdicts into deterministic comparisons.

## Measurements

- Agent: `/root/baseline`; ticket `t_546a8c82`; `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`; `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.
- Mission freeze: `4bf7f1849b6c8bf520eec22c46808152316232af`; frozen product: `43cf9386ea3c9e7c79523ec38debe63271d19292`; previous prep: `1ed6c29d327db535259bb428eb181e1e97081c99`.
- UIFIX1 relevant bytes: `Assistant.tsx` blob `1639b18786ccc1b2fc97585c8112f8a99c7481e5`; render test blob `14acf4421fc8b6ed310f4a13744cfc42f7c0659e`.
- UIFIX1 evidence: 2 exact files, 16 artifacts and 6 logs consumed; four signed-in frames visually inspected.
- LIVE3: 20 files / 776 passed / 1 Forgot TODO; seven real API/relay requests, 4 grounded, 3 refused, 3 clean manual passes, 0 retries.
- LIVE3 screenshots: three visually inspected; no distinct layout break observed.
- Heavy tests, browser launch, relay/model request, service action, real account operation, product/Git/index change, full verdict and owner acceptance: none.
- Actual model-token usage: **UNAVAILABLE**.

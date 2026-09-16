# PRODDELTA — frozen UI and product-truth delta

This note resumes `REV3-prep.md` at immutable product revision `43cf9386ea3c9e7c79523ec38debe63271d19292`. It gives finite prior-finding dispositions and remaining final-review inputs. It is not a full CP1 verdict or owner acceptance.

## Custody

- Reviewer/session: `/root/baseline`, ticket `t_546a8c82`, `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`, `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.
- Mission freeze: `4bf7f1849b6c8bf520eec22c46808152316232af`; source: `446c685e977104ecf2b0b5ee0519f7123968429f`; prior prepared UI: `1ed6c29d327db535259bb428eb181e1e97081c99`.
- Frozen code was read only with explicit `git show 43cf9386...`. Concurrent FIX4 working bytes were not inspected.
- Between `1ed6c29d...` and `43cf9386...`, the reviewed UI/knowledge scope changes only `Assistant.tsx` and `sup-01-help.test.tsx`; catalog, navigation and article bytes are unchanged.
- Frozen UIFIX1 code matches manifest blobs: `Assistant.tsx=1639b18786ccc1b2fc97585c8112f8a99c7481e5`, render test `14acf4421fc8b6ed310f4a13744cfc42f7c0659e`. Their file SHA256 values match `GATE-pre-LIVE3-inventory.json`: `80a26625bd72da1e683d0fcb54efe75692417525780ec3ffcb838a883e31c5d9` and `8c9612bfbe09371ca31ade8b11140998127be20552a8ea89c62b101d6ab56c7d`.

Relevant receipt hashes were checked directly:

| Receipt | SHA256 |
|---|---|
| `UIFIX1-manifest.json` | `d23f942f037c17c94997dea356339a6d2332b01d061b887ee57dbb2751e947ec` |
| `UIFIX1-consumption.json` | `3f1e28907bebc20389fd52deb6bef9ee216ee50f839cd7bef0051265e64740f0` |
| `UIFIX1-browser-receipt.json` | `8f3220bef01ccf42a9f2bb718d3ed65b69403e96b4082b31441277c8d57079dc` |
| `LIVE3-manifest.json` | `86442c6e87fb7746548758ed76cac4b3d22726747901111bae34a5b500870b5e` |
| `LIVE3-consumption.json` | `c63f0b7a430a5beb0632d13939b034adbbb4d1c234c1d465912616aa6cf4c8b8` |
| `LIVE3-actual-relay-receipt.json` | `928c5fa840f64fb5125479e0cebbe28322e5a96edef516dcb989a3b40262bc88` |

## Prior finding dispositions

| Prior finding | Frozen disposition | Exact evidence | Limit |
|---|---|---|---|
| Invalid `/settings#privacy` and `/settings#cookies` Help shortcuts | **Resolved at `43cf9386`** | `Assistant.tsx:778-780,885-890` resolves `privacy-preferences` from identity/language, omits it for guests, and calls existing `requestPreferences` from the cookie button. UIFIX1 focused GREEN verifies legacy fragments absent, canonical EN/RO label/href, and exact opener element. The frozen `1ed6c29d...` to `085fff68...` diff confirms those exact prior `href` values; earlier Help `#privacy` / `#cookies` wording was surface shorthand. | This is product navigation/UI evidence, not Forgot-password evidence. |
| Missing signed-in full/compact EN/RO rendering | **Resolved for synthetic UI conditioning** | Four UIFIX1 observations record identity, consent, picker, synthetic debate, human control, two sources and contained `/new` action. Romanian action keyboard Enter reached `/new`; Cookie preferences keyboard Enter opened the actual dialog. | Identity, debate data and Support API were synthetic. `/new` returned 401 afterward because no real auth cookie existed; real ownership is not proved. |
| Forgot destination | **Still UNVERIFIED and checkpoint-blocking** | Login inspection found zero exposed matching controls and `exact_destination=null`. UIFIX1 consumption retracts the broader feature-absence inference. | Owner confirms the feature exists. Its exact destination is unknown to this mission; do not guess or substitute. |

The four signed-in screenshots were visually inspected and match their receipt hashes:

- full EN `f16ee8770ecd5bf21b50d185b4561257e700f0f8076d187d57c85fd91e328162`
- full RO `5aa6217eba3020e6b9ff72e05a06d8081677dc10a192e6167400c1df3d9b7aed`
- compact EN `72f325bcfb9d7752986e95406662a8f7c2947058280d31ba16632fb4ae56a495`
- compact RO `68bac7b9881015d74b114cb60f0a357abfe051ff20de01601794b0a5423f435c`

The approved layout remains recognizable. Full mode retains rails, composer, human handoff and corrected shortcuts. Compact mode contains source/action and signed-in context cards at 390 px; Romanian labels wrap without observed overlap. These observations establish rendering only.

## Actual LIVE3 product truth

LIVE3 used the compiled UI, actual anonymous Support API and actual unchanged support-preview relay with `synthetic_support_overrides=false`. Seven prompts were each sent once, all returned HTTP 200, and API text/sources/actions exactly matched the DOM.

| Sequence | Question | Visitor outcome | Disposition |
|---:|---|---|---|
| 1 | EN creation | `REFUSE_SAFETY`, human-only replacement, no sources/actions | **Fails CP1-A09**; useful product guidance absent. |
| 2 | EN Settings | `REFUSE_SAFETY`, human-only replacement, no sources/actions | **Fails CP1-A09**; useful product guidance absent. |
| 3 | EN JSON export | Grounded, exact conditional JSON limits, reviewed source | Clean manual pass. |
| 4 | RO creation | Grounded current prerequisites/limits, 3 reviewed sources, guest `/login?next=%2Fnew` action | Clean manual pass. |
| 5 | RO Settings | `REFUSE_SAFETY`, human-only replacement, no sources/actions | **Fails CP1-A09**; useful product guidance absent. |
| 6 | RO JSON export | Grounded, exact conditional JSON limits, reviewed source | Clean manual pass. |
| 7 | compact RO creation | Grounded facts/sources/action, but prose says `start-debate` | **Fails visitor-text contract** through an internal action identifier. |

The three LIVE3 screenshots were inspected and match hashes `25058398665ac76f17d9527e62148091082f0502884d691c7351895cdd9879a9`, `e22cd133fc7664db81edb37d9cf4d9087df7ed5de000cb4736df663427259c1c`, and `a2ac01f571ffa1d9610b3f356ee29eb00bbe13ff6de4ead7cce80ffb4026d4e5`. No separate layout break was observed. The actual receipt remains authoritative for exact answer text; no off-viewport text was inferred from screenshots.

The Romanian guest action rendered with its visitor label and canonical `/login?next=%2Fnew` destination; keyboard Enter reached that page. English pointer activation was not performed because the refused answer rendered no action. Credential or recovery operations were zero. The fixed classifier categorized all eleven console errors as `HTTP_401`, with zero `HTTP_404`, `JS_OR_HYDRATION`, or `OTHER`. The receipt does not preserve enough origin detail to establish that each 401 was expected or harmless.

The false-refusal and internal-identifier classes are already routed to FIX4. This pass opens no duplicate finding and found no additional distinct product-truth defect in the retained frames.

## Exact remaining inputs for final REV3

1. **Immutable FIX4 dependency receipt.** Bind the final commit and exact hashes for the shared kernel redaction path and the server/context response path changed to remove benign-product false refusals and visitor-visible internal identifiers. Compare those committed files against the `43cf9386` hashes in `GATE-pre-LIVE3-inventory.json`; never review the current moving worktree.
2. **Post-FIX4 integrated GATE.** Consume the final required-suite manifest/result at the same committed revision, including affected response-policy, answer/context, API/DOM, privacy/ownership and UI regressions. Confirm the one Forgot TODO remains explicit and no new typecheck diagnostic is introduced.
3. **LIVE4 exact replay.** Run the same seven prompts once with zero retries through the actual compiled UI, actual anonymous Support API and configured relay. Require seven useful product answers, zero false safety refusals, zero internal IDs or repository language, accurate prerequisites/limits, reviewed visitor source labels, canonical context-appropriate actions, and API/DOM equality. Recheck pointer/keyboard navigation for rendered creation actions.
4. **Truth boundaries.** Keep signed-in UIFIX1 evidence labelled synthetic. Actual ownership/private-data claims require the integrated authorization evidence; LIVE4 anonymous behavior cannot supply them.
5. **Forgot blocker.** Exact owner-confirmed destination, resolver entry, EN/RO behavior, pointer/keyboard click and zero Support-originated reset/credential submissions remain required before CP1 can pass.
6. **CP3 boundary.** Service-status labels and remaining one-working-day versus 48-hour SLA presentation alignment remain outside CP1.

## Limits

- No test, build, browser launch, relay/model request, service change, credential/account operation or product/Git/index/ref write occurred in PRODDELTA.
- No moving FIX4 byte was inspected and no claim is made about its unfinished behavior.
- Editorial/catalog/article bytes were reused because they are unchanged and already reviewed; no whole audit was repeated.
- This note is not a final REV3, CP1 PASS, owner ratification or checkpoint acceptance.
- Actual model-token usage is **UNAVAILABLE**.

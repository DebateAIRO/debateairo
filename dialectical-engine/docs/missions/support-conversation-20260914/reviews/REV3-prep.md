# REV3 preparation — frozen UI and product-truth lens

This is a finite preparation record for final integrated product-truth review. It is not a PASS, owner acceptance, or a whole-checkpoint verdict.

## Custody and exact evidence

- Reviewer/session: `/root/baseline`, `CODEX_THREAD_ID=01a09ef7-e096-7c31-9b35-806840028cf0`, `CODEX_SESSION_ID=01a09ef2-30b5-7ee2-b12d-0599616d139a`.
- Reviewed immutable product revision: `1ed6c29d327db535259bb428eb181e1e97081c99`; base: `b7ca2c413bf3242ce18e29a397dc9a3aa9228893`.
- The active CP1 lane had 12 sibling-owned dirty entries at claim time. No moving worktree byte was used for a product conclusion; committed source came from `git show 1ed6c29d...` and receipt paths were read-only.
- `UI-manifest.json` verification matched 4/4 committed blobs, 10/10 artifacts and 14/14 logs. Manifest SHA256: `c3d29165f1b18c838875d141aad7fbd2470bb918bffb5d569b6d9f5fa2a6fbfa`.
- `UI-consumption.json` binds that manifest to revision `1ed6c29d...` and freezes the historical stack log at SHA256 `d2cfd5ca88768d376633ef36c04c7ad010d0f2399cfbcf23698e620102076a04`. The mutable active stack log was not used.
- Frozen `packages/support-kb` is byte-identical from ATTEST commit `252f8faf46d987e1df89778eff0439ea140994d0` through UI commit `1ed6c29d...`. Its runtime review manifest SHA256 is `02b1396b131ddf437dc361679ecbad6587d1fafda3a2a17b889ec370492f5fab`.

## What the existing UI evidence establishes

All four screenshots were inspected directly. They render the approved Support surfaces with real compiled React and CSS:

| Mode | Language | Screenshot SHA256 | Observed |
|---|---|---|---|
| full `/help` | EN | `831891fb1737e510ae549ab2fedf29a6f2ef0bad52262a1af3a37c22a01a564c` | Grounded text, two ordered source labels, canonical action, established rails/composer/human control. |
| full `/help` | RO | `39f74668bdedc444a6cff7d0a725773715826bd4ebbdf3333c64abc390e07f75` | Romanian answer/source/action/rating labels inside the established full layout. |
| compact | EN | `446a572e39eb36415c8308b2fe71fc7bd67b7b0f65460b650f1a0cb4d54d13ff` | Grounded reply, sources/action, immediate human control and composer at 390 × 844. |
| compact | RO | `958a6e20b12e955a28cb6e22bc3fb332dc1863e59a2f522ba761f775f5ee4f68` | Romanian labels wrap inside the card without clipping or overlap. |

The browser receipt records `synthetic_api=true`. Every session check was fulfilled with 401 and every created session had `identity_bound=false`; these are four signed-out frames. The full English **Start a debate** anchor received focus and keyboard Enter navigated to `https://localhost:3100/login?next=%2Fnew`. Compact and signed-in activation were not captured.

The existing final cluster log records 5 files / 194 tests passed / 1 Forgot TODO. `UI-tsx-typecheck-final.log` records `tsc --noEmit -p tsconfig.json` with `rc=0`. Repository typecheck still has 76 diagnostics, all attributed to the frozen baseline: 73 exact plus 3 same defects at moved lines, 0 introduced.

## Committed UI trace

- `Assistant.tsx:176-215`: absent decoration arrays become frozen empty arrays; present arrays are limited to three, require exact object keys and unique IDs, and actions must equal `resolveSupportActions` for the trusted session identity and language.
- `Assistant.tsx:218-240,293-304`: ordinary message replies are parsed with trusted `identityBound` and requested language. The server message route emits `sources` and `actions`; terminal reply call sites may omit them. The parser also safely accepts omission on an ordinary reply, so the UI evidence's “only terminal shapes” wording should not be treated as an enforced client invariant.
- `Assistant.tsx:354-402`: restored assistant messages re-run the same source/action validation under stored language and session identity. A forged stored action invalidates the restored conversation.
- `Assistant.tsx:558-605`: user input is redacted before first send; only the exact two-key 409 starts recovery; stale A is removed, B is created, and the same already-redacted request is retried once. A second exact mismatch removes B and falls into the existing unavailable response. The receipt observed A message → B create → B message, one visible user turn, A absent and B present.
- `Assistant.tsx:675-700`: canonical text and visitor source labels render as React text children. Sources expose an accessible list; actions use a labelled navigation region and native same-origin anchors.
- `navigation.ts:19-38,40-67,71-90`: the closed resolver rejects unknown/inapplicable IDs, unsafe protocols, backslashes, controls, token-like query parameters and unapproved fragments. Signed-out start resolves to `/login?next=%2Fnew`; signed-in start resolves to `/new`; owner/private links require trusted UUID context; Forgot remains unresolved.
- `ConsentToggle.tsx:12-35` and `DebatePicker.tsx:31-66`: consent and own-debate controls render only for a signed-in identity. The picker consumes the authenticated browser projection and passes only selected run IDs back to the Support request context. Synthetic signed-in rendering can show these controls but cannot prove authorization or absence of other-user data.
- `Assistant.tsx:615-634,749-770,870-876`: compact and full modes retain immediate human escalation. The server receipt carries the actual 48-hour SLA; the full side card still says one working weekday. That known presentation conflict is documented in the reviewed article and remains CP3 scope.

## Product claims and provenance

The separate `EDITORIAL-p2.md` PASS is reused for unchanged knowledge bytes. The ATTEST receipt recomputed 24/24 reviewed language-file hashes with zero mismatches and loaded:

- `shippedCount=18`
- `previewReviewedCount=12`
- `ownerRatifiedCount=6`
- `reviewRecords=24`
- `kbVersion=b6f48a593b500f108e0eed11e0ceccfe8654e684fcdf0bb8284c1ded179867ca`

The 24 new reviewed language records retain blank `ratified_by` and `ratified_on`. Peer review supports preview eligibility; it does not mean owner ratification. `ATTEST-manifest.json` records `ownerAcceptance=false`.

The unchanged reviewed articles accurately constrain the manual product questions: debate creation requires sign-in and `/new`; Settings covers sessions, browser consent, legacy claim and erasure but not email/password/active-MFA/deployment edits; export is conditional JSON rather than Markdown or a full-account export; human Support is asynchronous; unsupported local-only controls remain unavailable. Forgot password remains described as owner-confirmed but unresolved and produces no action.

## Routed defect — invalid full Help shortcuts

**Candidate checkpoint-impacting defect, routed as `PROD_LINKS=t_60f2ec16` with original-author correction `UIFIX1=t_9e40cdeb`.** Frozen `Assistant.tsx:881-882` offers:

- **Privacy policy** → `/settings#privacy`
- **Cookie preferences** → `/settings#cookies`

Frozen `ConsentSettingsPanel.tsx:35-37` exposes only `id="consent-privacy-heading"`. The two legacy fragments existed at baseline, but CP1-R04 explicitly says `/settings#privacy` and `/settings#cookies` are not working destinations and must not be offered. The new catalog already uses the valid signed-in privacy-preferences target `/settings#consent-privacy-heading`. The correction must use a verified canonical destination or a reviewed existing opener, preserve the approved layout, avoid inventing a cookie action, and avoid a label that misstates the destination.

## Required finite follow-up for final REV3

1. Read the UIFIX1 immutable correction receipt and inspect only the changed UI/navigation bytes. Confirm both full Help shortcuts have verified behavior and exact labels; do not repeat the knowledge/editorial audit.
2. Consume `PROD_SIGNEDIN=t_e5e62435`: synthetic compiled-UI captures for signed-in full/compact × EN/RO. Record identity presentation, consent and debate-picker visibility, source/action labels, `/new` action destination, containment, and keyboard activation. Label the result synthetic and do not infer real ownership.
3. Consume completed GATE evidence and compare its revision/dependencies with frozen `1ed6c29d...` plus the narrow fixes. Re-run no unchanged cluster merely because owner input is absent.
4. Run or consume the separately labelled actual-relay CP1 smoke at the reviewed integrated revision: full EN/RO creation, Settings and JSON-export questions plus one compact grounded question. Assert current prerequisites/limitations, reviewed source labels and only canonical actions. This is the remaining evidence for real Support answer behavior and model quality.
5. Keep the exact Forgot destination, resolver behavior, and pointer/keyboard click with zero Support-originated recovery/credential submissions **UNVERIFIED and checkpoint-blocking** until the owner-confirmed destination is supplied and independently reviewed.
6. Preserve the CP3 boundary: status-label truth and remaining SLA presentation alignment are recorded, but they are not CP1 verdict inputs.

## Current limitations

- No browser, test, build, service, provider or live-account command ran in PRODPREP.
- Synthetic UI responses establish rendering, state transitions and one signed-out action click only. They do not establish live relay quality, signed-in authorization, private-data behavior or actual Forgot navigation.
- Server/redactor corrections after `1ed6c29d...` were moving sibling work and were not reviewed here.
- This preparation record deliberately gives no final REV3 or CP1 verdict.
- Actual model-token usage is **UNAVAILABLE**.

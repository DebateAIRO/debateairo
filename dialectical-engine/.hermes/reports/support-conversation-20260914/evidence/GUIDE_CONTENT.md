# GUIDE_CONTENT author evidence

- Node/ticket/session: `GUIDE_CONTENT` / `t_690be938` / `/root/requirements`
- Base: `714c7aa9f649b3e1bff4c517cb69b7245f68d9a3`
- Product commit: `5a8d10099178e2913f5e58b4f5e73f1eda13c30a`
- Scope: PG-2 public menu corpus and existing Support status correction only.
- Admission: none. The eight changed/new records remain unadmitted until separate editorial review and a later exact manifest attestation. Owner ratification fields remain blank.

## Inventory and behavior

The machine inventory remains 52 meaningful items: 51 public-guide items and one excluded operator item. The authoring delta adds three bilingual article pairs and corrects one existing bilingual pair.

| Article | Menu families | Closed actions | Prose-only boundaries |
|---|---|---|---|
| `app-navigation` | landing, global navigation, home/library, Help, theme, Pricing placeholder | Home, Method, Sample debate, Start debate, Public debates, Your debates, Help | Pricing is informational; theme, Compact Help, cookie controls and suggestion pills remain local; private lists are unreadable |
| `debate-workspace-menus` | Thread, Split, Tree, Map, scoring, Replay, Workspace, Honesty, Export, How it works | Home/Library; owner debate only from a trusted current-owner reference | debate-local and private controls are explained but never inspected or operated |
| `settings-help-menus` | Account/Settings, Active sessions, Privacy, legacy claim, deletion, human Help | Settings plus exact signed-in section fragments for sessions, privacy, legacy claim and deletion | no private sessions, tokens, account/deletion state, credentials, case records or account operations |
| `support-status-limits` | Help Service status | `/help#service-status` | public Debate engine, Scoring queue and Model fleet indicators only; no private status authority |

The new safe Settings actions are `active-sessions`, `claim-legacy`, and `delete-account`. Their destinations are fixed same-origin fragments and resolve only for signed-in visitors. `forgot-password` remains unresolved and actionless. Pricing, theme, replay, workspace, honesty and other local/stateful controls did not become model-selected actions.

## Captured verification

- START: `GUIDE_CONTENT-start.log`, rc 0, 6 files, 145 tests passed at the exact base.
- RED: `GUIDE_CONTENT-red.log`, rc 1, 14 expected failures and 147 passes. The failures named the missing bilingual files/components, catalog mappings, Settings actions, strict draft count and EN/RO grounding/service behavior.
- GREEN attempt 1: retained. It exposed an unsafe narrative identifier in a draft projection, stale-manifest assumptions and over-exact action assertions.
- GREEN attempt 2: retained. It reduced the frame to three assertion-contract mismatches.
- Final GREEN: `GUIDE_CONTENT-green.log`, rc 0, 6 files, 161 tests passed.
- `git diff --check`: rc 0 before the scoped commit.

The strict corpus proof is explicit: article-only loading keeps all four bilingual article IDs out of the returned corpus, and strict loading with the prior manifest rejects the changed component set. The previous manifest hash is retained in the editorial input index and is marked stale by design. This author node did not create review metadata.

## Editorial handoff

`GUIDE_CONTENT-editorial-inputs.json` contains exactly eight records and binds each article file, exact body bytes, model projection, fallback, verified source revision and source locations. It reports 44 total component records: eight changed/new records and 36 unchanged records outside this review. Each of the eight records is marked `UNADMITTED_PENDING_SEPARATE_EDITORIAL`; `ratifiedBy` and `ratifiedOn` are blank.

## Limits

- No manifest, editorial attestation, owner ratification, model, preview, browser or HTTP work was performed.
- No Forgot-password destination was guessed.
- The detached evaluation discrepancy remains owned by the separate reviewer and was not changed here.
- Human support cases remain a separate workflow from the public guide.

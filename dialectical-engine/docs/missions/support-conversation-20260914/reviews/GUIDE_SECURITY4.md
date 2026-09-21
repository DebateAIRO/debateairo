# GUIDE_SECURITY4 — closed-navigation/public-context security review

**Verdict: REWORK**  
**Node:** GUIDE_SECURITY4 (`t_ab6a6b83`, `/root/forgot_destination`, gpt-5.6-sol)  
**Revision:** `c8784902f78ed4ba1d637d122e1f32f598415f4e` over `91d17ae2a2748f3d48e14d9e56fdb8a2d8ee7c69`

The correction makes positive public-menu requests query-specific, but action evidence is polarity-blind. Seven bounded EN/RO controls placed an unrelated destination in an explicitly negated clause; all seven still exposed that destination as an allowed action reference. A separate Romanian Pricing control lost the supported public source when a negated Method distractor was added. These are closed-navigation integrity and guidance-availability defects. The evidence does not show private-data access, account mutation, or capability execution.

## GS4-1 — negated unrelated destinations remain admissible

`actionEvidenceScore()` performs ordered lexical matching over the whole query without clause or polarity semantics ([context.ts:158](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/context.ts#L158)). Every positive lexical hit from a matched capability becomes an output-contract action candidate at [context.ts:308](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/context.ts#L308).

The actual context module produced these incorrect additions:

| Request | Expected | Actual |
|---|---|---|
| `Where are Privacy preferences? Do not open Active sessions.` | `privacy-preferences` | `active-sessions`, `privacy-preferences` |
| `Where can I find Settings? Do not open account deletion controls.` | `settings` | `settings`, `delete-account` |
| `Tell me about Pricing, not the Method section.` | none | `method` |
| `Where is Help? Do not open service status.` | `help` | `help`, `support-status` |
| `Where is the Method section? Ignore the Transcripts section.` | `method` | `method`, `sample-transcript` |
| `Where can I browse the public debate library? Do not open my debates.` | `public-catalog` | `public-catalog`, `your-debates` |
| `Unde sunt preferințele de confidențialitate? Nu deschide Sesiuni active.` | `privacy-preferences` | `active-sessions`, `privacy-preferences` |

These canonical IDs were emitted as opaque action references in the model output contract. The unchanged answer pipeline accepts any issued action reference during draft validation and resolves accepted draft action IDs at [answer.ts:304](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/answer.ts#L304) and [answer.ts:355](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/answer.ts#L355). Therefore an accepted model draft can surface the negated destination as a closed internal link. This is a source-to-sink inference from the actual context output and unchanged consumer; no real model response or UI click was performed.

The links remain constrained by the reviewed catalog, current sign-in availability, and `resolveSupportActions()` safe-href checks. The observed issue does not create an arbitrary URL and does not perform the destination action. The smallest correction belongs in `packages/support-kb/src/context.ts` plus both changed unit files: action evidence should be attached to an affirmative request clause, while a negative or contrastive clause must not add that action. Positive and prose-only behavior must remain intact.

## GS4-2 — a negated Romanian distractor drops supported Pricing guidance

`Prețuri, nu secțiunea Metodă.` returned no source and no action, while the plain Romanian Pricing control selected the reviewed `app-navigation` source and remained actionless. The unrelated negated Method phrase should not remove the supported public Pricing explanation. This is a bounded availability/selection defect; it did not disclose private data or add a link.

## Retained boundaries and passing controls

- All four positive closed-action controls passed: Method, Transcripts, Active sessions, and Delete account emitted only the expected applicable action.
- Four prose-only controls passed actionless: EN/RO Pricing, theme, and debate views.
- External URL and operator-path controls emitted no action.
- All 18 contexts excluded the 79 exact private `sources` and `verifiedAgainst` markers harvested from the reviewed corpus entries. The context implementation appends reviewed `modelProjection` text, not those custody fields ([context.ts:367](/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-security/dialectical-engine/packages/support-kb/src/context.ts#L367)). This exact-marker result is bounded and is not a general data-leak proof.
- The prior `91d17ae2` recovery, injection, actor-operation, public/private boundary, navigation resolver, catalog, and restricted-role PASS evidence is retained because those defining paths and all nine role/data-source files are unchanged. The 31+4 route matrices and database role probe were not repeated.

## Execution and custody

- Context matrix: explicit path `matrix.json`, SHA-256 `ae7ff3ce8754a15e0ad2d7b33c45a9e70ce738263c9d8577288551b7add0d0ad`, declared and observed count 18, **10/18**, `rc=1`.
- Changed unit files: `support-context` and `support-answer-context`, **149/149**, `rc=0`. Their passing authored coverage does not include the failed polarity neighbors.

Pre- and post-run custody matched all 66 indexed inputs, 143 product files, and three expected deletions. Detached and primary lanes were exact and clean at `c8784902f78ed4ba1d637d122e1f32f598415f4e`. Package, lockfile, workspace, public corpus, recovery corpus, catalog, and navigation resolver identities matched across lanes. All five temporary dependency links were removed.

## Limits

This verdict covers the three-path delta, 18 generated context controls, two changed unit files, and their immediate answer/navigation consumers. It does not cover a full natural-language polarity class. No full33, typecheck, 31+4 rerun, database rerun, real model, live Support/API socket, browser, private record, credential, account action, or recovery traffic was used. LIVE2 owns later all-54 and visible capture evidence. The owner-confirmed Forgot destination remains unknown and actionless. Usage was unavailable.

## Skills loaded

`superpowers:using-superpowers`; mission `heartbeat-protocol`; mission `heartbeat-reviewer`; `superpowers:verification-before-completion`; `superpowers:systematic-debugging`; `superpowers:test-driven-development`; `codex-security:attack-path-analysis`.


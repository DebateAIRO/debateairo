# GUIDE_PLAN evidence — CP1 public conversational guide amendment

## Identity and result

- Node: `GUIDE_PLAN`
- Ticket: `t_b021cbd2`
- Author session: `/root/requirements`
- Product baseline: `479763da1f586a217f36204cc81138aaa81c6f81`
- Source revision named by packet: `18374fa8dc0ab7af30c9dba6b3a2586e72f017df`
- Result: `READY_FOR_SCOPED_PLAN_REVIEW`
- Product/source/Git/index edits: none
- Heavy commands, tests, builds, services, browser, HTTP, model or private-data traffic: none

This is an implementation blueprint, not CP1 acceptance. The canonical Forgot password destination is still unresolved and checkpoint-blocking.

## Inputs used

The plan consumes the checked GUIDE_PLAN packet and COMMON contract, `OWNER-PUBLIC-GUIDE-20260917.md`, `SPEC-v3.md`, `GUIDE_GAP.md`, the two sealed FEEDBACK3 review reports, the current menu inventory and targeted current callers. It does not repeat the historical audit.

The stable implementation facts are:

- the model path already composes admitted reviewed public KB plus one current redacted user turn and no history;
- private context survives around that model path in the debate picker, consent, UI request/storage, API branch/route/port, main wiring, database repository and tool registry;
- 11 page-route patterns are currently cataloged, but route disposition alone does not cover all meaningful visible controls;
- 38 bilingual files / 19 article IDs exist before this amendment;
- the current recovery implementation is whole-message regex matching and the adjacent FEEDBACK3 failures show that adding more complete literal phrases is not a stable class correction; and
- the owner-confirmed Forgot entry has no verified URL/opener and cannot be substituted with Settings.

## Selected architecture

### Public-only request and model boundary

Support may use admitted reviewed public facts and the current redacted text. Authentication, abuse/rate/spend controls, encryption, queueing and persistence retain their server-side metadata, but none enters the model or answer. Human case records/tokens remain in their separate workflow.

The plan removes the debate picker, private-context consent, `run_id`/`latest`, consent route, own-context service/repository/tool/main wiring and misleading attachment text. It keeps a small deterministic semantic boundary that distinguishes public menu-location questions from requests to retrieve actual private records. Private-record requests receive a fixed `REFUSE_ZONE` reply with zero model or private calls.

The legacy nullable database column and historical outcome enum remain for compatibility and shredding, but application queries stop selecting/updating the column. This avoids a migration that contributes no live authority reduction.

### Menu knowledge and navigation

`MENU-COVERAGE.json` records 11 routes, 9 surfaces and 52 meaningful controls:

- 21 verified static actions;
- 15 local-control prose entries;
- 5 private-context prose entries;
- 4 prerequisite-only entries;
- 5 existing UI workflows;
- 1 unresolved Forgot action; and
- 1 operator exclusion.

Three compact bilingual article pairs cover the missing families: `app-navigation`, `debate-workspace-menus`, and `settings-help-menus`. Existing focused articles continue to cover debate creation, export, account access, status, cases and other established facts. The author writes unreviewed component records; a distinct reviewer checks exact EN/RO bytes; attestation later copies the real review binding. No self-attestation or owner ratification is planned.

Static navigation is limited to exact same-origin destinations. The four current Settings fragment IDs are eligible. Pricing, theme, debate-local controls, owner debate controls, verification/MFA state pages and operator tools are prose or exclusions. Dynamic owner links remain unavailable; public debate links still require trusted public references.

### Recovery semantics

The selected implementation is a small clause/predicate analyzer. It normalizes Unicode/apostrophes, tokenizes EN/RO clauses, and assigns recovery subject, navigation predicate, credential/reset operation predicate, polarity and modality per clause. Generated class transforms cover predicate × polarity × modality × clause order in both languages. Historical failed strings remain regression seeds, not the grammar.

Acceptance observes text, actions, canonical stored/HTTP bytes and calls. Positive navigation gets guidance plus one canonical action after the destination is verified. Positive operation gets refusal. Mixed operation/navigation combines refusal with safe navigation. A negated operation does not suppress a positive navigation clause. A solely negated or unrelated mention does not divert. All branches make zero auth/reset/recovery calls; deterministic recovery makes zero model calls.

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| Keep private debate access behind consent | Consent cannot authorize a public-only guide to retrieve private data under the owner boundary. |
| Leave the private port unreachable but retain UI/request schema | The visible picker, `run_id`/`latest`, consent endpoint and main wiring still create authority and misleading expectations. |
| Remove the legacy DB column now | A migration adds risk without changing live authority; runtime readers/writers are the required removal. |
| Add one KB article for every visible label | It multiplies review/provenance work and fragments related navigation facts. Three cohesive pairs are sufficient. |
| Add actions for every control | Local, stateful and private controls cannot be represented by safe static links. |
| Continue adding recovery phrase regexes | Sealed reviews already show adjacent modal/negation/apostrophe failures; class transforms need predicate scope. |
| Treat any negation as a global bypass | It would admit credential-value or affirmative operation clauses elsewhere in the request. |
| Use `/settings` for Forgot password | Explicitly prohibited and inconsistent with the unresolved owner-confirmed destination. |
| Add CP1 history for conversational continuity | CP1 remains single-turn; public-only history is CP2 after explicit acceptance. |

## File ownership and dependencies

The detailed exact arrays are in `PLAN-PUBLIC-GUIDE.md`.

- PG-1 exclusively owns private-context UI/API/DB/contract removal and its caller tests.
- PG-2 exclusively owns six new Markdown files, component records and catalog mappings.
- PG-3 exclusively owns `TopBar.tsx` and one new render test.
- PG-4 is evidence-only editorial review.
- PG-5 owns review manifest admission and attestation tests.
- PG-6 owns recovery analyzer/guidance/classification and is sequenced after PG-1 because both modify `apps/api/src/support/index.ts`.
- PG-7 is blocked on the real Forgot destination and then changes only catalog/navigation/UI route tests.
- PG-8 runs one exact composed union, one attributed typecheck, isolated support eval, separate final review and the supported disjoint preview.

## Acceptance changes

The amendment adds direct acceptance for:

1. every included menu family through natural EN/RO free text and the real corpus selector/answer service;
2. complete removal of private picker, consent, request fields, endpoint, port, repository, tool and model payload authority;
3. captured model payload containing public reviewed context plus current redacted text only;
4. human case functionality with zero case-to-model transfer;
5. closed safe actions, exact Settings anchors and Account `/settings` behavior;
6. prompt injection and private-data requests that cannot expand sources/actions or invoke tools;
7. five recovery semantic classes judged by visible text/actions/storage/HTTP/calls; and
8. separate editorial admission, one final 33-file union, one attributed typecheck and both existing UI modes.

Historical failure labels are preserved. The new visible recovery matrix is a forward oracle and does not relabel earlier evidence.

## Unresolved dependency

The Forgot password action remains `href: null` / unresolved. Independent implementation can complete and be reviewed. CP1 cannot pass or be presented as complete until the owner supplies or identifies the existing destination/opener, it is connected without an auth/reset operation, and both UI modes prove the click.

## Light verification

- `MENU-COVERAGE.json` parsed successfully with `python3 -m json.tool`.
- The plan/spec/inventory placeholder scan found no `TBD`, `TODO`, “implement later”, “appropriate error”, “Write tests for the above”, or “Similar to Task”.
- Inventory measurement: 11 routes, 9 surfaces, 52 items with the mode counts recorded above.
- No product/test/source path was written by this node. No heavy command ran.

Usage: `UNAVAILABLE`.

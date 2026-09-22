# Checkpoint 1 specification v5 — public guide composition and language correction

ui: yes

Status: **implementation amendment ready for scoped re-review**. This document supersedes `SPEC-v4.md` only for the bounded requirements below. Every other `SPEC-v4.md` and `SPEC-v3.md` requirement remains governing. This document neither accepts CP1 nor resolves the owner-confirmed Forgot password destination.

## Corrected requirements

### CP1-R24 v2 — eight exact editorial records

The editorial set contains eight EN/RO component records:

1. new `app-navigation.en` and `app-navigation.ro`;
2. new `debate-workspace-menus.en` and `debate-workspace-menus.ro`;
3. new `settings-help-menus.en` and `settings-help-menus.ro`; and
4. corrected `support-status-limits.en` and `support-status-limits.ro`.

The existing `support-status-limits` bodies, model projections, and visitor fallbacks must describe only public `/help` service-status and Support availability/limit facts. They must not say that Support can read a selected debate, approved status projection, run state, or any private record after consent or ownership checks.

A distinct editorial reviewer reviews the exact eight projection/fallback records. Production admission remains closed until an attestation author copies the real eight-record review binding into the manifest. Owner fields stay blank until actual owner acceptance. The unchanged `support-cases` pair remains outside this correction and continues to describe the separate human-case workflow.

### CP1-R28 — text-only messages retain selected language

The public message request is strictly `{ text: string }`. It rejects `language`, `run_id`, `latest`, and every other unknown field. Language is chosen when the Support session is created and stored on that session. All deterministic and model responses use the stored session language; detected language remains diagnostic only and never overrides the selected response language.

Changing the visible EN/RO selector invalidates the active Support session capability before another message is sent. The next request creates a new session with the selected language, then sends exactly `{text}`. The stale-snapshot 409 path retries the already-redacted current request at most once by creating a replacement session in the same currently selected language. It never reuses the prior session language, sends a message-level language override, or loops.

Acceptance must include ambiguous labels that do not reliably reveal language from their spelling: ask `Pricing` in an EN session and `Account` in a RO session, and require the visible deterministic/model reply, source labels, and actions to use the session language. Both `/help` and compact widget retain their selector.

### CP1-R29 — serialized real-corpus composition

PG-1 and PG-2 may be authored independently because their write sets are disjoint, but checks that load the shared real corpus are serialized on the integration lane at recorded exact revisions:

1. compose PG-1 and run its focused UI/API/route/service/eval frame before PG-2 is integrated;
2. compose PG-2 and prove all eight new/changed records are excluded from strict production admission while the review binding is absent;
3. complete separate editorial review and PG-5 admission for the exact eight records;
4. compose PG-6 after PG-1 owns the shared server file, and pin each route/service run to an identified pre- or post-attestation snapshot; and
5. run the final unaffected union only after PG-5 admission.

If PG-1 route/service members are first run in an isolated worktree and later composed after PG-2, rerun only those PG-1 members whose real-corpus input changed. This is an attribution requirement, not permission for repeated unchanged broad suites.

### CP1-R30 — independent working preview and destination-dependent readiness

Independent composition is not blocked by the unresolved Forgot connector. After PG-1, PG-3, PG-5, PG-6, their applicable separate reviews, and exact serialized composition, an independent verification node runs:

- the final unaffected suite union once;
- one attributed typecheck;
- isolated support eval; and
- both-surface EN/RO preview, with `forgot-password` deliberately unresolved and actionless.

Its strongest allowed result is `WORKING_PREVIEW_VERIFIED_WITH_FORGOT_CONNECTOR_UNRESOLVED`. It may state that the public guide implementation is working for independently testable scope. It must not say CP1 complete, `READY FOR USER VERIFICATION`, or owner accepted.

A later connector/readiness node remains blocked until the owner supplies or identifies the existing canonical destination/opener. It composes PG-7, runs the connector's focused resolver, route, and two UI-click checks, then runs only the minimal composition checks affected by that connector. Only after these checks and the already-required separate final review may the checkpoint be presented as ready for the user's verification. Settings, saved-MFA recovery, human escalation, or an invented route are never substitutes.

## Corrected acceptance

### CP1-A12 v2 — inventory consistency

`MENU-COVERAGE-v2.json` parses to 52 unique items: 51 included and one operator exclusion. Any item that carries a returned action must use `safe-static-action` or `trusted-reference-action`. `help-free-text` is `safe-static-action` for the existing verified `/help` action. `landing-start` may retain a null catalog href because the closed resolver supplies `/new` when signed in and `/login?next=%2Fnew` when signed out.

### CP1-A13 v2 — strict body and language lifecycle

In addition to the v4 public-authority checks, route tests reject `language`, `run_id`, `latest`, and unknown message fields. Render tests prove a selector change clears the active session, the next `createSession` receives the selected language, and `sendMessage` receives only session plus text. Ambiguous `Pricing`/`Account` requests return EN/RO according to the stored session language in full and compact surfaces. The existing one-retry stale-session path creates the replacement session in the selected language and sends the same already-redacted text exactly once.

### CP1-A17 v2 — two verification gates

The independent composition gate is satisfied when the serialized final unaffected union, attributed typecheck, isolated eval, separate review, and working preview pass at one recorded revision while Forgot remains unresolved/actionless. This gate records the bounded working-preview status only.

The CP1 readiness gate additionally requires the verified existing Forgot destination/opener, PG-7 composition, focused resolver/route/full-help/compact-widget click checks, minimal connector-affected composition checks, and the separate final review. Until then CP1-A05 remains `UNVERIFIED`, and CP1 is not ready or complete.

## Trace to corrected plan

| Finding | Requirement | Plan anchors | Observable result |
|---|---|---|---|
| B1 | CP1-R30, CP1-A17 v2 | PG-8A and PG-8B | working preview proceeds actionless; readiness remains connector-blocked |
| B2 | CP1-R24 v2 | PG-2, PG-4, PG-5 | changed status pair contains no private-status claim; exact eight records reviewed/admitted |
| B3 | CP1-R29 | Composition schedule; PG-1/2/5/6 | every real-corpus frame names exact revision/snapshot and is serialized |
| B4 | CP1-R28, CP1-A13 v2 | PG-1 language lifecycle tests | strict `{text}`, stored session language, selector invalidation, one same-language retry |
| Inventory | CP1-A12 v2 | `MENU-COVERAGE-v2.json` | `/help` action row obeys the declared action rule |

## Unchanged limit

CP1 remains single-turn. No private records, case data, security metadata, or prior conversation turns enter the model. CP2 remains gated on explicit CP1 acceptance.

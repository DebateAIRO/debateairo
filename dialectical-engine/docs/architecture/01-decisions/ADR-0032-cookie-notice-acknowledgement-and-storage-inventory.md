# ADR-0032 — The cookie notice records an acknowledgement, not a consent; and every stored name is listed, by test

| Field | Value |
|---|---|
| **Status** | **Proposed** — V ratifies. Supersedes ADR-0021 decisions 1, 2, 3 and 5 (the five-member v1 record, "not v1 → re-ask", its predicate, and `COOKIE_CATEGORIES`). ADR-0021 decisions 4 and 6 (clearing site data restores the first visit; `apps/ui/lib/consent.ts` is the whole model) stand. |
| **Date** | 2026-09-29 |
| **Authored by** | Mission `cookie-compliance`, slice S01, node ARCH(S01), seat ARCH-CC-S01 (board `cookie-compliance`, ticket `t_cf835f25`). Number measured at write time: `ls docs/architecture/01-decisions/` and every local branch's tree held ADR-0031 as the highest. |
| **Owning contexts** | *Cookie notice acknowledgement* — `apps/ui/lib/consent.ts`. *Storage inventory of record* — `apps/ui/lib/legal/pages.ts`. |
| **Source of record** | `docs/missions/cookie-compliance/slices/S01/SPEC-v2.md` S01-R06 (the record and its predicate), S01-R17 and S01-R18 (the inventory law); `slices/S01/DECISIONS.md` D-17, D-26..D-29, D-37, D-40. This ADR transcribes those decisions; it adds none. |

## Context

The consent-ui mission shipped a three-choice bar whose record (`{"v":1,"essential":true,"quality":…,"analytics":…,"decidedAt":…}`, ADR-0021) answered a question about optional processing that the product never performed. The product stores eight items, all strictly necessary (SPEC-v2 §2). With nothing optional, the bar becomes a notice: it is shown once, and what is kept is only that it was seen. A record that still named `quality` or `analytics` would restate the fiction; a notice that asked for "consent" with no way to refuse would read as a consent with no reject option (EDPB cookie-banner taskforce report, 18 Jan 2023, ¶7-8).

The same audit found three stored items that `/cookies` did not list (the age-refusal cookie, the language-offer key, the help-chat key): a list kept by hand drifted from the code. That property outlives the mission — the next feature that stores anything meets it — so it is recorded here.

## Decision

**1. One key, one two-member record.** `localStorage['debateai.consent']` holds exactly `JSON.stringify({ v: 2, acknowledgedAt: new Date().toISOString() })` (EXACT shape `{"v":2,"acknowledgedAt":"2026-09-29T13:45:07.123Z"}`), written only when the visitor presses the notice's acknowledgement. It is an acknowledgement, not a consent: it gates nothing, and nothing outside `components/consent/CookieConsent.tsx` reads it.

**2. One predicate decides the notice.** ACK(raw) is true only when `raw` is a string that parses to a non-null, non-array object whose own keys are exactly `v` and `acknowledgedAt`, with `v === 2` (a number) and `acknowledgedAt` matching `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`. Anything else — an absent key, an old v1 record, a third member, a throwing read — shows the notice once more, and the next press overwrites the key. A throwing write still closes the notice for the page's life. There is no migration code.

**3. The category data is gone.** `COOKIE_CATEGORIES`, the `quality`/`analytics` members and `decisionFor` are deleted; the card lists the eight stored items instead.

**4. The storage inventory of record is `LEGAL_COOKIES` ∪ `LEGAL_BROWSER_STORAGE` in `apps/ui/lib/legal/pages.ts`**, each item carrying its name and the message keys of its kind, purpose, lifetime and recipient. `/cookies` and the cookie card render it; Privacy Policy §13 in every locale is bound to it by test.

**5. WRITTEN = LISTED, both ways, enforced by `tests/unit/cookie-inventory-drift.test.ts`.** The test discovers every stored name from source — API `set-cookie` producers, the UI proxy's `lawfulSetCookie` allow-list, every `document.cookie =` write, every `.setItem(` call whatever its receiver — over `apps/ui`, `apps/api/src` and `packages` minus test files (SPEC-v2 R17's scanned-file rule), and fails naming every name stored but not listed, or listed but not stored, and every write whose key it cannot resolve to a string.

## Options considered

| Option | Why it was rejected |
|---|---|
| Keep the v1 record with `quality`/`analytics` set to false | It still names processing that does not exist, and an old `quality: true` record would silence the corrected notice. |
| `{"acknowledged": true}` | No time for "when was the notice seen", no version for the next change. |
| Removing the notice altogether | V ruled the banner stays (mission intake). |
| A hand-maintained list of writers checked against `/cookies` | The same drift one level up; it would have been green with the three unlisted items. |
| A separate `lib/storageInventory.ts` | A second name for the list the drift test and the REQ detector already read in `pages.ts`. |

## Consequences

- A feature that adds a cookie or a storage key fails the drift test until the item is listed in `pages.ts` — and listing it puts it on `/cookies`, on the card, and (through the §13 binding test) in the Privacy Policy of all 35 locales. Adding an item that is not strictly necessary also ends the notice-only state: SPEC-v2 §7 says what the product must then do for everyone.
- A future consent record (for optional processing) is a new version and a new predicate; this record's ACK is then the one line that changes, as ADR-0021 foresaw for its own v1.
- Every visitor holding a v1 record sees the notice once more after deploy; that is intended (D-07).
- The drift test reads source text; a write whose key is assembled at runtime from parts is reported as unresolved rather than passed, so such a write must use a named constant.

## Constraints served

| Constraint | How |
|---|---|
| S01-R06 — the frozen value, ACK and its 17 fixtures | Decisions 1, 2 |
| S01-R03 — no fake processing in the consent code | Decision 3 |
| S01-R08 — nothing waits on the answer | Decision 1 (one reader) |
| S01-R09, R11 — every surface names exactly the eight items | Decision 4 |
| S01-R17, R18 — the drift guard, both ways, and one list for every surface | Decisions 4, 5 |

## What this ADR does not rule

- Whether persistent strictly-necessary items need an opt-in anywhere (rows V-3, V-4 of the mission's V packet).
- The wording and look of the notice and the card (the mission's MOCK → DONE gate).
- The Help panel's shortcut to the card and the help-bot articles about it (mission V-ROW, D-43).

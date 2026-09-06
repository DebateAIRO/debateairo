# ADR-0021 — The browser-local consent record: one key, one versioned object, re-ask on anything else

| Field | Value |
|---|---|
| **Status** | **Proposed** — V ratifies. This ADR **transcribes** decisions already taken in the `consent-ui` mission's frozen SPEC and DECISIONS; it proposes no new decision, and a new decision written into an ADR would be a SPEC change wearing an ADR's clothes. |
| **Date** | 2026-09-06 |
| **Authored by** | Mission `consent-ui`, slice S01, cluster `S01-C2`, step `S01-S47` (board `consent-ui`, `t_8d084df2`). |
| **Owning context** | **Browser-local consent preferences** — introduced by this mission and owned entirely by `apps/ui/lib/consent.ts`. Nothing outside `apps/ui/components/consent/` reads it. |
| **Source of record** | `docs/missions/consent-ui/slices/S01/SPEC.md` **S01-R01 … S01-R05** and **S01-R28**; `docs/missions/consent-ui/slices/S01/DECISIONS.md` §Storage and §Tokens-and-copy. Every value below appears verbatim in one of those two files. |
| **Numbering note** | `ADR-0019` and `ADR-0020` are held by the halted `translation` mission; `ADR-0022-shared-modal-semantics.md` belongs to this mission's slice S02. Numbers are allocated by the orchestrator against a repo-wide grep at allocation time, not by reading the last file on disk — a number on disk is only the last one *written*, never the last one *claimed*. |

## Context

The `consent-ui` mission asks a first-time visitor, once, what may be stored in
their browser, and remembers the answer until they clear site data. The answer is
a **record**, not a switch: **S01-R23** guarantees that storing a preference
loads nothing, unloads nothing and gates nothing today. No script, request, pixel
or feature is conditioned on it, and the slice adds no analytics consumer and no
placeholder pretending to be one.

That guarantee is exactly what makes this ADR necessary. Because nothing reads
the booleans now, the first component that ever does will arrive **after this
mission has closed** — an analytics or telemetry feature months from now — and
will meet a schema documented only inside a closed mission's folder. Everything
else this slice decided is mission-local and belongs in its own `DECISIONS.md`;
this one outlives the mission, so it gets a repo-wide record.

The existing neighbour is `localStorage['debateai.mode']`
(`apps/ui/app/layout.tsx:39`), which establishes the `debateai.` prefix and the
house `try/catch` treatment of every storage access
(`apps/ui/components/ModeToggle.tsx:23-27`).

## Options considered

| Option | Why it was rejected |
|---|---|
| **Three keys, one per category** | No atomicity: a partial write leaves a half-decided visitor, and "clear site data re-asks" becomes three removals instead of one. |
| **A packed string, e.g. `"1\|1\|0\|1757178131"`** | Unreadable in the acceptance step. QA on this mission is V personally, inspecting the value by eye in DevTools. |
| **A versioned key name, `debateai.consent.v1`** | Leaves stale keys behind forever and muddies the "clearing site data re-asks" property. One key, one read, one clear. |
| **`firstDecidedAt` + `updatedAt`** | Nothing consumes a first-decision timestamp. Two timestamps is YAGNI. |
| **An epoch integer for the timestamp** | Smaller, and unreadable to the human performing acceptance. |
| **Carrying the booleans forward silently on a version mismatch** | There is no v0 to migrate from, so a migration path would be untested code for a case that cannot occur; and re-asking on a schema change is the conservative reading of consent. |
| **Omitting `essential` because it is always true** | The record stops being self-describing to a future consumer, and V cannot see all three categories in one glance. |
| **Keeping the surface up forever when a write fails** | Blocking a visitor because their browser refuses storage is worse than re-asking. |
| **Inlining the category copy in the components** | Byte-exactness stops being a single-file review, and a ruling on the cookie names becomes a component change instead of a one-line data edit. |

## Decision

**1. One key, `debateai.consent`, holding one JSON object with exactly five
members and no others** (S01-R01):

```json
{"v":1,"essential":true,"quality":true,"analytics":false,"decidedAt":"2026-09-06T18:02:11.123Z"}
```

- `v` is the **integer** schema version, and is `1`. The version lives **inside
  the value**, never in the key name.
- `essential` is always `true` and is **stored explicitly, never omitted**.
- `quality` and `analytics` are booleans.
- `decidedAt` is the UTC ISO-8601 string produced by `new Date().toISOString()`
  and records when **this** stored decision was taken. A later re-save
  overwrites it; there is no first-decision timestamp.

**2. A stored value whose `v` is not `1` is treated as no decision** (S01-R02):
the visitor is asked again and the next decision overwrites the key. **No
migration code is written**, and no branch on any other version exists.

**3. A stored value is a decision if and only if it satisfies this predicate;
anything else re-asks, and no read or write ever throws** (S01-R03, row
**V-19** default (a)). Stated once, and the code states nothing else:

> the raw string parses, and the parsed value is a non-array object with
> **exactly five own members**, `v === 1`, `essential === true`, `quality` and
> `analytics` both boolean, and `decidedAt` a string matching
> `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`.

R01 declares the record's shape and R03 declares the rejection rule, and the two
did not compose: a record carrying a sixth member, or a hand-edited `decidedAt`,
satisfied R03's "missing any of the five" test while violating R01's "exactly
these five members and no others". V-19 closes the gap in R01's direction, which
extends the earlier ruling on `essential !== true` from its instance to its whole
class. Nothing in this product writes such a record — decision 6 makes this
module the only writer — so both shapes arrive only from DevTools, a hand edit or
an extension; re-asking such a visitor is the conservative reading of consent,
and a record whose timestamp cannot be parsed cannot answer *when* consent was
given. Every `localStorage` access is wrapped in `try/catch`:

- If a **read** throws or returns nothing, the visitor is asked.
- If a **write** throws, the surface still closes and the decision lives in React
  state for the lifetime of that page — a visitor is never trapped by a storage
  failure — and the ask returns on the next full page load.

**4. Clearing site data restores the first-visit state** (S01-R05). Removing
`debateai.consent` and reloading asks again. This is a property of the design, not
a feature: it is the only place the decision lives.

**5. The three category records live in one exported constant,
`COOKIE_CATEGORIES`, in `apps/ui/lib/consent.ts`** (S01-R28), each
`{ id, name, tag, description, detail, locked, defaultOn }`, and the components
render from it. No copy string is inlined in a component. The three `id` values
are exactly the three decision members — `essential`, `quality`, `analytics` — so
a category and the boolean it governs cannot drift apart.

**6. The module is the whole model.** `apps/ui/lib/consent.ts` owns the record,
its codec (`readConsent` / `writeConsent`), the mapping from a control to the
decision it writes (`decisionFor`), the category data, and nothing else.

## Consequences

- **A future consumer reads, and does not re-derive.** Anything that wants to
  know what the visitor allowed calls `readConsent()` and branches on `quality`
  or `analytics`. It must treat `null` as "not decided", which is not the same as
  "declined" — the visitor has simply not been asked yet, or their answer is
  unreadable.
- **A schema change is a version bump, and it re-asks everybody.** Adding a sixth
  member, or changing the meaning of one, means `v: 2` — and by decision 2 every
  visitor holding a `v: 1` record is asked again. That cost is deliberate: it is
  the conservative reading of consent, and it is why no migration code exists to
  rot. When a `v: 2` is first written, decision 2's rule ("not `1` → re-ask")
  is the line that needs revisiting, and it is the only one.
- **Nothing enforces the record's meaning today.** R23 guarantees no consumer, so
  no test can prove a consumer honours it. The first consumer to arrive is the
  first opportunity to get this wrong, and this document is the only thing that
  will be standing there.
- **The three `detail` lines name five cookies this product does not set.** They
  are `de_session`, `de_mfa`, `de_device`, `de_quality`, `de_analytics`; the
  product sets `__Host-debateai-session` and `__Host-debateai-csrf`
  (`apps/api/src/index.ts:169-170`). The strings are pinned verbatim from the
  design because the mission's packet requires it, and the conflict is routed to
  V as contested row **Q7-01**. Decision 5 is what makes V's ruling a one-line
  data edit rather than a component change, and this consequence stands until
  that ruling lands.
- **One writer, one reader, no second copy.** The key is written only by the four
  controls of S01-R04 and read only after mount. A second module that writes
  `debateai.consent` would be a second source of truth for a legal record, and
  there is no mechanism that would notice.

## Constraints served

| Constraint | How |
|---|---|
| **S01-R01** — the key, the five members, the integer `v`, the ISO-8601 instant | Decision 1 |
| **S01-R02** — a non-`1` version re-asks, with no migration code | Decision 2 |
| **S01-R03** — corrupt, short, non-object or throwing access re-asks and never throws | Decision 3 |
| **S01-R05** — clearing site data restores the first-visit state | Decision 4 |
| **S01-R28** — one exported constant holds the category copy | Decision 5 |
| **S01-R23** — the record gates nothing today | Context; second and third consequences |
| Standing V honesty law — a UI never claims a capability the product lacks | Fourth consequence (routed as Q7-01, not absorbed silently) |
| Privacy posture — private by default | The record holds three booleans and a timestamp. No identifier, no content, no token. |

## What this ADR does not rule

- **When a consumer may act on the record**, and what "not decided" means to it.
  Nothing reads the booleans today; the first consumer's behaviour is its own
  decision, and it is not taken here.
- **The five cookie names.** Contested row **Q7-01** is V's. Decision 5 makes
  either ruling cheap; it does not pre-empt it.
- **Anything about the two surfaces** — geometry, copy beyond the category
  records, layering, focus, or the state machine. Those are mission-local and
  live in the slice's SPEC and `DECISIONS.md`.

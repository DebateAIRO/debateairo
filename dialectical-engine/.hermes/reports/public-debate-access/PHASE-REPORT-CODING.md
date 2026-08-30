# Phase report — CODING loop (public-debate-access)

**Closed 2026-08-30.** All four slices merged to `dev`. Nothing pushed, per standing law.

## What shipped

| Slice | What it does | Commit |
|---|---|---|
| **S01** | Publishes a redacted argument tree to anonymous readers — the envelope, the publish path, and the value-provenance redactor | `56f46ab` |
| **S03** | Selectable `Your Debates` / `Public Debates` on the library page | `f1168c6` |
| **S02** | Anonymous public debate detail page at read parity with the owner view | `f8b9d5f` |
| **Row 9** | `NodeSchema.stranger_restatement` `.passthrough()` → `.strict()` | `f59618a` |
| **S04** | Publication-contract audit: schema-name guard + real product-path redaction test | `e879f87` |
| — | An overclaiming test comment, filed 2026-08-29 and never applied | `a322803` |

## Against V's Done criteria

1. **Both buttons present and accessible.** Present and verified in served markup after merge.
   "Accessible" was split honestly: the *mechanical* half is tested (real `<a href>` anchors, natively
   focusable, `aria-current="page"` correct, `aria-selected` absent — proved by rendering the real
   `HomePage` through `renderToStaticMarkup` and parsing with jsdom). The half no test can reach —
   real screen-reader announcement, visible focus styling, tab order against the rest of the page —
   is **routed to QA and open**, not claimed.
2. **Each shows the right list.** Verified live after merge: `"Public Debates"` 0→1, `?tab=yours`
   public links 1→0, `?tab=public` 0→1. The logged-in mirror (`?tab=public` must not show the user's
   own debates) needs a session and is **QA's, still open**.
3. **Public debates accessible like the owner's.** Anonymous end-to-end journey verified against
   production data: 46,243 bytes, zero mutation controls, zero owner-only markers. **But the argument
   tree path has never been observed live** — see the gap below.

## The one gap that matters, stated plainly

`redactNodeForPublic` is the control that stands between an anonymous reader and owner-only data. It
has **never executed against a node the engine produced.** The only publication in the database
predates `56f46ab`, so it carries no tree, and S02 correctly suppresses all tree UI when
`tree_included !== true` — the absent tree is right, not broken.

Every input that redactor has ever seen was authored by someone who already knew what it strips.
That is the mission's own recorded law: *a fixture that cannot fail against production pins nothing.*
V has ruled that V publishes a fresh debate and QA verifies it.

## How the work actually went

Every slice was blind-reviewed and **every slice came back with something real.** The reviews were not
a formality:

- **REV-04** found two anonymous-data leaks in S01. Both closed; the redaction rule became recursive
  and iterated to a fixed point.
- **REV-05** found `role="tab"` on navigation links was Bad ARIA, and that the PLAN had *mandated* it.
  Architecture dropped the tab ARIA for `aria-current="page"`.
- **REV-06** found S02's oracle asserted a node *existed* rather than that it was *reachable*.
- **REV-07** found the `.strict()` change safe **and** found its sibling — `disagreement` is still an
  open bag — by mutating the projection and watching the schema accept a leak.
- **REV-08** found S04's second test vacuous, proved it (adding `owner_ref` turned test 1 red and left
  test 2 green), and then — after clearing that blocking finding — went looking for a mutant that
  would leave the *repaired* test green, and found one.

That last move is the single most valuable behaviour observed this mission: **after a mutant turns a
test red, ask what mutant leaves it green.** Stopping at the author-supplied red mutant would have
produced a clean PASS with a real hole intact.

## Defects found in the harness itself

Eleven variants of one shape — *a check that returns the right answer for a reason unrelated to the
property it claims* — catalogued in `.hermes/TOOLING-TRAPS.md`. Several were in the Router's own
instruments: a gate that executed a backticked filename and reported it as verified RED; a coverage
number that described only what it could see; a `| head -4` cap that hid the very file motivating the
diagnostic; a blindness check that grepped `git status` and so answered "was it modified" when the
question was "does it exist".

Three Router defects are recorded in the ledger with their consequences: a self-contradicting packet
that cost a seat cycle; a QA packet that dropped **every** item Architecture had routed to it; and a
sanitizer that deleted a blind lens's own self-report mid-run.

## Open at phase close

- **QA loop** (`t_cb2dd94d`) — running; the tree check blocked on V's publication.
- **`t_3e217eab`** — the redactor's first run against real data.
- **`t_83df0d9c`** — V ruled *fix it now, split the schema*; Architecture is designing it.
- **`t_79d8e6d0`** — blinding a lens makes the author's `SKILLS LOADED` unverifiable. Structural.
- **`t_373a9132`** — addressed to a Hermes seat that was never on this roster.

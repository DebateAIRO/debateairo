# Turn 3 Library and Public Debate Design

## Goal

Reproduce Turn 3 of `ui_designs/DebateAI Design Document.html` in the live application with one-to-one visual fidelity while preserving real data, read-only public navigation, and the established Turn 1 debate views.

## Approved architecture

The home library and signed-out public debate are two coordinated surfaces backed by the existing V3 contracts. The library receives real model lineage metadata instead of decorative fixtures. The public debate uses the document's verdict-first layout as its Tree presentation; Thread, Split, and Map continue to render the existing read-only Turn 1 views. No score, timestamp, model, review, or metric may be fabricated to fill a visual slot.

## Turn 3a: library

### Layout

- Keep the 58px application header.
- `.libScreen` uses `44px 56px 48px` padding and `.libInner` is centered at `max-width: 820px`.
- The eyebrow is JetBrains Mono, `9.5px`, `700`, `0.22em` tracking, gold.
- The title is Fraunces, `36px`, `500`, `-0.025em` tracking, with a 12px top gap.
- The lede is `13.5px/1.6`, muted, with a 560px maximum line length.
- The composer has a 26px top gap, 16px shell radius, 7px bezel, 10px core radius, and the document's large shadow.
- The composer core uses `18px 20px 14px` padding. The text area is Fraunces `16px`; its placeholder is italic.
- Tabs begin 38px below the composer and use an 8px gap. Both tab labels are `11.5px`, `700`; the selected tab uses the ink fill and page-colored text.
- Library rows have a 10px vertical gap, 13px radius, `14px 18px` padding, and 16px internal gap. Hover translates the row right by exactly 4px.

### Row content

- Claim: Fraunces `14.5px/1.35`, weight `600`.
- Metadata: `11px`, 5px below the claim.
- Public metadata begins with `By <pseudonym>`; only the pseudonym uses the gold bold accent.
- Model dots are 12px circles with a 2px core-colored border and `-4px` overlap, limited to five visible dots.
- Model count is based on distinct real model IDs.
- Status pills use `4px 11px` padding, `10px` bold text, and a 6px indicator dot.
- Settled verdict states must remain visually distinct from the generating state.
- Missing wall-clock time or model lineage is omitted cleanly; separators are assembled only between present values.
- The public indexing disclosure remains beneath the public list in muted italic `10.5px` text.

### Data rules

- Completed private summaries derive distinct model IDs from the served answer nodes.
- Open runs may omit model metadata if no authoritative lineage is available.
- Public summaries derive distinct model IDs from the decrypted published snapshot already used to build each list row.
- Existing sequence ordering remains authoritative; a sequence number is never rendered as a timestamp.

## Turn 3b: signed-out public debate

### Navigation and page state

- The compact 58px debate header remains the sole application header.
- It contains the topic, a `Public view · actions locked` pill, Thread/Split/Tree/Map controls, and the mode toggle.
- Initial view remains Tree.
- In public mode, Tree renders the verdict-first Turn 3b overview.
- Thread, Split, and Map render their existing functional read-only views.
- Selecting Tree from another view returns to the verdict-first overview.
- Private debate behavior and private Tree rendering remain unchanged.

### Verdict-first overview

- The body uses `34px 44px 42px` padding with a centered 960px maximum width.
- The verdict shell uses the approved double bezel: 16px outer radius, 7px shell padding, 10px core radius, and the document's large shadow.
- A 52px stance-colored tab is attached to the top edge.
- The first row carries the verdict pill, confidence/threshold context when present, and a Details action.
- The verdict prose is the published summary, set in Fraunces `16px/1.5`, weight `600`.
- The caveat uses the first residual objection when available, otherwise the reversal point.
- Details opens the existing public Honesty drawer.
- Four compact metrics display only derivable facts:
  - Dialectical support: support-node count and attack/defeat-node count.
  - Verification: reviewed-node count over total published nodes.
  - Judge coverage: nodes with final strength over total published nodes.
  - Convergence: agreed reviews over all reviews, or `Not measured` when no reviews exist.

### Strongest arguments

- The support section labels the two sides and renders a 5px pro/con gradient meter.
- The meter ratio uses the sum of nonnegative final strengths, falling back to base scores, for classified support versus attack/defeat nodes. If neither side has weight, it is visually balanced and labeled unavailable rather than implying evidence.
- Strongest Pro is the classified support node with the highest final strength, falling back to base score.
- Strongest Con is the classified attack/defeat node with the same ranking rule.
- Ties keep source order for deterministic rendering.
- Each card uses the document's double-bezel anatomy, stance pill, base-to-final score, real maker/model pill, Fraunces claim, locked Challenge control, and working Read control.
- A missing side renders an explicit compact empty card instead of a sample argument.
- Read opens the existing node-detail drawer in public read-only mode.

### Locked actions

- Public Challenge controls are visibly locked and cannot trigger a mutation.
- The footer reads that the debate is being viewed publicly and links to `/login?next=<encoded current public debate path>`.
- No public control may acquire a private action token or invoke a mutation endpoint.

## Accessibility and responsive behavior

- Header controls remain native buttons/links with pressed state and accessible labels.
- Verdict, metrics, and strongest-argument content remain in document order for screen readers.
- Disabled Challenge controls expose their locked state without relying on color.
- At narrow widths, strongest-argument cards stack, header controls wrap without clipping, and all text remains readable without horizontal page scrolling.
- Existing reduced-motion behavior continues to suppress nonessential transitions.

## Verification

- Contract and presentation helpers receive behavior tests with real fixtures.
- UI source tests verify the Turn 3 component is wired into public Tree without replacing Thread/Split/Map.
- Typecheck, the UI node-test suite, relevant root unit tests, and a production UI build are run.
- The live full stack is restarted and both `/?tab=yours` and `/?tab=public` are visually inspected in both themes.
- A real published debate is checked in Tree, Thread, Split, and Map; Details and Read must work, Challenge must remain locked.

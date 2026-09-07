# ADR-0022 — One shared modal-semantics module, and the Esc stack

**Status: Proposed** — V ratifies this ADR. No seat writes `Accepted`.

| Field | Value |
|---|---|
| **Date** | 2026-09-06 — written by seat `CODE-S02-C1C2` as step `S02-S72` of mission `consent-ui`, slice S02, cluster `S02-C1`. |
| **Proposed by** | Transcribed, not decided here. Sources: `docs/missions/consent-ui/slices/S02/DECISIONS.md` — *"Who writes the ONE shared modal-semantics helper?"*, *"The Esc stack's implementation shape"*, *"The focus trap's focusable set"*; `docs/missions/consent-ui/slices/S02/PLAN.md` §DDD and module boundaries → *Is an ADR warranted?*; and the exported-surface block at the head of `PLAN.md` §Cluster S02-C1. |
| **Source of record** | `.hermes/planning/consent-ui/packets/COMMON.md` §10.7 (the orchestrator ruling closing REQ-REV-01 P4) and §10.23 (this ADR's number, allocated against a repo-wide grep at allocation time). `slices/S02/SPEC.md` S02-R14 and S02-R16 are the frozen requirements. |
| **Numbering note** | `0022` is an orchestrator **allocation**, not the next free id on disk. At base `2b670d30` the directory holds `ADR-0001` … `ADR-0018`, so the next free id is `0019` — but `ADR-0019` and `ADR-0020` are reserved by the halted `translation` mission. `consent-ui` was allocated `ADR-0021-consent-storage-contract.md` (slice S01) and `ADR-0022-shared-modal-semantics.md` (slice S02). No file exists at any of those four ids at the time of writing. |

## Context

Seven components under `apps/ui` declare `role="dialog"` / `aria-modal="true"` and implement
none of the behaviour that declaration promises. Measured in the lane
`.worktrees/consent-s02/dialectical-engine` at base `2b670d30`:

```
grep -rl --include='*.tsx' 'aria-modal' apps/ui          -> 7 files
  apps/ui/app/debate/[id]/DebatePageClient.tsx
  apps/ui/components/AnswerHonestyDrawer.tsx
  apps/ui/components/DebateWorkspaceDrawer.tsx
  apps/ui/components/GuideModal.tsx
  apps/ui/components/InvestigationDrawer.tsx
  apps/ui/components/NodeDetailDrawer.tsx
  apps/ui/components/PublicHonestyDrawer.tsx

createPortal                     0 files
Escape                           0 files
focusTrap                        0 files
.focus()                         0 files
addEventListener("keydown"       0 files
```

(the five counts are `grep -rl --include='*.ts' --include='*.tsx' -- '<term>' apps/ui`,
excluding the module this ADR introduces). So there is **no focus trap, no Esc handling and no
focus return anywhere in the app today** — the exemplar is
`apps/ui/components/GuideModal.tsx:32-45`, which renders a scrim and a card inline, with no
portal and no keyboard contract.

Mission `consent-ui` adds two more overlays in two parallel lanes: slice S01's cookie
preferences card and slice S02's privacy-policy modal. Two lanes writing modal semantics
independently produce **two document-level `keydown` listeners**, and one `Escape` then closes
both surfaces — the defect REQ-REV-01 B3 predicted and the reason the behaviour is centralised
before either surface is built.

## Decision

**One module owns modal semantics for this repository:
`apps/ui/components/consent/modalSemantics.ts`.** Slice S02 writes it; slice S01 consumes it
**unchanged**; no second implementation is added.

It owns exactly six things: the **focus trap**, **initial focus**, **focus return**,
**backdrop close**, **`prefers-reduced-motion`**, and the **Esc stack**.

**The Esc-stack rule, which is law for every future overlay in this repo, not only for these
two:** *the topmost open surface consumes `Escape`, and no other surface acts on the same
event.* Its shape: a module-level registry array of open surfaces plus **exactly one**
`document` `keydown` listener, installed when the array becomes non-empty and removed when it
empties. **Topmost is derived from the DOM, never from the order the surfaces registered in:
on `Escape` the module invokes the `onClose` of the one open surface that no other open surface
contains and that comes last in document order (`compareDocumentPosition`)** — registration
happens in a `React.useEffect`, which React runs child-first within a commit, so for a nested
pair mounted together the last-registered entry is the surface *underneath* (measured:
`CODE-REV-S02-C1C2` r1 B1). The handler calls `preventDefault()` and `stopPropagation()`.
`Tab` is handled on that same topmost entry only. A per-surface listener is rejected: a
listener cannot know whether its own surface is topmost.

**The focusable set is queried inside the surface at the moment `Tab` is pressed and is never
cached at open**, because the set changes while the surface is open (the policy modal's
`I have read it` button is `disabled` until the scroll gate latches). The selector is:

```
a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])
```

**`prefers-reduced-motion` is read through a guard**, because jsdom 30.0.1 in this repo has no
`window.matchMedia` at all (measured: `typeof window.matchMedia === "undefined"`), and an
unguarded call throws in every render test that mounts a modal.

**The exported surface, quoted verbatim from `slices/S02/PLAN.md` §Cluster S02-C1** — it is
fixed there so slice S01 and clusters C5/C6 can be written against it, and it did not change:

```ts
export type ModalSurface = Readonly<{
  containerRef: React.RefObject<HTMLElement | null>;
  initialFocusRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}>;
export function useModalSurface(open: boolean, surface: ModalSurface): void;
export function backdropCloseHandler(
  scrim: HTMLElement | null, onClose: () => void
): (event: { target: EventTarget | null }) => void;
export function prefersReducedMotion(): boolean;
export function openSurfaceCount(): number;   // test-visible depth of the Esc stack
```

`openSurfaceCount` exists so the stack's depth is observable from a test without exporting the
stack itself.

### Addendum 2026-09-07 — a fourth, OPTIONAL `ModalSurface` member (V-22)

Appended by seat `CODE-CROSS-01` as the one cross-slice change ticket `t_c1068d6f` authorises;
nothing above this heading is edited. `ModalSurface` gains `returnFocusRef?:
React.RefObject<HTMLElement | null>` — the control focus returns to when the opener captured at
open did not survive the opening commit. The three original members and every other export are
unchanged, and a surface that omits the member behaves exactly as before. It exists because the
capture cannot serve a whole CLASS of surfaces — any surface whose opener is unmounted by the same
commit that opens it, of which every mutually-exclusive surface pair is a member: the platform has
moved focus to `document.body` before any hook tier runs (`useLayoutEffect` too — measured,
CODE-REV-S01-C6 r1 B2), so the capture is `body` and a captured reference would be detached, while
a parent-owned ref is re-attached to the fresh control in the layout phase of the commit that
remounts it, before this hook's passive cleanup reads it. **The precedence is
surviving-capture-first, not named-control-first** — V-22's default and CODE-REV-S01-C6 r1's remedy
both word it the other way, and that wording is measurably wrong: a surface whose opener IS still
on the page would lose its focus return to whatever else the caller lent it, which takes S01-R18's
Settings direction off `Cookie preferences` the moment the cookie bar returns underneath the card.
Both directions of S01-R18, and both sentences of V-22's own worked example, hold only under
surviving-first. Pinned by four cases in `tests/render/consent-modal-semantics.test.tsx` and one in
`tests/render/consent-policy-link.test.tsx`.

### Addendum 2026-09-07 — topmost is the surface opened LAST, not the one later in the document (V-20 (b))

Appended by seat `CODE-CROSS-02` as the one cross-slice change ticket `t_cde7254d` authorises;
nothing above this heading is edited, and the **Decision** paragraph's sentence "*Topmost is
derived from the DOM, never from the order the surfaces registered in … comes last in document
order (`compareDocumentPosition`)*" is superseded by this one. **`topmostSurface()` now returns the
LAST REGISTERED entry whose container is still in the document**; an entry whose container is
`null` still receives `Escape`, an entry whose container has left the document is skipped and the
walk continues below it, and there is no arrangement constraint on any consumer. Everything else
this ADR decides — one module, one `document` listener, the queried-at-`Tab` focusable set, the
guarded `prefers-reduced-motion`, the exported surface — is unchanged.

Why: the document-order rule was measurably wrong wherever both slices' surfaces coexist.
`app/layout.tsx` mounts `<CookieConsent />` AFTER `{children}`, so on `/sign-up` the cookie
preferences card is LATER in the document than the privacy policy that renders inside
`SignUpFlow`, while the policy is HIGHER in paint (`--z-policy-card: 78` over
`--z-consent-card: 76`). One `Escape` therefore closed the card underneath the open policy,
discarding the visitor's unsaved category choices and leaving focus trapped in a surface that had
just refused the key (`CODE-REV-S02-C9` r1 **B1**, measured three times with a control that
discriminated document order from open order). Open order rather than a `--z-*` rank because every
overlay here opens FROM a control of the surface below it, under its own scrim: the last-opened
surface IS the one on top in every state a visitor can reach, and a z-rank would restate the
ladder in TypeScript. **The one shape where the two part company** is a pair mounted in a SINGLE
commit — React runs effects child-first, so a nested inner surface registers before its outer one
and the OUTER one answers `Escape`. No surface in this repository has that shape today (both
policy modals are mounted conditionally by a state change the visitor causes); a future overlay
pair that needs its inner surface on top opens that surface in a later commit. Pinned by seven
cases in `tests/render/consent-cross-slice.test.tsx` — the first suite in this mission to mount
both slices in ONE document, in `layout.tsx`'s order — and by five in
`tests/render/consent-modal-semantics.test.tsx`. **Status: this is the orchestrator's ruling under
V-20 and V may undo it; the cost of undoing is this one function.**

### Addendum 2026-09-07 — a CONTAINMENT-ONLY tiebreak on top of open order (V-20 (b′))

Appended by seat `CODE-CROSS-03` as the one product change ticket `t_ed4c5e73` authorises;
nothing above this heading is edited. The addendum directly above ("topmost is the surface
opened LAST", V-20 (b)) keeps every sentence except its last two, which said the OUTER surface
of a pair mounted in one commit answers `Escape` and that the shape is pinned as-is: those are
superseded here.

**`topmostSurface()` now runs two passes.** Pass 1 is unchanged — walk back from the last
registered entry and take the first whose container is `null` or still connected. Pass 2 keeps
scanning downwards and replaces the incumbent by any connected entry whose container the
incumbent's container `contains` (`Node.contains`), repeating until nothing deeper is open. **So
`Escape` reaches the innermost open surface of a nested group, and open order decides everything
else.** The exported surface, the single `document` listener, the focus trap, the focus return,
the `null`-container branch and the detached-entry skip are all unchanged.

Why: (b) as ruled shipped a behaviour INVERSION for the one shape where open order and paint
order part company. React runs effects child-first, so a pair mounted in a SINGLE commit
registers `[inner, outer]` and "last registered" names the surface UNDERNEATH — one `Escape`
would close the outer surface, discard whatever the visitor had in it, and leave focus trapped
in the inner surface that refused the key. That is `CODE-REV-S02-C9` r1 **B1**'s exact harm in a
different shape, reported as `CODE-REV-CROSS-02` r1 **N2** and measured by that seat before it
was proposed: under the containment variant the full consent suite set ran
`3 failed | 190 passed (193)`, the three failures being exactly the three synthetic cases that
existed to pin the inversion, every cross-slice case green.

**Why containment and not the whole DOM rank.** The previous rule was `CONTAINED_BY ||
FOLLOWING`, and it was the `FOLLOWING` arm that produced B1: it ranked two UNRELATED surfaces —
the cookie card, mounted after `{children}` by `app/layout.tsx`, and the sign-up policy inside
them — by an accident of mount position. `CONTAINED_BY` cannot do that, because it only ever
relates a surface to one that encloses it, which is a real z-order the browser also paints. The
ADR's own argument against a DOM rank ("it would restate the ladder in TypeScript") is answered
rather than abandoned: one `Node.contains` call, on the one relation where the DOM and the paint
agree by construction, and no comparison at all between unrelated surfaces.

No surface in this repository nests today — both policy modals are conditional siblings — so
this changes nothing a visitor can reach; it removes the trap for the shape they cannot. Pinned
by four cases in `tests/render/consent-modal-semantics.test.tsx` (the nested pair in one commit,
the nested pair in a later commit, the three-deep chain, and the `Tab` trap reading the same
entry) and left green by all seven of `tests/render/consent-cross-slice.test.tsx`, so B1 stays
discharged. **Status: this is the orchestrator's ruling under V-20 and V may undo it; the cost
of undoing is the second loop of one function.**

### Addendum 2026-09-07 — correction to the V-22 addendum's trigger clause (CODE-REV-CROSS-01 r1 N3)

The V-22 addendum above describes `returnFocusRef` as "the control focus returns to when the
opener captured at open did not survive the opening commit". That names the CAUSE where the code
tests the STATE: `modalSemantics.ts`'s cleanup evaluates `opener.isConnected` **at close**, so
the named control also serves an opener that was on the page at open and left the document while
the surface was open — a strictly broader rule than the sentence, and one the case
`returns focus to the named control when the captured opener has since left the page` already
pinned. Read that clause as: **when the captured opener is not a usable element at close —
because the opening commit removed it, or because it left the document while the surface was
open.** The addendum's decision and its precedence sentence (surviving-capture-first, not
named-control-first) are unaffected. The same clause is corrected in place in the
`ModalSurface` member's JSDoc and in `CookiePreferencesCard`'s prop doc.

## Options considered

- **A React context provider owning the stack.** Rejected: it would force slice S01's
  preferences card and slice S02's policy modal into one React tree, and they are mounted from
  different components in different slices.
- **A per-surface `keydown` listener with a "topmost" flag.** Rejected: a surface cannot know
  it is topmost without a shared registry, which is the module this ADR introduces.
- **Retrofitting the seven existing overlays now.** Rejected as out of scope for this mission;
  it is ticket `A11Y-OVERLAYS` (`t_8962842f`).

## Consequences

1. **Slice S01 consumes `modalSemantics.ts` unchanged.** Its exported surface is a cross-slice
   contract; neither slice changes it alone. If S01 needs a change, that is a finding against
   the S02 cluster that owns the file, not an edit in S01's lane.
2. **Exactly one `document`-level `keydown` listener exists across the app** while any surface
   is open, and none when none is. This is pinned by a test, not by convention.
3. **Ticket `A11Y-OVERLAYS` (`t_8962842f`) retrofits the seven existing `aria-modal` overlays
   onto this module.** Until it lands, those seven keep declaring `aria-modal` without
   implementing it; this ADR does not change them.
4. **Every future overlay in this repository takes its semantics from this module** and
   inherits the Esc-stack rule. Adding a second `document` keydown listener for `Escape` is a
   regression against consequence 2.
5. The module is DOM-and-React only: it references no CSS token and no application state, so it
   is buildable and fully testable independently of either slice's CSS.

## Verification

`tests/render/consent-modal-semantics.test.tsx` pins all six behaviours plus the two structural
invariants (one listener; the stack pops), ten cases in total. The Esc-stack rule is pinned
directly — two surfaces mounted one over the other, ONE `Escape` dispatched, the outer surface's
`onClose` asserted **not** called — which is the one assertion a two-listener implementation
fails and every other assertion in the SPEC passes.

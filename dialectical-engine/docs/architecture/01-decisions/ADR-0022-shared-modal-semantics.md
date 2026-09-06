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

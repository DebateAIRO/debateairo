# S02 — Sign-up privacy gate: checkbox group (8a), privacy-policy modal (10c), both-boxes gating · SPEC v3 (FROZEN 2026-09-06 by REQ-01, rework round 2)

## Supersession header

- **Version:** v3 · **Date:** 2026-09-06 · **Author:** REQ-01, rework round 2 of max 3
- **Supersedes:** `SPEC-v2.md` (frozen 2026-09-06, archived byte-identical before any v3 edit,
  md5 `836570df829135cee501998fd8e1a7ea`, never edited). `SPEC-v1.md` is archived beside it and is
  likewise never edited. **The findings that produced v2 (B2, B3, P4, N2, N5-contested, N8, N9)
  are listed in `SPEC-v2.md`'s own header — this table names only what v3 changed**, so no row is
  restated and no restated row can drift.
- **Why:** review verdict `docs/missions/consent-ui/reviews/REQ-REV-01-r2.md` (REWORK, round 2).
  v2 fixed B2's implementation correctly and provably, and then **prescribed a second test idiom
  it never executed** — B4 and B5, both BLOCKING, both re-proved by execution before this version
  was written. Every change below carries the finding id that caused it; nothing else in the file
  moved.

| Finding | What changed in v3 | Where |
|---|---|---|
| **B4** | v2 offered `field(name).dispatchEvent(new Event("change", { bubbles: true }))` as an equal alternative to `field(name).click()` for assertions about the submit button. **Measured: it does nothing** — React routes a checkbox's `onChange` through the **click** event and requires a real `MouseEvent`, so the DOM box does not even change and the button stays `disabled`. A seat that picked the second option reproduced B2 exactly, having been told by the SPEC to misdiagnose the failure. The alternative is **deleted** from R17's hook and from §Tests; `field(name).click()` inside `act` is the **single** idiom, no second one is offered, and the two measured-dead forms are recorded as dead so nobody re-derives them. Probe `.hermes/reports/consent-ui/probes/b2-idiom-matrix.mjs`, re-run by REQ-01 before and after the fix; matrix verbatim in `requirements/REQ-01-rework-r2-handoff.md`. | R17, §Tests |
| **B5** | R17's fifth hook case read *"assign `.checked = true` on both WITHOUT dispatching, assert still `disabled`, then dispatch and assert it enables"*. **It cannot pass under any idiom**: `.click()` TOGGLES, so from a pre-assigned `true` it drives the box to `false` and the button correctly stays disabled, and both `change` dispatches are inert (B4). The case is rewritten with an explicit reset — *set both back to `.checked = false`, then `click()` both* — and the toggle mechanism is now stated in the sentence rather than left to be re-derived. | R17 |
| **B5 (second half — the guarantee, moved to a pin that delivers it)** | v2 said the fifth case exists *"so a future seat that switches to controlled inputs breaks a test that names the reason"*. **Measured across 4 implementation variants × 3 runs: the rewritten case 5 is green under all four, including controlled inputs — it documents the toggle and detects nothing.** The controlled-inputs guarantee therefore moves to a new **case 6** (assign `.checked` on one box without dispatching, click the other to force a React re-render, assert the first box's `.checked` is still `true`), which is measured RED under exactly the two controlled variants and green under the two uncontrolled ones. Full matrix in the round-2 handoff. | R17 |
| **N11** | §Copy's *"the `\uXXXX` form appears about twenty times"* is replaced by the measured tally with its counting rule and its command (**15 escapes: `\u2014` ×12, `\u2019` ×2, `\u2192` ×1** — written here in the escape form the file actually holds), plus the measurement that **U+00B7 is never escaped** (`grep -c -i 'u00b7'` → `0`, raw ×4). v2's sentence also promised the *literal six-character escape* and printed the decoded character instead (escape-form count in `SPEC-v2.md`: **0**); it now prints the escape where it says escape. | §Copy |

**Frozen at this version.** No seat edits this file, REQ-01 included. A correction is a
`SPEC-v4` with its own supersession header, and this version is archived first, exactly as
`SPEC-v1.md` and `SPEC-v2.md` were.

## Purpose (≤5 lines)

Someone creating an account must affirm they are 18 or over and accept the privacy policy,
and the second of those is taken from actually reading the policy: clicking the unticked
privacy box opens the policy modal, and only its `I have read it` button ticks the box.
`Create account` stays disabled until both boxes are ticked, and the submit handler refuses
to register if either is not. What is sent to the server does not change.

## Design of record (artboards, extract paths, the sentences that bind)

- **8a — the checkbox group**: `docs/missions/consent-ui/design/turn-8a-checkbox-group.html`
  (whole file) and its context in `turn-8a-signup.html:24-34`. A bordered shell box holding
  two rows with 17px rounded check squares.
- **10c — the privacy-policy modal**: `docs/missions/consent-ui/design/turn-10-cookie-consent.html:46-99`.
  Artboard caption (`:47`): *"opened from sign-up · scrollable, must reach the end"* — the
  sentence that produces the scroll gate (row V-2 default).
- **Every policy string**: `docs/missions/consent-ui/design/design-data.js` — `policyJump`
  (`:51`), `mkSec` (`:54`), `policySections` (`:57-84`), `accentsFor` (`:16`).
- **V's words, and where the design overrules them.** V asked for a box stating "I agree with
  the privacy policy" and for an "I agree" button; V deferred to the design in the same
  sentence ("idk how its written in the design"). Intake C1 and C2 resolve both to the
  design's wording: the label is the 8a sentence, the button is `I have read it`.

## Requirements

Each requirement is `statement · source · verification hook`. Where jsdom cannot observe a
thing, the hook says so and hands it to V rather than pretending.

### The checkbox group (8a)

**S02-R01 — The two checkboxes live in one bordered shell box replacing the current single
`.authCheck` label.** Container: `1px solid var(--line)`, `border-radius: 11px`,
`background: var(--shell)`, `padding: 2px 13px`. Two rows, each
`display: flex; align-items: flex-start; gap: 10px; padding: 11px 0; cursor: pointer`; the
first row carries `border-bottom: 1px solid var(--line)`, the second none. Each row's check
square is 17×17, `border-radius: 5px`, `border: 1.5px solid var(--ok-edge)`, and when checked
`background: var(--ok-dot)` with a `✓` glyph in `var(--core)` at 10px/800. Label text is
11.5px, `line-height: 1.5`.
· **Source:** `turn-8a-checkbox-group.html:1-10`, read literally; `--ok-edge` is the
`tint(okC,.55)` token S01 declares (`design-data.js:40`).
· **Hook:** jsdom asserts the container and two rows exist with the two inputs inside; V
acceptance steps 1-2 confirm the look in both modes. jsdom computes no layout, so the pixel
geometry is V's to confirm, not a test's — stated plainly.

**S02-R02 — Copy is byte-exact (see §Copy).** Row 1: `I am 18 or over.` Row 2:
`I agree to the ` + `Privacy Policy` (a link, bold and underlined) + `, including that my
debates may be published publicly.`
· **Source:** `turn-8a-checkbox-group.html:4,8`; intake C1 (design wording wins) and C7 /
row V-6 default (the 18+ row is reworded from
`I affirm that I am at least 18 years old.` to the design's sentence).
· **Hook:** jsdom `textContent` equality for both rows. **No existing test asserts the old
label** — verified by grep: `"18 years old"` and `"at least 18"` each have exactly one hit
in the repo outside `docs/`, both at `apps/ui/components/SignUpFlow.tsx:187`. Rewording it
breaks nothing.

**S02-R03 — Input names and form semantics.** The 18+ input keeps
`name="adult-affirmed"` and keeps `required` **on the same tag**. The new input is
`name="privacy-accepted" type="checkbox" required`. Both remain real
`<input type="checkbox">` elements in the DOM — focusable, toggled by `Space`, and
associated with their label text — with the 17px square rendered as a styled sibling or
pseudo-element rather than replacing the input. Both are `disabled={busy || sent}` like the
current one. **No `<form>` element is added.**
· **Source:** current markup `apps/ui/components/SignUpFlow.tsx:185-188` and the FormData
read at `:72`; two live source-text guards —
`apps/ui/components/authRoutes.source-test.mjs:45` asserts
`/name="adult-affirmed"[\s\S]*?required/`, and `:165` asserts the sign-up + login `<form>`
count is exactly 3.
· **Hook:** `pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts` stays green (measured
GREEN at base by REQ-01 on 2026-09-06: exit 0, `Tests 2 passed (2)`); jsdom asserts both
inputs exist by name and are keyboard-toggleable.

**S02-R04 — The 18+ row is a plain toggle.** Clicking the square, the text or the row toggles
it. It opens nothing.
· **Source:** design 8a shows no link in row 1; V's goal names only the privacy box as the
modal's trigger.
· **Hook:** jsdom clicks the row and asserts `checked` flips and no dialog is in the document.

**S02-R05 — Clicking the privacy row while it is UNCHECKED opens the policy modal and leaves
the box unchecked.** This holds for a click on the check square, on the label text, and on
the `Privacy Policy` link alike. Because a native label click would otherwise toggle the
input, the handler calls `preventDefault()` on that path — the box must be observably still
unchecked while the modal is open.
· **Source:** intake C3, resolved: "Clicking the UNCHECKED box, or the link, opens 10c
without ticking"; V's goal ("When the user clicks the tick, our modal (10c) appears").
· **Hook:** three jsdom cases — click the square, the text, the link — each asserting the
dialog is present AND `field("privacy-accepted").checked === false`. This is the single most
likely implementation slip in the slice; all three entry points are pinned separately.

**S02-R06 — Clicking the privacy row while it is CHECKED unchecks it directly, with no
modal.**
· **Source:** intake C3, resolved.
· **Hook:** jsdom checks the box via the modal path, clicks the row, asserts
`checked === false` and no dialog in the document.

**S02-R07 — `I have read it` ticks the box, closes the modal, and returns focus to the
privacy checkbox input.**
· **Source:** V's goal ("User clicks 'I agree', then the tickbox … gets ticked"); intake C2
(the label is the design's `I have read it`).
· **Hook:** jsdom asserts `checked === true`, the dialog is absent, and
`document.activeElement` is the `privacy-accepted` input.

**S02-R08 — `×`, `Esc`, and a backdrop click each close the modal leaving the box
UNCHECKED, and each return focus to the privacy checkbox input.** **`Esc` does this as the
topmost open surface, and closes nothing else** — the Esc-stack rule stated in R14's shared
interface paragraph and implemented once, in the shared helper.
· **Source:** V's goal ("if the User does not click the 'I agree' button …, then the tickbox
is not ticked"); intake C3; the Esc-stack qualification is **REQ-REV-01 B3**.
· **Hook:** three jsdom cases, one per dismissal route, each asserting
`checked === false`, the dialog absent, and `document.activeElement` is the input. The Esc
case additionally asserts the sign-up form and both inputs are still in the document (the B3
pin stated in full in R14).

### The policy modal (10c)

**S02-R09 — Modal geometry.** Scrim: `position: fixed; inset: 0; background: var(--scrim);
z-index: var(--z-policy-scrim)`, centring its child. Modal:
`width: min(680px, calc(100vw - 32px)); max-height: 92vh; z-index: var(--z-policy-card)`;
bezel `background: var(--shell)`, `1px solid var(--line-strong)`, `border-radius: var(--r-panel)`,
`padding: 7px`; core `background: var(--core)`, `1px solid var(--line)`, `border-radius: 11px`,
`display: flex; flex-direction: column; overflow: hidden; position: relative`; the 52×4 gold
tab at `top: 0; left: 24px` with `border-radius: var(--r-tab)`. Header
`flex: 0 0 auto; padding: 22px 24px 14px; border-bottom: 1px solid var(--line)`. Scroll region
`flex: 1; min-height: 0; overflow: auto; padding: 16px 24px 8px`. Footer
`flex: 0 0 auto; padding: 14px 24px; border-top: 1px solid var(--line); background: var(--shell)`.
· **Source:** `turn-10-cookie-consent.html:48-95`. **680 is the artboard's own modal width**
(760px artboard less the 40px inset on each side, `:50`); `92vh` approximates the artboard's
vertical proportion (660 less 34px top and bottom = 592, i.e. 89.7%). The `min(…, 100vw - 32px)`
clamp is REQ-01's responsive rule.
· **Hook:** V acceptance steps 5 and 13; source-text assertion of the width and max-height
rules.

**S02-R10 — Header copy is byte-exact (see §Copy)**: the mono eyebrow, the Fraunces title,
the lede, and a `×` close button.
· **Source:** `turn-10-cookie-consent.html:56,57,58,60`.
· **Hook:** jsdom `textContent` equality for the three strings; the `×` control has
`aria-label="Close"`.

**S02-R11 — Eight jump pills render in the design's order, and each scrolls to its mapped
section.** The order is `policyJump`'s own and is **not** document order; it is not sorted.
Each pill is a `<button type="button">` carrying `data-jump="<target id>"`; each target id
exists on the corresponding section element.

| Pill (verbatim, in order) | Section | Element id |
|---|---|---|
| `CONTROLLER` | 05 Controller and contact | `policy-section-05` |
| `WHAT WE COLLECT` | 01 What we collect | `policy-section-01` |
| `LAWFUL BASIS` | 06 Lawful basis for each purpose | `policy-section-06` |
| `PUBLISHING` | 03 Publishing and visibility | `policy-section-03` |
| `MODELS & TRANSFERS` | 04 Model providers and international transfers | `policy-section-04` |
| `RETENTION` | 07 Retention | `policy-section-07` |
| `YOUR GDPR RIGHTS` | 08 Your rights under the GDPR | `policy-section-08` |
| `COMPLAINTS` | 11 Children, complaints and changes | `policy-section-11` |

Sections **02** (Why we hold it), **09** (Automated decisions and profiling) and **10**
(Security and breach notification) have no pill. That is the design: 8 pills, 11 sections. No
pill is added for them.
· **Source:** `design-data.js:51` for the pills, `:57-84` for the sections; the mapping is
REQ-01's, recorded in DECISIONS, because the two lists share no naming scheme.
· **Hook, split honestly:** jsdom pins the **mapping** — eight pills in this exact text order,
each `data-jump` value resolving to an element that exists in the rendered modal. jsdom
computes no layout and implements no scrolling, so the **scroll itself** is V acceptance
step 12, not a test.

**S02-R12 — The eleven sections render in order, each with its two-digit number, title, body,
optional bullet list, and its accent colour applied to the number and the bullet dots.**
Accent mapping (`s.c` → token):

| Section | `s.c` in the design | Token |
|---|---|---|
| 01 What we collect | `okC` | `--ok-dot` |
| 02 Why we hold it | `tA.gold` | `--gold` |
| 03 Publishing and visibility | `accentsA.reasoning` | `--reasoning` |
| 04 Model providers and international transfers | `tA.con` | `--con` |
| 05 Controller and contact | `tA.ink` | `--ink` |
| 06 Lawful basis for each purpose | `okC` | `--ok-dot` |
| 07 Retention | `tA.gold` | `--gold` |
| 08 Your rights under the GDPR | `accentsA.reasoning` | `--reasoning` |
| 09 Automated decisions and profiling | `tA.mute` | `--muted` |
| 10 Security and breach notification | `tA.con` | `--con` |
| 11 Children, complaints and changes | `tA.ink` | `--ink` |

`--reasoning` is the exact both-mode match for `accentsFor`'s `reasoning`
(`#3D5A80` / `#C8A055`, `design-data.js:16`). Sections 01, 06 and 08 carry bullet lists of
3, 4 and 5 items respectively; the other eight carry none.
· **Source:** `design-data.js:57-84`; `turn-10-cookie-consent.html:69-87` for the markup.
· **Hook:** jsdom asserts the eleven titles in order, the total bullet count of 12, and each
section's number element carrying the mapped token via a `data-accent` attribute or an
inline custom-property whose value is a `var(--token)` reference.

**S02-R13 — The footer holds the contact line and `I have read it`. `Download PDF` is NOT
rendered.** The end marker `END OF POLICY · GDPR (EU) 2016/679 · v2.1` is the last element
inside the scroll region.
· **Source:** `turn-10-cookie-consent.html:88,91,93,94`; intake C4 / row V-3 default — the
repo has no policy PDF and nothing generates one, so a download button would fabricate a
capability (COMMON §36 honesty law).
· **Hook:** jsdom asserts the end-marker text is present and that no element's text equals
`Download PDF`.

**S02-R14 — The modal is a standalone, prop-driven component with no consent state of its
own, and S01 consumes it unchanged.**

> `PrivacyPolicyModal` is a client component at `apps/ui/components/consent/PrivacyPolicyModal.tsx`
> whose props are exactly `{ open: boolean; mode: "read" | "consent"; onClose: () => void;
> onAcknowledge?: () => void }`. It renders `null` when `open` is `false`. It owns no consent
> state and reads or writes no storage. It calls `onAcknowledge` only from the `I have read it`
> button and only when `mode` is `"consent"`. When `mode` is `"read"` it renders no
> `I have read it` button, applies no scroll-to-end gate, never calls `onAcknowledge`, and
> renders exactly one `Close` button in the primary position. Its modal semantics — focus
> trap, initial focus, focus return, backdrop close, `prefers-reduced-motion`, and the Esc
> stack — come from the ONE shared helper `apps/ui/components/consent/modalSemantics.ts`,
> which S02 owns and writes and S01 consumes unchanged; the S01 preferences card takes its
> modal semantics from that same helper. **The Esc stack: the topmost open surface consumes
> Esc and no other surface acts on the same event.**

The `mode="read"` footer keeps the contact line beside that `Close` button. **This paragraph
is reproduced verbatim as `slices/S01/SPEC.md` S01-R20 and neither slice may change it
alone.**
· **Source:** intake C8; the packet's cross-slice interface charge; REQ-01 decision. The
`Close` label is the one string this mission adds that the design does not contain — the
design only ever shows 10c "opened from sign-up", so it has no read-only presentation to
copy, and a button labelled `I have read it` that consents to nothing would be a UI claiming
a thing it does not do. Routed as contested row **Q7-04**. The Esc stack is **REQ-REV-01 B3**;
the helper's path and owner are `COMMON.md` §10.7 (the ruling closing REQ-REV-01 P4); moving
the `Close` button into the shared paragraph is **REQ-REV-01 N9**, so the consumer's own hook
can pin it.
· **Hook:** jsdom renders the component directly with `mode="read"` and asserts no
`I have read it` button, a `Close` button, and that `onAcknowledge` is never invoked; then
with `mode="consent"` and asserts the converse. A TypeScript-level assertion that the prop
type has exactly these four members. **Plus the B3 Esc-stack pin on this side: render the
sign-up card, open the modal, press `Esc` once, and assert (a) the dialog is gone, (b) the
sign-up form and both checkbox inputs are STILL in the document, and (c) exactly one surface
acted on that keydown — no second listener also fired** (assert it by leaving the sign-up
card's own state untouched: `privacy-accepted` still `false`, focus back on that input per
R08).

**S02-R15 — In `mode="consent"`, `I have read it` is disabled until the reader has reached
the end of the policy, and once reached it stays enabled.** The criterion, evaluated on the
scroll container, is exactly:

```
container.scrollTop + container.clientHeight >= container.scrollHeight - 8
```

It is evaluated (a) once when the modal mounts, (b) on every `scroll` event of that
container, and (c) on `resize`. Once true it **latches**: scrolling back up does not disable
the button again. While disabled the button carries `disabled` and `aria-disabled="true"` and
the accessible description `Scroll to the end of the policy to continue.`; no tooltip is
added. A policy short enough that `scrollHeight <= clientHeight` satisfies the criterion at
mount and the button is enabled immediately.
· **Source:** row V-2 default; the artboard caption "scrollable, must reach the end"
(`turn-10-cookie-consent.html:47`). **The 8px slack is derived:** the body text is 11.5px at
`line-height: 1.65` ≈ 19px per line, so 8px is under half a line — the marker cannot be
counted as reached while a line of policy is still hidden — while still absorbing sub-pixel
and zoom rounding, which exact equality does not.
· **Rejected alternative, recorded so nobody re-derives it:** an `IntersectionObserver` on the
end marker is the more idiomatic expression of the rule, but jsdom implements none, so every
pin would need a stub with asynchronous callback timing. The arithmetic form is synchronous
and pinnable.
· **Hook:** a jsdom test defines `scrollTop`, `clientHeight` and `scrollHeight` on the scroll
container, dispatches `scroll`, and asserts the button's `disabled` flips at the boundary —
one case at `scrollHeight - 9` (still disabled), one at `scrollHeight - 8` (enabled), one
scrolling back to 0 (still enabled, the latch), and one with
`scrollHeight === clientHeight` (enabled at mount). In a real browser V observes it at
acceptance step 6.

**S02-R16 — Modal accessibility, and the ONE shared helper that provides it.**
`role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the title element. Focus
moves into the modal on open — initial focus on the `×` close button — and is trapped: Tab
from the last focusable returns to the first, Shift+Tab from the first goes to the last.
`Esc` closes it as the topmost open surface (R08, R14). Focus returns to the element that
opened it. The scroll region is keyboard-reachable and scrollable with `PageDown`/arrow keys,
which means it carries `tabindex="0"` and an accessible name.

**S02 writes `apps/ui/components/consent/modalSemantics.ts` and it is the only place any of
this is implemented in this mission.** It owns: the focus trap, initial focus, focus return,
backdrop close, `prefers-reduced-motion`, and the **Esc stack** — a single surface registry in
which the topmost open surface consumes Esc and no other surface acts on the same event.
`PrivacyPolicyModal` consumes it; S01's preferences card consumes the same file unchanged
(`COMMON.md` §10.7). Neither slice registers a second document-level keydown listener.
· **Source:** REQ-01 decision; the file's path and owner are `COMMON.md` §10.7, the
orchestrator ruling that closed **REQ-REV-01 P4** (v1 gave S02 an exhaustive owned-file list
with no helper in it, while COMMON said S02 owned the helper — so every placement broke one
document). **Net-new machinery:** grep over `apps/ui/**/*.ts,*.tsx` returns 0 hits for each of
`createPortal`, `Escape`, `focusTrap`, `.focus()`, `document.body`,
`addEventListener("keydown"`. All seven existing overlays — e.g.
`apps/ui/components/GuideModal.tsx:32-45` — declare `aria-modal` without implementing modal
semantics. Retrofitting those seven is ticket `A11Y-OVERLAYS` (`t_8962842f`), outside this
mission's surface.
· **Hook:** jsdom asserts the three ARIA attributes, the initially focused element, the Tab
cycle at both ends, and focus restoration on each of the three dismissal routes. **Plus a
direct pin on the helper: mount two surfaces through it, one over the other, dispatch ONE
`keydown` with `key: "Escape"`, and assert the outer surface's close callback was not
invoked** — a stack with two listeners passes every other hook in this SPEC and fails only
this one.

### Gating

**S02-R17 — `Create account` is disabled unless BOTH boxes are checked**, in addition to the
existing `busy || sent`. **The implementation is pinned, not left to the coding seat:**

1. Both inputs stay **uncontrolled** `<input type="checkbox">` elements — no `checked` prop,
   exactly as `apps/ui/components/SignUpFlow.tsx:186` is today.
2. Each carries an `onChange` handler that **mirrors** its `event.currentTarget.checked` into
   a React state boolean. Those two booleans exist for ONE purpose: computing the submit
   button's `disabled` attribute, so it reflects the boxes live with no submit.
3. **`FormData` remains the truth at submit** (`new FormData(form)`, read exactly as
   `SignUpFlow.tsx:63` and `:72` read it today). React state is never the value that decides
   whether registration proceeds — see R18.

· **Source:** V's goal, verbatim: "The user will not be able to register an account unless
both 'I am 18 or above' and the 'privacy policy' tickboxes are checked." **The pinning is
REQ-REV-01 B2, and it is probe-proven, not argued.** v1 said the component "holds both in
React state rather than reading them only from `FormData` at submit time", i.e. controlled
inputs. The reviewer ran a standalone jsdom + React harness executing this repo's own idiom
(`field(x).checked = true`, `tests/render/auth-flow-integration.test.tsx:324,448,466`) and its
own submit helper (`:41-48`), three runs each, deterministic: **controlled → `register()`
called 0 times** (the three existing cases go RED, 14/17); **uncontrolled + `onChange` mirror
→ `register()` called once with `[true,true]`.** The mechanism: assigning the DOM property
`.checked` dispatches no React `change` event, so a controlled input's state stays `false`
while the DOM says `true`. The uncontrolled+mirror shape is the only one under which the
three existing cases keep working with their existing one-line idiom.
· **Rejected alternative, recorded so nobody re-derives it:** making the inputs controlled and
rewriting the three existing cases to click the boxes. It works, but it edits three passing
cases' mechanics rather than their data, enlarges S02's diff into the shared auth suite, and
buys nothing — the button's live `disabled` is satisfied by the mirror alone.
· **Hook — ONE idiom for the button, named once (REQ-REV-01 B4).** `field(x).checked = true`
fires no React change event, so it can never flip this button. **The single idiom for every
assertion about the BUTTON's enabled state is `field(name).click()`, wrapped in
`await act(async () => { … })`.** There is no second idiom, and all six cases below use only
that one.
· **Measured, so that no seat re-derives it** — probe
`.hermes/reports/consent-ui/probes/b2-idiom-matrix.mjs`, React 19.2.8 + jsdom 30.0.1 from
`apps/ui/node_modules`, run three times with identical output by REQ-REV-01 and again by REQ-01:
`field(name).click()` **enables** the button (DOM `true/true`) · `dispatchEvent(new
MouseEvent("click", { bubbles: true }))` **enables** it (DOM `true/true`) · `dispatchEvent(new
Event("change", { bubbles: true }))` **does not** (DOM stays `false/false`) · `dispatchEvent(new
Event("click", { bubbles: true }))` **does not** (DOM stays `false/false`). The mechanism: React
routes a checkbox's `onChange` through the **click** event and requires a real `MouseEvent`, so a
synthetic `change` never reaches the handler and the mirror never updates. **The last two forms
are recorded here as measured-dead, never as alternatives: a hook that uses either is wrong, and
its failure will look like an implementation bug.** `MouseEvent` is measured-equivalent and is
deliberately still not offered — two idioms presented as equivalent is what caused B4.
· **The six cases.** Cases 1-4 run from a fresh mount with the one idiom: neither box →
`disabled`; only `adult-affirmed` → `disabled`; only `privacy-accepted` → `disabled`; both →
**not** `disabled`.
· **Case 5 — assignment announces nothing, and `.click()` TOGGLES (REQ-REV-01 B5).** Assign
`.checked = true` on both WITHOUT dispatching and assert the button is still `disabled`; **then
set both back to `.checked = false`, then `click()` both** inside `act`, and assert it enables.
**The reset is load-bearing, not tidiness: `.click()` toggles, so clicking a box already assigned
`true` drives it to `false`, `onChange` fires with `false`, and the button correctly stays
disabled.** Without the reset this case cannot pass under any idiom — v2 stated it without the
reset and it was unsatisfiable against the correct implementation.
· **Case 6 — the pin that goes red if a seat makes the inputs controlled.** Assign `.checked =
true` on `adult-affirmed` only, WITHOUT dispatching; then `click()` `privacy-accepted` inside
`act` (that click is what forces a React re-render); then assert **both** that the button is still
`disabled` **and that `field("adult-affirmed").checked` is still `true`**. The second assertion is
the discriminating one: an uncontrolled input keeps the assigned value across the render, while a
controlled input is re-rendered from React state and React resets it to `false`.
· **Which case catches which regression, measured — 6 cases x 4 implementation variants x 3 runs,
deterministic** (REQ-01 rework R2; full matrix in `requirements/REQ-01-rework-r2-handoff.md`).
Against the pinned shape all six pass. Against **controlled** inputs — the regression this hook
exists to catch — **only case 6 goes red**; cases 1-5 stay green under all four variants, so case
5 documents the toggle but detects nothing. v2 attached the controlled-inputs guarantee to case 5,
where it was not true; it lives on case 6, where it is measured. V acceptance steps 2-4 and 8.

**S02-R18 — The submit handler refuses to call `client.register` when either box is
unchecked — defence in depth, and the `required` attributes stay.** `submitRegistration`
returns before the call if either is false. **The values it tests are the two `FormData`
reads, never the React mirror of R17:**
`data.get("adult-affirmed") === "on"` (the existing read at `apps/ui/components/SignUpFlow.tsx:72`)
and `data.get("privacy-accepted") === "on"`. Both are computed from the same `FormData`
instance already built at `:63`, before the `client.register` call, and the function returns
without calling it if either is `false`.
· **Source:** the packet's defence-in-depth charge; the browser's own `required` validation is
bypassed by a programmatic `form.dispatchEvent(new Event("submit"))`, which is exactly how
the existing suite submits (`tests/render/auth-flow-integration.test.tsx:41-48`) — so
`required` alone gates nothing in a test and would gate nothing against a scripted submit.
**The truth source is pinned by REQ-REV-01 B2:** if this refusal read R17's React booleans
instead, the three existing cases — which tick the boxes with `.checked = true` and fire no
change event — would find both booleans `false` and `register` would never be called, taking
`auth-flow-integration.test.tsx` from 18 passed to 15. Reading `FormData` reads the DOM, which
is what the idiom sets, so the same handler satisfies both the gate and the existing suite.
· **Hook:** a NEW pin the slice must add: dispatch a submit with only one box checked
(`.checked = true` on one input only, the house idiom, no change event needed because this
pin is about the HANDLER, not the button) and assert `register` was **not** called; then the
same with the other box. This is named in §Tests as an addition, not a change.

**S02-R19 — The registration request keeps its exact shape.** `client.register(email,
password, recoveryEmail, adultAffirmed)` — four positional arguments, no new field, no new
argument (`packages/contract/src/client.ts:215-220`). Nothing about the privacy acceptance is
sent to the server by this mission.
· **Source:** intake C6 / row V-5 default (a server-side `privacy_accepted_at` is a follow-up
ticket, not this mission); COMMON §35 no-touch surface.
· **Hook:** `tests/render/auth-flow-integration.test.tsx:327-332` continues to assert
`toHaveBeenCalledWith` with exactly those four arguments. Adding a fifth argument fails it —
which is the intended guard, not a test to update.

**S02-R20 — The policy content is data, in `apps/ui/lib/privacyPolicy.ts`, not markup.** Two
exported constants: `POLICY_JUMP` (the eight pills with their target ids) and
`POLICY_SECTIONS` (the eleven records `{ no, title, accent, body, items }`), transcribed
byte-exact from `design-data.js:51` and `:57-84` — **"byte-exact" measured on the DECODED
characters, per the note at the end of §Copy: the extract holds `\uXXXX` escapes, and this
file is a TypeScript module, so a verbatim escape decodes correctly while the same escape in
a `.json` file would not** (REQ-REV-01 N8). `PrivacyPolicyModal.tsx` renders from them and
contains no policy prose.
· **Source:** REQ-01 decision, forced by R21: the policy text may not live in
`SignUpFlow.tsx`, and keeping it out of the component file as well makes a byte-exactness
check a single-file review.
· **Hook:** a test asserts `POLICY_SECTIONS.length === 11`, `POLICY_JUMP.length === 8`, the
eleven titles in order, the per-section bullet counts `[3,0,0,0,0,4,0,5,0,0,0]`, and that
every `POLICY_JUMP` target id appears in `POLICY_SECTIONS`.

**S02-R21 — `SignUpFlow.tsx` must not gain the substrings `terms`, `privacy notice`,
`localStorage` or `sessionStorage` (case-insensitive).** No policy prose, no storage access
and no `Privacy notice` string may live in that file. The designed label
`I agree to the Privacy Policy, including that my debates may be published publicly.` is
SAFE under this rule — it contains neither banned substring.
· **Source:** a LIVE, GREEN guard nobody had named:
`apps/ui/components/authRoutes.source-test.mjs:48` asserts
`assert.doesNotMatch(signUp, /localStorage|sessionStorage|Bearer|Google|Model API|terms|privacy notice/i)`,
and it runs via `tests/unit/v2ui-node-runner.test.ts`, measured GREEN by REQ-01 on 2026-09-06
(exit 0, `Tests 2 passed (2)`). The parallel ban at
`tests/architecture/auth-front-door-parity.test.ts:86` also exists but that suite is red at
base for an unrelated reason (see §Tests), so the node-runner guard is the one that bites.
· **Hook:** `pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts` stays green.

**S02-R22 — S02 declares no new CSS token and edits neither `globals.css` token block nor
`tests/unit/t9-mode-tokens.test.ts`.** The five tokens it consumes — `--scrim`,
`--z-policy-scrim`, `--z-policy-card`, `--ok-edge`, and (for the check square fill)
`--ok-dot` — are declared by S01 (`slices/S01/SPEC.md` S01-R24). Every colour in S02's files
is a `var(--token)` reference; no `#hex`, `rgb(`, `rgba(` or `oklch(` literal appears
anywhere in them. S02's CSS goes in ONE delimited block
`/* === consent-ui S02 === */ … /* === end consent-ui S02 === */` appended at the end of
`globals.css`, after S01's.
· **Source:** S01-R24's single-writer rule, which exists because
`tests/unit/t9-mode-tokens.test.ts:376-377` asserts exact set equality between the declared
tokens and the test's map keys (expected lists built at `:371-372`; `:379-384` is a separate
raw VALUE loop — **REQ-REV-01 N2** corrected this pointer, substance unchanged) — two lanes
adding tokens would conflict on every addition.
· **Hook:** a source-text assertion that S02's files contain no colour literal; the token test
stays green without S02 touching it.

**S02-R23 — Both surfaces follow the mode toggle live**, including while the modal is open.
· **Source:** the design's mode-toggle rule for TURN 10 (`turn-10-cookie-consent.html:8`) and
the auth shell's existing toggle (`apps/ui/components/TopBar.tsx:60-67` renders `ModeToggle`
on `/sign-up`).
· **Hook:** V acceptance step 14 flips the mode with the modal open.

**S02-R24 — Motion respects `prefers-reduced-motion`.** If the modal animates in, S02 adds
its own `@media (prefers-reduced-motion: reduce)` block for its selectors; there is no global
reset in this codebase (the four existing blocks at `globals.css:269,3663,4681,5244` are each
component-scoped).
· **Source:** measured at those citations.
· **Hook:** source-text assertion that S02's CSS block contains such a rule, or no animation.

## States and transitions

| From | Event | To | Side effect |
|---|---|---|---|
| Both unchecked | click 18+ row | 18+ checked | submit stays disabled |
| Privacy unchecked | click square / text / link | Modal `mode="consent"` open | box stays unchecked |
| Modal open, end not reached | scroll to within 8px of the bottom | Modal open, button enabled | latched |
| Modal open, button enabled | `I have read it` | Modal closed, privacy checked | focus → privacy input |
| Modal open | `×` / `Esc` / backdrop | Modal closed, privacy unchecked | focus → privacy input |
| Modal open (topmost) | **one `Esc`** | **Modal closed and NOTHING else acts on that event** — the sign-up card, and S01's preferences card when the modal was opened from it, stay exactly as they were (R14's Esc stack) | none |
| Privacy checked | click privacy row | Privacy unchecked | no modal |
| Both checked, **each state set by a real `change`/click** | — | `Create account` enabled | — |
| Both boxes `.checked = true` **assigned with no change event** | — | `Create account` still disabled (R17's mirror never fired) — but a programmatic submit still registers, because R18 reads `FormData` | none |
| Either unchecked in `FormData` | programmatic submit | no registration call | R18 |
| Opened from S01's card | any dismissal | back to the card | `mode="read"`, no side effect |

## Copy — verbatim

**Checkbox group** — `turn-8a-checkbox-group.html:4,8`:

- Row 1: `I am 18 or over.`
- Row 2: `I agree to the ` `Privacy Policy` `, including that my debates may be published publicly.`
  (the words `Privacy Policy` are the link; the sentence is one continuous label)

**Modal header** — `turn-10-cookie-consent.html:56,57,58`:

- eyebrow: `PRIVACY POLICY · v2.1 · EFFECTIVE 12 AUG 2026`
- title: `What we store, and why`
- lede: `Your rights and our obligations under the GDPR (EU) 2016/679, in plain language. Eleven sections — scroll to the end.`

**Jump pills** — `design-data.js:51`, in this order: `CONTROLLER` · `WHAT WE COLLECT` ·
`LAWFUL BASIS` · `PUBLISHING` · `MODELS & TRANSFERS` · `RETENTION` · `YOUR GDPR RIGHTS` ·
`COMPLAINTS`

**Sections** — `design-data.js:57-84`, byte-exact:

**01 · What we collect** — `Only what an account needs to function, plus what you choose to give us.`
- `Account: email, recovery email, password hash, MFA secret, recovery codes.`
- `Security: device name, browser, IP and timestamp for each session.`
- `Content: the claims you post, your challenges, and the model output they produce.`

**02 · Why we hold it** — `Each category has one purpose and is not reused for another. Session and device records exist so you can recognise and revoke a login you did not make. Debate content exists so a debate can be reopened, replayed and audited against the scores it was given.`

**03 · Publishing and visibility** — `Debates are private until you publish them. Publishing shows the claim, the tree, the scores and your display name — never your email, device records or session history. Unpublishing removes it from public listings; copies already made by readers are outside our control.`

**04 · Model providers and international transfers** — `Claims and arguments are sent to the model providers you select in order to generate the debate. We send debate text only — never your email, device record or session data — and we do not permit providers to train on it. Providers outside the EEA receive data under Standard Contractual Clauses (Art. 46 GDPR); a list of current sub-processors and their locations is maintained at dezbatere.ro/subprocessors.`

**05 · Controller and contact** — `The controller of your personal data is DebateAIRO SRL, Bucharest, Romania. Our data protection contact is privacy@dezbatere.ro. We have no obligation to appoint a DPO but this address is monitored and answers within 30 days.`

**06 · Lawful basis for each purpose** — `We rely on a single, stated basis per purpose under Art. 6(1) GDPR:`
- `Contract, Art. 6(1)(b) — account, authentication, running and storing your debates.`
- `Legitimate interests, Art. 6(1)(f) — security, abuse prevention, and the session and device records that let you spot a login you did not make.`
- `Consent, Art. 6(1)(a) — optional analytics and model-quality telemetry, and publishing a debate. Withdrawable at any time, without affecting your account.`
- `Legal obligation, Art. 6(1)(c) — retaining records we are required by law to keep.`

**07 · Retention** — `Session and device records are kept 30 days; optional analytics and telemetry 90 days; account data for as long as the account exists. Deleting your account erases account data and unpublished debates within 30 days, and removes published debates from public listings. Backups age out within a further 90 days.`

**08 · Your rights under the GDPR** — `You may exercise any of these free of charge from Settings → Privacy, or by writing to privacy@dezbatere.ro. We answer within one month (Art. 12(3)).`
- `Access (Art. 15) — a copy of your data, exportable as JSON from Settings.`
- `Rectification (Art. 16) and erasure (Art. 17) — correct or delete your data.`
- `Restriction (Art. 18) and objection (Art. 21) — including objecting to processing based on legitimate interests.`
- `Portability (Art. 20) — your debates and account data in a machine-readable form.`
- `Withdraw consent (Art. 7(3)) — for analytics, telemetry, or a published debate.`

**09 · Automated decisions and profiling** — `Model scores, condition marks and verdicts are automated evaluations of arguments, not of people. No decision with legal or similarly significant effect on you is made automatically (Art. 22), and we do not profile you for advertising.`

**10 · Security and breach notification** — `Passwords are hashed, MFA is mandatory, and access to production data is logged. In the event of a personal data breach we notify the Romanian supervisory authority within 72 hours (Art. 33) and inform you directly where the risk to your rights is high (Art. 34).`

**11 · Children, complaints and changes** — `The service is for adults; accounts require an 18-or-over affirmation and we do not knowingly process children’s data. You may lodge a complaint with the Romanian supervisory authority (ANSPDCP, Bucharest) or the authority where you live. Material changes to this policy are announced in-app at least 14 days before they take effect, and prior versions remain available.`

**End marker** — `END OF POLICY · GDPR (EU) 2016/679 · v2.1`

**Footer** — `Questions: ` + `privacy@dezbatere.ro` (bold, `--ink`) · `I have read it`
(`mode="consent"`) or `Close` (`mode="read"`). `Download PDF` is not rendered.

All em dashes are U+2014, middle dots U+00B7, the right single quote in `children’s` is
U+2019, and the arrow in `Settings → Privacy` is U+2192.

**What "byte-exact" means against this extract (REQ-REV-01 N8).** Everything above is the
DECODED text — what the reader must see. `design-data.js` does not store it that way: it holds
**literal six-character ASCII escapes**, e.g. `design-data.js:89` contains `\u2019` where this
document shows `’`. **Counted, not estimated (REQ-REV-01 N11).** The counting rule: every
occurrence of the six-character ASCII sequence `\uXXXX` in the whole file, tallied by codepoint.
The command, run from `docs/missions/consent-ui/design/`, and its output:
`grep -o '\\u[0-9A-Fa-f]\{4\}' design-data.js | sort | uniq -c | sort -rn` →
`12 \u2014` · `2 \u2019` · `1 \u2192`, **15 escapes in total, of three distinct codepoints**.
**U+00B7 is never escaped anywhere in the extract** — `grep -c -i 'u00b7' design-data.js` → `0`;
it appears 4 times as a raw UTF-8 character, alongside 4 raw U+2014, so the same codepoint can be
raw in one line and escaped in another and neither form can be assumed. So a
transcription is byte-exact when the **rendered** character matches. Copying an escape
verbatim into a TypeScript or JavaScript string literal in `apps/ui/lib/privacyPolicy.ts` is
correct — the language decodes it to the same codepoint. Copying it into a `.json` file, into
raw JSX text, or into any string that is not re-parsed as a JS literal is **not**: it ships
the six visible characters `’` to the reader. The verification hook is therefore on the
DECODED output (`textContent` equality against the strings above), never on the source bytes.

**Claims in this policy that this repository can neither confirm nor refute — UNVERIFIED, not
defects.** The retention periods (30/90 days), `dezbatere.ro/subprocessors`, the controller
entity `DebateAIRO SRL, Bucharest, Romania`, and the version/date
`v2.1 · EFFECTIVE 12 AUG 2026`. These are business facts and the codebase is not their
source of truth; REQ-01 did not attempt to verify them and no seat should re-derive that.
Checked and **true**: `privacy@dezbatere.ro` matches the brand domain
(`apps/ui/components/TopBar.tsx:31`); §11's claim that accounts require an 18-or-over
affirmation matches `apps/ui/components/SignUpFlow.tsx:186`; §10's "MFA is mandatory" matches
`apps/ui/app/settings/page.tsx:49`.

## Token mapping (element → tokens)

| Element | Tokens |
|---|---|
| checkbox group container | `--shell`, `--line`, `border-radius: 11px` |
| row divider | `--line` |
| check square, unchecked | `--ok-edge` border (S01-declared) |
| check square, checked | `--ok-dot` fill, `--core` glyph, `--ok-edge` border |
| label text | `--ink`, `--font-sans` |
| `Privacy Policy` link | `--ink`, underline, weight 700 |
| modal scrim | `--scrim`, `--z-policy-scrim` |
| modal bezel / core | `--shell`, `--line-strong`, `--r-panel`; `--core`, `--line` |
| gold tab | `--gold`, `--r-tab` |
| eyebrow | `--gold`, `--font-mono` |
| title | `--ink`, `--font-display` |
| lede / section bodies / bullet text | `--text-2`, `--font-sans` |
| `×` close | `--line-strong` border, `--muted` |
| jump pills | `--line-strong` border, `--shell` background, `--muted` text, `--font-mono`, `--r-pill` |
| section number + bullet dot | the per-section accent token in R12 |
| section divider | `--line` |
| end marker | `--muted`, `--font-mono` |
| footer | `--shell` background, `--line` top border, `--muted` text, `--ink` for the address |
| `I have read it` / `Close` | `--ink` background, `--bg` text, `--r-pill`; disabled state at reduced opacity |
| focus rings | `--focus` |

**S02 declares no new token** (R22). Contrast of `--text-2` on `--core` in both modes is
already exercised by the existing token contract; the disabled-button contrast is
**UNVERIFIED by REQ-01** and is measured by the slice with the repo's contrast helper
(`tests/support/contrast.ts`).

## Accessibility and keyboard

- Both checkboxes are real inputs, focusable, `Space`-toggleable, with their sentence as the
  accessible label (R03).
- The `Privacy Policy` link is reachable by Tab and activates the modal with `Enter`.
- Modal: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, initial focus on `×`,
  focus trap in both directions, `Esc` to close, focus restored to the privacy input (R16).
- **Esc, and only one surface acting on it (R14's shared paragraph, REQ-REV-01 B3):** the
  TOPMOST open surface consumes Esc and no other surface acts on the same event. With the
  policy modal over the sign-up card, Esc closes only the modal; with the policy modal over
  S01's preferences card (`mode="read"`), Esc closes only the modal and the card stays open.
  **The stack lives in the ONE shared helper `apps/ui/components/consent/modalSemantics.ts`,
  which S02 writes and S01 consumes unchanged** (`COMMON.md` §10.7) — exactly one
  document-level keydown listener exists across the two slices.
- The scroll region carries `tabindex="0"` and an accessible name so keyboard users can
  scroll it — which is the only way a keyboard-only user can satisfy R15.
- `I have read it` while disabled carries `aria-disabled="true"` and the description
  `Scroll to the end of the policy to continue.` (R15).
- Focus rings visible on every control, in both modes.

## V acceptance (numbered browser steps · expected observation · mode)

Run at `https://localhost:3000/sign-up`. Steps 1-14 are run once in **Terracotta** and once in
**Chamber**.

1. Open `/sign-up`. → Below the password field, one bordered box with two rows:
   `I am 18 or over.` and `I agree to the Privacy Policy, including that my debates may be
   published publicly.`, with `Privacy Policy` underlined. Both squares empty.
2. Fill a valid email, a different recovery email, and a password meeting all four rules,
   leaving both boxes unticked. → `Create account` is greyed out and does nothing when
   clicked.
3. Tick `I am 18 or over.` only. → Still disabled.
4. Untick it; tick nothing. Click the privacy row's **text**. → The policy modal opens over a
   dim overlay. The privacy box is **still empty**. Repeat with a click on the **square**, and
   with a click on the **`Privacy Policy` link** — same result all three times.
5. Read the modal header. → `PRIVACY POLICY · v2.1 · EFFECTIVE 12 AUG 2026`, the title
   `What we store, and why`, the lede ending `Eleven sections — scroll to the end.`, and a
   `×` at the top right. `I have read it` at the bottom right is greyed out. There is **no**
   `Download PDF` button.
6. Scroll the policy to the bottom until `END OF POLICY · GDPR (EU) 2016/679 · v2.1` is
   visible. → `I have read it` becomes active. Scroll back up to the top. → It **stays**
   active.
7. Click `×`. → The modal closes and the privacy box is **still empty**; `Create account`
   still disabled. Reopen, press `Esc`. → Same — and, the Esc-stack check (REQ-REV-01 B3):
   **that one `Esc` closed the modal and nothing else.** The sign-up card is still on screen
   with the email, recovery email and password you typed in step 2 still filled, and the 18+
   box in whatever state you left it. Reopen, click the dim area outside the modal. → Same.
8. Reopen, scroll to the end, click `I have read it`. → The modal closes, the privacy box is
   **ticked**. Tick `I am 18 or over.` too. → `Create account` becomes active.
9. Untick `I am 18 or over.`. → `Create account` greys out again. Re-tick it.
10. Click the ticked privacy box. → It unticks immediately, with **no** modal, and
    `Create account` greys out.
11. Count the sections in the modal. → Eleven, numbered 01 to 11, each with a coloured
    number; sections 01, 06 and 08 have bullet lists.
12. Click each of the eight jump pills in turn. → Each scrolls the policy to its section:
    `CONTROLLER` → 05, `WHAT WE COLLECT` → 01, `LAWFUL BASIS` → 06, `PUBLISHING` → 03,
    `MODELS & TRANSFERS` → 04, `RETENTION` → 07, `YOUR GDPR RIGHTS` → 08, `COMPLAINTS` → 11.
13. Narrow the window to a phone width. → The modal stays within the viewport, the policy
    still scrolls, nothing is clipped and no horizontal scrollbar appears.
14. Keyboard only, from a fresh load: Tab to the privacy row and press `Enter` on the link. →
    The modal opens and focus is inside it, on `×`. Tab repeatedly. → Focus cycles within the
    modal and never reaches the page behind. Tab to the policy body and scroll it with
    `PageDown` to the end. → `I have read it` enables; Tab to it and press `Enter`. → The
    modal closes, the box is ticked, and focus is back on the privacy checkbox. Then, with
    the modal open, click the top-bar mode toggle. → The modal restyles live and stays open at
    the same scroll position.

## Tests to update and why

| Test | What encodes the old design, and what the slice does |
|---|---|
| `tests/render/auth-flow-integration.test.tsx` | Three cases tick **only** `adult-affirmed` before submitting: `:324` (happy path, case at `:316`), `:448` (failure path, case at `:436`), `:466` (resend-failure path, case at `:456`), each via the idiom `field("adult-affirmed").checked = true;` with the helper at `:35-39` and the submit at `:41-48`. **The slice ticks BOTH boxes in all three, keeping the existing one-line idiom exactly as it is** — one added line per case, `field("privacy-accepted").checked = true;`, and nothing else. That is sufficient **only** because R17 keeps the inputs uncontrolled and R18 reads `FormData`; the assignment reaches the DOM, `FormData` reads the DOM, `register` fires. Note precisely why they break without the added line: `submit()` dispatches a bare `new Event("submit")`, which bypasses HTML constraint validation, so the new `required` attribute alone would not fail them — what fails them is R18's handler-level refusal, which would make `register` never fire and break the assertions at `:327-332`. |
| `tests/render/auth-flow-integration.test.tsx` (ADD) | A NEW case the slice must add: fill valid fields, tick exactly one box, dispatch submit, assert `register` was **not** called. Then the same with the other box. This is the only pin for R18. |
| **The idiom rule for every NEW assertion about the BUTTON (REQ-REV-01 B2, narrowed to ONE idiom by B4)** | `field(x).checked = true` sets a DOM property and fires **no** React `change` event, so it can never change the submit button's `disabled` state under R17's mirror. **Any new assertion about the button's enabled/disabled state uses exactly one idiom — `field(name).click()` wrapped in `await act(async () => { … })`** — and must never assign `.checked` and then assert on the button. **No second idiom is offered.** Two forms that a seat might reach for are measured dead and must not be used: `dispatchEvent(new Event("change", { bubbles: true }))` and `dispatchEvent(new Event("click", { bubbles: true }))` leave the DOM box `false` and the button `disabled`, because React routes a checkbox's `onChange` through the **click** event and requires a real `MouseEvent` (probe `.hermes/reports/consent-ui/probes/b2-idiom-matrix.mjs`, three identical runs; R17's hook carries the full matrix). Assignments remain correct for the three existing SUBMIT cases and for R18's new refusal pins, because those exercise the handler and `FormData`, not the button. A pin that gets this wrong fails in a way that looks like an implementation bug: the button is disabled, the test blames the component. |
| `tests/render/auth-flow-integration.test.tsx` (hooks) | Its hooks (`:59-73`) clear no storage. If any S02 test touches `debateai.consent`, it clears it in `beforeEach`/`afterEach` — `vitest.config.ts:19` sets `fileParallelism: false`, so a leaked key survives into later files in the same worker. |
| `apps/ui/components/authRoutes.source-test.mjs` | Must stay GREEN, not change. `:45` requires `name="adult-affirmed"` still followed by `required`; `:48` bans `terms`/`privacy notice`/`localStorage` in `SignUpFlow.tsx` (R21); `:165` pins the sign-up+login `<form>` count at 3 (R03). Measured GREEN at base by REQ-01: `pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts` → exit 0, `Tests 2 passed (2)`. |
| `apps/ui/scripts/node-test-manifest.json` | Only if the slice adds a `consent/*.source-test.mjs`: its `apps/ui`-relative path must be registered here, or `tests/unit/v2ui-node-runner.test.ts:19` fails on the manifest equality assertion. **This line number was challenged as N5 and RE-MEASURED in v2 — it is correct as written; do not "fix" it.** Measured 2026-09-06 in the main tree and in lane `.worktrees/consent-s01/dialectical-engine` (same md5 `dae7cd12705f1d7c885030ceefdbd433`, file is 35 lines): `:16` is the `.map(...)`, `:17` is `.sort();`, `:18` is blank, **`:19` is `expect(activeTests).toEqual([...manifest].sort());`**, `:20` is `});`, `:21` is blank. |
| New: `tests/render/consent-privacy-*.test.tsx` | Every jsdom hook named in R01-R24. |

**Baseline that is already red — inherit, do not claim.** The authority is
`docs/missions/consent-ui/BASELINE.md`, measured in both clean lanes. It records
`tests/render/auth-flow-integration.test.tsx` GREEN at base (exit 0, `Tests 17 passed (17)`)
— so S02's three edits and one addition must leave it at 18 passed, not fewer — and
`tests/unit/t9-mode-tokens.test.ts` red at base (exit 1, `Tests 2 failed | 6 passed (8)`),
which S02 does not touch.
`tests/architecture/auth-front-door-parity.test.ts` is RED at base and S02 must not claim
otherwise. REQ-01 measured on 2026-09-06:
`pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts` → exit 1,
`Tests 2 failed (2)`, both `ENOENT` on `web/package.json` and `web/components/LoginFlow.tsx`.
`web/` holds exactly one tracked file (`git ls-files web/` → `web/next.config.mjs`); the
suite's unguarded `read` helper at `:11` throws before any assertion runs — which also means
its own `terms` ban at `:86` is currently unenforceable, and the node-runner guard (R21) is
the one that actually bites. `pnpm typecheck` is red by the 8 pinned diagnostics in
`tests/unit/s14-ui.test.ts`; assert the delta.

## Out of scope

No server-side privacy-acceptance record, no `privacy_accepted_at`, no policy-version field,
no change to the registration request or the contract (`packages/contract/src/client.ts:215-220`)
· no `Download PDF` and no PDF generation · no policy-versioning UI, no "policy changed"
re-consent flow · no change to the cookie bar, the preferences card, the storage contract or
the Settings panel (S01 owns those) · **no retrofit of the seven existing overlays onto
`modalSemantics.ts` — that is ticket `A11Y-OVERLAYS` (`t_8962842f`), and S02 writes the helper
for the two consent surfaces only** · no new CSS token and no edit to either token block or
to `tests/unit/t9-mode-tokens.test.ts` · no change to `apps/api/**`, `packages/**`,
`migrations/**`, or any login / MFA / recovery / verify-email flow.

## Parallel-safety (file surface; single-writer rule)

**S02 owns and is the only writer of:** `apps/ui/components/SignUpFlow.tsx` ·
`apps/ui/components/consent/PrivacyPolicyModal.tsx` ·
**`apps/ui/components/consent/modalSemantics.ts` — the ONE shared modal-semantics helper
(focus trap, initial focus, focus return, backdrop close, `prefers-reduced-motion`, Esc
stack), written here and consumed unchanged by S01 (`COMMON.md` §10.7, the ruling that closed
REQ-REV-01 P4; v1's owned-file list was exhaustive and named no helper, which is what made
every placement break one document)** · `apps/ui/lib/privacyPolicy.ts` · the ONE
delimited block `/* === consent-ui S02 === */ … /* === end consent-ui S02 === */` appended at
the end of `apps/ui/app/globals.css`, after S01's · its changes to
`tests/render/auth-flow-integration.test.tsx` and its own new tests.

**S02 reads but never edits:** `apps/ui/app/globals.css` token blocks ·
`tests/unit/t9-mode-tokens.test.ts` · `apps/ui/app/layout.tsx` ·
`apps/ui/app/settings/page.tsx` · `apps/ui/lib/consent.ts` and everything else under
`apps/ui/components/consent/` that S01 owns (that is: everything there except this slice's
own `PrivacyPolicyModal.tsx` and `modalSemantics.ts`).

**The only file both slices write is `apps/ui/app/globals.css`**, in two separate delimited
blocks at the end. **Two S02-owned TypeScript files are consumed unchanged by S01** —
`PrivacyPolicyModal.tsx` under the R14 interface and `modalSemantics.ts` for the card's modal
semantics — so S02's lane should land both first (intake C8); S01's wiring cluster pulls
`slice/consent-s02` into its lane rather than editing either file. ARCH owns the sequencing.
**`modalSemantics.ts` is the harder of the two to sequence: S01's card cannot satisfy
S01-R18 or the Esc stack until it exists**, so it should be the first artefact of the mission, ahead of
the policy modal that also depends on it.

## Traceability (R-id → PLAN steps: filled by ARCH)

See `PLAN.md` §SPEC trace. Every `S02-Rnn` above has a row there; the step column is empty
until the architecture seat fills it.

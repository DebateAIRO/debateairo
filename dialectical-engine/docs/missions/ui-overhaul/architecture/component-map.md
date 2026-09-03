# COMPONENT MAP — design element → existing component, per slice

Legend: **RE-SKIN** = token/CSS change only, no JSX edit · **STRUCTURAL** = JSX
edit to an existing component · **NEW** = a file that does not exist yet.

The bias throughout is RE-SKIN then STRUCTURAL; NEW is reserved for the landing
sections, which have no counterpart in the product. That bias is not thrift —
every STRUCTURAL edit is a standing test that may break (`test-migration.md`),
and every NEW client component is a hydration surface the SSR mode script has
to survive.

---

## T9 — Landing page (the only slice that is mostly NEW)

| Design | Target | Kind |
|---|---|---|
| T9-S1 chrome: wordmark, `Method`/`Transcripts`/`Pricing`, `Start a debate`, ☾ | `apps/ui/components/landing/LandingChrome.tsx` | NEW |
| T9-S2 hero: eyebrow, headline, body, two CTAs, meta triple | `apps/ui/components/landing/LandingHero.tsx` | NEW |
| T9-S3 sample block `ONE DEBATE, FOUR TURNS` + Pro/Con/Reasoning cards | `apps/ui/components/landing/LandingSample.tsx` | NEW |
| T9-S4 method ledger 01–04 | `apps/ui/components/landing/LandingMethod.tsx` | NEW |
| T9-S5 pricing strip | `apps/ui/components/landing/LandingPricing.tsx` | NEW |
| composition root | `apps/ui/components/landing/LandingPage.tsx` | NEW |
| T9-S6 mode toggle | `apps/ui/components/ModeToggle.tsx` | NEW (shared, ADR-002) |
| route branch | `apps/ui/app/page.tsx` | STRUCTURAL (one early return, ADR-003) |
| tokens + fonts | `apps/ui/app/globals.css`, `apps/ui/app/layout.tsx` | STRUCTURAL |
| return path | `apps/ui/lib/returnPath.ts` NEW · `LoginFlow.tsx`, `SignUpFlow.tsx` STRUCTURAL | ADR-004 |

The landing sample cards (T9-S3) deliberately do **not** reuse the canvas card
component. `DebateCanvas`'s card is bound to a `DebateNode` and to live scoring
state; the landing card is static marketing copy. They share the **token and
class vocabulary** (`data-bezel`, `data-stance`, the bezel classes) so the two
cannot drift visually, but not the component. Reusing the live card here would
drag the whole scoring data layer into an anonymous route.

## T3 — Library (3a) and public debate (3b)

| Design | Target | Kind |
|---|---|---|
| T3-S1 library chrome, `+ New debate`, asker chip, ☾, ⚙ | `apps/ui/components/TopBar.tsx` | STRUCTURAL (add ☾ + asker chip) |
| T3-S2 composer hero `A REASONING INSTRUMENT` / `What should we debate?` / `Start debate →` | `apps/ui/app/page.tsx` (eyebrow + display + lede already present) and `apps/ui/components/LibraryComposer.tsx` | STRUCTURAL (copy) |
| T3-S3 `Your debates` / `Public debates` selectors, `4 TOTAL` chip, rows | `apps/ui/app/page.tsx` `sectionHead` block; rows in `apps/ui/components/DebatesBuffer.tsx` and the inline `debateCard` list | STRUCTURAL (copy + chip), rows RE-SKIN |
| T3-S4 bezel card language on rows | `.debateCard` rules in `globals.css` | RE-SKIN |
| T3-S5 public header + `🔒 Public view · actions locked` + view toggles | `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` (`publicHeader`) | STRUCTURAL |
| T3-S6 verdict-first block, status chip, thresholds line, `Details ▾`, metric line | `apps/ui/components/public/PublicVerdictBlock.tsx` | NEW, rendered inside `publicHeader` |
| T3-S7 `THE CASE FOR` / `THE CASE AGAINST` + strongest cards + `Read ▾` | `apps/ui/components/public/PublicStrongestCases.tsx` | NEW, rendered inside `publicHeader` |
| T3-S8 locked banner + `Unlock actions` | `apps/ui/components/public/PublicLockBanner.tsx` | NEW, rendered inside `publicHeader` |

### How 3b composes without dropping the workspace (closes T3 OQ-1)

The apparent conflict — "verdict first" vs "the shipped page mounts the whole
owner workspace with Thread/Split/Tree/Map" — dissolves once the design's own
reading order is read literally
(`design-document-text.txt:436-475`):

```
Should remote-first companies pay engineers the same salary…
🔒 Public view · actions locked
Thread   Split   Tree   Map        ☾          <- view toggles come FIRST
CONTESTED · verdict-thresholds v3 · Details ▾ <- verdict block
…verdict paragraph, caveat, metric line…
↑ THE CASE FOR · 3      3 · THE CASE AGAINST ↓ <- strongest cases AFTER verdict
🔒 Viewing publicly — sign in to challenge…  ·  Unlock actions
```

The toggles are **above** the verdict in the design itself. "Verdict-first"
therefore means *verdict precedes the strongest-case pair*, which is exactly
what T3 R6 says ("before or above the strongest-case pair"). There is no
conflict to resolve and nothing to drop.

`DebatePageClient` already renders `{publicMode && publicHeader ? publicHeader : null}`
directly after the top bar and before `debateMain`. So the composition is:

```
debateTopBar  (title, view toggles, ☾)      <- existing, +ModeToggle
publicHeader:                                <- existing slot, new contents
   PublicLockBanner        data-public-locked="true"
   PublicVerdictBlock      data-verdict-block
   PublicStrongestCases    data-strongest-case
debateMain    (Thread/Split/Tree/Map)        <- existing, untouched
```

R5 ("do not regress to an answer-only page that drops tree/views") is satisfied
because nothing below `publicHeader` changes. The existing `<details className="publicationDetails">`
contents — pseudonym, badges, residual objections, reversal point — are kept
and moved **below** the strongest-case pair, since the design gives them no
position and dropping them would lose the only public home they have.

## T1 — Debate tree canvas

| Design | Target | Kind |
|---|---|---|
| T1-S1 chrome, `Thread`/`Split`/`Tree`/`Map`, `Scoring · n/m`, ☾ | `apps/ui/app/debate/[id]/DebatePageClient.tsx` `debateTopBar` | STRUCTURAL (☾ only — the four labels already exist verbatim) |
| T1-S2 `Show set-aside paths` | `apps/ui/components/DebateCanvas.tsx` | RE-SKIN (string already exists) |
| T1-S3 root claim card | `DebateCanvas.tsx` root branch | STRUCTURAL (`data-bezel`, `data-stance="root"`) |
| T1-S4 argument card: stance tab, type chip, model line, BASE/FINAL, `↻ Regenerate`, `Details ▸` | `DebateCanvas.tsx` card branch; badges via `ScoreBadges`/`V3ScoreBadges` | STRUCTURAL |
| T1-S5 stance-coloured connectors | `apps/ui/lib/debatePresentation.ts` `ROLE_PALETTES` + the `<path>` in `DebateCanvas.tsx` `canvasLinks` | RE-SKIN + one attribute |
| T1-S6 synthesis strip | `apps/ui/components/SynthesisPanel.tsx` | RE-SKIN |
| T1-S7 scoring footer | `DebatePageClient.tsx` `topSwitch` | RE-SKIN |
| T1-S8 tokens/mode | `globals.css` | RE-SKIN |

**Already true, do not rebuild:** the literal strings `Thread`, `Split`, `Tree`,
`Map` (`DebatePageClient.tsx`), `Show set-aside paths` and `↻ Regenerate`
(`DebateCanvas.tsx`); the connector `<path stroke={c.color}>` in the
`canvasLinks` SVG; and `ROLE_PALETTES` in `debatePresentation.ts`, which already
maps pro/con to `var(--pro-line)` / `var(--con-line)`. T1 R4 is therefore a
**token redefinition plus one `data-connector-stance` attribute**, not new
rendering code.

## T5 — Node detail drawer

`apps/ui/components/NodeDetailDrawer.tsx` (24.6 KB) already carries every datum
T5 needs. The slice is a **label retitle + section reorder + re-skin**, with one
genuinely new binding line.

| Design label | Present today as | Kind |
|---|---|---|
| `WAY OF KNOWING · …` | `way of knowing` (lowercase, in the V3 honesty list) | STRUCTURAL (retitle + promote out of the list) |
| `BASE SCORE` / `FINAL STRENGTH` with source suffix | score rows | STRUCTURAL (retitle) |
| `REPLAY` | replay handle | STRUCTURAL (retitle) |
| `RESTATEMENT` | `stranger restatement` | STRUCTURAL (retitle) |
| `DEFEATERS` | `defeaters` | STRUCTURAL (retitle) |
| `JUDGE DISAGREEMENT` | `judge disagreement` | STRUCTURAL (retitle) |
| `REVIEW AGREED BY:` / `REVIEW DISPUTED BY:` + reviewer model line | `second-maker review`, already carrying `data-node-review={v3.review?.outcome ?? "absent"}` | STRUCTURAL — the binding copy is new, the data and the typed-absence marker are not |
| condition-mark chips | present | RE-SKIN |
| `GENERATION HISTORY`, `Compare versions`, `ACTIVE` / `ARCHIVED` | `drawerHistoryHead`, `Compare versions` present; `ACTIVE`/`ARCHIVED` **absent** | STRUCTURAL (add the two state labels) |
| `⚐ Challenge` / `↻ Regenerate`, locked in publicMode | present, already publicMode-aware | RE-SKIN |

`data-node-review` is the key already in the file: `"absent"` is exactly T5
R3's typed absence, so `T5-C1-4` ("no fabricated review line") asserts
`data-node-review="absent"` **and** the two labels being absent — two
independent signals, so a coder cannot satisfy it by deleting the attribute.

**Field order (closes T5 OQ-1):** ship the design's vertical order —
header → claim body → way of knowing → review verdict → scores → replay →
restatement → defeaters → judge disagreement → condition marks → actions →
generation history. No accessibility constraint forces a different order: the
drawer is a single `role="dialog"` with a linear reading order, and the design's
order is already most-important-first.

## T4 — New debate

`apps/ui/app/new/page.tsx` (372 lines) + `apps/ui/app/new/defaults.tsx`.

| Design | Target | Kind |
|---|---|---|
| T4-S2 `NEW QUESTION` / `What should we debate?` / textarea | `new/page.tsx` form head | STRUCTURAL (copy) |
| T4-S3/S4/S5 risk tier, composition budget, tree depth | existing controls in `new/page.tsx` | RE-SKIN + label copy |
| T4-S6 steering menu + annotations | existing | RE-SKIN |
| T4-S7 provenance note | existing tier-source line | RE-SKIN |
| T4-S8 options panel, V2-only, "not sent" | `.optionsToggle` block — **class name frozen** (`ux01-new-debate-form.test.tsx` pins `class="optionsToggle"` with `aria-expanded="false"`) | STRUCTURAL (copy + `data-v2-only`) |
| T4-S9 `Start run →` / `Cancel` / `⌃↵ to start` | existing submit row | STRUCTURAL (copy) |
| chrome + ☾ | `TopBar.tsx` | shared |

The V2-not-sent guard (R4) is a **payload** assertion, not a copy assertion:
mark each V2 control `data-v2-only="true"`, and assert the submitted V3
create payload's key set contains none of them. `tests/unit/v2ui-pages.test.ts`
already guards the neighbouring invariant (risk/budget/depth stay asker-facing
while machine-owned values are derived) by reading page source — so T4 must not
restructure `new/page.tsx` beyond copy and wrappers without re-running that file.

## T6 — Settings

`apps/ui/app/settings/page.tsx` + `SessionControls.tsx`,
`LegacyRunClaimControls.tsx`, `AccountErasureControls.tsx`.

| Design | Target | Kind |
|---|---|---|
| T6-S2 `IDENTITY` / `Your asker scope` / ASKER / SCOPE / HttpOnly+MFA line | `settings/page.tsx` | STRUCTURAL (copy) |
| T6-S3 sessions, Current/Other, Revoke, `Revoke all sessions`, `Sign out` | `SessionControls.tsx` — pins `Active sessions`, `Current session` (`s5-session-controls.test.tsx`) | RE-SKIN + additive copy |
| T6-S4 fresh authentication | `SessionControls.tsx` step-up | RE-SKIN |
| T6-S5 legacy claim + not-saved copy | `LegacyRunClaimControls.tsx` | RE-SKIN |
| T6-S6 seven-day deletion + typed `DELETE MY ACCOUNT` | `AccountErasureControls.tsx` | RE-SKIN |

Every security behaviour here is out of contract (T6 NON-goals). This slice
changes presentation and copy only; `tests/unit/s10-erasure-ui.test.ts` reads
`apps/ui/lib/api.js` as source and must stay green untouched.

## T7 — Sign in, two-step, fleet

| Design | Target | Kind |
|---|---|---|
| T7-S1 `WELCOME BACK` / `Back to the graph.` / policy line / rule marks | `apps/ui/components/LoginFlow.tsx` + `AuthShell.tsx` | STRUCTURAL (copy) |
| T7-S2 `TWO-STEP VERIFICATION`, 6-digit, `Use a recovery code`, `← Back to sign in` | `LoginFlow.tsx` second step | STRUCTURAL (copy) |
| T7-S3 fleet stub | `apps/ui/app/admin/workers/page.tsx` | STRUCTURAL (copy) |
| ☾ on auth shell | `TopBar.tsx` `authTopBar` branch | shared |

**Closes T7 OQ-2 (fleet route ownership).** The route already exists and is
already honest: `apps/ui/app/admin/workers/page.tsx` renders
`Operator-only view` and *"Fleet status is unavailable in the ordinary asker
interface. This page does not request deployment state or infer worker counts
from a refused operator response."* It is reachable by an ordinary asker at
`/admin/workers` by direct URL, has no `AuthGate`, and issues no privileged
request. So: the ARCH-named ordinary-asker fleet entry is **`/admin/workers`**,
T7-C3's "required fixture" is that route, and the only change is aligning the
first sentence to the SPEC's binding string
`Deployment state is unavailable in the ordinary asker interface.` No new route
is invented and no privileged API is added — which is what T7 R5 forbids.

`Back to the graph.` is **already** asserted by
`tests/render/auth-flow-integration.test.tsx` and
`tests/render/web-auth-login.test.tsx`; those pins are already on the NEW
string and stay green.

## T8 — Sign up, MFA enrolment, recovery

| Design | Target | Kind |
|---|---|---|
| T8-S1 `CREATE AN ACCOUNT` / `Put a claim on the graph.` / fields / age affirmation | `apps/ui/components/SignUpFlow.tsx` + `AuthShell.tsx` | STRUCTURAL (copy) |
| T8-S2/S3/S4 three-step mandatory MFA | `apps/ui/app/enroll-mfa/page.tsx` (251 lines) | STRUCTURAL (copy + step chrome) |
| T8-S5 recovery replacement gate | `LoginFlow.tsx` replacement-code branch + `lib/authNavigationGuard.ts` | RE-SKIN |
| ☾ | `TopBar.tsx` `authTopBar` | shared |

`apps/ui/app/verify-email/page.tsx` is `export { default } from "../enroll-mfa/page"` —
a deliberate canonical alias asserted by
`tests/render/web-auth-enrollment.test.tsx` and
`tests/architecture/auth-front-door-parity.test.ts`. **Do not inline it.**
Both files must still see that exact re-export line after T8.

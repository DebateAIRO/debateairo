# REQ-01 — READY FOR PEER REVIEW (mission `consent-ui`, ticket `t_5916299b`)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-requirements, superpowers:brainstorming`

Those four, in the order COMMON §1 states, and no others. **Honest shortfall, declared rather
than hidden:** `superpowers:brainstorming`'s hard gate is "present the design to your human
partner and wait for an explicit yes." This seat has no human partner in session and the
packet forbids asking V ("Take your pick as the SPEC default; do not ask V"). I discharged the
gate through the artefacts the packet does provide — the six-row contested-decisions table,
the blind REQ-REV-01 review, and SPEC freezing — and I classified the work **architectural**
(new subsystem: a consent state machine, a storage contract, an app-wide mount, a cross-slice
component interface), which is why every rejected alternative is recorded in DECISIONS rather
than discarded silently. Recommendation for COMMON in the self-report §3.3.

Seat: REQ-01 · role requirements · model `claude-opus-5[1m]` · main tree `2b670d30`, 90 dirty
entries · **no git writes, no code, no CSS, no test changes.**

---

## 1. INSTRUCTIONS.md line count

**92 lines** (`wc -l docs/missions/consent-ui/INSTRUCTIONS.md`) — under the hard cap of 100.

## 2. Slices, with requirement counts

| Code | Name | Requirements | "Fully done" gate |
|---|---|---|---|
| S01 | Cookie consent — bar (10a), preferences card (10b), persistence, Settings re-entry | **29** (`S01-R01`…`S01-R29`, contiguous) | every cluster GREEN on the worst of three runs · every per-cluster review PASS or closed · `slice/consent-s01` committed · 18 numbered V-acceptance steps runnable in the dev stack |
| S02 | Sign-up privacy gate — checkbox group (8a), policy modal (10c), both-boxes gating | **24** (`S02-R01`…`S02-R24`, contiguous) | same bar · 14 numbered V-acceptance steps |

## 3. SPEC ↔ PLAN-scaffold trace row counts (equal per slice)

| Slice | SPEC requirements | PLAN trace rows | Verdict |
|---|---|---|---|
| S01 | 29 | 29 | **MATCH** |
| S02 | 24 | 24 | **MATCH** |

Counted mechanically: `grep -cE "^\*\*S0n-R[0-9]{2} " SPEC.md` against
`grep -cE "^\| S0n-R[0-9]{2} " PLAN.md`. Every requirement has a trace row; every trace row's
step and cluster column is **deliberately empty** — those are the architecture seat's.

## 4. The S01 ↔ S02 modal interface sentence, quoted from both

**`slices/S01/SPEC.md` S01-R20:**

> `PrivacyPolicyModal` is a client component at `apps/ui/components/consent/PrivacyPolicyModal.tsx`
> whose props are exactly `{ open: boolean; mode: "read" | "consent"; onClose: () => void;
> onAcknowledge?: () => void }`. It renders `null` when `open` is `false`. It owns no consent
> state and reads or writes no storage. It calls `onAcknowledge` only from the `I have read it`
> button and only when `mode` is `"consent"`. When `mode` is `"read"` it renders no
> `I have read it` button, applies no scroll-to-end gate, and never calls `onAcknowledge`.

**`slices/S02/SPEC.md` S02-R14:**

> `PrivacyPolicyModal` is a client component at `apps/ui/components/consent/PrivacyPolicyModal.tsx`
> whose props are exactly `{ open: boolean; mode: "read" | "consent"; onClose: () => void;
> onAcknowledge?: () => void }`. It renders `null` when `open` is `false`. It owns no consent
> state and reads or writes no storage. It calls `onAcknowledge` only from the `I have read it`
> button and only when `mode` is `"consent"`. When `mode` is `"read"` it renders no
> `I have read it` button, applies no scroll-to-end gate, and never calls `onAcknowledge`.

Verified **byte-identical** by `diff` on the two extracted blocks (6 lines each), re-run after
every later edit. Both SPECs state that neither slice may change it alone.

## 5. Contested decisions — 6 rows

`docs/missions/consent-ui/requirements/contested-decisions.md`. Each carries VERDICT /
CONFIDENCE / STRONGEST COUNTER, and **each pick is already the SPEC default**, so a late V "no"
costs a rework round, never a re-plan. None blocks a slice.

| Id | Subject | Pick | Confidence |
|---|---|---|---|
| Q7-01 | The card names five cookies that do not exist | verbatim now, contained as data; **recommend V rule (b), correct them** | medium-high |
| Q7-02 | How the preferences card opens | centred dialog on the shared scrim | high |
| Q7-03 | No `×` on the preferences card (as designed) | keep the design | medium |
| Q7-04 | `Close` — the one string added beyond the design | add it | high vs (c), medium vs (b) |
| Q7-05 | Settings Privacy panel copy (no design source) | REQ-01's three strings | high / medium |
| Q7-06 | Does the bar appear on the debate canvas? | every route | medium-high |

**Q7-01 is the one row I ask the orchestrator to put to V early**, because it is the only row
whose shipped default states something untrue to a user, in a GDPR surface.

## 6. Contradictions found — zero remaining; three were found and closed

Charge Q8 ran mechanically over my own output. Target was zero; **three real defects were
found in my own draft and all three are closed.** Both sides quoted:

1. **S01's required modal interface vs S02's declaration.** My first S01 draft cited the
   interface as "R17" while the requirement actually landed at R20, and S02's interface
   paragraph had not yet been written to match. **Closed:** the cross-reference now reads
   S01-R20 ↔ S02-R14 in both files, and the paragraphs are byte-identical (§4 above).
2. **A layering collision I had decided but never stated.** S01-R08 puts the bar at
   `--z-consent-bar: 45`; `.tokenDock` is `position: fixed; bottom: 18px; z-index: 40`
   (`apps/ui/app/globals.css:3396-3403`). The bar therefore covers it on the owner debate
   route, and no requirement said so. **Closed:** added **S01-R29**, with the measurement that
   makes it harmless — `.tokenDock` holds exactly one non-interactive status pill
   (`apps/ui/app/debate/[id]/DebatePageClient.tsx:1525-1529`), so no control is blocked.
3. **Two verification hooks asserted a false green.** S01-R24 and S01-R25 said
   `tests/unit/t9-mode-tokens.test.ts` "passes". `BASELINE.md` — written by the orchestrator at
   17:35, after my draft — records it **red at base**: exit 1, `Tests 2 failed | 6 passed (8)`,
   one failure being the colour-literal test itself. **Closed:** both hooks now state the
   DELTA (inventory test GREEN; failure set unchanged at exactly two; literal hit list
   unchanged at exactly one line), and `BASELINE.md` is named as the authority in both SPECs
   and both PLANs.

**Both SPEC edits are declared, not buried** — see §8. Banned-word scan across every file I
wrote: the only hits are the law quoting its own banned list (`INSTRUCTIONS.md:82`, both
PLANs' quantifiability sections). No criterion uses one.

## 7. Packet defects in THIS packet (REQ-01.md)

1. **§3 Q2 offers a three-way choice that its own later bullet has already narrowed to one.**
   The 10b presentation is offered as "replacing the bar, centred on the same scrim used by
   10c, or growing in place — decide one", but the Settings re-entry bullet in the same charge
   requires the same card to open where **there is no bar** to replace or grow from. Two of the
   three options silently require a second layout the packet never asks for. **Fix:** a packet
   that offers a menu should state the constraint that narrows it.
2. **§2 item 3 cites product files by bare path for some facts and by `path:line` for others.**
   The cited ones cost a `sed -n`; the uncited ones cost a whole file read
   (`settings/page.tsx`, 245 lines, for three of them). The orchestrator already knows these
   ranges — the intake record quotes them. **Fix:** line ranges on every pointer.
3. **§2 item 4 names four test files as pins but gives none of their measured state** — and two
   of the four are RED at base. This is the defect that produced contradiction 3 above.
   **Fix, and the highest-leverage item in my self-report:** measure `BASELINE.md` **before**
   dispatching the requirements seat, or, if they must overlap, tell the seat so in one
   sentence and name the file to re-read before handoff.
4. **§3 Q2 demands a breakpoint "the design does not show" and §4 bans unquantified criteria,
   but says nothing about whether a derived number beats a conventional one.** I derived 720px
   from measured content widths rather than reaching for 768. **Fix:** one line in COMMON §4 —
   "a pinned number carries its derivation in the same sentence."
5. **The mandated `superpowers:brainstorming` floor has a human-approval gate that a fleet seat
   cannot satisfy, and nothing says how to discharge it.** I had to invent the resolution
   (§ opening). **Fix:** resolve it once in COMMON §1 for every requirements and architecture
   seat in every future mission.

**Commendation, because it earned one:** charge Q8 is the reason all three defects above were
caught before handoff rather than by a coding seat mid-slice. A self-contradiction charge
should be standing in every multi-artifact packet.

## 8. Two edits made to a FROZEN SPEC — declared for the reviewer

Both before handoff, with no seat having consumed the files, both recorded in
`slices/S01/DECISIONS.md`:

- **Additive:** S01-R29 (contradiction 2). No existing requirement's text changed. Charge Q8 is
  an order to check my own output, which I take to be part of creation.
- **Text-changing:** the hooks of S01-R24 and S01-R25 (contradiction 3). A hook asserting a
  falsehood, frozen into a document a coding seat must obey, is worse than a hook corrected
  fifteen minutes after it was written. If the reviewer disagrees, the remedy is a SPEC-v2
  header and I would not contest it.

**Underlying gap:** "FROZEN at creation" never defines *when creation ends*. I recommend it be
defined as **the handoff marker** — one sentence in COMMON §4 that removes this judgement call
from every future requirements seat.

## 9. Findings handed to the orchestrator (measured, with commands and receipts)

1. **The design names five cookies that do not exist.** `grep de_session|de_mfa|de_device|de_quality|de_analytics`
   over `apps packages tests migrations` → **0 hits**. Real cookies: `__Host-debateai-session`,
   `__Host-debateai-csrf` (`apps/api/src/index.ts:169-170`). Contested row Q7-01.
   *(Adopted by the orchestrator into `BASELINE.md` during my run.)*
2. **`tests/architecture/auth-front-door-parity.test.ts` is RED at base.**
   `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts` → **exit 1,
   `Tests 2 failed (2)`**, both ENOENT on `web/package.json` and `web/components/LoginFlow.tsx`;
   `git ls-files web/` → `web/next.config.mjs` only. Its `terms` ban at `:86` is therefore
   currently unenforceable. *(Adopted into `BASELINE.md`.)*
3. **A live guard nobody had named constrains S02's copy.**
   `pnpm exec vitest run tests/unit/v2ui-node-runner.test.ts` → **exit 0, `Tests 2 passed (2)`**;
   it runs `apps/ui/components/authRoutes.source-test.mjs:48`, banning
   `/localStorage|sessionStorage|Bearer|Google|Model API|terms|privacy notice/i` in
   `SignUpFlow.tsx`, and `:165` pinning the sign-up `<form>` count at 3. *(Adopted into
   `BASELINE.md`.)*
4. **NEW — systemic accessibility finding, not yet ticketed.** Seven overlay components declare
   `role="dialog" aria-modal` and **none** implements modal semantics. Verified by grep over
   `apps/ui/**/*.ts,*.tsx`: `createPortal` 0, `Escape` 0, `focusTrap` 0, `.focus()` 0,
   `document.body` 0, `addEventListener("keydown"` 0. Exemplar:
   `apps/ui/components/GuideModal.tsx:32-45`. Both my slices must build this machinery from
   scratch; **ARCH should site ONE shared helper** so it is not written twice, and a separate
   ticket should retrofit the seven existing overlays. `aria-modal="true"` is currently a false
   promise on seven surfaces.
5. **Token additions are single-writer, mechanically.** `tests/unit/t9-mode-tokens.test.ts:380-383`
   asserts EXACT set equality between the tokens declared in `:root` / the chamber block and
   `Object.keys(TERRACOTTA) ∪ Object.keys(MODE_INDEPENDENT)` / `Object.keys(CHAMBER)`. Two lanes
   adding tokens would conflict on every addition, so **S01 owns both token blocks and that
   test file; S02 adds no token** and consumes the five S01 declares for it.

## 10. Paths written

| Path | What |
|---|---|
| `docs/missions/consent-ui/INSTRUCTIONS.md` | mission compass, 92 lines |
| `docs/missions/consent-ui/slices/S01/SPEC.md` | FROZEN, 29 requirements, 18 V-acceptance steps |
| `docs/missions/consent-ui/slices/S01/PLAN.md` | scaffold, 29 trace rows, empty step column |
| `docs/missions/consent-ui/slices/S01/PROGRESS.md` | skeleton, orchestrator is sole writer |
| `docs/missions/consent-ui/slices/S01/DECISIONS.md` | 5 inherited + 22 REQ-01 decisions |
| `docs/missions/consent-ui/slices/S02/SPEC.md` | FROZEN, 24 requirements, 14 V-acceptance steps |
| `docs/missions/consent-ui/slices/S02/PLAN.md` | scaffold, 24 trace rows, empty step column |
| `docs/missions/consent-ui/slices/S02/PROGRESS.md` | skeleton, orchestrator is sole writer |
| `docs/missions/consent-ui/slices/S02/DECISIONS.md` | 8 inherited + 16 REQ-01 decisions |
| `docs/missions/consent-ui/requirements/contested-decisions.md` | 6 rows for V |
| `docs/missions/consent-ui/requirements/REQ-01-handoff.md` | this file |
| `.hermes/reports/consent-ui/agent-reports/REQ-01.md` | self-report, 306 lines, filed before this handoff |
| `.hermes/TOOLING-TRAPS.md` | appended 6 traps (append-only, nothing else touched) |

Nothing outside the packet's `allowed` list was written.

## 11. Sub-delegation receipts

Two read-only `Explore` children (COMMON §3 permits 3), **both wrote nothing**:

1. *Stacking and overlay survey* — the `--z-*` inventory, the 16 raw `z-index` declarations,
   the seven overlay components and their pattern, the full `.auth*` vocabulary, the root
   layout's render order, the four `prefers-reduced-motion` blocks, and the six negative greps.
2. *Test-surface survey* — every reference to the sign-up checkbox, the structure of
   `auth-flow-integration.test.tsx`, the token test's map names and comparison semantics, the
   root-layout constraints, the two source guards, and the `localStorage` hygiene of the suite.

**Every claim of theirs that entered an artifact was re-verified by me at `path:line` before
use** — including re-running all six negative greps myself, and running the two vitest suites
rather than accepting either child's inference. Three of their findings changed the SPECs
materially (the `terms`/`privacy notice` ban, the `appShell > TopBar` direct-child shape, and
the exact-arity `toHaveBeenCalledWith`). One child flagged the parity suite as *probably* red
and explicitly asked me to confirm before freezing; I confirmed it by running it, which is why
finding 2 above is a measurement and not a guess.

---

**comments read through: 2**

---

## SUPERSEDED — read `REQ-01-rework-r1-handoff.md` instead (appended 2026-09-06 by REQ-01, rework round 1)

This handoff records the state at `READY FOR PEER REVIEW`. It was reviewed by REQ-REV-01
(`docs/missions/consent-ui/reviews/REQ-REV-01.md`, verdict **REWORK**), and both SPECs have
since been superseded by v2. **Nothing above this line has been altered** — it is the record
the review audited. Two corrections a later reader must carry:

1. **§9 finding 5 cites `tests/unit/t9-mode-tokens.test.ts:380-383` for the set-equality
   assertion (REQ-REV-01 N2). The assertion is at `:376-377`;** its expected lists are built at
   `:371-372`, and `:379-384` is the separate raw VALUE loop. The finding's substance — token
   additions are single-writer — is correct and unchanged.
2. **§10's paths now point at v2.** `slices/S01/SPEC.md` and `slices/S02/SPEC.md` are v2 with
   supersession headers; the frozen v1 files are archived as `SPEC-v1.md` beside each.

Current handoff: `docs/missions/consent-ui/requirements/REQ-01-rework-r1-handoff.md`.

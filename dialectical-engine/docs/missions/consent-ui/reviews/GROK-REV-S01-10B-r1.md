# GROK-REV-S01-10B r1 — finished-UI-element review of the cookie PREFERENCES CARD (design 10b) + Settings → Privacy re-entry

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, grok-heartbeat-adapter, superpowers:verification-before-completion, superpowers:systematic-debugging`

`superpowers:receiving-code-review` — not loaded this session — not needed because no finding of mine is contested (COMMON §10.9).

**Verdict: PASS**

**Seat:** GROK-REV-S01-10B · reviewer · grok-4.6 · ticket `t_41da6951` · slice ticket `t_26efb70d` · round 1 of max 3
**Work under review:** S01-10B cookie preferences card (turn 10b) with Settings → Privacy re-entry, at detached `4cc0f4b6` (`slice/consent-s02`; S01 @ `4ddc350c` is an ancestor). CLAIM HEAD dirty count: 0.
**Probes:** `.hermes/reports/consent-ui/probes/GROK-REV-S01-10B-r1-*`

**Findings:** 0 blocking · 4 non-blocking (N1–N4, all packet/SPEC/harness — none against the shipped 10b surface).

---

## 1. Packet review (`heartbeat-reviewer` §1)

| Packet constant | Measured | |
|---|---|---|
| worktree detached @ `4cc0f4b6` | `git rev-parse --short HEAD` = `4cc0f4b6`; `slice/consent-s02` resolves to the same SHA | ✓ |
| S01 merged @ `4ddc350c` | `4ddc350c` = `docs(consent-ui): index ADR-0021 and ADR-0022 in the ADR README`; ancestor of HEAD | ✓ |
| `min(520px, calc(100vw - 32px))` | `globals.css:7398` | ✓ |
| `--shadow-knob` | `:59` declared `0 1px 3px rgba(0,0,0,.3)`; `.consentKnob` uses it at `:7541` | ✓ (SPEC R24 still says ten tokens — N3) |
| colour-literal pin | exactly one hit, `globals.css:6116` `.drawerScrim[data-drawer-scrim] { background: color-mix(in srgb, #0a0806 32%, transparent); }` | ✓ |
| glob `CODE-REV-S01-10B-*.md` | **0 files** | **N1** |
| `allowed` vs deliverables | verdict, self-report, TRAPS append, probes dir, comments on `t_41da6951` and `t_26efb70d` — all present | ✓ |

**N1 — PACKET.** The reading list names `docs/missions/consent-ui/reviews/CODE-REV-S01-10B-*.md`. That glob is empty. The per-cluster verdicts are `CODE-REV-S01-C*.md` and `CODE-REV-CROSS-*.md`. CLASS: COMMON §10.13 / the 10C seat's TRAPS `:2995`. A seat that `ls`s the glob and stops skips process evidence. **REMEDY BINDING (measured: `ls docs/missions/consent-ui/reviews/CODE-REV-S01-10B-*` → no matches):** produce the glob from `ls` at dispatch. Ticket: orchestrator packet-hygiene, same day.

Author's `SKILLS LOADED` vs worker floor: first-round `CODE-S01-C{1C2,3C4,C5,C6,C7}.md` self-reports on disk do **not** open with the line (C7 discusses it at `:217` without emitting it). `CODE-S01-C6-rework-r1.md` does emit the full worker floor. Cluster reviewers claimed the ticket handoff line; I did not dump every coding ticket. **UNVERIFIED on the board; the on-disk self-reports are the sample.**

---

## 2. What I verified, and how

### 2.1 Cluster commands ×3 (worst run is the verdict)

PLAN `CMD-C1`…`CMD-C7` from `/bin/bash`. Two tables:

**Harness default (`FORCE_COLOR` set):** every command `verdict=1`, `tsc ran: 0`, vitest/hit-list/file-count arms green. Cause: pnpm prints `\x1b[2m$ tsc --noEmit\x1b[22m` so `n_tcran` is 0. **N2.**

**Control (`env -u FORCE_COLOR NO_COLOR=1`):** every command `verdict=0` on all three runs. Log: `.hermes/reports/consent-ui/probes/GROK-REV-S01-10B-r1-cmd-nocolor.log`.

| CMD | worst of 3 (no FORCE_COLOR) | vitest summary (identical ×3) |
|---|---|---|
| C1 | 0 | `Tests  2 failed \| 7 passed (9)`; hit-list 1; pinned `.drawerScrim` 1; inventory green |
| C2 | 0 | `Tests  6 passed (6)` / `Test Files  1 passed (1)`; ADR Status:Proposed 1 |
| C3 | 0 | `Tests  7 passed (7)` / files 1; t9 failures 2; S01 blocks 1 |
| C4 | 0 | `Tests  11 passed (11)` / files 1 |
| C5 | 0 | `Tests  4 failed \| 58 passed (62)`; unpinned failures 0; guarded-green 2; consent-mount fail 0; Test Files `(3)` |
| C6 | 0 | `Tests  14 passed (14)` / files 1; `n_s02c=0` (vacuous: `slice/consent-s02` === HEAD — N4) |
| C7 | 0 | `Tests  76 passed (76)` / `Test Files  6 passed (6)` |

`pnpm typecheck`: exit 1, **0 diagnostics outside** `tests/unit/s14-ui.test.ts`. `cd apps/ui && npx tsc --noEmit -p tsconfig.json`: exit 0.
Consent SET: `Test Files  17 passed (17)` / `Tests  197 passed (197)` (BASELINE last confirmed 195 at `4ef2f7d3`; CROSS-03 rework added cases).

**N2 — HARNESS / PLAN.** `n_tcran` is ANSI-fragile under this Grok tool shell. CLASS: COMMON §10.16 arriving through colour. Reproduced independently of GROK-REV-S01-10A (TRAPS `:2965`). **REMEDY BINDING (measured: hexdump + `env -u FORCE_COLOR` flips 1→0):** cluster commands for Grok seats wrap `pnpm typecheck` with `env -u FORCE_COLOR`. Ticket: orchestrator / TRAPS (already appended as a cross-reference).

**N4 — PLAN at this HEAD.** `CMD-C6`'s `slice/consent-s02..HEAD` arm is vacuous because the ref **is** HEAD. TOOLING-TRAPS `:2871`. The working-tree arm (`git diff --stat HEAD` empty) still means something. Not a product defect.

### 2.2 Design fidelity (own jsdom document + real `globals.css` as `<style>`)

Independent kit, not the author's tests. `Tests  30 passed (30)` after fixture corrections (first run 4 failed were probe defects: rgb-vs-hex, jsdom `var()` hole, Settings opener not focused before click, scroll metrics stubbed too late).

Copy, byte-exact against SPEC §Copy / `COOKIE_CATEGORIES` / `design-data.js:87-91`: eyebrow `CHOOSE WHAT TO STORE`, title `Cookie preferences`, lede with U+2192, twelve category strings, footer `Privacy notice` · `Essential only` · `Save choices` in that order. No category string inlined in `CookiePreferencesCard.tsx`.

Structure: scrim → bezel `.consentCard` → `.consentCardCore` → gold tab; three rows; Essential `aria-checked=true` `aria-disabled=true`; no `×`; `role="dialog"` `aria-modal="true"` `aria-labelledby`. Source-text: `width: min(520px, calc(100vw - 32px))`; `--shadow-knob`; bar hover `scale(1.04)` + reduced-motion counterpart.

Tokens: `getPropertyValue` on `:root` / `html[data-mode=chamber]` matches COMMON §7 declared strings in both modes (`--shell` `#EFE9E0` / `#221D17`, `--scrim` `rgba(10,8,6,.42)`, etc.). Used `backgroundColor` of mounted nodes is `rgba(0,0,0,0)` — jsdom does not substitute `var()` (TRAPS append). `getPropertyValue("background")` still contains `var(--shell)` / `var(--core)` / `var(--scrim)` / `var(--gold)`.

Settings panel: heading `Privacy`, hint from SPEC, button `Cookie preferences` with `.setBtn`, mounted from `settings/page.tsx:79`.

Privacy notice → 10c read mode: 11 `POLICY_SECTIONS`, 8 `POLICY_JUMP` pills, end marker `END OF POLICY · GDPR (EU) 2016/679 · v2.1`, **no** `Download PDF`, **no** `I have read it`, a `Close` button.

**N3 — SPEC stale.** S01-R24 still says "exactly these ten tokens"; the shipped tree has `--shadow-knob` as an eleventh MODE_INDEPENDENT token (CODE-REV-S01-C3C4 r1 N3, design `box-shadow:0 1px 3px rgba(0,0,0,.3)`). The packet quoted the shipped name. Not a product defect — the card matches the artboard. **REMEDY ADVISORY:** SPEC-v4 or a DECISIONS row the next Grok packet quotes. Ticket: docs hygiene, same day.

### 2.3 Behaviour, adversarially (own probes)

Clear storage → bar; `Accept all` writes `{v:1,essential:true,quality:true,analytics:true,decidedAt:ISO}`; second visit silent; `v:0` re-asks; `Essential only` from bar and card write the same booleans; `Save choices` writes current toggles.

Toggles: Essential ignores click / Space / Enter; quality and analytics answer click AND Space (handler pin — jsdom does not activate Space natively).

Esc on bar writes nothing. Esc from first-visit card restores the bar. Esc from Settings with a valid record → Silent. Esc from Settings with nothing stored → bar (B1 pin). Backdrop click dismisses without writing. Card remounts fresh per open (stale `initial` cannot survive). Initial focus on Model quality telemetry.

Esc stack: one Esc over the policy leaves the card; a second closes the card.

Focus return: bar direction → `Choose what to store`; Settings direction → `Cookie preferences` (after `.focus()` on the opener — jsdom `click()` does not focus). Helper order is surviving-opener first (`modalSemantics.ts:276-282`).

Honesty: `analytics:true` appends no `<script>` and writes no `dataset`. Grep: no `Download PDF` under `apps/ui`; no `plausible|gtag|googletagmanager|mixpanel|posthog` under consent files. Cookie-name copy lives only in `COOKIE_CATEGORIES` (contested Q7-01, pinned verbatim).

S02 sibling (packet probe 3): unchecked box AND `Privacy Policy` link open the modal without ticking; `×` / Esc / backdrop leave it unchecked; `I have read it` disabled until scroll metrics reach the SPEC formula (`SCROLL_SLACK=8`), then acknowledge ticks the box; submit with only the adult box does not call `register`; both boxes → `register("a@b.co","Abcdef1!","c@d.co",true)` — four arguments, no privacy field.

### 2.4 Process evidence

PROGRESS.md last orchestrator line: S01 element gates launched on `4cc0f4b6`. Cluster reviews: S01 C1–C7 PASS (C6 at r2); CROSS-01/02/03 PASS (CROSS-03 at r2). Three-run tables in those verdicts re-ran here as CMD-C1…C7 ×3 (control table above). Per-cluster N-findings were routed to later clusters or tickets in their own §7 tables (sampled C1C2 N1–N5, C5 N1–N3, C6 r1 B1 discharged at r2). I did not re-open every historical ticket.

---

## 3. What I could NOT verify (jsdom / V)

- Used geometry: 520px card width, `min(520px, 100vw - 32px)` as laid-out pixels, `max-height: 92vh`, 38×22 toggle, 16px knob, 7px bezel padding.
- Hover `scale(1.04)` and reduced-motion as painted motion (source-text only).
- Stacking: bar under drawer, policy over card, toast above (`--z-*` declared; no layout).
- Live Terracotta ↔ Chamber restyle of *used* colours (custom properties flip; `backgroundColor` stays transparent in jsdom).
- Real-browser Space/Enter activation of a `<button role="switch">` (pinned on the keydown handler).
- V acceptance steps 1–18 in `https://localhost:3000` both modes, including signed-in Settings and the node-drawer stacking step.
- Every historical N-finding's board ticket still open/closed.

---

## 4. Findings

**B:** none.

**N1** packet glob `CODE-REV-S01-10B-*.md` → 0 files. Orchestrator packet-hygiene ticket, same day.

**N2** `n_tcran` ANSI-fragile under `FORCE_COLOR`. Cross-ref TRAPS `:2965`. Grok cluster commands must `env -u FORCE_COLOR`.

**N3** SPEC R24 "exactly ten tokens" vs shipped `--shadow-knob`. Docs: SPEC-v4 or DECISIONS. Product matches the artboard.

**N4** `CMD-C6` `n_s02c` vacuous at this HEAD. Already in TRAPS `:2871`. Do not read a 0 as "S01 never touched S02 after merge."

---

## 5. Predictions

I expect a parallel 10a lens (GROK-REV-S01-10A) to also hit N2 (`FORCE_COLOR` / `n_tcran`) and the empty glob class, and to pass the bar on copy + R04 writes. I expect a 10c lens to file the jsdom-zeros scroll-gate fixture as a probe defect rather than a product RED, and to confirm no `Download PDF`. I would check first whether anyone files the SPEC-ten-vs-`--shadow-knob` mismatch as blocking — it is not: the knob shadow is the artboard's `0 1px 3px`. I also expect a lens that reads `CMD-C6` at this HEAD without noticing the ref is HEAD to call the S02-untouched arm a real proof; it is vacuous.

**Blindness disclosure:** while measuring `t_26efb70d`'s cursor immediately before this post I saw the first 800 characters of comment 0 (`GROK-REV-S01-10A`, `Verdict: PASS`). All probes in §2 were already on disk and green (`Tests  30 passed (30)`, CMD-C1…C7 `verdict=0` ×3) before that read. I did not open the rest of that comment.

---

`comments read through: 1` on `t_26efb70d` (GROK-REV-S01-10A r1 head only, as disclosed); `comments read through: 2` on `t_41da6951` (ORCHESTRATOR dispatch + my CLAIM) — both computed with `show --json | python3 -c "…len(…['comments'])"` immediately before posting.

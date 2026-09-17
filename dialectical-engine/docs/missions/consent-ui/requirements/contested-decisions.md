# Contested decisions — mission `consent-ui` (REQ-01, 2026-09-06)

Things REQ-01 could not settle from the design, V's words, the intake rows or the product.
**Each pick is already the SPEC default and the slices build it** — a late "no" from V costs a
rework round, never a re-plan. REQ-01 did not ask V; the orchestrator routes these rows.

Every row carries `VERDICT / CONFIDENCE / STRONGEST COUNTER` per COMMON §4.

---

## Q7-01 — The cookie-preferences card names five cookies that do not exist

**Plain words.** The design's preferences card puts a small monospace line under each
category listing the cookies it covers: `de_session · de_mfa · de_device — 30 days`,
`de_quality — 90 days · first-party`, `de_analytics — 90 days · first-party`. **None of those
five cookies exists.** A grep for `de_session|de_mfa|de_device|de_quality|de_analytics` over
`apps packages tests migrations` returns zero hits. The product sets exactly two cookies:
`__Host-debateai-session` (`apps/api/src/index.ts:169`) and `__Host-debateai-csrf`
(`apps/api/src/index.ts:170`). The two optional categories store nothing at all today
(intake C10). So the card, which is a GDPR consent surface, would state five false facts
about what is on the reader's machine.

**Why it is contested and not simply decided.** Two binding instructions collide. The REQ-01
packet says to quote the design's copy VERBATIM — "every visible string, every tag label,
**every mono detail line**". COMMON §36 carries V's standing law that a UI never claims a
capability the product lacks, and intake C10 makes honesty this mission's theme. A
requirements seat does not overrule its packet on copy, so the SPEC pins the strings
verbatim and routes the conflict here.

| Option | What ships |
|---|---|
| **(a)** | The design's five names, verbatim (the current SPEC default). |
| **(b)** | Correct the lines to the truth: Essential → `__Host-debateai-session · __Host-debateai-csrf — session`; the two optional lines say the category is not in use yet. Every other string stays verbatim. |
| **(c)** | Ship (a) now, and open a follow-up ticket to rename the product's real cookies to the designed names, making the card true later. |

**VERDICT:** (a) ships today because the packet commands it, and the SPEC contains the
damage: the three detail strings are pinned as data in one exported constant
(`COOKIE_CATEGORIES` in `apps/ui/lib/consent.ts`, S01-R28), so **whichever option V rules is a
one-line data edit, not a component change.** REQ-01 recommends V choose **(b)**.
**CONFIDENCE: medium-high** that V prefers (b) — this is the one surface in the product where
a false statement is a regulatory problem rather than a cosmetic one.
**STRONGEST COUNTER:** V has twice deferred to the design over the product on copy (intake C1
and C7) and may reasonably say the design is the design of record and the cookie names are a
product-naming decision for later — which is option (c), and is coherent.

---

## Q7-02 — How the preferences card (10b) opens

**Plain words.** The design shows 10b as a standalone 520px card on its own artboard, with no
surrounding page. It never shows how it arrives on screen. The packet offered three: replace
the bar in place, centre it on the same dim overlay the policy modal uses, or grow it out of
the bar.

**Why it is contested.** The Settings re-entry (intake C5 / row V-4) eliminates two of the
three without saying so: in Settings there is no bar to replace and none to grow from, so
either of those would require a **second layout for the same card**. Choosing the scrim gives
one presentation for both entry points — but it does add a dim overlay the 10b artboard does
not show.

| Option | What ships |
|---|---|
| **(a)** | Centred dialog on the shared `--scrim`, bar hidden while it is open (the SPEC default). |
| **(b)** | Replaces the bar in place, plus a second centred layout for the Settings entry. |
| **(c)** | Grows out of the bar, plus a second layout for Settings. |

**VERDICT:** (a). **CONFIDENCE: high** — (b) and (c) each cost a second layout, a second set of
acceptance steps and a second responsive rule for no user-visible gain.
**STRONGEST COUNTER:** the design draws 10b without a scrim, and adding one is REQ-01 putting
a surface on screen the artboard does not depict; a purist reading of "the design is the
design of record" prefers (b).

---

## Q7-03 — The preferences card has no close button

**Plain words.** The design's 10b footer has exactly three controls — `Privacy notice`,
`Essential only`, `Save choices` — and no `×`. The policy modal (10c) does have one. So a
visitor who opens the preferences card from **Settings** and wants to leave without changing
anything has only `Esc` or a click on the dim area; `Essential only` would overwrite their
stored choice, so it is not a cancel.

| Option | What ships |
|---|---|
| **(a)** | No `×`, exactly as designed; Esc and backdrop are the no-change exits (the SPEC default). |
| **(b)** | Add a `×` to the card's header, matching 10c's, so there is a visible no-change exit. |

**VERDICT:** (a). **CONFIDENCE: medium.** The design is explicit and Esc/backdrop are standard
dialog exits, so nothing is trapped.
**STRONGEST COUNTER:** this is a real accessibility gap on the Settings entry specifically —
a touch user who does not know backdrop-tap dismisses a dialog, and who cannot press Esc, has
no visible way out that does not change their stored decision. That argument is strong enough
that REQ-01 would not object to (b); it is (a) only because the design is explicit.

---

## Q7-04 — `Close` — the one string this mission adds that the design does not contain

**Plain words.** The policy modal is opened from two places: the sign-up checkbox, where its
button `I have read it` ticks the box, and S01's preferences card, where it is opened just to
read. The design only ever draws the first case ("opened from sign-up"), so it says nothing
about the read-only footer. A button reading `I have read it` that consents to nothing would
be a UI claiming a thing it does not do.

| Option | What ships |
|---|---|
| **(a)** | Read-only footer = the contact line + a single `Close` button (the SPEC default). |
| **(b)** | Read-only footer = the contact line only; the header `×`, Esc and backdrop are the exits. No new string. |
| **(c)** | Keep `I have read it` in both modes; in read-only it just closes. |

**VERDICT:** (a). **CONFIDENCE: high** against (c) — (c) is dishonest and is the option the
standing law rules out. **Medium** against (b), which adds no new copy at all.
**STRONGEST COUNTER:** (b) is the strictly-verbatim answer and costs only a slightly weaker
close affordance; if V wants zero invented strings anywhere in this mission, (b) is the pick.

---

## Q7-05 — The Settings Privacy panel needs copy the design never wrote

**Plain words.** Intake C5 / row V-4 adds a `Privacy` panel to Settings with one
`Cookie preferences` button. The design shows no Settings Privacy panel, so its section title
and hint line have no source. REQ-01 wrote: title `Privacy`, hint
`Choose what this browser stores. Asked once; change it here any time.`, button
`Cookie preferences`.

| Option | What ships |
|---|---|
| **(a)** | Those three strings (the SPEC default). `Cookie preferences` at least matches the card's own title. |
| **(b)** | V supplies the wording. |
| **(c)** | Panel with the button and no hint line at all. |

**VERDICT:** (a). **CONFIDENCE: high** that some wording is needed and medium that this is the
wording V wants — it echoes the card's own lede ("Asked once. Revisit any time from
Settings → Privacy.") deliberately, so the two surfaces read as one voice.
**STRONGEST COUNTER:** it is invented product copy in a mission whose whole discipline is
verbatim transcription, and V may prefer to write the sentence personally.

---

## Q7-06 — Does the bar appear on the debate canvas?

**Plain words.** Row V-7's default mounts the bar app-wide, on whatever page a visitor first
opens. The debate view is the product's most immersive surface: it suppresses the global top
bar entirely (`apps/ui/components/TopBar.tsx:58`) and renders its own chrome. So "app-wide"
means the consent bar appears over the debate canvas too.

| Option | What ships |
|---|---|
| **(a)** | Every route, debate canvas included (the SPEC default, and row V-7's plain reading). |
| **(b)** | Every route except `/debate/*` and `/public/debate/*`, where it waits until the visitor navigates away. |

**VERDICT:** (a). **CONFIDENCE: medium-high.** Measured consequence, so V is not choosing
blind: on the owner debate view the bar covers `.tokenDock`
(`apps/ui/app/globals.css:3396-3403`), which contains exactly one non-interactive status pill
(`apps/ui/app/debate/[id]/DebatePageClient.tsx:1525-1529`) — so it blocks no control, and one
click ends it (S01-R29).
**STRONGEST COUNTER:** a first-time visitor arriving on a shared public debate link meets a
consent bar over the thing they came to read, and (b) would defer the ask by one navigation.
Against that: a reader who never navigates is then never asked, which is the exact failure
row V-7 exists to prevent.

---

## Summary

| Id | Subject | Pick | Confidence |
|---|---|---|---|
| Q7-01 | Five cookie names that do not exist | verbatim now, contained as data; **recommend V rule (b)** | medium-high |
| Q7-02 | How 10b opens | centred dialog on the shared scrim | high |
| Q7-03 | No `×` on the preferences card | as designed, no `×` | medium |
| Q7-04 | `Close` in the modal's read-only mode | add the one string | high vs (c), medium vs (b) |
| Q7-05 | Settings Privacy panel copy | REQ-01's three strings | high / medium |
| Q7-06 | Bar on the debate canvas | every route | medium-high |

**Six rows. None blocks a slice** — every one has a default on disk and in the SPECs. Q7-01 is
the only row REQ-01 asks the orchestrator to put in front of V early, because it is the one
where the shipped default states something untrue to a user.

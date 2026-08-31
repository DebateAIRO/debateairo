# PLAN — T9 Landing page

> Packet REQ-01 binds Requirements to author WHAT-proves clusters here.
> Architecture still owns HOW (modules, token extraction, file surfaces).
> Quantifiability law binds both seats.

**Goal:** Anonymous `/` is the TURN 9 landing; signed-in `/` stays library;
stub nav; mode toggle; placeholders explicit.

**Spec:** `docs/missions/ui-overhaul/slices/T9/SPEC.md` v1

**Status:** REQUIREMENTS CLUSTERS DRAFTED — Architecture fills HOW / file
surfaces / exact acceptance commands.

## Quantifiability law

- Every step markable done / not-done with no judgement call.
- Forbidden acceptance words: the vague set banned by `heartbeat-requirements` §4 (do not use those adjectives in acceptance lines).
- Every step names: cluster id · acceptance test · file surface (ARCH fills
  surfaces).
- Every PLAN step traces to a SPEC sentence; every SPEC R has ≥1 step.
- Three-run law on each cluster verification command.
- UNVERIFIED is a valid answer.

## Clusters (WHAT each proves)

### T9-C1 — Route split: anonymous landing vs signed-in library

**Proves:** R1, R2 — `/` content depends on session presence as V ruled.

| Step | SPEC | WHAT | Acceptance (automatable) |
|---|---|---|---|
| T9-C1-1 | R1 | Logged-out `/` document contains hero headline `Find the weakest joint in your own argument.` | Render/route test: no-session `/` includes that string |
| T9-C1-2 | R2 | Signed-in `/` document does not use the landing-only hero as the primary view; library chrome from T3 is present | Render/route test: session `/` includes library marker (e.g. `Your debates` / `+ New debate`) and excludes landing-only hero as sole body |

**Cluster verification command (ARCH finalizes):** three runs of the T9 landing
vs library route tests; worst run is verdict.

### T9-C2 — Landing chrome, CTAs, stub nav

**Proves:** R4, R5 — nav labels and CTAs exist; unddesigned pages are stubs.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C2-1 | R4 | Labels `Method`, `Transcripts`, `Pricing` are in the landing document | Assert all three strings present on anonymous `/` |
| T9-C2-2 | R5 | `Start a round` and `Read a scored transcript` are present | Assert both strings on anonymous `/` |
| T9-C2-3 | R4 | No product page at those nav destinations is required this mission | Structural check: SPEC/PLAN NON-goals still list those pages out of scope; no ARCH ticket invents full pages without V |

### T9-C3 — Mode toggle + design tokens named

**Proves:** R3 — Terracotta ↔ Chamber toggle; fonts/palette requirements named.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C3-1 | R3 | A mode control exists on landing | Assert toggle control present (role/label ARCH pins) |
| T9-C3-2 | R3 | Activating toggle changes a measurable mode attribute/class/token set between the two named modes | Assert before/after mode marker differs |
| T9-C3-3 | R3 | Requirements name Fraunces, Plus Jakarta Sans, `#C15F3C`, `#3F7466`, `#E7E2D8`/`#f0eee6`, `#111111` | Grep shipped styles/tokens for these literals or ARCH-documented token aliases that resolve to them |

### T9-C4 — Method ledger, sample cards, placeholders

**Proves:** R6, R7, R8 — method 01–04, card anatomy, placeholders not fabricated.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C4-1 | R7 | Method steps include titles `Models argue`, `They review each other`, `You challenge`, `Verdict with receipts` | Assert all four strings |
| T9-C4-2 | R6 | Sample block exposes BASE/FINAL style score labels on at least one card | Assert `BASE` and `FINAL` present in landing sample region |
| T9-C4-3 | R8 | Placeholder slots remain placeholder text OR a V-closed real source is documented in DECISIONS | Assert design placeholder glyphs **or** DECISIONS row citing V closure + wired source test |

### T9-C5 — Render-pin migration bind

**Proves:** R9 — OLD UI pins for this surface are not the mission bar.

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T9-C5-1 | R9 | ARCH names the `tests/render/**` files that pinned OLD `/` or home chrome for the replaced surface | DECISIONS or PLAN appendix lists those paths |
| T9-C5-2 | R9 | Those tests pass against NEW landing strings / signed-in split | Three-run vitest on the named files |

## Open dependencies

- V-DECISION on T9 SPEC OPEN QUESTIONS 1–3 before coding CTA destination and
  placeholder wiring.
- T3 library markers used in T9-C1-2 must match T3 SPEC copy.

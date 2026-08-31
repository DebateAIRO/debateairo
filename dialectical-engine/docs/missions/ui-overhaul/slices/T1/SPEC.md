# SPEC — T1 Debate view — tree canvas

**Version:** v1 (2026-08-31) · **Status:** FROZEN at creation.

**Mission:** `ui-overhaul` · **Design source:** TURN 1 (1a Approved).

## Intent

Replace the owner debate tree canvas with TURN 1 approved direction:
Terracotta ↔ Chamber, double-bezel cards, sprung connectors, Field Notes stance
tab (small colored line at top of each card), card anatomy (type chip ·
BASE/FINAL · author · reviewer + review verdict · regenerate/read), view
toggles, show set-aside paths, and synthesis/verdict strip.

## Screen inventory

| ID | Region | Notes |
|---|---|---|
| T1-S1 | Chrome | Dialectical Engine / dezbatere.ro / debate title / `Scoring · n/m` / Thread·Split·Tree·Map / mode |
| T1-S2 | Canvas controls | `Show set-aside paths` checkbox |
| T1-S3 | Root claim card | ROOT CLAIM + question text; claims/depth meta |
| T1-S4 | Argument cards | Stance tab color; type (REASONING / PRO / CON); model line; BASE%/FINAL%; short claim; `↻ Regenerate`; `Details ▸` |
| T1-S5 | Connectors | Stance-colored connectors between cards |
| T1-S6 | Synthesis strip | Strongest Pro / Strongest Con / Verdict / Leans |
| T1-S7 | Scoring footer | `Scoring · n of m claims scored · DF-QuAD` (or current scorer label) |
| T1-S8 | Mode + tokens | Terracotta light / Chamber dark; gold reserved for reasoning & verdict |

## States

1. Views: Thread / Split / Tree / Map (same four reading modes).
2. Set-aside paths shown vs hidden.
3. Generating vs complete cards (regenerate availability per existing rules).
4. publicMode (from public route): same canvas READ language with mutate
   controls locked (T3) — shared component path.

## Copy / anatomy (binding)

- View labels: `Thread`, `Split`, `Tree`, `Map`
- `Show set-aside paths`
- Card: `BASE` / `FINAL` percents; `↻ Regenerate`; `Details ▸`
- Synthesis: `↑ STRONGEST PRO` / `↓ STRONGEST CON` / `VERDICT` / `Leans`
- Token note from design: card = shell + core double bezel; top tab + connector
  carry stance color; gold reserved for reasoning & verdict

## Requirements

### R1 — Four view modes remain

Thread / Split / Tree / Map controls exist and switch the reading mode.

### R2 — Double-bezel cards + stance tab

Tree/canvas cards use double-bezel shell and a stance-colored top tab (Field
Notes stance tab folded in).

### R3 — Card anatomy fields

Each argument card shows stance/type, author model line, BASE and FINAL, short
text, Regenerate (owner), Details open.

### R4 — Connectors stance-colored

Visible connectors use stance color tokens (not neutral-only).

### R5 — Set-aside toggle

`Show set-aside paths` toggles set-aside path visibility.

### R6 — Synthesis + scoring chrome

Synthesis strip and scoring count chrome present when data exists.

### R7 — Mode toggle

Terracotta ↔ Chamber on debate chrome; gold reserved for reasoning & verdict
treatments.

### R8 — publicMode compatibility

When mounted with publicMode, canvas remains readable; regenerate/challenge
mutate paths locked per T3/T5.

### R9 — Render pins move

`tests/render/ui02e-debate-canvas.test.tsx`, load/scoring debate pins, etc.
move to NEW UI (**ARCH names full pin list**).

## NON-goals

- New scorer algorithm.
- Removing view modes.
- Designing TURN 2 (does not exist).

## OPEN QUESTIONS

1. **Reviewer line on card face (ARCH):** design TURN 1a abbreviated cards omit
   full “REVIEW AGREED/DISPUTED BY” lines that appear on landing sample cards —
   confirm whether tree cards require reviewer verdict on-face or only in
   Details (T5). Requirements proposes **Details carries full reviewer line;
   tree card may show compact verdict mark if already present in app**.
2. **Vocab:** keep `claims` in `32 claims / depth 4` meta (propose yes) vs
   design `joints` — V-DECISION shared.

## Acceptance — V manual (browser)

1. Open an owner debate with a tree. **Expect:** four view toggles; mode
   toggle; cards with BASE/FINAL; Details opens T5; Regenerate visible.
2. Toggle Show set-aside paths. **Expect:** visible path set changes.
3. Confirm stance tab/connector color differs across PRO vs CON cards.
4. Open same debate via public URL logged out. **Expect:** canvas readable;
   Regenerate not actionable.

## Acceptance — automated

- Canvas render tests assert view toggles, BASE/FINAL, bezel/stance markers
  ARCH documents.
- publicMode regenerate locked assert shared with T3/T5.
- Pin migration; three-run law.

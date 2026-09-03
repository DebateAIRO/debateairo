# ADR-005 — The contrast threshold, pinned as numbers over an enumerated pair list

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local
**Slices affected:** T1 (R8), T5 (R8), T9 (R3) — every SPEC that says
"text/surface pairs meet the contrast threshold ARCH pins"

## Why this ADR exists

Four slices replaced the word "readable" with "the contrast threshold ARCH
pins" (recorded in T1/T5 `DECISIONS.md` as finding F7). That is only an
improvement if ARCH supplies a **number, a pair list, and a computation** —
otherwise the unmeasurable adjective has just been renamed. All three follow.

## The pins

| Role | Floor | Basis |
|---|---|---|
| Text tokens (`--text`, `--text-strong`, `--text-2`, `--text-3`, `--muted`, `--muted-2`, and every `*-text` accent) against every surface token | **4.5 : 1** | WCAG 2.2 SC 1.4.3 Contrast (Minimum), normal text |
| Non-text marks that carry meaning (`--pro-line`, `--con-line`, `--gold-line`, `--reasoning-line`, `--focus`) against every surface token | **3.0 : 1** | WCAG 2.2 SC 1.4.11 Non-text Contrast |
| Background fills (`*-bg`, `*-border`, `--m-*-bg`, `--m-*-border`) | none | they sit under text that carries its own floor |

**Surface set** (the denominators, both modes): `--bg`, `--surface`,
`--surface-2`, `--surface-sunken`. Every text and line token is checked against
**all four**, and the verdict is the WORST pair — not the average and not the
common case. The worst surface is `--surface-sunken` (`shell`) in both modes,
in every single row measured.

## Measured result — the design passes, after two derived values

Computed 2026-08-31 over the values in `token-inventory.md` using the WCAG
relative-luminance formula. **34 rows (17 tokens × 2 modes), 0 failures.**
Terracotta is the binding mode; Chamber clears every floor by a margin (its
worst row is `--muted` at 5.32).

The full row-by-row evidence — every token, both modes, worst surface, ratio —
is published in `token-inventory.md` §"Contrast measurements". This ADR states
the floors and cites that table; it deliberately does not keep a second count of
its own. *(Amended 2026-08-31 per AN3: an earlier revision said "18 text rows
and 8 non-text rows" while the inventory published 16 token-rows — two units for
one measurement, with three measured tokens never published at all.)*

Five tokens do **not** meet their floor at the design's raw hex and are shipped
as derived variants. This is recorded, not hidden:

| Token | Design raw | Worst ratio raw | Shipped value | Worst ratio shipped |
|---|---|---|---|---|
| `--gold-text` (Terracotta) | `#A8823E` | **2.94** on `shell` — fails even the 3.0 non-text floor | `#826530` | 4.52 |
| `--gold-line` (Terracotta) | `#A8823E` | **2.94** on `shell` | `#A5803D` | 3.02 |
| `--con-text` (Terracotta) | `#C15F3C` | 3.50 on `shell` | `#A55133` | 4.55 |
| `--agree-text` (Terracotta) | `#3E7A4E` | 4.25 on `shell` | `#3C754B` | 4.53 |
| `--pro-text` (Terracotta) | `#3F7466` | 4.46 on `shell` | `#3F7365` | 4.52 |

`--gold-line`, `--con-text`, `--agree-text` and `--pro-text` move by 0.5–15% of
channel value; `--pro-text` differs from the design hex in a single blue unit.
`--gold-text` is a real, visible darkening and is the one place this mission
departs meaningfully from a design hex. It departs because gold-on-shell at
2.94 : 1 is not legible text, and the design uses gold for the REASONING chip
and the VERDICT label — both text a reader must read. The raw `--gold` is kept
unchanged for fills and decorative rules, so the design's gold is still on
screen everywhere it is not carrying a word.

**No Chamber token is altered.** Chamber ships the design hexes exactly.

## The computation, and where it lives

**Create:** `tests/support/contrast.ts`

```ts
/** WCAG 2.2 relative luminance of an #RRGGBB colour. */
export function relativeLuminance(hex: string): number;

/** WCAG 2.2 contrast ratio, 1..21. Order-independent. */
export function contrastRatio(a: string, b: string): number;

/** Every token and its worst ratio over the surface set, for one mode. */
export function worstRatios(
  tokens: Readonly<Record<string, string>>,
  surfaces: readonly string[]
): ReadonlyArray<{ token: string; surface: string; ratio: number }>;
```

`relativeLuminance` implements sRGB linearisation: channel `c = v/255`, then
`c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4`, then
`0.2126 R + 0.7152 G + 0.0722 B`. `contrastRatio(a,b) = (max(L)+0.05)/(min(L)+0.05)`.

The token values are **not** transcribed into the test. They are read out of the
real stylesheet through jsdom (`ADR-006`), so the assertion is over what
`globals.css` actually declares. A test that hard-codes the palette and then
checks the palette against itself proves nothing.

## Refutation

The contrast cluster **catches**: any token whose shipped value drops below its
floor on any of the four surfaces, in either mode — including a Chamber block
where someone pasted a Terracotta value. It does **not** catch: a component that
puts `--muted` text on a background that is not one of the four surface tokens
(for example directly on `--con-bg`), because that pair is not in the enumerated
set. That gap is deliberate — enumerating every rendered pair needs a real
browser and belongs to V's manual QA step, which each SPEC already carries.
The boundary is stated so nobody reads a green contrast cluster as "the whole
UI is AA".

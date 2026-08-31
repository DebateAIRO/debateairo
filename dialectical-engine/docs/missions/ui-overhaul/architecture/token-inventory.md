# TOKEN INVENTORY — Terracotta (light) / Chamber (dark)

**Surface:** `apps/ui/app/globals.css`, two blocks at the top of the file:
`:root { … }` (Terracotta, the default) and `html[data-mode="chamber"] { … }`
(Chamber). Both blocks declare the SAME key set. See `ADR-001-token-surface.md`.

## Provenance — this is not a re-interpretation of the design

Every base value below is lifted from the design bundle's own token function,
`docs/missions/ui-overhaul/design/design-document-original.html` line 388:

```js
const tokensFor = (dk) => dk ? {
  page:'#14110E', headerBg:'rgba(20,17,14,.7)', shell:'#221D17', core:'#181410', railBg:'#171310',
  ink:'#F2EAD9', mute:'#9C907A', hair:'rgba(242,234,217,.09)', hairStrong:'rgba(242,234,217,.18)',
  gridDot:'rgba(242,234,217,.08)', gold:'#C8A055', pro:'#6E9E96', con:'#C8834F', hint:'#B5A88F',
  shadow:'0 22px 48px -22px rgba(0,0,0,.8)', shadowBig:'0 36px 70px -30px rgba(0,0,0,.9)'
} : {
  page:'#F9F6F1', headerBg:'rgba(251,249,244,.8)', shell:'#EFE9E0', core:'#FDFBF6', railBg:'#F4F0E8',
  ink:'#29261F', mute:'#6E675C', hair:'rgba(41,38,31,.1)', hairStrong:'rgba(41,38,31,.2)',
  gridDot:'rgba(41,38,31,.12)', gold:'#A8823E', pro:'#3F7466', con:'#C15F3C', hint:'#555147',
  shadow:'0 18px 40px -20px rgba(41,38,31,.24)', shadowBig:'0 30px 60px -26px rgba(41,38,31,.32)'
};
const accentsFor = (dk) => ({ pro:t.pro, con:t.con, reasoning: dk ? '#C8A055' : '#3D5A80' });
const dots = { claude:'#8A63C9', gpt:'#B4552D', gemini:'#3D6FB4', grok:'#5F6670', qwen:'#3F8E7C' };
const agreeC = dark ? '#86B58D' : '#3E7A4E';
const disputeC = dark ? '#D67F65' : '#B0432F';
const tint = (hex, a) => `rgba(r,g,b,${a})`;   // authorBg a=.12 light / .16 dark; authorBorder a=.42 / .50
```

### CORRECTION to the mission compass, recorded here rather than silently applied

`docs/missions/ui-overhaul/INSTRUCTIONS.md` §"Design-system facts" lists cream
`#E7E2D8` / `#f0eee6` and ink `#111111`. **None of the three is a product
surface in the artboards.** Measured 2026-08-31 against the rendered export:

| Hex | Where it actually occurs | Verdict |
|---|---|---|
| `#f0eee6` | `design-document-rendered.html:51` — `html,body{background:#f0eee6}`, the deck viewer's own page chrome | NOT a product token |
| `#E7E2D8` | `design-document-rendered.html:148` — `body{margin:0;background:#E7E2D8}`, the artboard stage backdrop | NOT a product token |
| `#111111` | zero occurrences as a colour in the rendered export | NOT a product token |
| `#C15F3C` | `design-document-rendered.html:1351,1355,1359` — SVG connector `stroke` on CON edges, and `tokensFor().con` | **real** — the CON stance token |
| `#3F7466` | `design-document-rendered.html:1349,1353,1357` — SVG connector `stroke` on PRO edges, and `tokensFor().pro` | **real** — the PRO stance token |

The two real ones are exactly the two the T9 acceptance cell needs, so
`T9-C3-3` remains satisfiable as written. The creams and the ink are the
deck's furniture and must not be shipped. The compass sentence is
requirements-owned; see `open-questions.md` Q-10 for the routed correction.

## Mode-independent tokens (declared once in `:root`, NOT repeated in the Chamber block)

| Token | Value | Note |
|---|---|---|
| `--font-display` | `var(--font-fraunces), "Fraunces", Georgia, serif` | NEW. Replaces `--font-serif` as the display face |
| `--font-sans` | `var(--font-jakarta), "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif` | REDEFINED |
| `--font-mono` | `var(--font-mono-src), "JetBrains Mono", ui-monospace, monospace` | KEPT. The design uses `ui-monospace, Menlo, monospace`; the app's existing mono is retained (`open-questions.md` Q-08) |
| `--font-serif` | `var(--font-display)` | KEPT AS ALIAS so the 521 existing `var()` sites do not need editing |
| `--r-card` | `14px` | design card radius (`border-radius:14px` on bezel cards) |
| `--r-panel` | `16px` | design panel/header radius |
| `--r-btn` | `12px` | design CTA radius |
| `--r-pill` | `999px` | design chip radius (141 occurrences) |
| `--r-tab` | `0 0 5px 5px` | NEW. The stance tab at the top of a card (15 occurrences of `border-radius:0px 0px 5px 5px`) |
| `--r-dot` | `50%` | NEW. Model dots |
| `--safe-b` … `--z-zoom-cluster` | unchanged | 9 canvas-geometry tokens; carry over verbatim |

## Mode-bearing tokens — the full key set

Both blocks declare all of these. `T` = Terracotta (`:root`), `C` = Chamber
(`html[data-mode="chamber"]`).

### Surfaces

| Token | T | C | Design source |
|---|---|---|---|
| `--bg` | `#F9F6F1` | `#14110E` | `page` |
| `--surface` | `#FDFBF6` | `#181410` | `core` |
| `--surface-1` | `#FDFBF6` | `#181410` | `core` |
| `--surface-2` | `#F4F0E8` | `#171310` | `railBg` |
| `--surface-sunken` | `#EFE9E0` | `#221D17` | `shell` |
| `--shell` | `#EFE9E0` | `#221D17` | NEW — the outer half of the double bezel |
| `--core` | `#FDFBF6` | `#181410` | NEW — the inner half of the double bezel |
| `--header-bg` | `rgba(251,249,244,.8)` | `rgba(20,17,14,.7)` | NEW — `headerBg`, the blurred chrome |
| `--ink` | `#29261F` | `#F2EAD9` | `ink`. NOTE: in the app `--ink` is a *surface* (dark button fill); in Chamber it is the light value, which is correct — a dark-mode "ink button" is light-on-dark |
| `--ink-hover` | `#3A362D` | `#FFF8E8` | derived, +/- 8% L |

### Text

| Token | T | C | Floor | Measured worst ratio |
|---|---|---|---|---|
| `--text` | `#29261F` | `#F2EAD9` | 4.5 | T 12.51 · C 13.97 |
| `--text-strong` | `#1A1613` | `#FFFFFF` | 4.5 | T 14.90 · C 16.72 |
| `--text-2` | `#555147` | `#B5A88F` | 4.5 | T 6.56 · C 7.13 |
| `--text-3` | `#6E675C` | `#9C907A` | 4.5 | T 4.63 · C 5.32 |
| `--muted` | `#6E675C` | `#9C907A` | 4.5 | T 4.63 · C 5.32 |
| `--muted-2` | `#6E675C` | `#9C907A` | 4.5 | T 4.63 · C 5.32 |

`--muted-2` is deliberately collapsed onto `mute`: the design has exactly two
muted greys (`mute`, `hint`) and inventing a third that clears 4.5:1 would be
ARCH inventing colour the design does not contain.

### Lines

| Token | T | C | Design source |
|---|---|---|---|
| `--line` | `rgba(41,38,31,.10)` | `rgba(242,234,217,.09)` | `hair` |
| `--line-2` | `rgba(41,38,31,.12)` | `rgba(242,234,217,.08)` | `gridDot` |
| `--line-strong` | `rgba(41,38,31,.20)` | `rgba(242,234,217,.18)` | `hairStrong` |

### Stance and accents — three roles per accent

The existing stylesheet already splits every accent into `-text` / `-bg` /
`-border` / `-line`. That split is preserved because the roles carry different
contrast floors (`ADR-005`). `-text` is the only role a reader must read.

| Token | T | C | Floor | T worst | C worst |
|---|---|---|---|---|---|
| `--pro` | `#3F7466` | `#6E9E96` | — | — | — |
| `--pro-text` | `#3F7365` | `#6E9E96` | 4.5 | 4.52 | 5.57 |
| `--pro-line` | `#3F7466` | `#6E9E96` | 3.0 | 4.46 | 5.57 |
| `--pro-bg` | `#E6EBE5` | `#262A25` | — | — | — |
| `--pro-border` | `#ADC2BA` | `#435953` | — | — | — |
| `--con` | `#C15F3C` | `#C8834F` | — | — | — |
| `--con-text` | `#A55133` | `#C8834F` | 4.5 | 4.55 | 5.43 |
| `--con-line` | `#C15F3C` | `#C8834F` | 3.0 | 3.50 | 5.43 |
| `--con-bg` | `#F6E8E0` | `#34261A` | — | — | — |
| `--con-border` | `#E4B9A8` | `#704C30` | — | — | — |
| `--gold` | `#A8823E` | `#C8A055` | — | — | — |
| `--gold-text` | `#826530` | `#C8A055` | 4.5 | 4.52 | 6.86 |
| `--gold-line` | `#A5803D` | `#C8A055` | 3.0 | 3.02 | 6.86 |
| `--gold-bg` | `#F3ECE0` | `#342A1B` | — | — | — |
| `--gold-border` | `#D9C8A9` | `#705A33` | — | — | — |
| `--reasoning` | `#3D5A80` | `#C8A055` | — | — | — |
| `--reasoning-text` | `#3D5A80` | `#C8A055` | 4.5 | 5.85 | 6.86 |
| `--reasoning-line` | `#3D5A80` | `#C8A055` | 3.0 | 5.85 | 6.86 |
| `--reasoning-bg` | `#E6E8E8` | `#342A1B` | — | — | — |
| `--reasoning-border` | `#ACB7C4` | `#705A33` | — | — | — |

**The reasoning accent is NOT gold in Terracotta.** `accentsFor(false).reasoning`
is `#3D5A80`, a slate blue; only `accentsFor(true).reasoning` is gold. The
design's closing note "gold is reserved for reasoning & verdict"
(`design-document-rendered.html:1578`) describes Chamber. A coder who reads only
that sentence will paint light-mode REASONING chips gold and be wrong. T1's
`DECISIONS.md` records this.

### Review verdict

| Token | T | C | Floor | T worst | C worst |
|---|---|---|---|---|---|
| `--agree` | `#3E7A4E` | `#86B58D` | — | — | — |
| `--agree-text` | `#3C754B` | `#86B58D` | 4.5 | 4.53 | 7.17 |
| `--agree-bg` | `#E6ECE2` | `#2A2E24` | — | — | — |
| `--agree-border` | `#ADC5AF` | `#4F654F` | — | — | — |
| `--dispute` | `#B0432F` | `#D67F65` | — | — | — |
| `--dispute-text` | `#B0432F` | `#D67F65` | 4.5 | 4.72 | 5.64 |
| `--dispute-bg` | `#F4E5DE` | `#36251E` | — | — | — |
| `--dispute-border` | `#DDAEA2` | `#774A3B` | — | — | — |

### Status (existing keys, remapped onto the design's two verdict colours)

| Token | T | C |
|---|---|---|
| `--ok-dot` | `#3E7A4E` | `#86B58D` |
| `--ok-text` | `#3C754B` | `#86B58D` |
| `--ok-bg` | `#E6ECE2` | `#2A2E24` |
| `--ok-border` | `#ADC5AF` | `#4F654F` |
| `--gen-dot` | `#A8823E` | `#C8A055` |
| `--gen-text` | `#826530` | `#C8A055` |
| `--gen-bg` | `#F3ECE0` | `#342A1B` |
| `--gen-border` | `#D9C8A9` | `#705A33` |

### Score bands (existing keys; band hues kept, lightness re-anchored per mode)

| Token | T | C |
|---|---|---|
| `--score-strength-text` | `#3C754B` | `#86B58D` |
| `--score-strength-bg` | `#E6ECE2` | `#2A2E24` |
| `--score-strength-border` | `#ADC5AF` | `#4F654F` |
| `--score-uncertainty-text` | `#826530` | `#C8A055` |
| `--score-uncertainty-bg` | `#F3ECE0` | `#342A1B` |
| `--score-uncertainty-border` | `#D9C8A9` | `#705A33` |
| `--score-impact-text` | `#3D5A80` | `#C8A055` |
| `--score-impact-bg` | `#E6E8E8` | `#342A1B` |
| `--score-impact-border` | `#ACB7C4` | `#705A33` |

### Model dots — design `dots` map, flattened over `core`

| Token | T | C | Design key |
|---|---|---|---|
| `--m-claude` | `#8A63C9` | `#8A63C9` | `claude` |
| `--m-gpt` | `#B4552D` | `#B4552D` | `gpt` |
| `--m-gemini` | `#3D6FB4` | `#3D6FB4` | `gemini` |
| `--m-grok` | `#5F6670` | `#5F6670` | `grok` |
| `--m-qwen` | `#3F8E7C` | `#3F8E7C` | `qwen` |
| `--m-default` | `#888888` | `#888888` | `dots` fallback |

Dots are identical in both modes: they are 9px solid discs used as identity
marks, they carry no text, and the design's `dots` map is not mode-switched.
Their `-bg`/`-border` tints ARE mode-switched (`authorBg`/`authorBorder`):

| Token | T | C |
|---|---|---|
| `--m-claude-bg` / `-border` | `#EFE9F1` / `#CDBBE3` | `#2A212E` / `#513C6D` |
| `--m-gpt-bg` / `-border` | `#F4E7DE` / `#DEB5A2` | `#311E15` / `#66351F` |
| `--m-gemini-bg` / `-border` | `#E6EAEE` / `#ACC0DA` | `#1E232A` / `#2B4262` |
| `--m-grok-bg` / `-border` | `#EAE9E6` / `#BBBCBE` | `#23211F` / `#3C3D40` |
| `--m-qwen-bg` / `-border` | `#E6EEE7` / `#ADCDC3` | `#1E2821` / `#2C5146` |
| `--m-default-bg` / `-border` | `#EFEDE9` / `#CCCBC8` | `#2A2723` / `#504E4C` |

Derivation: `tint(dot, a)` flattened over that mode's `core`, with the design's
own alphas — `a = .12` light / `.16` dark for `-bg`, `.42` / `.50` for
`-border`. Flattened to opaque hex rather than left as `rgba()` so the contrast
test can compute on the declared value (`ADR-006`).

### Brand / focus

| Token | T | C |
|---|---|---|
| `--accent` | `#C15F3C` | `#C8834F` |
| `--link` | `#3D5A80` | `#C8A055` |
| `--focus` | `#C15F3C` | `#C8834F` |

### Elevation

| Token | T | C | Design source |
|---|---|---|---|
| `--shadow-card` | `0 18px 40px -20px rgba(41,38,31,.24)` | `0 22px 48px -22px rgba(0,0,0,.8)` | `shadow` |
| `--shadow-pop` | `0 30px 60px -26px rgba(41,38,31,.32)` | `0 36px 70px -30px rgba(0,0,0,.9)` | `shadowBig` |
| `--shadow-drawer` | `-22px 0 54px -22px rgba(41,38,31,.32)` | `-26px 0 62px -26px rgba(0,0,0,.9)` | `shadowBig`, rotated to the drawer's edge |
| `--shadow-chrome` | `0 20px 46px -22px rgba(26,22,19,.26)` | `0 24px 52px -24px rgba(0,0,0,.85)` | NEW — the floating nav pill (`rendered:270`) |

## Type scale

The artboards are fixed 1280px compositions; the product is responsive. Sizes
are therefore expressed as `clamp()` anchored on the artboard value at 1280px.

| Token | Value | Artboard anchor |
|---|---|---|
| `--t-hero` | `clamp(44px, 9.2vw, 118px)` | `font-size:118px; line-height:.92; letter-spacing:-.035em` (`rendered:294`) |
| `--t-display` | `clamp(30px, 4.4vw, 56px)` | 56px section headline |
| `--t-title` | `clamp(22px, 2.2vw, 28px)` | 28px |
| `--t-lede` | `clamp(16px, 1.5vw, 19.5px)` | `font-size:19.5px; line-height:1.65` (`rendered:296`) |
| `--t-body` | `15.5px` | CTA / body |
| `--t-ui` | `13.5px` | nav, buttons, rows |
| `--t-meta` | `12px` | card meta |
| `--t-micro` | `11px` | chips |
| `--t-nano` | `9.5px` | stance/type chips, BASE/FINAL labels |
| `--lh-hero` | `0.92` | |
| `--ls-hero` | `-0.035em` | |
| `--ls-eyebrow` | `0.18em` | `letter-spacing:.18em; text-transform:uppercase` (`rendered:293`) |
| `--fvs-display` | `"SOFT" 0, "WONK" 1` | `font-variation-settings` on every Fraunces heading |
| `--fw-display` | `480` | the artboard's hero weight |

`--t-micro` (11px) and `--t-nano` (9.5px) are the two most frequent sizes in
the export (77 and 38 occurrences). The remaining half-pixel sizes in the
artboards (9, 10, 10.5, 12.5, 13, 14, 14.5, 15) are collapsed into the nine
steps above; a nine-step scale is the smallest set that covers every artboard
role without inventing one.

## Fonts — exact `next/font/google` call

Verified against the installed font data
(`apps/ui/node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`,
next 15.5.23): Fraunces exposes axes `SOFT` (0–100), `WONK` (0–1), `opsz`
(9–144), `wght` (100–900); Plus Jakarta Sans exposes `wght` (200–800). Both
support `normal` and `italic`.

```ts
// apps/ui/app/layout.tsx
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap"
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-jakarta",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-src",
  display: "swap"
});
```

`axes` and a literal `weight` are mutually exclusive in `next/font/google`; the
variable font is requested by omitting `weight`, and `wght` is then driven from
CSS. Do not add `weight: "variable"` alongside `axes` — it is rejected at build
time. `Source_Serif_4` and `Hanken_Grotesk` are removed from this file in the
same edit; nothing else imports them
(`grep -rn "Source_Serif_4\|Hanken_Grotesk" apps/ui` → `app/layout.tsx` only).

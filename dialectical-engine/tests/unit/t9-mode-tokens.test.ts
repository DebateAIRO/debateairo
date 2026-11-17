import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error jsdom is a runtime test dependency without root-level declarations.
import { JSDOM } from "jsdom";
// @ts-expect-error React is provided by the UI workspace, outside the root declaration graph.
import { act, createElement } from "react";
// @ts-expect-error React DOM is provided by the UI workspace, outside the root declaration graph.
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

type Mode = "terracotta" | "chamber";
type TokenName = `--${string}`;

type TokenContractModule = {
  styledDocument: () => { window: Window; document: Document };
  tokenValue: (win: Window, name: TokenName, mode?: Mode) => string;
  declaredTokenNames: () => readonly string[];
  chamberTokenNames: () => readonly string[];
};

type ContrastModule = {
  relativeLuminance: (hex: string) => number;
  contrastRatio: (a: string, b: string) => number;
  worstRatios: (
    tokens: Readonly<Record<string, string>>,
    surfaces: readonly string[]
  ) => ReadonlyArray<{ token: string; surface: string; ratio: number }>;
};

type ModeToggleModule = {
  ModeToggle: () => ReturnType<typeof createElement>;
};

type I18nProviderModule = {
  I18nProvider: (props: {
    locale: "en";
    catalog: Readonly<Record<string, string>>;
    children?: ReturnType<typeof createElement>;
  }) => ReturnType<typeof createElement>;
};

const root = process.cwd();
const globalsPath = resolve(root, "apps/ui/app/globals.css");
const layoutPath = resolve(root, "apps/ui/app/layout.tsx");
const modeTogglePath = resolve(root, "apps/ui/components/ModeToggle.tsx");
const presentationPath = resolve(root, "apps/ui/lib/debatePresentation.ts");
const tokenSupportPath = resolve(root, "tests/support/tokenContract.ts");
const contrastSupportPath = resolve(root, "tests/support/contrast.ts");

const TERRACOTTA = {
  "--bg": "#F3F5F9",
  "--surface": "#FFFFFF",
  "--surface-1": "#FFFFFF",
  "--surface-2": "#F7F8FB",
  "--surface-sunken": "#EEF1F6",
  "--shell": "#EEF1F6",
  "--core": "#FFFFFF",
  "--header-bg": "#FFFFFF",
  "--ink": "#121826",
  "--ink-hover": "#232B3D",
  "--text": "#121826",
  "--text-strong": "#0B101B",
  "--text-2": "#4A5468",
  "--text-3": "#5E6779",
  "--muted": "#5E6779",
  "--muted-2": "#5E6779",
  "--line": "#E3E7EF",
  "--line-2": "#E3E7EF",
  "--line-strong": "#D3D9E4",
  "--pro": "#2350D8",
  "--pro-text": "#2350D8",
  "--pro-line": "#2350D8",
  "--pro-bg": "#E5EAFA",
  "--pro-border": "#A3B6EF",
  "--con": "#E8701A",
  "--con-text": "#A84B05",
  "--con-line": "#DD6916",
  "--con-bg": "#FCEEE4",
  "--con-border": "#F5C39F",
  "--gold": "#FF8A2A",
  "--gold-text": "#A84B05",
  "--gold-line": "#E26600",
  "--gold-bg": "#FFF3E8",
  "--gold-border": "#FFC08A",
  "--eml-pending-bg": "rgba(255,138,42,.1)",
  "--eml-pending-border": "rgba(255,138,42,.45)",
  "--eml-pill-hover": "rgba(128,120,104,.12)",
  "--reasoning": "#121826",
  "--reasoning-text": "#121826",
  "--reasoning-line": "#121826",
  "--reasoning-bg": "#E3E3E5",
  "--reasoning-border": "#9B9EA4",
  "--agree": "#2F7A47",
  "--agree-text": "#2F7A47",
  "--agree-bg": "#E7F3EA",
  "--agree-border": "#A9D2B4",
  "--dispute": "#B42318",
  "--dispute-text": "#B42318",
  "--dispute-bg": "#FDECEA",
  "--dispute-border": "#F2B8B0",
  "--ok-dot": "#2F7A47",
  "--ok-text": "#2F7A47",
  "--ok-bg": "#E7F3EA",
  "--ok-border": "#A9D2B4",
  "--gen-dot": "#FF8A2A",
  "--gen-text": "#A84B05",
  "--gen-bg": "#FFF3E8",
  "--gen-border": "#FFC08A",
  "--score-strength-text": "#2F7A47",
  "--score-strength-bg": "#E7F3EA",
  "--score-strength-border": "#A9D2B4",
  "--score-uncertainty-text": "#A84B05",
  "--score-uncertainty-bg": "#FFF3E8",
  "--score-uncertainty-border": "#FFC08A",
  "--score-impact-text": "#121826",
  "--score-impact-bg": "#E3E3E5",
  "--score-impact-border": "#9B9EA4",
  "--m-claude": "#8A63C9",
  "--m-gpt": "#B4552D",
  "--m-gemini": "#3D6FB4",
  "--m-grok": "#5F6670",
  "--m-qwen": "#3F8E7C",
  "--m-default": "#888888",
  "--m-claude-bg": "#F1ECF9",
  "--m-claude-border": "#CEBDE8",
  "--m-gpt-bg": "#F6EBE6",
  "--m-gpt-border": "#E0B8A7",
  "--m-gemini-bg": "#E8EEF6",
  "--m-gemini-border": "#AEC3E0",
  "--m-grok-bg": "#ECEDEE",
  "--m-grok-border": "#BCBFC3",
  "--m-qwen-bg": "#E8F1EF",
  "--m-qwen-border": "#AED0C8",
  "--m-default-bg": "#F1F1F1",
  "--m-default-border": "#CDCDCD",
  "--accent": "#2350D8",
  "--link": "#2350D8",
  "--focus": "#DD6916",
  "--focus-halo": "rgba(232,112,26,.2)",
  "--shadow-card": "0 18px 40px -24px rgba(18,24,38,.22)",
  "--shadow-pop": "0 20px 44px -22px rgba(18,24,38,.3)",
  "--shadow-drawer": "-22px 0 54px -22px rgba(18,24,38,.3)",
  "--shadow-chrome": "0 14px 32px -20px rgba(18,24,38,.22)",
  "--grid-dot": "rgba(18,24,38,.08)",
  "--shadow-auth-card": "0 48px 90px -44px rgba(18,24,38,.5)",
  "--lp-raised": "#EEF1F6",
  "--lp-glass": "rgba(255,255,255,0.6)",
  "--lp-nav-shadow": "0 20px 46px -22px rgba(18,24,38,0.26)",
  "--lp-card-shadow": "0 30px 62px -30px rgba(18,24,38,0.24),0 8px 20px -12px rgba(18,24,38,0.12)",
  "--lp-core-inset": "inset 0 1px 0 rgba(255,255,255,0.85),inset 0 0 0 1px rgba(255,255,255,0.4)",
  "--lp-arrow-bg": "rgba(255,255,255,0.14)",
  "--lp-arrow-border": "rgba(255,255,255,0.26)",
  "--lp-r-shell": "20px",
  "--lp-r-core": "13px",
  "--lp-r-btn": "12px",
  "--lp-r-arrow": "9px",
  "--lp-r-nav": "16px",
  "--lp-fw-display": "700",
  "--lp-ls-display": "-0.03em",
  "--shadow-tab": "0 6px 16px -8px rgba(18,24,38,.55)",
  "--ok-soft": "rgba(47,122,71,.28)",
  "--ok-edge": "rgba(47,122,71,.55)",
  "--muted-bg": "rgba(94,103,121,.1)",
  "--muted-border": "rgba(94,103,121,.4)",
  "--accent-text": "#2350D8",
  "--accent-bg": "#E8EDFC",
  "--accent-border": "#B9C7F0",
  "--accent-halo": "rgba(35,80,216,.18)",
  "--brand": "#2350D8",
  "--on-brand": "#FFFFFF",
  "--on-ink": "#FFFFFF",
  "--cta": "#FF8A2A",
  "--on-cta": "#121826",
  "--cta-border": "#121826",
  "--cta-shadow": "#121826",
  "--hard": "#121826",
  "--hard-shadow": "#121826",
  "--shadow-soft": "0 14px 32px -20px rgba(18,24,38,.22)",
  "--case-ink": "#7A8396",
  "--chip": "#EEF1F6",
  "--track": "#DCE1EA",
  "--dashed": "#7A8396",
  "--field": "#F7F8FB",
  "--field-border": "#D3D9E4"
} as const satisfies Readonly<Record<TokenName, string>>;

const CHAMBER = {
  "--bg": "#0E131D",
  "--surface": "#171E2B",
  "--surface-1": "#171E2B",
  "--surface-2": "#121925",
  "--surface-sunken": "#232C3C",
  "--shell": "#232C3C",
  "--core": "#171E2B",
  "--header-bg": "#171E2B",
  "--ink": "#EEF2F8",
  "--ink-hover": "#FFFFFF",
  "--text": "#EEF2F8",
  "--text-strong": "#FFFFFF",
  "--text-2": "#A7B1C2",
  "--text-3": "#8B95A8",
  "--muted": "#8B95A8",
  "--muted-2": "#8B95A8",
  "--line": "#263042",
  "--line-2": "#263042",
  "--line-strong": "#34405A",
  "--pro": "#7C9DFF",
  "--pro-text": "#7C9DFF",
  "--pro-line": "#7C9DFF",
  "--pro-bg": "#27324D",
  "--pro-border": "#4A5E95",
  "--con": "#FF9A45",
  "--con-text": "#FF9A45",
  "--con-line": "#FF9A45",
  "--con-bg": "#3C322F",
  "--con-border": "#8B5C38",
  "--gold": "#FF9A45",
  "--gold-text": "#FFB374",
  "--gold-line": "#FF9A45",
  "--gold-bg": "#33241A",
  "--gold-border": "#8C4510",
  "--eml-pending-bg": "rgba(255,154,69,.13)",
  "--eml-pending-border": "rgba(255,154,69,.5)",
  "--eml-pill-hover": "rgba(128,120,104,.12)",
  "--reasoning": "#C9D3E3",
  "--reasoning-text": "#C9D3E3",
  "--reasoning-line": "#C9D3E3",
  "--reasoning-bg": "#333B48",
  "--reasoning-border": "#707887",
  "--agree": "#86B58D",
  "--agree-text": "#86B58D",
  "--agree-bg": "#1E2A22",
  "--agree-border": "#3F5A45",
  "--dispute": "#FF8A7A",
  "--dispute-text": "#FF8A7A",
  "--dispute-bg": "#3A1F1F",
  "--dispute-border": "#7A3A35",
  "--ok-dot": "#86B58D",
  "--ok-text": "#86B58D",
  "--ok-bg": "#1E2A22",
  "--ok-border": "#3F5A45",
  "--gen-dot": "#FF9A45",
  "--gen-text": "#FFB374",
  "--gen-bg": "#33241A",
  "--gen-border": "#8C4510",
  "--score-strength-text": "#86B58D",
  "--score-strength-bg": "#1E2A22",
  "--score-strength-border": "#3F5A45",
  "--score-uncertainty-text": "#FFB374",
  "--score-uncertainty-bg": "#33241A",
  "--score-uncertainty-border": "#8C4510",
  "--score-impact-text": "#C9D3E3",
  "--score-impact-bg": "#333B48",
  "--score-impact-border": "#707887",
  "--m-claude": "#8A63C9",
  "--m-gpt": "#B4552D",
  "--m-gemini": "#3D6FB4",
  "--m-grok": "#5F6670",
  "--m-qwen": "#3F8E7C",
  "--m-default": "#888888",
  "--m-claude-bg": "#292944",
  "--m-claude-border": "#50407A",
  "--m-gpt-bg": "#30272B",
  "--m-gpt-border": "#663A2C",
  "--m-gemini-bg": "#1D2B41",
  "--m-gemini-border": "#2A4670",
  "--m-grok-bg": "#232A36",
  "--m-grok-border": "#3B424E",
  "--m-qwen-bg": "#1D3038",
  "--m-qwen-border": "#2B5654",
  "--m-default-bg": "#292F3A",
  "--m-default-border": "#50535A",
  "--accent": "#7C9DFF",
  "--link": "#7C9DFF",
  "--focus": "#FF9A45",
  "--focus-halo": "rgba(255,154,69,.32)",
  "--shadow-card": "0 22px 48px -22px rgba(0,0,0,.8)",
  "--shadow-pop": "0 24px 56px -24px rgba(0,0,0,.85)",
  "--shadow-drawer": "-26px 0 62px -26px rgba(0,0,0,.9)",
  "--shadow-chrome": "0 18px 40px -22px rgba(0,0,0,.8)",
  "--grid-dot": "rgba(238,242,248,.07)",
  "--shadow-auth-card": "0 48px 90px -44px rgba(0,0,0,.85)",
  "--lp-raised": "#232C3C",
  "--lp-glass": "rgba(23,30,43,0.66)",
  "--lp-nav-shadow": "0 26px 60px -24px rgba(0,0,0,0.85)",
  "--lp-card-shadow": "0 60px 110px -40px rgba(0,0,0,0.9),0 18px 44px -20px rgba(0,0,0,0.7)",
  "--lp-core-inset": "inset 0 1px 0 rgba(255,255,255,0.06),inset 0 0 0 1px rgba(255,255,255,0.02)",
  "--lp-arrow-bg": "rgba(0,0,0,0.14)",
  "--lp-arrow-border": "rgba(0,0,0,0.22)",
  "--lp-r-shell": "28px",
  "--lp-r-core": "18px",
  "--lp-r-btn": "999px",
  "--lp-r-arrow": "999px",
  "--lp-r-nav": "999px",
  "--lp-fw-display": "700",
  "--lp-ls-display": "-0.03em",
  "--shadow-tab": "0 6px 16px -8px rgba(0,0,0,.75)",
  "--ok-soft": "rgba(134,181,141,.35)",
  "--ok-edge": "rgba(134,181,141,.55)",
  "--muted-bg": "rgba(139,149,168,.12)",
  "--muted-border": "rgba(139,149,168,.5)",
  "--accent-text": "#7C9DFF",
  "--accent-bg": "#24315A",
  "--accent-border": "#3D4F86",
  "--accent-halo": "rgba(124,157,255,.32)",
  "--brand": "#7C9DFF",
  "--on-brand": "#0E131D",
  "--on-ink": "#0E131D",
  "--cta": "#FF9A45",
  "--on-cta": "#0E131D",
  "--cta-border": "#FF9A45",
  "--cta-shadow": "#8C4510",
  "--hard": "#C9D3E3",
  "--hard-shadow": "#2E3A50",
  "--shadow-soft": "0 18px 40px -22px rgba(0,0,0,.8)",
  "--case-ink": "#8B95A8",
  "--chip": "#232C3C",
  "--track": "#2A3446",
  "--dashed": "#66738A",
  "--field": "#121925",
  "--field-border": "#34405A"
} as const satisfies Readonly<Record<TokenName, string>>;

const MODE_INDEPENDENT = {
  "--font-display": "var(--font-bricolage), \"Bricolage Grotesque\", var(--font-instrument), \"Instrument Sans\", system-ui, sans-serif",
  "--font-sans": "var(--font-instrument), \"Instrument Sans\", ui-sans-serif, system-ui, sans-serif",
  "--font-mono": "var(--font-sans)",
  "--font-serif": "var(--font-display)",
  "--r-card": "14px",
  "--r-panel": "16px",
  "--r-btn": "12px",
  "--r-pill": "999px",
  "--r-tab": "0 0 5px 5px",
  "--r-dot": "50%",
  "--safe-b": "env(safe-area-inset-bottom, 0px)",
  "--dock-w": "min(360px, calc(100vw - 36px))",
  "--dock-max-h": "96px",
  "--dock-offset-b": "calc(18px + var(--safe-b))",
  "--zoom-cluster-w": "52px",
  "--zoom-cluster-offset-b": "calc(var(--dock-offset-b) + var(--dock-max-h) + 12px)",
  "--token-dock-clearance": "calc(18px + var(--dock-max-h))",
  "--z-canvas-sticky": "4",
  "--z-zoom-cluster": "5",
  "--t-hero": "clamp(44px, 9.2vw, 118px)",
  "--t-display": "clamp(30px, 4.4vw, 56px)",
  "--t-title": "clamp(22px, 2.2vw, 28px)",
  "--t-lede": "clamp(16px, 1.5vw, 19.5px)",
  "--t-body": "15.5px",
  "--t-ui": "13.5px",
  "--t-meta": "12px",
  "--t-micro": "11px",
  "--t-nano": "9.5px",
  "--lh-hero": "0.96",
  "--ls-hero": "-0.03em",
  "--ls-eyebrow": "0.18em",
  "--fvs-display": "normal",
  "--fw-display": "700",
  "--shadow-thumb": "0 1px 4px rgba(0,0,0,.3)",
  "--shadow-knob": "0 1px 3px rgba(0,0,0,.3)",
  "--qr-paper": "#FFFFFF",
  "--qr-ink": "#111111",
  "--scrim": "rgba(11,16,27,.45)",
  "--z-consent-bar": "45",
  "--z-consent-scrim": "75",
  "--z-consent-card": "76",
  "--z-policy-scrim": "77",
  "--z-policy-card": "78",
  "--ls-display": "-0.02em",
  "--shadow-big": "0 5px 0 var(--hard-shadow)",
  "--lp-btn-shadow": "0 4px 0 var(--cta-shadow)"
} as const satisfies Readonly<Record<TokenName, string>>;

const TEXT_TOKENS = [
  "--text",
  "--text-strong",
  "--text-2",
  "--text-3",
  "--muted",
  "--muted-2",
  "--pro-text",
  "--con-text",
  "--gold-text",
  "--agree-text",
  "--dispute-text",
  "--reasoning-text"
] as const;

const LINE_TOKENS = ["--pro-line", "--con-line", "--gold-line", "--reasoning-line", "--focus"] as const;
const SURFACE_TOKENS = ["--bg", "--surface", "--surface-2", "--surface-sunken"] as const;

async function tokenContract(): Promise<TokenContractModule> {
  expect(existsSync(tokenSupportPath), "tests/support/tokenContract.ts exists").toBe(true);
  return vi.importActual<TokenContractModule>("../support/tokenContract.js");
}

async function contrastContract(): Promise<ContrastModule> {
  expect(existsSync(contrastSupportPath), "tests/support/contrast.ts exists").toBe(true);
  return vi.importActual<ContrastModule>("../support/contrast.js");
}

function canonicalCssValue(value: string): string {
  return value
    .replace(/\s*,\s*/g, ",")
    .replace(/"\s+(?=[\d-])/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Flattens a translucent `rgba(r,g,b,a)` token onto the opaque surface it is
 * painted over, per channel: `c = round(alpha*fg + (1-alpha)*bg)`.
 *
 * It exists because `tests/support/contrast.ts:3-5` throws on any argument that
 * is not `#RRGGBB`, so a tint's contrast cannot be asked of the shared helper at
 * all — and a reader never sees the tint, only this composite. Local to this
 * file on purpose: `tests/support/contrast.ts` is iterated by 34 published
 * contrast rows other missions depend on and is not this slice's to change.
 */
function composite(rgba: string, hexSurface: string): string {
  const parsed = /^rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),(\.\d+|\d+(?:\.\d+)?)\)$/.exec(rgba);
  if (!parsed) throw new TypeError(`Expected a comma-tight rgba() colour, received ${rgba}`);
  if (!/^#[0-9a-f]{6}$/i.test(hexSurface)) {
    throw new TypeError(`Expected an #RRGGBB surface, received ${hexSurface}`);
  }
  const alpha = Number(parsed[4]);
  const channel = (index: number): string => {
    const foreground = Number(parsed[index + 1]);
    const background = Number.parseInt(hexSurface.slice(1 + index * 2, 3 + index * 2), 16);
    const flattened = Math.round(alpha * foreground + (1 - alpha) * background);
    return flattened.toString(16).toUpperCase().padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** A 1-indexed, inclusive line interval. */
export type LineRange = readonly [start: number, end: number];

/**
 * The two token-block intervals in globals.css, located by syntax.
 * Throws if either block is absent or unclosed — a boundary the guard cannot
 * find is a broken guard, and a broken guard must stop the run.
 */
function tokenBlockRanges(css: string): readonly LineRange[] {
  const lines = css.split("\n");
  const find = (re: RegExp, label: string): LineRange => {
    const start = lines.findIndex((l) => re.test(l));
    if (start === -1) throw new Error(`${label} token block not found in globals.css`);
    const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
    if (end === -1) throw new Error(`${label} token block is not closed`);
    return [start + 1, end + 1];
  };
  return [
    find(/^:root\s*\{/, ":root"),
    find(/^html\[data-mode="chamber"\]\s*\{/, "chamber")
  ];
}

const isInsideTokenBlocks = (n: number, ranges: readonly LineRange[]): boolean =>
  ranges.some(([start, end]) => n >= start && n <= end);

describe("T9-C3 token contract", () => {
  it("declares the complete inventory and the same mode-bearing key set in both modes", async () => {
    // PROPERTY: every inventory key is declared exactly once in its owning block,
    // and every mode-bearing key has both a Terracotta and Chamber value.
    const { styledDocument, tokenValue, declaredTokenNames, chamberTokenNames } = await tokenContract();
    const { window } = styledDocument();
    const rootNames = [...declaredTokenNames()];
    const chamberNames = [...chamberTokenNames()];
    const expectedRoot = [...Object.keys(TERRACOTTA), ...Object.keys(MODE_INDEPENDENT)].sort();
    const expectedChamber = Object.keys(CHAMBER).sort();

    expect(new Set(rootNames).size, "no duplicate :root declarations").toBe(rootNames.length);
    expect(new Set(chamberNames).size, "no duplicate Chamber declarations").toBe(chamberNames.length);
    expect(rootNames.sort(), ":root inventory names").toEqual(expectedRoot);
    expect(chamberNames.sort(), "Chamber inventory names").toEqual(expectedChamber);

    for (const [name, value] of Object.entries(TERRACOTTA)) {
      expect(tokenValue(window, name as TokenName, "terracotta"), `Terracotta ${name}`).toBe(value);
    }
    for (const [name, value] of Object.entries(CHAMBER)) {
      expect(tokenValue(window, name as TokenName, "chamber"), `Chamber ${name}`).toBe(value);
    }
    for (const [name, value] of Object.entries(MODE_INDEPENDENT)) {
      expect(
        canonicalCssValue(tokenValue(window, name as TokenName, "terracotta")),
        `mode-independent ${name}`
      ).toBe(canonicalCssValue(value));
    }
  });

  it("switches the real stylesheet live between the two background and stance palettes", async () => {
    // PROPERTY: changing only html[data-mode] re-cascades the real stylesheet
    // from the complete Terracotta values to the complete Chamber values.
    const { styledDocument, tokenValue } = await tokenContract();
    const { window } = styledDocument();

    expect(tokenValue(window, "--bg", "terracotta")).toBe("#F3F5F9");
    expect(tokenValue(window, "--pro", "terracotta")).toBe("#2350D8");
    expect(tokenValue(window, "--con", "terracotta")).toBe("#E8701A");
    expect(tokenValue(window, "--bg", "chamber")).toBe("#0E131D");
    expect(tokenValue(window, "--pro", "chamber")).toBe("#7C9DFF");
    expect(tokenValue(window, "--con", "chamber")).toBe("#FF9A45");
  });

  it("clears all 34 published contrast rows against all four surfaces", async () => {
    // PROPERTY: each of the 17 meaning-bearing tokens clears its role floor on
    // the worst of four surfaces in each mode (17 tokens x 2 modes = 34 rows).
    const { styledDocument, tokenValue } = await tokenContract();
    const { contrastRatio, relativeLuminance, worstRatios } = await contrastContract();
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBe(1);
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);

    let measuredRows = 0;
    for (const mode of ["terracotta", "chamber"] as const) {
      const { window } = styledDocument();
      const surfaces = SURFACE_TOKENS.map((name) => tokenValue(window, name, mode));
      for (const [names, floor] of [
        [TEXT_TOKENS, 4.5],
        [LINE_TOKENS, 3]
      ] as const) {
        const values = Object.fromEntries(names.map((name) => [name, tokenValue(window, name, mode)]));
        const rows = worstRatios(values, surfaces);
        expect(rows).toHaveLength(names.length);
        for (const row of rows) {
          expect(row.ratio, `${mode} ${row.token} on ${row.surface}`).toBeGreaterThanOrEqual(floor);
          measuredRows += 1;
        }
      }
    }
    expect(measuredRows).toBe(34);
  });

  it("clears 4.5:1 for --muted on --muted-bg over --core, and 3:1 for the toggle's ON-vs-OFF state, in both modes", async () => {
    // PROPERTY: a translucent tint's readability is measured against the colour a
    // reader actually sees — the tint composited over its opaque surface — never
    // against the tint's own unrenderable rgba string. The two toggle rows are
    // WCAG 1.4.11 non-text contrast: the ON and OFF tracks are adjacent states of
    // one control and must be tellable apart at 3:1.
    const { styledDocument, tokenValue } = await tokenContract();
    const { contrastRatio } = await contrastContract();

    // The ratios are pinned to three decimals, not merely floored, so that any
    // edit to --muted, --muted-bg, --core, --ok-dot or --shell has to restate
    // this measurement in the same commit rather than drift past it silently.
    for (const [mode, expectedSurface, expectedRatio] of [
      ["terracotta", "#EFF0F2", 4.988],
      ["chamber", "#252C3A", 4.641]
    ] as const) {
      const { window } = styledDocument();
      const surface = composite(
        tokenValue(window, "--muted-bg", mode),
        tokenValue(window, "--core", mode)
      );
      expect(surface, `${mode} --muted-bg over --core`).toBe(expectedSurface);

      const ratio = contrastRatio(tokenValue(window, "--muted", mode), surface);
      expect(ratio, `${mode} --muted on ${surface} = ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(
        4.5
      );
      expect(Number(ratio.toFixed(3)), `${mode} --muted on ${surface}`).toBe(expectedRatio);
    }

    for (const [mode, expectedRatio] of [
      ["terracotta", 4.642],
      ["chamber", 6.017]
    ] as const) {
      const { window } = styledDocument();
      const on = tokenValue(window, "--ok-dot", mode);
      const off = tokenValue(window, "--shell", mode);
      const ratio = contrastRatio(on, off);
      expect(ratio, `${mode} toggle ON ${on} vs OFF ${off} = ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(
        3
      );
      expect(Number(ratio.toFixed(3)), `${mode} toggle ON ${on} vs OFF ${off}`).toBe(expectedRatio);
    }
  });
});

describe("T9-C3 mode control and document guard", () => {
  it("renders one accessible toggle that reads the document mode, flips it, and persists it", async () => {
    // PROPERTY: the real control treats the document marker as initial truth and
    // one activation atomically flips marker, accessible state, label, and storage.
    expect(existsSync(modeTogglePath), "apps/ui/components/ModeToggle.tsx exists").toBe(true);
    const [{ ModeToggle }, { I18nProvider }] = await Promise.all([
      vi.importActual<ModeToggleModule>("../../apps/ui/components/ModeToggle.js"),
      vi.importActual<I18nProviderModule>("../../apps/ui/lib/i18n/I18nProvider.js")
    ]);
    const chromeCatalog = JSON.parse(
      readFileSync(resolve(root, "apps/ui/messages/en/chrome.json"), "utf8")
    ) as Readonly<Record<string, string>>;
    const dom = new JSDOM("<!doctype html><html data-mode='chamber'><body><div id='root'></div></body></html>", {
      url: "https://app.debateai.test/"
    });
    const previous = new Map<PropertyKey, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({
      window: dom.window,
      document: dom.window.document,
      HTMLElement: dom.window.HTMLElement,
      Event: dom.window.Event,
      MouseEvent: dom.window.MouseEvent,
      localStorage: dom.window.localStorage,
      IS_REACT_ACT_ENVIRONMENT: true
    })) {
      previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    const reactRoot = createRoot(dom.window.document.getElementById("root")!);
    try {
      await act(async () => {
        reactRoot.render(createElement(
          I18nProvider,
          { locale: "en", catalog: chromeCatalog },
          createElement(ModeToggle)
        ));
        await Promise.resolve();
      });
      const button = dom.window.document.querySelector<HTMLButtonElement>("button[data-mode-toggle]");
      expect(button, "single mode button").not.toBeNull();
      expect(dom.window.document.querySelectorAll("button[data-mode-toggle]")).toHaveLength(1);
      expect(button!.type).toBe("button");
      expect(button!.className).toBe("modeToggle");
      expect(button!.getAttribute("aria-pressed")).toBe("true");
      expect(button!.getAttribute("aria-label")).toBe("Switch to light mode");
      // V 2026-09-26: the glyph is the whole visible control; no theme name is rendered.
      expect(button!.textContent).toBe("☀");

      await act(async () => button!.click());
      expect(dom.window.document.documentElement.dataset.mode).toBe("terracotta");
      expect(dom.window.localStorage.getItem("debateai.mode")).toBe("terracotta");
      expect(button!.getAttribute("aria-pressed")).toBe("false");
      expect(button!.getAttribute("aria-label")).toBe("Switch to dark mode");
      expect(button!.textContent).toBe("☾");
    } finally {
      await act(async () => reactRoot.unmount());
      dom.window.close();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it("loads the named variable fonts and installs the blocking storage guard before children", () => {
    // PROPERTY: the root layout exposes the two ratified font variables and
    // executes the validated storage read in head before rendering app children.
    const source = readFileSync(layoutPath, "utf8");
    // Design Document v2: Bricolage Grotesque (display, with its optical-size axis) and Instrument Sans (text); the
    // former mono labels are set in the text face, so there is no third family.
    expect(source).toContain("Bricolage_Grotesque, Instrument_Sans");
    expect(source).not.toMatch(/Fraunces|Plus_Jakarta_Sans|JetBrains_Mono|Source_Serif_4|Hanken_Grotesk/);
    expect(source).toContain('axes: ["opsz"]');
    expect(source).toContain('variable: "--font-bricolage"');
    expect(source).toContain('variable: "--font-instrument"');
    expect(source).toContain("<head>");
    expect(source).toContain("dangerouslySetInnerHTML");
    expect(source).toContain("try{var m=localStorage.getItem('debateai.mode')");
    expect(source).toContain("localStorage.getItem('debateai.mode')");
    expect(source).toContain("m==='chamber'||m==='terracotta'");
    expect(source).toContain("document.documentElement.dataset.mode=m");
    expect(source).toContain("catch(e){}");
    expect(source.indexOf("<head>"), "head precedes app children").toBeLessThan(source.indexOf("{children}"));

    const toggleSource = readFileSync(modeTogglePath, "utf8");
    expect(toggleSource, "head script remains storage's single reader").not.toContain("localStorage.getItem");
  });

  it("keeps the pre-paint storage guard inside head and before body", () => {
    // PROPERTY: the storage reader executes from the document head, never after
    // application children where the first Terracotta paint could already occur.
    const source = readFileSync(layoutPath, "utf8");
    const headStart = source.indexOf("<head");
    const guardStart = source.indexOf("dangerouslySetInnerHTML");
    const headEnd = source.indexOf("</head>");
    const bodyStart = source.indexOf("<body");

    expect(headStart, "head opening exists").toBeGreaterThanOrEqual(0);
    expect(guardStart, "guard follows head opening").toBeGreaterThan(headStart);
    expect(guardStart, "guard is inside head").toBeLessThan(headEnd);
    expect(headEnd, "head closes before body opens").toBeLessThan(bodyStart);
  });

  it("keeps hydration-warning suppression on both document root elements", () => {
    // PROPERTY: the server html/body tolerate the head guard's pre-hydration
    // data-mode mutation instead of reporting a mismatch for returning readers.
    const source = readFileSync(layoutPath, "utf8");

    expect(source, "html suppresses the expected data-mode mismatch").toMatch(
      /<html\b[^>]*\bsuppressHydrationWarning(?:\s|>)/
    );
    expect(source, "body retains its hydration suppression").toMatch(
      /<body\b[^>]*\bsuppressHydrationWarning(?:\s|>)/
    );
  });

  it("leaves no mode-inert colour literal in the four Wave-0 product files", () => {
    // PROPERTY: outside globals.css's declared token region, every owned product
    // colour is a custom-property reference and can therefore respond to mode.
    const patterns = /oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i;
    const hits: string[] = [];
    for (const path of [globalsPath, layoutPath, modeTogglePath, presentationPath]) {
      if (!existsSync(path)) {
        hits.push(`${path}:missing`);
        continue;
      }
      const css = readFileSync(path, "utf8");
      const ranges = path === globalsPath ? tokenBlockRanges(css) : [];
      const lines = css.split("\n");
      for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        if (path === globalsPath && isInsideTokenBlocks(lineNumber, ranges)) continue;
        if (patterns.test(line)) hits.push(`${path}:${lineNumber}:${line.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

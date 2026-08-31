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

const root = process.cwd();
const globalsPath = resolve(root, "apps/ui/app/globals.css");
const layoutPath = resolve(root, "apps/ui/app/layout.tsx");
const modeTogglePath = resolve(root, "apps/ui/components/ModeToggle.tsx");
const presentationPath = resolve(root, "apps/ui/lib/debatePresentation.ts");
const tokenSupportPath = resolve(root, "tests/support/tokenContract.ts");
const contrastSupportPath = resolve(root, "tests/support/contrast.ts");

const TERRACOTTA = {
  "--bg": "#F9F6F1",
  "--surface": "#FDFBF6",
  "--surface-1": "#FDFBF6",
  "--surface-2": "#F4F0E8",
  "--surface-sunken": "#EFE9E0",
  "--shell": "#EFE9E0",
  "--core": "#FDFBF6",
  "--header-bg": "rgba(251,249,244,.8)",
  "--ink": "#29261F",
  "--ink-hover": "#3A362D",
  "--text": "#29261F",
  "--text-strong": "#1A1613",
  "--text-2": "#555147",
  "--text-3": "#6E675C",
  "--muted": "#6E675C",
  "--muted-2": "#6E675C",
  "--line": "rgba(41,38,31,.10)",
  "--line-2": "rgba(41,38,31,.12)",
  "--line-strong": "rgba(41,38,31,.20)",
  "--pro": "#3F7466",
  "--pro-text": "#3F7365",
  "--pro-line": "#3F7466",
  "--pro-bg": "#E6EBE5",
  "--pro-border": "#ADC2BA",
  "--con": "#C15F3C",
  "--con-text": "#A55133",
  "--con-line": "#C15F3C",
  "--con-bg": "#F6E8E0",
  "--con-border": "#E4B9A8",
  "--gold": "#A8823E",
  "--gold-text": "#826530",
  "--gold-line": "#A5803D",
  "--gold-bg": "#F3ECE0",
  "--gold-border": "#D9C8A9",
  "--reasoning": "#3D5A80",
  "--reasoning-text": "#3D5A80",
  "--reasoning-line": "#3D5A80",
  "--reasoning-bg": "#E6E8E8",
  "--reasoning-border": "#ACB7C4",
  "--agree": "#3E7A4E",
  "--agree-text": "#3C754B",
  "--agree-bg": "#E6ECE2",
  "--agree-border": "#ADC5AF",
  "--dispute": "#B0432F",
  "--dispute-text": "#B0432F",
  "--dispute-bg": "#F4E5DE",
  "--dispute-border": "#DDAEA2",
  "--ok-dot": "#3E7A4E",
  "--ok-text": "#3C754B",
  "--ok-bg": "#E6ECE2",
  "--ok-border": "#ADC5AF",
  "--gen-dot": "#A8823E",
  "--gen-text": "#826530",
  "--gen-bg": "#F3ECE0",
  "--gen-border": "#D9C8A9",
  "--score-strength-text": "#3C754B",
  "--score-strength-bg": "#E6ECE2",
  "--score-strength-border": "#ADC5AF",
  "--score-uncertainty-text": "#826530",
  "--score-uncertainty-bg": "#F3ECE0",
  "--score-uncertainty-border": "#D9C8A9",
  "--score-impact-text": "#3D5A80",
  "--score-impact-bg": "#E6E8E8",
  "--score-impact-border": "#ACB7C4",
  "--m-claude": "#8A63C9",
  "--m-gpt": "#B4552D",
  "--m-gemini": "#3D6FB4",
  "--m-grok": "#5F6670",
  "--m-qwen": "#3F8E7C",
  "--m-default": "#888888",
  "--m-claude-bg": "#EFE9F1",
  "--m-claude-border": "#CDBBE3",
  "--m-gpt-bg": "#F4E7DE",
  "--m-gpt-border": "#DEB5A2",
  "--m-gemini-bg": "#E6EAEE",
  "--m-gemini-border": "#ACC0DA",
  "--m-grok-bg": "#EAE9E6",
  "--m-grok-border": "#BBBCBE",
  "--m-qwen-bg": "#E6EEE7",
  "--m-qwen-border": "#ADCDC3",
  "--m-default-bg": "#EFEDE9",
  "--m-default-border": "#CCCBC8",
  "--accent": "#C15F3C",
  "--link": "#3D5A80",
  "--focus": "#C15F3C",
  "--shadow-card": "0 18px 40px -20px rgba(41,38,31,.24)",
  "--shadow-pop": "0 30px 60px -26px rgba(41,38,31,.32)",
  "--shadow-drawer": "-22px 0 54px -22px rgba(41,38,31,.32)",
  "--shadow-chrome": "0 20px 46px -22px rgba(26,22,19,.26)"
} as const satisfies Readonly<Record<TokenName, string>>;

const CHAMBER = {
  "--bg": "#14110E",
  "--surface": "#181410",
  "--surface-1": "#181410",
  "--surface-2": "#171310",
  "--surface-sunken": "#221D17",
  "--shell": "#221D17",
  "--core": "#181410",
  "--header-bg": "rgba(20,17,14,.7)",
  "--ink": "#F2EAD9",
  "--ink-hover": "#FFF8E8",
  "--text": "#F2EAD9",
  "--text-strong": "#FFFFFF",
  "--text-2": "#B5A88F",
  "--text-3": "#9C907A",
  "--muted": "#9C907A",
  "--muted-2": "#9C907A",
  "--line": "rgba(242,234,217,.09)",
  "--line-2": "rgba(242,234,217,.08)",
  "--line-strong": "rgba(242,234,217,.18)",
  "--pro": "#6E9E96",
  "--pro-text": "#6E9E96",
  "--pro-line": "#6E9E96",
  "--pro-bg": "#262A25",
  "--pro-border": "#435953",
  "--con": "#C8834F",
  "--con-text": "#C8834F",
  "--con-line": "#C8834F",
  "--con-bg": "#34261A",
  "--con-border": "#704C30",
  "--gold": "#C8A055",
  "--gold-text": "#C8A055",
  "--gold-line": "#C8A055",
  "--gold-bg": "#342A1B",
  "--gold-border": "#705A33",
  "--reasoning": "#C8A055",
  "--reasoning-text": "#C8A055",
  "--reasoning-line": "#C8A055",
  "--reasoning-bg": "#342A1B",
  "--reasoning-border": "#705A33",
  "--agree": "#86B58D",
  "--agree-text": "#86B58D",
  "--agree-bg": "#2A2E24",
  "--agree-border": "#4F654F",
  "--dispute": "#D67F65",
  "--dispute-text": "#D67F65",
  "--dispute-bg": "#36251E",
  "--dispute-border": "#774A3B",
  "--ok-dot": "#86B58D",
  "--ok-text": "#86B58D",
  "--ok-bg": "#2A2E24",
  "--ok-border": "#4F654F",
  "--gen-dot": "#C8A055",
  "--gen-text": "#C8A055",
  "--gen-bg": "#342A1B",
  "--gen-border": "#705A33",
  "--score-strength-text": "#86B58D",
  "--score-strength-bg": "#2A2E24",
  "--score-strength-border": "#4F654F",
  "--score-uncertainty-text": "#C8A055",
  "--score-uncertainty-bg": "#342A1B",
  "--score-uncertainty-border": "#705A33",
  "--score-impact-text": "#C8A055",
  "--score-impact-bg": "#342A1B",
  "--score-impact-border": "#705A33",
  "--m-claude": "#8A63C9",
  "--m-gpt": "#B4552D",
  "--m-gemini": "#3D6FB4",
  "--m-grok": "#5F6670",
  "--m-qwen": "#3F8E7C",
  "--m-default": "#888888",
  "--m-claude-bg": "#2A212E",
  "--m-claude-border": "#513C6D",
  "--m-gpt-bg": "#311E15",
  "--m-gpt-border": "#66351F",
  "--m-gemini-bg": "#1E232A",
  "--m-gemini-border": "#2B4262",
  "--m-grok-bg": "#23211F",
  "--m-grok-border": "#3C3D40",
  "--m-qwen-bg": "#1E2821",
  "--m-qwen-border": "#2C5146",
  "--m-default-bg": "#2A2723",
  "--m-default-border": "#504E4C",
  "--accent": "#C8834F",
  "--link": "#C8A055",
  "--focus": "#C8834F",
  "--shadow-card": "0 22px 48px -22px rgba(0,0,0,.8)",
  "--shadow-pop": "0 36px 70px -30px rgba(0,0,0,.9)",
  "--shadow-drawer": "-26px 0 62px -26px rgba(0,0,0,.9)",
  "--shadow-chrome": "0 24px 52px -24px rgba(0,0,0,.85)"
} as const satisfies Readonly<Record<TokenName, string>>;

const MODE_INDEPENDENT = {
  "--font-display": "var(--font-fraunces), \"Fraunces\", Georgia, serif",
  "--font-sans": "var(--font-jakarta), \"Plus Jakarta Sans\", ui-sans-serif, system-ui, sans-serif",
  "--font-mono": "var(--font-mono-src), \"JetBrains Mono\", ui-monospace, monospace",
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
  "--lh-hero": "0.92",
  "--ls-hero": "-0.035em",
  "--ls-eyebrow": "0.18em",
  "--fvs-display": "\"SOFT\" 0, \"WONK\" 1",
  "--fw-display": "480"
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

/** Last line of globals.css inside the token blocks (1-indexed, inclusive). */
function tokenBlockBoundary(css: string): number {
  const lines = css.split("\n");
  const start = lines.findIndex((l) => /^html\[data-mode="chamber"\]\s*\{/.test(l));
  if (start === -1) throw new Error("chamber token block not found in globals.css");
  const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
  if (end === -1) throw new Error("chamber token block is not closed");
  return end + 1;
}

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

    expect(tokenValue(window, "--bg", "terracotta")).toBe("#F9F6F1");
    expect(tokenValue(window, "--pro", "terracotta")).toBe("#3F7466");
    expect(tokenValue(window, "--con", "terracotta")).toBe("#C15F3C");
    expect(tokenValue(window, "--bg", "chamber")).toBe("#14110E");
    expect(tokenValue(window, "--pro", "chamber")).toBe("#6E9E96");
    expect(tokenValue(window, "--con", "chamber")).toBe("#C8834F");
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
});

describe("T9-C3 mode control and document guard", () => {
  it("renders one accessible toggle that reads the document mode, flips it, and persists it", async () => {
    // PROPERTY: the real control treats the document marker as initial truth and
    // one activation atomically flips marker, accessible state, label, and storage.
    expect(existsSync(modeTogglePath), "apps/ui/components/ModeToggle.tsx exists").toBe(true);
    const { ModeToggle } = await vi.importActual<ModeToggleModule>("../../apps/ui/components/ModeToggle.js");
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
        reactRoot.render(createElement(ModeToggle));
        await Promise.resolve();
      });
      const button = dom.window.document.querySelector<HTMLButtonElement>("button[data-mode-toggle]");
      expect(button, "single mode button").not.toBeNull();
      expect(dom.window.document.querySelectorAll("button[data-mode-toggle]")).toHaveLength(1);
      expect(button!.type).toBe("button");
      expect(button!.className).toBe("modeToggle");
      expect(button!.getAttribute("aria-pressed")).toBe("true");
      expect(button!.getAttribute("aria-label")).toBe("Switch to Terracotta mode");
      expect(button!.textContent).toBe("☀ Terracotta");

      await act(async () => button!.click());
      expect(dom.window.document.documentElement.dataset.mode).toBe("terracotta");
      expect(dom.window.localStorage.getItem("debateai.mode")).toBe("terracotta");
      expect(button!.getAttribute("aria-pressed")).toBe("false");
      expect(button!.getAttribute("aria-label")).toBe("Switch to Chamber mode");
      expect(button!.textContent).toBe("☾ Chamber");
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
    // PROPERTY: the root layout exposes the three ratified font variables and
    // executes the validated storage read in head before rendering app children.
    const source = readFileSync(layoutPath, "utf8");
    expect(source).toContain("Fraunces, Plus_Jakarta_Sans, JetBrains_Mono");
    expect(source).not.toMatch(/Source_Serif_4|Hanken_Grotesk/);
    expect(source).toContain('axes: ["SOFT", "WONK", "opsz"]');
    expect(source).toContain('variable: "--font-fraunces"');
    expect(source).toContain('variable: "--font-jakarta"');
    expect(source).toContain('variable: "--font-mono-src"');
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
      const lines = css.split("\n");
      for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        if (path === globalsPath && lineNumber <= tokenBlockBoundary(css)) continue;
        if (patterns.test(line)) hits.push(`${path}:${lineNumber}:${line.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

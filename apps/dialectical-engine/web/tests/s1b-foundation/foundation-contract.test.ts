import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const readWebFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");

const layout = readWebFile("app/layout.tsx");
const base = readWebFile("styles/base.css");
const appShell = readWebFile("styles/debate-chrome-header.css");
const debateShell = readWebFile("styles/debate-chrome.css");
const drawers = readWebFile("styles/drawers.css");
const responsive = readWebFile("styles/responsive.css");
const forms = readWebFile("styles/forms.css");
const outline = readWebFile("styles/canvas-outline.css");
const thread = readWebFile("styles/thread.css");

const productionCss = [base, appShell, debateShell, drawers, responsive, forms, outline, thread].join("\n");

function declarationCount(source: string, property: string) {
  return source.match(new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "g"))?.length ?? 0;
}

describe("S1b viewport and safe-area contract", () => {
  test("exports the zoom-safe Next.js viewport contract", () => {
    expect(layout).toMatch(/import\s+type\s+\{\s*Viewport\s*\}\s+from\s+"next";/);
    expect(layout).toMatch(
      /export const viewport: Viewport = \{\s*width: "device-width",\s*initialScale: 1,\s*viewportFit: "cover"\s*\};/
    );
    expect(layout).not.toMatch(/\bmaximumScale\b/);
    expect(layout).not.toMatch(/\buserScalable\b/);
  });

  test("keeps viewportFit and the safe-area shell clearance structurally coupled", () => {
    expect(base).toMatch(
      /--safe-b:\s*env\(safe-area-inset-bottom,\s*0px\);[^\n]*requires viewportFit: "cover"/
    );
    expect(debateShell).toMatch(
      /padding-bottom:\s*calc\(var\(--token-dock-clearance\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\);/
    );
    expect(debateShell).toMatch(/requires (?:the )?viewportFit: "cover"/);
  });

  test("uses 100dvh after a 100vh fallback in both flex shells", () => {
    expect(appShell).toMatch(
      /\.appShell\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*100vh;[^}]*min-height:\s*100dvh;/s
    );
    expect(debateShell).toMatch(
      /\.debateView\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s
    );
    expect(debateShell).not.toMatch(/padding-bottom:\s*58px/);
  });
});

describe("S1b collision, breakpoint, and typography tokens", () => {
  const collisionTokens = {
    "--safe-b": 'env(safe-area-inset-bottom, 0px)',
    "--dock-w": "min(360px, calc(100vw - 36px))",
    "--dock-collapsed-w": "168px",
    "--dock-max-h": "96px",
    "--dock-offset-b": "calc(18px + var(--safe-b))",
    "--zoom-cluster-w": "52px",
    "--zoom-cluster-offset-b": "calc(var(--dock-offset-b) + var(--dock-max-h) + 12px)",
    "--token-dock-clearance": "calc(18px + var(--dock-max-h))",
    "--z-canvas-sticky": "4",
    "--z-zoom-cluster": "5",
    "--z-dock": "40",
    "--z-sheet": "50",
    "--z-drawer": "55",
    "--z-pop": "60",
    "--z-modal": "70"
  } as const;

  test("defines the amended collision map once, centrally in base.css", () => {
    for (const [property, value] of Object.entries(collisionTokens)) {
      expect(base).toContain(`${property}: ${value};`);
      expect(declarationCount(productionCss, property), `${property} definition count`).toBe(1);
    }
  });

  test("makes every canonical breakpoint available as a foundation token", () => {
    for (const width of [480, 640, 768, 920, 1200]) {
      expect(base).toContain(`--bp-${width}: ${width}px;`);
    }
  });

  test("uses fluid clamps for display, lede, and route hero copy", () => {
    for (const [source, selector] of [
      [forms, ".display.lg"],
      [forms, ".display.md"],
      [forms, ".display.sm"],
      [forms, ".lede"],
      [drawers, ".drawerClaim"],
      [outline, ".outlineRoot"],
      [thread, ".threadRootClaim"]
    ] as const) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(source, selector).toMatch(new RegExp(`${escapedSelector}\\s*\\{[^}]*font-size:\\s*clamp\\(`, "s"));
    }
  });
});

describe("S1b browser geometry safeguards", () => {
  test("preserves text sizing and removes viewport-width drawer geometry", () => {
    expect(base).toMatch(
      /html\s*\{[^}]*-webkit-text-size-adjust:\s*100%;[^}]*text-size-adjust:\s*100%;[^}]*\}/s
    );
    expect(drawers).toMatch(/\.drawer\s*\{[^}]*max-width:\s*100%;/s);
    expect(drawers).not.toMatch(/\.drawer\s*\{[^}]*max-width:\s*100vw;/s);
    expect(responsive).toMatch(/\.drawer\s*\{[^}]*width:\s*100%;/s);
    expect(responsive).not.toMatch(/\.drawer\s*\{[^}]*width:\s*100vw;/s);
  });

  test("declares a 16px minimum for focusable form controls at 768px and below", () => {
    expect(responsive).toMatch(
      /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*:where\(button,\s*input,\s*textarea,\s*select\)\s*\{[^}]*font-size:\s*max\(16px,\s*1em\)\s*!important;/
    );
  });
});

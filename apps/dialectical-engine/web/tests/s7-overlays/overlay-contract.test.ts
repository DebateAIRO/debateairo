import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const readWebFile = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");

const challengePopover = readWebFile("components/ChallengePopover.tsx");
const drawers = readWebFile("styles/drawers.css");
const overlays = readWebFile("styles/overlays.css");

function rule(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "s"))?.[1] ?? "";
}

describe("S7 popover and safe-area contract", () => {
  test("hands the challenge coordinates to CSS so phone layouts can viewport-clamp the card", () => {
    expect(challengePopover).toContain('"--popover-x": `${state.x}px`');
    expect(challengePopover).toContain('"--popover-y": `${state.y}px`');
    expect(challengePopover).not.toMatch(/style=\{\{\s*left:\s*state\.x,\s*top:\s*state\.y\s*\}\}/);

    const phoneRules = overlays.slice(overlays.indexOf("@media (max-width: 640px)"));
    expect(rule(phoneRules, ".popAnchor")).toMatch(/inset:\s*0;/);
    expect(rule(phoneRules, ".popAnchor")).toMatch(/transform:\s*none;/);
    expect(rule(phoneRules, ".popAnchor")).toMatch(/overflow:\s*auto;/);
    expect(rule(phoneRules, ".popCard")).toMatch(/max-height:\s*100dvh;/);
    expect(rule(phoneRules, ".popCard")).toMatch(/overflow-y:\s*auto;/);
  });

  test("makes the phone drawer full-screen and pads every safe-area edge", () => {
    const phoneRules = drawers.slice(drawers.indexOf("@media (max-width: 640px)"));
    const drawerRule = rule(phoneRules, ".drawer");

    expect(drawerRule).toMatch(/width:\s*100%;/);
    expect(drawerRule).toMatch(/padding-top:\s*env\(safe-area-inset-top,\s*0px\);/);
    expect(drawerRule).toMatch(/padding-right:\s*env\(safe-area-inset-right,\s*0px\);/);
    expect(drawerRule).toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom,\s*0px\);/);
    expect(drawerRule).toMatch(/padding-left:\s*env\(safe-area-inset-left,\s*0px\);/);
  });
});

describe("S7 fixed-chrome collision contract", () => {
  test("caps both token-dock states using only the foundation collision map", () => {
    const dockRule = rule(overlays, ".tokenDock");
    const formRule = rule(overlays, ".tokenDock > .tokenForm");
    const collapsedRule = rule(overlays, ".tokenDock > .btn");

    expect(dockRule).toMatch(/bottom:\s*var\(--dock-offset-b\);/);
    expect(dockRule).toMatch(/max-width:\s*var\(--dock-w\);/);
    expect(dockRule).toMatch(/max-height:\s*var\(--dock-max-h\);/);
    expect(dockRule).toMatch(/z-index:\s*var\(--z-dock\);/);

    expect(formRule).toMatch(/max-height:\s*var\(--dock-max-h\);/);
    expect(formRule).toMatch(/overflow-y:\s*auto;/);

    expect(collapsedRule).toMatch(/max-width:\s*var\(--dock-collapsed-w\);/);
    expect(collapsedRule).toMatch(/overflow:\s*hidden;/);
    expect(collapsedRule).toMatch(/text-overflow:\s*ellipsis;/);
    expect(collapsedRule).toMatch(/white-space:\s*nowrap;/);

    for (const token of [
      "--dock-w",
      "--dock-collapsed-w",
      "--dock-max-h",
      "--dock-offset-b",
      "--zoom-cluster-w",
      "--zoom-cluster-offset-b",
      "--z-dock"
    ]) {
      expect(drawers + overlays, `${token} must remain read-only`).not.toMatch(
        new RegExp(`${token}\\s*:`)
      );
    }
  });

  test("moves the phone toast below the two-row chrome while retaining centered geometry", () => {
    const phoneRules = overlays.slice(overlays.indexOf("@media (max-width: 640px)"));
    const toastRule = rule(phoneRules, ".toast.toast");

    expect(toastRule).toMatch(/top:\s*104px;/);
    expect(toastRule).toMatch(/bottom:\s*auto;/);
    expect(toastRule).toMatch(/left:\s*50%;/);
    expect(toastRule).toMatch(/right:\s*auto;/);
    expect(toastRule).toMatch(/max-width:\s*var\(--dock-w\);/);
    expect(toastRule).toMatch(/transform:\s*translateX\(-50%\);/);
  });
});

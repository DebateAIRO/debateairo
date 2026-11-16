import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Keyboard audit round 4 (2026-11-12), C5: four English instructions named only the mouse. The other 34 languages are
 * revised separately; this pins the English. The node drawer's line now names its Challenge button, which renders
 * whenever the line does (both wait on `generation?.argument && onChallenge` / `onChallenge`; NodeDetailDrawer.tsx).
 */
const read = (file: string) => JSON.parse(readFileSync(`${process.cwd()}/apps/ui/messages/en/${file}`, "utf8")) as Record<string, string>;

describe("C5: the English instructions do not name only the mouse", () => {
  it("the four strings", () => {
    const views = read("debateViews.json");
    const drawers = read("debateDrawers.json");
    expect(views["debateViews.clickLevelToStepBack"]).toBe("choose a level to step back up");
    expect(views["debateViews.leanAndFocusHint"]).toBe("Leans {lean} · choose any argument to make it the focus");
    expect(drawers["debateDrawers.guide.challengeBody"]).toBe(
      "Press Challenge on a claim — or select any sentence inside an argument — to send focused scrutiny at that exact spot."
    );
    expect(drawers["debateDrawers.node.selectToChallenge"]).toBe("Select any sentence above to challenge it, or press Challenge.");
  });

  it("the drawer shows that line only where it also shows the Challenge button", () => {
    const source = readFileSync(`${process.cwd()}/apps/ui/components/NodeDetailDrawer.tsx`, "utf8");
    expect(source).toContain('{generation?.argument && onChallenge ? (\n            <div className="drawerSelectHint">▲ {t(catalog, "debateDrawers.node.selectToChallenge")}</div>');
    expect(source).toMatch(/\{onChallenge \? \(\s*<button\s+type="button"\s+className="btn btnChallenge"/);
  });
});

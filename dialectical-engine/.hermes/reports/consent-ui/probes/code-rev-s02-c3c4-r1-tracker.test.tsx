// @vitest-environment jsdom

/**
 * CODE-REV-S02-C3C4 r1 — root-cause harness for the P10b failure.
 *
 * Question: after a click whose default is prevented (C7's row handler, which must open the
 * modal INSTEAD of toggling), does the NEXT genuine click still reach React's onChange?
 *
 * Two handler shapes, isolated from SignUpFlow so nothing else can explain the result:
 *   GUARDED — the shipped shape: checked && !nativeEvent.defaultPrevented
 *   PLAIN   — the literal shape used by adult-affirmed: checked
 */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root: Root | null = null;
const log: string[] = [];

function Box({ guarded }: { guarded: boolean }) {
  const [mirror, setMirror] = useState(false);
  return (
    <div id="row">
      <input
        id="box"
        type="checkbox"
        onChange={(e) => {
          const next = guarded
            ? e.currentTarget.checked && !e.nativeEvent.defaultPrevented
            : e.currentTarget.checked;
          log.push(
            `onChange fired: currentTarget.checked=${e.currentTarget.checked} ` +
            `defaultPrevented=${e.nativeEvent.defaultPrevented} -> mirror=${next}`
          );
          setMirror(next);
        }}
      />
      <output id="mirror">{String(mirror)}</output>
    </div>
  );
}

const box = () => document.querySelector<HTMLInputElement>("#box")!;
const row = () => document.querySelector<HTMLElement>("#row")!;
const mirror = () => document.querySelector<HTMLElement>("#mirror")!.textContent;

async function mount(guarded: boolean) {
  await act(async () => root!.render(<Box guarded={guarded} />));
}

describe("React 19.2.8 + jsdom 30.0.1 — cancelled click and the input value tracker", () => {
  beforeEach(() => {
    log.length = 0;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const c = document.createElement("div");
    document.body.append(c);
    root = createRoot(c);
  });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  for (const guarded of [true, false]) {
    const shape = guarded ? "GUARDED (shipped privacy handler)" : "PLAIN (shipped adult handler)";

    it(`${shape} — cancelled click #1, then genuine click #2`, async () => {
      await mount(guarded);
      const cancel = (e: Event) => e.preventDefault();
      row().addEventListener("click", cancel);
      await act(async () => { box().click(); });
      log.push(`after cancelled click: DOM=${box().checked} mirror=${mirror()}`);

      row().removeEventListener("click", cancel);
      await act(async () => { box().click(); });
      log.push(`after genuine  click: DOM=${box().checked} mirror=${mirror()}`);

      console.log(`\n--- ${shape} ---\n${log.join("\n")}`);
      expect(box().checked, "DOM after the genuine click").toBe(true);
      expect(mirror(), "MIRROR after the genuine click").toBe("true");
    });
  }

  it("CONTROL — two genuine clicks with nothing cancelled", async () => {
    await mount(true);
    await act(async () => { box().click(); });
    log.push(`click 1: DOM=${box().checked} mirror=${mirror()}`);
    await act(async () => { box().click(); });
    log.push(`click 2: DOM=${box().checked} mirror=${mirror()}`);
    console.log(`\n--- CONTROL ---\n${log.join("\n")}`);
    expect(box().checked).toBe(false);
    expect(mirror()).toBe("false");
  });

  it("PLAIN handler under a cancelled click records a value the DOM never holds", async () => {
    await mount(false);
    row().addEventListener("click", (e) => e.preventDefault());
    await act(async () => { box().click(); });
    console.log(`\n--- PLAIN, cancelled ---\n${log.join("\n")}\nDOM=${box().checked} mirror=${mirror()}`);
    expect(box().checked, "DOM reverted").toBe(false);
    // This is what the B1 guard exists to prevent; without the guard the mirror lies.
    expect(mirror(), "PLAIN mirror after a cancelled click").toBe("false");
  });
});

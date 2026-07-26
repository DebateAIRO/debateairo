import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DebateMap } from "@/components/DebateMap";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import type { DebateNode } from "@/lib/types";

const readWebFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

const threadCss = readWebFile("styles/thread.css");
const splitCss = readWebFile("styles/split.css");
const mapCss = readWebFile("styles/map.css");
const synthCss = readWebFile("styles/synth.css");
const splitSource = readWebFile("components/DebateSplit.tsx");
const mapSource = readWebFile("components/DebateMap.tsx");

const childNode: DebateNode = {
  id: "child-pro",
  debate_id: "completed-debate",
  parent_id: "root",
  node_type: "PRO",
  depth: 1,
  position: 0,
  claim: "Public transit frees scarce street space.",
  status: "complete",
  materialized_path: "root/child-pro",
  active_generation_id: null,
  active_generation: null,
  children: []
};

const rootNode: DebateNode = {
  id: "root",
  debate_id: "completed-debate",
  parent_id: null,
  node_type: "ROOT_CLAIM",
  depth: 0,
  position: 0,
  claim: "Cities should prioritize public transit.",
  status: "complete",
  materialized_path: "root",
  active_generation_id: null,
  active_generation: null,
  children: [childNode]
};

describe("S5 mobile synthesis capability parity", () => {
  test("a completed debate exposes a reachable mobile synthesis sheet", () => {
    render(
      <SynthesisPanel
        ready
        pending={false}
        streaming={false}
        structured={false}
        proClaim="Transit carries more people per lane."
        conClaim="Some trips remain difficult without a car."
        verdict="Prioritize transit while preserving accessible exceptions."
        meta="fixture-model"
      />
    );

    const toggle = screen.getByRole("button", { name: "Open synthesis and verdict" });
    const panel = screen.getByRole("complementary", { name: "Synthesis" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("data-sheet-state", "collapsed");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveAttribute("data-sheet-state", "expanded");
    expect(within(panel).getByText("Prioritize transit while preserving accessible exceptions.")).toBeVisible();
  });
});

describe("S5 reading-view interaction contracts", () => {
  test("map wedges select a readout and only the existing Open in Split button navigates", () => {
    const onOpenSplit = vi.fn();
    render(<DebateMap root={rootNode} onOpenSplit={onOpenSplit} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Inspect Public transit frees scarce street space."
      })
    );

    const readout = screen.getByTestId("map-readout");
    expect(within(readout).getByText("Public transit frees scarce street space.")).toBeVisible();
    expect(onOpenSplit).not.toHaveBeenCalled();

    fireEvent.click(within(readout).getByRole("button", { name: /Open in Split/ }));
    expect(onOpenSplit).toHaveBeenCalledTimes(1);
    expect(onOpenSplit).toHaveBeenCalledWith("child-pro");
  });

  test("thread and split styles encode the bounded phone geometry", () => {
    expect(threadCss).toMatch(/\.thread\s*\{[^}]*--thread-lane:\s*30px;/s);
    expect(threadCss).toMatch(
      /@media\s*\(max-width:\s*480px\)[\s\S]*?\.thread\s*\{[^}]*--thread-lane:\s*14px;/s
    );
    expect(threadCss).toMatch(/\.threadLane:nth-last-of-type\(n\s*\+\s*6\)\s*\{\s*display:\s*none;/);

    expect(splitCss).toMatch(
      /\.splitMeterSide\s*\{[^}]*flex:\s*0 1 auto;[^}]*min-width:\s*64px;/s
    );
    expect(splitCss).toMatch(/@media\s*\(max-width:\s*768px\)/);
    expect(mapCss).not.toMatch(/\.splitColumns|\.splitPerspectives|\.splitBattleLine/);
    expect(splitSource).toMatch(/"--split-chip-indent"/);
  });

  test("synthesis CSS follows the approved reserved-rectangle contract", () => {
    expect(synthCss).toMatch(
      /max-width:\s*calc\(100vw - 14px - var\(--dock-collapsed-w\) - 30px\);/
    );
    expect(synthCss).toMatch(/bottom:\s*var\(--dock-offset-b\);/);
    expect(synthCss).toMatch(/max-height:\s*70dvh;/);
    expect(synthCss).toMatch(/\.synthScrim\s*\{[^}]*z-index:\s*var\(--z-sheet\);/s);
    expect(synthCss).toMatch(
      /\.debateView:has\(\.tokenForm\)\s+\[data-synth-tab\]\s*\{[^}]*visibility:\s*hidden;/s
    );
    expect(synthCss).toMatch(/\.synthPanel\.synthPanel\s*\{[^}]*display:\s*block;/s);
    expect(mapSource).toMatch(/<path[\s\S]{0,700}?onClick=\{\(\) => setSelectedId\(arc\.id\)\}/);
    expect(mapSource.match(/onOpenSplit\(/g)).toHaveLength(1);
  });
});

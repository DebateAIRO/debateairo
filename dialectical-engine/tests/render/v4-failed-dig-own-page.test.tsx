// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { V4FailedScreen } from "../../apps/ui/components/v4/V4FailedScreen.js";
import type { RunProjection } from "../../packages/contract/src/index.js";

/*
 * A dig's own failed page (V4FailedScreen with `dig`), and the owner's third round (5 Nov 2026 afternoon): a dig that keeps
 * failing because the AIs were unavailable drops "You can try it again in a while.", so its line does not disagree with the
 * map's "This keeps failing. Write your report; it uses everything that finished." The page says "You can try this dig again
 * from the map." only when the map offers that try. What the map offers comes from the page (the parent map's digs, the
 * start-step session's wiring); absent, the page is as it was. Made-up texts only.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const HOME: Record<string, string> = {};
const RUN = "7a000000-0000-4000-8000-000000000001";
const PARENT = "7a000000-0000-4000-8000-000000000002";
const failedDig = (reason: string): RunProjection => ({
  run_ref: RUN, question_line: "Dig: made-up pick", state: "FAILED", terminal_reason: reason, hold_until: null
} as RunProjection);
const UNAVAILABLE = "RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM";

async function draw(node: ReactNode): Promise<HTMLElement> {
  const box = document.body.appendChild(document.createElement("div"));
  const root = createRoot(box);
  await act(async () => root.render(node));
  const html = box.cloneNode(true) as HTMLElement;
  await act(async () => root.unmount());
  box.remove();
  return html;
}

type Retry = "OFFER" | "KEEPS_FAILING" | "RETRIED" | "NONE";
function digPage(reason: string, digRetry?: Retry): ReactNode {
  return (
    <V4FailedScreen run={failedDig(reason)} askAgainHref="/v4?again=1" askHref="/v4" dig={{ backHref: `/v4/debate/${PARENT}` }}
      catalog={CATALOG} homeCatalog={HOME} {...(digRetry === undefined ? {} : { digRetry })} />
  );
}
const text = (box: HTMLElement): string => (box.textContent ?? "").replace(/\s+/gu, " ");

describe("a dig's own failed page and the map's offer to try it again", () => {
  it("without word from the map, the page is as it was: the reason in full and 'You can try this dig again from the map.'", async () => {
    const page = await draw(digPage(UNAVAILABLE));
    expect(text(page)).toContain(CATALOG["v4.digFailed.reason.MODELS_UNAVAILABLE"]!);
    expect(text(page)).toContain(CATALOG["v4.debate.digFailedBackNote"]!);
    expect(page.querySelector(`a[href="/v4/debate/${PARENT}"]`)!.textContent).toBe(CATALOG["v4.report.backToMap"]);
  });

  it("when the map offers the try, the same: the reason in full and the note", async () => {
    const page = await draw(digPage(UNAVAILABLE, "OFFER"));
    expect(text(page)).toContain(CATALOG["v4.digFailed.reason.MODELS_UNAVAILABLE"]!);
    expect(text(page)).toContain(CATALOG["v4.debate.digFailedBackNote"]!);
  });

  it("the third round: a dig that keeps failing because the AIs were unavailable promises no later try, and no try from the map", async () => {
    const page = await draw(digPage(UNAVAILABLE, "KEEPS_FAILING"));
    expect(text(page)).toContain(CATALOG["v4.digFailed.unavailableKeepsFailing"]!);
    expect(text(page)).not.toContain("You can try it again in a while.");
    expect(text(page)).not.toContain(CATALOG["v4.debate.digFailedBackNote"]!);
    // The way back to the map stays.
    expect(page.querySelector(`a[href="/v4/debate/${PARENT}"]`)!.textContent).toBe(CATALOG["v4.report.backToMap"]);
  });

  it("a dig that keeps failing for another reason keeps its own line, without the note", async () => {
    const page = await draw(digPage("RUNNER_EXECUTION_FAILED:made-up", "KEEPS_FAILING"));
    expect(text(page)).toContain(CATALOG["v4.digFailed.reason.STOPPED"]!);
    expect(text(page)).not.toContain(CATALOG["v4.debate.digFailedBackNote"]!);
  });

  it("when a later try already runs, or the map cannot offer one, the page does not say the map offers it", async () => {
    for (const retry of ["RETRIED", "NONE"] as const) {
      const page = await draw(digPage(UNAVAILABLE, retry));
      expect(text(page), retry).toContain(CATALOG["v4.digFailed.reason.MODELS_UNAVAILABLE"]!);
      expect(text(page), retry).not.toContain(CATALOG["v4.debate.digFailedBackNote"]!);
    }
  });

  it("a first question's failed page takes no word from the map", async () => {
    const run = { ...failedDig(UNAVAILABLE), question_line: "Should the town plant more trees?" } as RunProjection;
    const page = await draw(
      <V4FailedScreen run={run} askAgainHref="/v4?again=1" askHref="/v4" dig={null} catalog={CATALOG} homeCatalog={HOME} digRetry="KEEPS_FAILING" />
    );
    expect(text(page)).toContain(CATALOG["v4.debate.askAgain"]!);
    expect(text(page)).not.toContain(CATALOG["v4.debate.digFailedBackNote"]!);
  });
});

// The w6 browser check's "classic link as small as 'Ask a new question'" case went with the owner's answer 12 B (Task 76j):
// the map page hands this screen no classic link any more; the header's account menu holds it
// (tests/render/v4-map-wiring.test.tsx).

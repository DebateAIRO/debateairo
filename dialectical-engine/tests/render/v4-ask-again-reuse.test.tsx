// @vitest-environment jsdom
// V4 start step, Task 57e (the owner's 6 Nov rule: "re-use what we already paid for"): "Ask this again" finds what the failed question
// kept. The ask page already reads the failed debate back by its id (useAskAgain, wait-f11); when that FAILED read says `reusable: true`
// it now also gives the re-use link (`reuse`: the failed debate's id and its whole line, the clarifying answers in it), which the ask
// sends as `again_of` so the server starts the question again on its kept answers and paths at no new charge. A run that does not say
// so (nothing kept, a dig, not FAILED) gives none: today's "Ask this again". The words to fill in and the level are as before. The page
// words ("What already ran is kept for your next try, ...") are the review session's. Every question here is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunProjection } from "@debateai/contract";

const mocks = vi.hoisted(() => ({ readRun: vi.fn() }));
vi.mock("@/lib/api", () => ({ contractClient: { readRun: mocks.readRun } }));

import { askAgainReuseOf } from "../../apps/ui/lib/v4/failedRun.js";
import { useAskAgain, type AskAgain } from "../../apps/ui/lib/v4/useAskAgain.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const RUN_ID = "55555555-5555-4555-8555-555555555555";
const OWN = "Should Harbour Town build a second ferry pier?";
const LINE = `${OWN}\n\nLooking at Harbour Town.`;
const FAILED: RunProjection = Object.freeze({ run_ref: RUN_ID, question_line: LINE, state: "FAILED",
  terminal_reason: "RUNNER_EXECUTION_FAILED:PROVIDER_CALL_FAILED", hold_until: null, quota_used: "SOME", reusable: true,
  reading_level: "background" } as RunProjection);
const DIG_LINE = `Look deeper into this part of the answer: Ferry queues.\n\nThis follows from an earlier question: “${OWN}”`;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  mocks.readRun.mockReset();
});

/** What useAskAgain gives for `run`, once its read has landed. */
async function againOf(run: RunProjection): Promise<AskAgain | null> {
  mocks.readRun.mockResolvedValue(run);
  let seen: AskAgain | null = null;
  function Probe() {
    seen = useAskAgain(RUN_ID, CATALOG);
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Probe />); });
  await act(async () => { await Promise.resolve(); });
  return seen;
}

describe("Ask this again finds what the failed question kept (Task 57e)", () => {
  it("a FAILED read that says reusable: the re-use link, beside today's words and level", async () => {
    expect(await againOf(FAILED)).toEqual({ question: OWN, level: "background", reuse: { runId: RUN_ID, questionLine: LINE } });
  });

  it("no re-use link when the read does not say it, when the run did not fail, and for a dig", async () => {
    const { reusable: _reusable, ...plain } = FAILED as RunProjection & { reusable?: true };
    void _reusable;
    expect(await againOf(plain as RunProjection)).toEqual({ question: OWN, level: "background", reuse: null });
    expect(askAgainReuseOf({ ...FAILED, state: "SETTLED", terminal_reason: null } as RunProjection, CATALOG)).toBeNull();
    expect(askAgainReuseOf({ ...FAILED, question_line: DIG_LINE } as RunProjection, CATALOG)).toBeNull();
    expect(askAgainReuseOf(FAILED, CATALOG)).toEqual({ runId: RUN_ID, questionLine: LINE });
  });
});

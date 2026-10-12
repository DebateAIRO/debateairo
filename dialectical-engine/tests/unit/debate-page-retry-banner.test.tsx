/**
 * A .tsx file (like the other tests that import a page component): the root
 * `tsc --noEmit` has no JSX setting and cannot read DebatePageClient.tsx.
 *
 * Parallel calls, task 13: steps of one debate now run at the same time, so a
 * retry on one step can arrive while ANOTHER step's failure is on the page's
 * single error banner. A `node.retrying` clears the banner only when it is the
 * retry of the failed step that put it there.
 */
import { describe, expect, it, vi } from "vitest";
import { RunEventSchema, type RunEvent } from "@debateai/contract";
import { createDebatePageRunEventConsumer } from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { createLiveRunState, type LiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };

const RUN = "run:parallel-banner";
const FAILED = debateChromeEnglish["debateChrome.error.claimGenerationFailed"];

function harness() {
  let live: LiveRunState = createLiveRunState();
  let error: string | null = null;
  let sequence = 0;
  const consume = createDebatePageRunEventConsumer({
    runRef: RUN,
    readLive: () => live,
    writeLive: (next: LiveRunState) => { live = next; },
    // An answer is "present" so the consumer does not rebuild the live tree: this test is about the banner.
    hasAnswer: () => true,
    updateDebate: vi.fn(),
    updateSynthesisDraft: vi.fn(),
    writeError: (next: string | null) => { error = next; },
    refresh: vi.fn()
  });
  const send = (event_type: RunEvent["event_type"], subject: string | null, payload: Record<string, unknown> = {}) => {
    sequence += 1;
    consume(RunEventSchema.parse({
      event_id: `event:${sequence}`, event_type, run_ref: RUN, subject_ref: subject, at_sequence: sequence, payload
    }));
  };
  return { send, error: () => error };
}

describe("debate page banner: a retry clears only its own step's failure", () => {
  it("shows the failure of node A", () => {
    const page = harness();
    page.send("node.failed", "node:A");
    expect(page.error()).toBe(FAILED);
  });

  it("keeps A's failure on the page when a different node B retries", () => {
    const page = harness();
    page.send("node.failed", "node:A");
    page.send("node.retrying", "node:B");
    expect(page.error()).toBe(FAILED);
  });

  it("clears the failure when node A itself retries", () => {
    const page = harness();
    page.send("node.failed", "node:A");
    page.send("node.retrying", "node:B");
    page.send("node.retrying", "node:A");
    expect(page.error()).toBeNull();
  });

  it("keeps the banner while another failed node has not retried yet", () => {
    const page = harness();
    page.send("node.failed", "node:A");
    page.send("node.failed", "node:B");
    page.send("node.retrying", "node:B");
    expect(page.error()).toBe(FAILED);
    page.send("node.retrying", "node:A");
    expect(page.error()).toBeNull();
  });

  it("reads the node from payload.node_ref when the event has no subject", () => {
    const page = harness();
    page.send("node.failed", null, { node_ref: "node:A" });
    page.send("node.retrying", null, { node_ref: "node:B" });
    expect(page.error()).toBe(FAILED);
    page.send("node.retrying", null, { node_ref: "node:A" });
    expect(page.error()).toBeNull();
  });

  it("never lets a late retry clear the run's final failure sentence", () => {
    const page = harness();
    page.send("node.failed", "node:A");
    page.send("run.terminal", null, { state: "FAILED", reason: "RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL" });
    const terminal = page.error();
    expect(terminal).not.toBeNull();
    expect(terminal).not.toBe(FAILED);
    page.send("node.retrying", "node:A");
    expect(page.error()).toBe(terminal);
  });
});

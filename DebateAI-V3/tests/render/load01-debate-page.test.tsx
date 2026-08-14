import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunEventSchema } from "@debateai/contract";
import { debateDetailFromRunProjection } from "../../apps/v2-ui/lib/v3/adapter.js";
import DebatePageClient, * as DebatePageModule from "../../apps/v2-ui/app/debate/[id]/DebatePageClient.js";
import { createLiveRunState } from "../../apps/v2-ui/lib/v3/liveEvents.js";
import { readNotFoundCalls, resetNotFoundCalls } from "./stubs/next-navigation.js";

const mocks = vi.hoisted(() => ({
  getDebateServer: vi.fn()
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/v2-ui/lib/serverApi.js")>()),
  getDebateServer: mocks.getDebateServer
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("token:test")
}));

const queuedRun = {
  run_ref: "run:queued",
  question_line: "Messi or Ronaldo?",
  state: "QUEUED" as const,
  terminal_reason: null
};

function renderClient(debate = debateDetailFromRunProjection(queuedRun), error: string | null = null): string {
  return renderToStaticMarkup(
    <DebatePageClient
      id={debate.id}
      initialDebate={debate}
      initialAnswer={null}
      initialError={error}
      initialPending
    />
  );
}

describe("LOAD-01 real debate-page render", () => {
  beforeEach(() => {
    mocks.getDebateServer.mockReset();
    resetNotFoundCalls();
  });

  it.each([
    ["QUEUED", "Queued"],
    ["CLAIMED", "Claimed"],
    ["RUNNING", "Running"]
  ] as const)("renders %s as typed indeterminate truth with no invented progress", (state, label) => {
    const html = renderClient(debateDetailFromRunProjection({ ...queuedRun, state }));
    expect(html).toContain("Messi or Ronaldo?");
    expect(html).toContain(label);
    expect(html).not.toContain("Models arguing");
    expect(html).not.toContain("progressTrack");
    expect(html).not.toContain("40%");
  });

  it("renders a mid-session run.terminal failure as failed with no live progress", () => {
    const createConsumer = (DebatePageModule as unknown as {
      createDebatePageRunEventConsumer?: (...args: never[]) => (event: ReturnType<typeof RunEventSchema.parse>) => void;
    }).createDebatePageRunEventConsumer;
    expect(createConsumer).toBeTypeOf("function");
    let live = createLiveRunState();
    let debate = debateDetailFromRunProjection({ ...queuedRun, state: "RUNNING" });
    let error: string | null = null;
    const consume = createConsumer!({
      runRef: debate.id,
      readLive: () => live,
      writeLive: (next: typeof live) => { live = next; },
      hasAnswer: () => false,
      updateDebate: (update: (current: typeof debate) => typeof debate) => { debate = update(debate); },
      updateSynthesisDraft: vi.fn(),
      writeError: (next: string | null) => { error = next; },
      refresh: vi.fn()
    } as never);
    consume(RunEventSchema.parse({
      event_id: "event:terminal",
      event_type: "run.terminal",
      run_ref: debate.id,
      at_sequence: 1,
      payload: { state: "FAILED", reason: "NODE_REVIEW_UNAVAILABLE" }
    }));
    const html = renderClient(debate, error);
    expect(html).toContain("Failed");
    expect(html).toContain("Debate generation failed: NODE_REVIEW_UNAVAILABLE");
    expect(html).not.toContain("Generating");
    expect(html).not.toContain("progressStrip");
  });

  it("behaviorally throws Next notFound for a genuinely nonexistent id", async () => {
    mocks.getDebateServer.mockResolvedValue({ ok: false, kind: "not_found" });
    const { default: DebatePage } = await import("../../apps/v2-ui/app/debate/[id]/page.js");
    await expect(DebatePage({ params: Promise.resolve({ id: "run:missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(readNotFoundCalls()).toBe(1);
  });
});

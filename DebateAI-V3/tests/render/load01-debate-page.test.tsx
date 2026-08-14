import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, RunEventSchema, type Answer, type ContractClient } from "@debateai/contract";
import { getDebateBundle } from "../../apps/v2-ui/lib/api.js";
import { debateDetailFromRunProjection } from "../../apps/v2-ui/lib/v3/adapter.js";
import DebatePageClient, * as DebatePageModule from "../../apps/v2-ui/app/debate/[id]/DebatePageClient.js";
import { createLiveRunState } from "../../apps/v2-ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
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

function renderClient(
  debate = debateDetailFromRunProjection(queuedRun),
  error: string | null = null,
  answer: Answer | null = null
): string {
  return renderToStaticMarkup(
    <DebatePageClient
      id={debate.id}
      initialDebate={debate}
      initialAnswer={answer}
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

  it.each(["CLAIMED", "RUNNING"] as const)("renders mocked-transport %s without either answer 404 probe", async (state) => {
    const calls: string[] = [];
    const client = {
      readRun: async () => ({
        run_ref: "run:transport",
        question_line: "How does someone efficiently lose weight?",
        state,
        terminal_reason: null
      }),
      readAnswer: async () => {
        calls.push("answer-404");
        throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND");
      },
      readRunAnswer: async () => {
        calls.push("run-answer-404");
        throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED");
      }
    } as unknown as ContractClient;

    const bundle = await getDebateBundle("run:transport", "token:test", client);
    expect(bundle.kind).toBe("loading");
    expect(renderClient(bundle.detail)).toContain("progressFillIndeterminate");
    expect(renderClient(bundle.detail)).not.toContain("Claimed");
    expect(calls).toEqual([]); // MUT-BUG02-RENDER-404-LOOP: probe either absent answer while the run is live -> RED.
  });

  it("renders the served debate after mocked transport advances to SETTLED", async () => {
    const answer = buildFairShapedAnswer();
    const client = {
      readRun: async () => ({
        run_ref: "run:fair-test",
        question_line: answer.question_line,
        state: "SETTLED" as const,
        terminal_reason: null
      }),
      readRunAnswer: async () => answer
    } as unknown as ContractClient;

    const bundle = await getDebateBundle("run:fair-test", "token:test", client);
    expect(bundle.kind).toBe("served");
    if (bundle.kind !== "served") throw new Error("expected served debate");
    const html = renderClient(bundle.detail, null, bundle.answer);
    expect(html).toContain("Should the test question stand?");
    expect(html).not.toContain("progressFillIndeterminate"); // MUT-BUG02-RENDER-SERVE-FLIP: keep loading after SETTLED -> RED.
  });

  it.each([
    ["QUEUED", "Queued"],
    ["CLAIMED", "Running"],
    ["RUNNING", "Running"]
  ] as const)("renders %s as typed indeterminate truth with no invented progress", (state, label) => {
    const html = renderClient(debateDetailFromRunProjection({ ...queuedRun, state }));
    expect(html).toContain("Messi or Ronaldo?");
    expect(html).toContain(label);
    expect(html).not.toContain("Claimed"); // MUT-BUG02-CLAIMED-LABEL: expose internal CLAIMED to the user -> RED.
    expect(html).not.toContain("Models arguing");
    expect(html).toContain("progressTrack"); // MUT-BUG02-LOADING-BAR: remove the indeterminate loading bar -> RED.
    expect(html).toContain('aria-busy="true"');
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

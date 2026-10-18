// @vitest-environment jsdom
/*
 * a11y repair (2026-10-18), found walking a live debate: the stream carries no question text, and
 * for steps that answer whole no claim text either. Until the run settled, the h1, the tab title
 * and the root card went blank, and a claim scored before its text arrived showed "No strong
 * argument found" (a screen reader heard only "Claim", once per card). The page now keeps the
 * question it already read, and such a claim stays pending, read as "Loading…".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RunEventSchema, type RunEvent } from "@debateai/contract";
import DebatePageClient, {
  createDebatePageRunEventConsumer,
  withKnownTopic
} from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { DebateThread } from "../../apps/ui/components/DebateThread.js";
import { debateDetailFromRunProjection, liveDebateDetail } from "../../apps/ui/lib/v3/adapter.js";
import { applyRunEvent, createLiveRunState, liveTreeFromState, type LiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import type { DebateDetail } from "../../apps/ui/lib/types.js";
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };
import debateViewsEnglish from "../../apps/ui/messages/en/debateViews.json" with { type: "json" };
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

const RUN = "run:live-topic";
const QUESTION = "Ar trebui orașele mari să interzică mașinile personale în centrele istorice?";
const LOADING = debateChromeEnglish["debateChrome.loading"];
const NO_ARGUMENT = debateViewsEnglish["debateViews.noStrongArgument"];
const SCORED = { value: 0.95, kind: "propagated-probability" };

function runEvent(sequence: number, eventType: RunEvent["event_type"], subject: string, payload: Record<string, unknown> = {}): RunEvent {
  return RunEventSchema.parse({
    event_id: `event:${sequence}`, event_type: eventType, run_ref: RUN, subject_ref: subject, at_sequence: sequence, payload
  });
}

function runningDetail(): DebateDetail {
  return debateDetailFromRunProjection({
    run_ref: RUN, question_line: QUESTION, state: "RUNNING", terminal_reason: null, hold_until: null
  } as never);
}

/** The page's own consumer, before any answer exists, over a debate first read from the run. */
function livePage() {
  let live: LiveRunState = createLiveRunState();
  let debate: DebateDetail | null = runningDetail();
  const consume = createDebatePageRunEventConsumer({
    runRef: RUN,
    readLive: () => live,
    writeLive: (next: LiveRunState) => { live = next; },
    hasAnswer: () => false,
    updateDebate: (update) => { debate = update(debate); },
    updateSynthesisDraft: vi.fn(),
    writeError: vi.fn(),
    refresh: vi.fn()
  });
  return { consume, debate: () => debate! };
}

/** The live tree as the stream leaves it: one claim spawned then scored, one scored unseen, no text. */
function textlessLiveDetail(): DebateDetail {
  let state = createLiveRunState();
  state = applyRunEvent(state, runEvent(1, "node.spawned", "node:a"));
  state = applyRunEvent(state, runEvent(2, "node.scored", "node:a", SCORED));
  state = applyRunEvent(state, runEvent(3, "node.scored", "node:b", SCORED));
  return withKnownTopic(liveDebateDetail(RUN, liveTreeFromState(state, RUN, "")!), QUESTION);
}

describe("a live debate keeps its question", () => {
  it("keeps the topic and the root claim while claims arrive without text", () => {
    const page = livePage();
    page.consume(runEvent(1, "node.spawned", "node:a"));
    page.consume(runEvent(2, "node.scored", "node:a", SCORED));
    page.consume(runEvent(3, "node.scored", "node:b", SCORED));
    expect(page.debate().topic).toBe(QUESTION);
    expect(page.debate().tree?.claim).toBe(QUESTION);
    expect(page.debate().tree?.children.map((child) => child.status)).toEqual(["pending", "pending"]);
  });

  it("fills a blank topic from the run and leaves a known one alone", () => {
    const blank = liveDebateDetail(RUN, liveTreeFromState(
      applyRunEvent(createLiveRunState(), runEvent(1, "node.spawned", "node:a")), RUN, "")!);
    expect(blank.topic).toBe("");
    const filled = withKnownTopic(blank, QUESTION);
    expect(filled.topic).toBe(QUESTION);
    expect(filled.tree?.claim).toBe(QUESTION);
    const known = runningDetail();
    expect(withKnownTopic(known, "Another question")).toBe(known);
  });

  it("keeps a claim with text complete", () => {
    let state = createLiveRunState();
    state = applyRunEvent(state, runEvent(1, "node.spawned", "node:a"));
    state = applyRunEvent(state, runEvent(2, "node.text_delta", "node:a", { delta: "Centrele istorice respiră." }));
    state = applyRunEvent(state, runEvent(3, "node.scored", "node:a", SCORED));
    expect(liveTreeFromState(state, RUN, QUESTION)!.children[0]!.status).toBe("complete");
  });
});

describe("a claim whose text has not arrived", () => {
  it("is read as loading on the Tree, under the question as the page heading", () => {
    const html = renderToStaticMarkup(
      <DebatePageClient id={RUN} initialDebate={textlessLiveDetail()} storyLocale="en" storyCatalog={publicEnglish} />
    );
    const page = new DOMParser().parseFromString(html, "text/html");
    expect(page.querySelector("h1")?.textContent).toBe(QUESTION);
    expect(page.querySelector(".nodeClaim.root")?.textContent).toBe(QUESTION);
    const pending = [...page.querySelectorAll(".nodePending")];
    expect(pending).toHaveLength(2);
    for (const card of pending) expect(card.querySelector(".srOnly")?.textContent).toBe(LOADING);
    expect(html).not.toContain(NO_ARGUMENT);
  });

  it("is read as loading on the Thread", () => {
    const noop = () => undefined;
    const html = renderToStaticMarkup(
      <DebateThread
        root={textlessLiveDetail().tree!}
        expanded={new Set()}
        collapsed={new Set()}
        meta={{ nodes: 2, depth: 1 }}
        onOpenNode={noop}
        onChallengeNode={noop}
        onToggleExpand={noop}
        onToggleCollapse={noop}
      />
    );
    const page = new DOMParser().parseFromString(html, "text/html");
    const pending = [...page.querySelectorAll(".nodePending")];
    expect(pending).toHaveLength(2);
    for (const card of pending) expect(card.querySelector(".srOnly")?.textContent).toBe(LOADING);
    expect(html).not.toContain(NO_ARGUMENT);
  });
});

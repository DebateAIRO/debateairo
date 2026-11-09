// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useV4Ready } from "../../apps/ui/components/v4/useV4Ready.js";
import * as fixture from "../../apps/ui/lib/v3/storyFixture.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import { stateWordText, type WaitState } from "../../apps/ui/lib/v4/stateWords.js";
import type { V4Change, V4Map } from "../../apps/ui/lib/v4/types.js";
import type { Answer } from "../../packages/contract/src/index.js";
import { createSeed } from "../../tools/v4-mock-api/seed.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/*
 * The owner's fourth round of follow-ups (chat, 6 Nov 2026): the browser tab follows the page's state word, "Waiting · …"
 * while a question waits for a free spot and "Looking into it · …" while it runs (the wiring list's item 13). The page
 * hands useV4Ready the unfinished question's state (`waitState`, lib/v4/stateWords.ts); the tab says that state's word
 * without its time ("Waiting", "Taking a short break", "Paused until 1 December"). Without it the tab says "Looking into
 * it" for any unfinished question, as before. Once the answer is served the state no longer speaks for the tab.
 */
const V4 = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const RUN = "aaaa2222-2222-4222-8222-222222222222";
const NO_NEWS: readonly V4Change[] = Object.freeze([]);
const NOTHING_CHANGED: ReadonlySet<string> = new Set<string>();
// Noon UTC: 1 December in every time zone the tests run in (midnight UTC is 30 November west of UTC), as
// tests/unit/v4-state-words.test.ts does.
const PAUSED: WaitState = { kind: "PAUSED", until: "2026-12-01T12:00:00.000Z", canContinue: false };

function servedMap(): V4Map {
  const seed = createSeed(fixture);
  const answer = seed.answer({
    answerId: "aaaa1111-1111-4111-8111-111111111111", runRef: RUN,
    question: "Should countries build new nuclear power, or put the money into renewables and storage?",
    askedAt: "2026-10-27T15:12:00.000Z", servedAt: "2026-10-27T15:40:00.000Z", web: "PAID"
  }) as Answer;
  return buildV4Map({ runId: RUN, answer, story: null });
}

type ProbeProps = Readonly<{ waiting: boolean; waitState?: WaitState | null; map?: V4Map | null }>;

function Probe({ waiting, waitState, map = null }: ProbeProps) {
  const ready = useV4Ready({
    map,
    waiting,
    ...(waitState === undefined ? {} : { waitState }),
    isDigPage: false,
    news: NO_NEWS,
    hiddenNews: 0,
    visitNewsCount: 0,
    changed: NOTHING_CHANGED,
    selected: "root",
    phone: false,
    select: () => undefined,
    hideNews: () => undefined,
    focusHeading: () => undefined,
    reportHref: `/v4/debate/${RUN}/report`,
    // The start step's Task 62 (merged 7 Nov): no short answer came late on this probe.
    shortAnswerLate: 0,
    catalog: V4,
    locale: "en"
  });
  return <div className="probe" data-tab-prefix={ready.tabPrefix} />;
}

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function mount(props: ProbeProps): Promise<void> {
  host ??= document.body.appendChild(document.createElement("div"));
  root ??= createRoot(host);
  await act(async () => { root!.render(<Probe {...props} />); });
}
const tab = (): string | null => host!.querySelector(".probe")!.getAttribute("data-tab-prefix");

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  host?.remove();
  host = undefined;
});

describe("the tab follows the page's state word (the owner's fourth round, 6 Nov)", () => {
  it("without the question's state, an unfinished question's tab says \"Looking into it\", as before", async () => {
    await mount({ waiting: true });
    expect(tab()).toBe(V4["v4.ready.tab.waiting"]);
    expect(tab()).toBe("Looking into it");
  });

  it("\"Waiting\" while the question waits for a free spot, with or without the server's time", async () => {
    await mount({ waiting: true, waitState: { kind: "WAITING", startsAfter: "2026-11-06T00:40:00.000Z" } });
    expect(tab()).toBe("Waiting");
    await mount({ waiting: true, waitState: { kind: "WAITING", startsAfter: null } });
    expect(tab()).toBe("Waiting");
  });

  it("\"Looking into it\" while it runs", async () => {
    await mount({ waiting: true, waitState: { kind: "LOOKING" } });
    expect(tab()).toBe("Looking into it");
  });

  it("a short break, a wait for the person's other question and the month's pause say their own state words", async () => {
    await mount({ waiting: true, waitState: { kind: "SHORT_BREAK", continuesAbout: "2026-11-04T10:35:00.000Z" } });
    expect(tab()).toBe(V4["v4.state.SHORT_BREAK.noTime"]);
    await mount({ waiting: true, waitState: { kind: "WAITING_OWN" } });
    expect(tab()).toBe(V4["v4.state.WAITING_OWN"]);
    // A question paused at the month wall is not "waiting" for the page (no "Looking into it"), yet its tab says its word.
    await mount({ waiting: false, waitState: PAUSED });
    expect(tab()).toBe(stateWordText(PAUSED, V4, "en"));
    expect(tab()).toMatch(/^Paused until 1 December$/u);
    await mount({ waiting: false, waitState: { ...PAUSED, canContinue: true } });
    expect(tab()).toBe(V4["v4.state.PAUSED.canContinue"]);
  });

  it("once the answer is served, the question's state no longer speaks for the tab: \"Ready\"", async () => {
    await mount({ waiting: true, waitState: { kind: "WAITING", startsAfter: null } });
    expect(tab()).toBe("Waiting");
    await mount({ waiting: false, waitState: { kind: "WAITING", startsAfter: null }, map: servedMap() });
    expect(tab()).toBe(V4["v4.ready.tab.ready"]);
  });

  it("a paused question with no state handed says nothing in the tab, as before", async () => {
    await mount({ waiting: false });
    expect(tab()).toBe("");
    await mount({ waiting: false, waitState: null });
    expect(tab()).toBe("");
  });
});

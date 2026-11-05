// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, publicBranchesOf } from "@debateai/contract";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };
import { branchFixture, branchesFixture } from "../support/branchesFixture.js";

const publicDebate = PublicDebateSchema.parse({
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Should public readers receive the complete answer surface?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED",
    verdict: "SUPPORTED",
    verdict_available: true,
    confidence_band: "moderate",
    summary_segments: [{ text: "The public summary remains readable." }],
    badges: ["Evidence checked", "Countercase preserved"],
    residual_objections: ["A later primary source could change the result."],
    reversal_point: "A replicated contrary result.",
    as_of: "2026-08-24T00:00:00.000Z"
  }
});

let root: Root | null = null;

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/*
 * Owner's screen review, 3 Nov 2026 (public-d1 A, public-f1): the public page is rebuilt answer-first. A stranger still reads every published field
 * that is the debate itself (the question, who published it and when, the summary, the objections still standing, what could change the answer) and
 * the indexing disclosure, but none of what the owner's rules forbid: no verdict label ("Clear answer"), no confidence band, no badges, no state code.
 */
describe("S02 public debate answer surface", () => {
  it("keeps the published answer fields a stranger reads, the indexing disclosure, and none of the forbidden chrome", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root!.render(
      <PublicDebatePageClient
        debate={publicDebate}
        locale="en"
        storyLocale="en"
        storyCatalog={publicEnglish}
        publicCatalog={publicEnglish}
        homeCatalog={{}}
        timeCatalog={timeEnglish}
        debateChromeCatalog={debateChromeEnglish}
      />
    ));

    const text = container.textContent ?? "";
    expect.soft(text).toContain(publicDebate.question);
    expect(container.querySelector("h1")!.textContent).toBe(publicDebate.question);
    expect.soft(text).toContain(publicDebate.author_pseudonym);
    expect.soft(text).toContain(new Date(publicDebate.published_at).toLocaleDateString());
    expect.soft(text).toContain("The public summary remains readable.");
    expect.soft(text).toContain("A later primary source could change the result.");
    expect.soft(text).toContain("A replicated contrary result.");
    expect(text).toContain(publicEnglish["public.disclosure.indexing"]);
    expect(text).toContain("may be indexed by search engines");
    // public-f1: no verdict label, confidence band, badge or state code; no engine line of the disclosure either.
    for (const forbidden of [publicEnglish["public.story.label.supported"], "SUPPORTED", "moderate", "Evidence checked", "Countercase preserved", "SERVED",
      "Answer status", "confidence ·", "DIALECTICAL SUPPORT", "JUDGE COVERAGE", "CONVERGENCE", "VERIFICATION", "WITHHELD", "COMPLETE", "Scoring"]) {
      expect.soft(text, forbidden).not.toContain(forbidden);
    }
  });
});

/*
 * Owner's screen review, 3 Nov 2026 (public-f26): "Copy link" also appears at the top of the public page, in its top bar (on a phone, in the bar's
 * menu), the same button as on the debate's own pages (V4CopyLink): it copies the public page's own address and says so quietly.
 */
describe("public-f26: Copy link at the top of the public page", () => {
  it("sits in the top bar before 'Report a problem' and copies this page's address", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const copied: string[] = [];
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: async (url: string) => { copied.push(url); } } });
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(
      <PublicDebatePageClient debate={publicDebate} locale="en" storyLocale="en" storyCatalog={publicEnglish} publicCatalog={publicEnglish}
        homeCatalog={{}} timeCatalog={timeEnglish} debateChromeCatalog={debateChromeEnglish} />
    ));
    const menu = container.querySelector("[data-public-top-menu]")!;
    const copy = menu.querySelector<HTMLButtonElement>("[data-public-copy-link]")!;
    expect(copy.textContent).toBe("Copy link");
    const flag = menu.querySelector("[data-public-report]")!;
    expect(copy.compareDocumentPosition(flag) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    await act(async () => copy.click());
    await act(async () => { await Promise.resolve(); });
    expect(copied).toEqual([new URL(`/public/debate/${publicDebate.public_ref}`, window.location.origin).toString()]);
    expect(menu.querySelector(".v4PublicMarkCopied")!.textContent).toBe("Link copied.");
  });
});

/*
 * V4 start step, Task 63 (spec 2026-11-03 §7): a Free path debate publishes its paths. Each row is named by its path's title; a path the person added or
 * rewrote is their own words, like the question, so its title is never marked as AI text, and the views they wrote into a path show under the row as
 * theirs. The story's line about the path stays the AIs' text.
 */
describe("Task 63: a path debate's rows", () => {
  const OWN_VIEW = "My electricity bill went up twice this year.";
  const OWN_QUESTION = "Do the jobs at Cernavodă stay if the plant closes?";
  const pathDebate = PublicDebateSchema.parse({
    ...publicDebate,
    story_short: {
      headline: "Closing the plant costs more than it saves for now.",
      summary: "The savings come late; the jobs question is still argued.",
      confidence: "Fairly sure about the costs, less about the jobs.",
      paths: [
        { position_ref: "b1", fate: "HELD_UP", line: "The costs come before the savings, by about ten years.", node_refs: [] },
        { position_ref: "b2", fate: "PARTLY_HELD", line: "The jobs stay only if the site is reused.", node_refs: [] }
      ],
      change: { text: "A cheaper way to keep the grid stable.", node_refs: [] },
      reviewer_note: null
    },
    branches: publicBranchesOf(branchesFixture([
      branchFixture(1, { title: "Whole-system costs", author: "AI_COMBINED",
        viewpoints: [{ title: "Grid costs", question: "What does the grid cost to keep?", own: false }, { title: null, question: OWN_VIEW, own: true }] }),
      branchFixture(2, { title: "Cernavodă jobs", question: OWN_QUESTION, author: "PERSON_OWN_VIEW", viewpoints: [{ title: null, question: OWN_QUESTION, own: true }] })
    ], { width: 3 }))
  });

  it("shows each path's title, the AIs' marked as AI text and the person's own words never", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(
      <PublicDebatePageClient debate={pathDebate} locale="en" storyLocale="en" storyCatalog={publicEnglish} publicCatalog={publicEnglish}
        homeCatalog={{}} timeCatalog={timeEnglish} debateChromeCatalog={debateChromeEnglish} />
    ));
    const [costs, jobs] = [...container.querySelectorAll<HTMLElement>("[data-public-path]")];
    expect([costs, jobs].map((row) => row!.getAttribute("data-public-path"))).toEqual(["b1", "b2"]);
    const title = (row: HTMLElement) => row.querySelector(".v4PubRowTitle")!;
    expect(title(costs!).textContent).toBe("Whole-system costs");
    expect(title(costs!).getAttribute("data-ai-generated")).toBe("true");
    expect(title(jobs!).textContent).toBe("Cernavodă jobs");
    expect(title(jobs!).closest("[data-ai-generated]")).toBeNull();

    // Opened, the AI path shows the story's line as AI text and the view the person wrote into it as theirs, under its label.
    await act(async () => costs!.querySelector<HTMLButtonElement>(".v4PubRowHead")!.click());
    const line = [...costs!.querySelectorAll(".v4PubRowLine")].find((node) => node.textContent === "The costs come before the savings, by about ten years.");
    expect(line?.getAttribute("data-ai-generated")).toBe("true");
    const own = costs!.querySelector("[data-public-own-words]")!;
    expect(own.textContent).toContain(v4English["v4.public.pathOwnWords" as keyof typeof v4English]);
    expect([...own.querySelectorAll("li")].map((item) => item.textContent)).toEqual([OWN_VIEW]);
    expect(own.closest("[data-ai-generated]")).toBeNull();
    expect(own.querySelector("[data-ai-generated]")).toBeNull();
    expect(costs!.textContent).not.toContain("What does the grid cost to keep?");

    // The person's own path: its title is in the row's head, its question once under it, both as the person wrote them.
    await act(async () => jobs!.querySelector<HTMLButtonElement>(".v4PubRowHead")!.click());
    const ownPath = jobs!.querySelector("[data-public-own-words]")!;
    expect([...ownPath.querySelectorAll("li")].map((item) => item.textContent)).toEqual([OWN_QUESTION]);
    expect(ownPath.closest("[data-ai-generated]")).toBeNull();
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };

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

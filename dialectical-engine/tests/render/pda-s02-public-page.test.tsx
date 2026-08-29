// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";

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

describe("S02 public debate answer surface", () => {
  it("preserves the published answer fields and disclosure after the client-shell split", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => root!.render(<PublicDebatePageClient debate={publicDebate} />));

    const text = container.textContent ?? "";
    expect.soft(text).toContain(publicDebate.question);
    expect.soft(text).toContain(publicDebate.author_pseudonym);
    expect.soft(text).toContain(new Date(publicDebate.published_at).toLocaleDateString());
    expect.soft(text).toContain("SUPPORTED");
    expect.soft(text).toContain("moderate");
    expect.soft(text).toContain("The public summary remains readable.");
    expect.soft(text).toContain("Evidence checked");
    expect.soft(text).toContain("Countercase preserved");
    expect.soft(text).toContain("A later primary source could change the result.");
    expect.soft(text).toContain("A replicated contrary result.");
    expect(text).toContain("may be indexed by search engines");
  });
});

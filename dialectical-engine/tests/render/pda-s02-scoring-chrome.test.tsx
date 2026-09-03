// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";

const publicDebate = PublicDebateSchema.parse({
  public_ref: "44444444-4444-4444-8444-444444444444",
  author_pseudonym: "Public Scoring Author",
  question: "Does public scoring chrome preserve typed absence?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED",
    verdict: "SUPPORTED",
    verdict_available: true,
    confidence_band: "moderate",
    summary_segments: [{ text: "Scoring remains honestly unavailable." }],
    badges: [],
    residual_objections: [],
    reversal_point: "A real scoring endpoint.",
    as_of: "2026-08-24T00:00:00.000Z"
  }
});

let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("S02 public scoring diagnostics", () => {
  it("opens the owner diagnostics drawer over the same DR-115 unavailable payload", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<PublicDebatePageClient debate={publicDebate} />));
    await settle();

    const scoring = container.querySelector<HTMLButtonElement>('button[aria-label="Open scoring diagnostics"]');
    expect(scoring).not.toBeNull();
    await act(async () => scoring!.click());
    await settle();

    expect(container.querySelector('[role="dialog"][aria-label="Scoring diagnostics"]')).not.toBeNull();
    expect(container.textContent).toContain("Not exposed by scoring API");
    expect(container.textContent).toContain("unavailable");
  });
});

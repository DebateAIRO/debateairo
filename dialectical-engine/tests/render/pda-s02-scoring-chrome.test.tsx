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

/*
 * Owner's screen review, 3 Nov 2026 (public-f1): the public page shows no scoring chrome at all. The classic workspace's "Scoring · 0/0" and
 * "COMPLETE" chips, and the diagnostics drawer they opened, went with the old page.
 */
describe("S02 public scoring diagnostics", () => {
  it("offers a stranger no scoring diagnostics, chip or drawer", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<PublicDebatePageClient debate={publicDebate} />));
    await settle();

    expect(container.querySelector('button[aria-label="Open scoring diagnostics"]')).toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Scoring diagnostics"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Scoring ·|COMPLETE|Not exposed by scoring API/u);
    expect(container.textContent).toContain("Scoring remains honestly unavailable.");
  });
});

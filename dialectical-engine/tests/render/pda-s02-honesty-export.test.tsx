// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { PublicHonestyDrawer } from "../../apps/ui/components/PublicHonestyDrawer.js";
import { PublicAnswerDisclosure } from "../../apps/ui/components/PublicAnswerDisclosure.js";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import { buildPublicAnswerExport } from "../../apps/ui/lib/v3/publicAnswerExport.js";

const publicDebate = PublicDebateSchema.parse({
  public_ref: "33333333-3333-4333-8333-333333333333",
  author_pseudonym: "Public Honesty Author",
  question: "What does the public snapshot disclose?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "DOWNGRADED",
    verdict: "CONTESTED",
    verdict_available: true,
    confidence_band: "bounded",
    summary_segments: [{ text: "Public answer content." }],
    badges: ["Downgraded"],
    residual_objections: ["One objection remains."],
    reversal_point: "A stronger public replication.",
    as_of: "2026-08-24T00:00:00.000Z"
  }
});

let root: Root | null = null;

async function mount(element: ReactElement): Promise<HTMLDivElement> {
  if (root !== null) await act(async () => root!.unmount());
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("S02 public honesty and export", () => {
  it("renders public fields and explicit typed absence without implying owner artifacts exist", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await mount(
      <PublicHonestyDrawer answer={publicDebate.answer} onClose={() => undefined} />
    );
    const text = container.textContent ?? "";
    expect(text.match(/not included in this public snapshot/gi)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(text).toContain(publicDebate.answer.reversal_point);
    expect(text).toContain("owner-only");
  });

  it("opens honesty from the public page and exposes export immediately", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await mount(<PublicDebatePageClient debate={publicDebate} />);
    const download = container.querySelector<HTMLAnchorElement>("a[download]");
    expect(download).not.toBeNull();
    expect(download!.getAttribute("href")).toMatch(/^data:application\/json/);

    const drawerSelector = '[role="dialog"][aria-label="Public answer honesty"]';
    expect(container.querySelector(drawerSelector)).toBeNull();
    const honesty = container.querySelector<HTMLButtonElement>('button[aria-label="Honesty"]');
    expect(honesty).not.toBeNull();
    await act(async () => honesty!.click());
    const drawer = container.querySelector<HTMLElement>(drawerSelector);
    expect(drawer).not.toBeNull();
    expect(drawer!.textContent).toContain(publicDebate.answer.reversal_point);
  });

  it("exports only the projected public envelope and no owner-only key", () => {
    const exported = buildPublicAnswerExport(publicDebate);
    const encoded = exported.href.slice(exported.href.indexOf(",") + 1);
    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded) as { answer: { reversal_point: string } };
    expect(parsed.answer.reversal_point).toBe(publicDebate.answer.reversal_point);
    for (const forbidden of [
      "execution_ledger_digest",
      "memory_disclosure",
      "cost_envelope",
      "tier_provenance_ref",
      "ledger_digest_handle",
      "inspection_handle"
    ]) {
      expect(decoded).not.toContain(forbidden);
    }
  });

  it("discloses legacy answer-only publications and omits that notice for tree snapshots", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const legacy = await mount(<PublicAnswerDisclosure answer={publicDebate.answer} />);
    expect(legacy.textContent).toContain("predates argument-tree publishing");

    const tree = await mount(
      <PublicAnswerDisclosure answer={{ ...publicDebate.answer, nodes: [], edges: [], tree_included: true }} />
    );
    expect(tree.textContent).not.toContain("predates argument-tree publishing");
  });
});

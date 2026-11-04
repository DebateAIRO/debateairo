// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { PublicHonestyDrawer } from "../../apps/ui/components/PublicHonestyDrawer.js";
import { PublicAnswerDisclosure } from "../../apps/ui/components/PublicAnswerDisclosure.js";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import { buildPublicAnswerExport } from "../../apps/ui/lib/v3/publicAnswerExport.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };

const PUBLIC_PAGE_I18N = {
  locale: "en" as const,
  publicCatalog: publicEnglish,
  timeCatalog: timeEnglish,
  debateChromeCatalog: debateChromeEnglish
};

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
      <PublicHonestyDrawer
        answer={publicDebate.answer}
        catalog={publicEnglish}
        locale="en"
        onClose={() => undefined}
      />
    );
    const text = container.textContent ?? "";
    expect(text.match(new RegExp(publicEnglish["public.honesty.riskTierUnavailable"], "g"))?.length ?? 0).toBe(1);
    expect(text).toContain(publicEnglish["public.honesty.costEnvelopeUnavailable"]);
    expect(text).toContain(publicDebate.answer.reversal_point);
    expect(text).toContain(publicEnglish["public.honesty.inspectionUnavailable"]);
    // Dev's English pin, kept next to the key-based reads.
    expect(text.match(/not included in this public snapshot/gi)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(text).toContain("owner-only");
    const verdict = container.querySelector('section[aria-label="Verdict"]')!;
    expect(verdict.querySelector("p")?.closest('[data-ai-generated="true"]')).not.toBeNull();
    expect(container.querySelector('section[aria-label="Answer state"]')?.closest('[data-ai-generated="true"]')).toBeNull();
  });

  /*
   * Owner's screen review, 3 Nov 2026 (public-f1): the public page keeps the site's AI notice with its AI transparency link (published debates are
   * labelled for readers), in the wording that names no scores and no verdict (the old one did), and offers a stranger neither the honesty drawer with
   * its measures nor the snapshot download whose file carried the scores. The drawer and the export below stay as they are, for the pages that use them.
   */
  it("labels the public page as AI-generated without naming scores or a verdict, and opens no honesty drawer or snapshot export", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await mount(<PublicDebatePageClient debate={publicDebate} {...PUBLIC_PAGE_I18N} storyLocale="en" storyCatalog={publicEnglish} homeCatalog={{}} />);
    const notice = container.querySelector('[aria-label="AI disclosure"]');
    expect(notice?.textContent).toContain("may be inaccurate");
    expect(notice?.textContent).toContain("machine-readably marked");
    expect(notice?.textContent).not.toMatch(/scores?|verdict/iu);
    expect(notice?.querySelector('a[href="/ai-transparency"]')).not.toBeNull();
    expect(container.querySelector('[data-ai-generated="true"]')).not.toBeNull();
    expect(container.textContent).toContain("Public answer content.");
    expect(container.querySelector("a[download]")).toBeNull();
    expect(container.querySelector('button[aria-label="Honesty"]')).toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Public answer honesty"]')).toBeNull();
    expect(container.textContent).not.toContain("Export the published snapshot");
    expect(publicEnglish).not.toHaveProperty(["public.export.publishedSnapshotLabel"]);
  });

  it("exports only the projected public envelope and no owner-only key", () => {
    const exported = buildPublicAnswerExport(publicDebate);
    const encoded = exported.href.slice(exported.href.indexOf(",") + 1);
    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded);
    expect(parsed.answer.reversal_point).toBe(publicDebate.answer.reversal_point);
    expect(parsed.ai_disclosure).toMatchObject({ content_origin: "ai", human_editorial_review: false });
    expect(parsed.question).toBe(publicDebate.question);
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
    const legacy = await mount(
      <PublicAnswerDisclosure answer={publicDebate.answer} catalog={publicEnglish} locale="en" />
    );
    expect(legacy.textContent).toContain(publicEnglish["public.disclosure.legacySummaryOnly"]);
    expect(legacy.textContent).toContain("predates argument-tree publishing");

    const tree = await mount(
      <PublicAnswerDisclosure
        answer={{ ...publicDebate.answer, nodes: [], edges: [], tree_included: true }}
        catalog={publicEnglish}
        locale="en"
      />
    );
    expect(tree.textContent).not.toContain("predates argument-tree publishing");
  });

  it("on the V4 public page the disclosure says only the indexing and the evidence date, no engine state (public-f1)", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const plain = await mount(
      <PublicAnswerDisclosure answer={{ ...publicDebate.answer, verdict_available: false }} catalog={publicEnglish} locale="en" engineLines={false} />
    );
    expect(plain.textContent).toContain(publicEnglish["public.disclosure.indexing"]);
    expect(plain.textContent).toContain("Evidence as of");
    expect(plain.textContent).not.toContain("DOWNGRADED");
    expect(plain.textContent).not.toContain("Answer status");
    expect(plain.textContent).not.toContain(publicEnglish["public.disclosure.verdictUnavailableMode"]);
    expect(plain.textContent).not.toContain("predates argument-tree publishing");
    const page = await mount(<PublicDebatePageClient debate={publicDebate} {...PUBLIC_PAGE_I18N} storyLocale="en" storyCatalog={publicEnglish} homeCatalog={{}} />);
    expect(page.querySelector("[data-public-foot]")!.textContent).toContain(publicEnglish["public.disclosure.indexing"]);
    expect(page.textContent).not.toContain("Answer status");
  });
});

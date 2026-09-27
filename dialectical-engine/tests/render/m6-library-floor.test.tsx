// @vitest-environment jsdom


import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, PublicDebateSummarySchema, type PublicDebate } from "@debateai/contract";
import type { PostgresPublicationRepository } from "@debateai/db";
import { MemoryPublicationKeyStore, PublicationCipher, loadKek } from "../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import { PublicDebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";

/**
 * Task M6, fix round 1 (spec 2026-09-26 §14.4.4): a published components-only
 * debate whose label the engine kept no longer reads "Verdict unavailable" in
 * the public library. The list's summary carries the floor's label, and the
 * row shows it in the same words every other row uses for a label.
 */

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;

const ROW = {
  public_ref: "33333333-3333-4333-8333-333333333333",
  author_pseudonym: "Asker",
  question: "Ar trebui să ne mutăm la Cluj?",
  published_at: "2026-09-26T10:00:00.000Z",
  models: [],
  verdict: null,
  confidence_band: null
} as const;

function library(debates: Parameters<typeof PublicDebatesBuffer>[0]["debates"], locale = "en"): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <PublicDebatesBuffer
      debates={debates}
      catalog={{ ...catalog(locale, "home"), ...catalog(locale, "chrome") }}
      timeCatalog={catalog(locale, "time")}
      locale={locale}
      composeCatalog={catalog(locale, "compose")}
    />
  );
  return container;
}

describe("the public library row of a floor answer (fix round 1)", () => {
  it("shows the floor's label, in the words the other rows use, marked as generated", () => {
    const status = library([{ ...ROW, floor_verdict: "CONTESTED" }]).querySelector(".libStatus");
    expect(status?.textContent).toBe(catalog("en", "home")["home.verdict.contested"]);
    expect(status?.getAttribute("data-state")).toBe("contested");
    expect(status?.getAttribute("data-ai-generated")).toBe("true");
    const ro = library([{ ...ROW, floor_verdict: "UNSUPPORTED" }], "ro").querySelector(".libStatus");
    expect(ro?.textContent).toBe(catalog("ro", "home")["home.verdict.unsupported"]);
    expect(ro?.getAttribute("data-state")).toBe("unsupported");
  });

  it("keeps a snapshot without a floor as today", () => {
    const status = library([ROW]).querySelector(".libStatus");
    expect(status?.textContent).toBe(catalog("en", "home")["home.verdictUnavailable"]);
    expect(status?.getAttribute("data-state")).toBe("generating");
  });

  it("carries the floor's label on the list's summary, and still reads a summary without one", () => {
    expect(PublicDebateSummarySchema.parse({ ...ROW, floor_verdict: "SUPPORTED" }).floor_verdict).toBe("SUPPORTED");
    expect(PublicDebateSummarySchema.parse(ROW).floor_verdict).toBeUndefined();
    expect(PublicDebateSummarySchema.safeParse({ ...ROW, floor_verdict: "LIKELY" }).success).toBe(false);
    expect(PublicDebateSummarySchema.safeParse({ ...ROW, floor_verdict: null }).success).toBe(false);
  });

  it("lists a published floor's label, and nothing for a snapshot without one (the API)", async () => {
    const floorSnapshot: PublicDebate = PublicDebateSchema.parse({
      public_ref: "22222222-2222-4222-8222-222222222222",
      author_pseudonym: "Stable Public Name",
      question: "Should the public see this?",
      published_at: "2026-09-26T10:00:00.000Z",
      answer: {
        terminal: "COMPONENTS_ONLY", verdict: null, verdict_available: false, confidence_band: null,
        summary_segments: [], badges: [], residual_objections: [], reversal_point: "Contrary public evidence",
        as_of: "2026-09-26T09:00:00.000Z"
      },
      floor: { verdict_state: "CONTESTED", leading_node_id: "33333333-3333-4333-8333-333333333333", basis_incomplete: false }
    });
    const { floor: _floor, ...plainSnapshot } = { ...floorSnapshot, public_ref: "44444444-4444-4444-8444-444444444444" };
    const repository = {
      listPublicRefs: async () => ({ refs: [floorSnapshot.public_ref, plainSnapshot.public_ref], total: 2 })
    } as unknown as PostgresPublicationRepository;
    const application = new PostgresPublicationApplication(
      repository,
      new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd6)))),
      () => new Date("2026-09-27T12:00:00.000Z")
    );
    vi.spyOn(application, "readPublicDebate").mockImplementation(async (ref: string) =>
      ref === floorSnapshot.public_ref ? floorSnapshot : plainSnapshot as PublicDebate);
    const listed = await application.list(20, 0);
    expect(listed.items[0]).toMatchObject({ public_ref: floorSnapshot.public_ref, verdict: null, floor_verdict: "CONTESTED" });
    expect(listed.items[1]).not.toHaveProperty("floor_verdict");
    // The summary never carries the floor's position or anything owner-only.
    expect(JSON.stringify(listed)).not.toMatch(/leading_node_id|basis_incomplete|floor_reason/u);
  });
});

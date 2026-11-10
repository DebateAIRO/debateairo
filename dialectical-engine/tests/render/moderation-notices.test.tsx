// @vitest-environment jsdom
import { act } from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModerationStatement } from "@debateai/contract";
import { ModerationNotices } from "../../apps/ui/components/ModerationNotices.js";
import pub from "../../apps/ui/messages/en/public.json" with { type: "json" };
import ro from "../../apps/ui/messages/ro/public.json" with { type: "json" };

/*
 * 0157 (DSA Art 17; D1): the signed-in page of statements of reasons. It alone shows the facts, the quote and the places; each statement says what was
 * done, the source, the automated means, the ground and office@ with the three routes.
 */
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

const REF = "f1000000-0000-4000-8000-000000000001";
const statement = (over: Partial<ModerationStatement> = {}): ModerationStatement => ({
  statement_id: "57a7e000-0000-4000-8000-000000000001", kind: "DEBATE_HIDDEN", public_ref: REF, happened_at: "2026-11-05T10:00:00.000Z", piece_kind: null, hidden_now: true,
  ground: { recorded: true, interim: true, grounds: ["REVIEW_HOLD"], suspected: ["HATE_SPEECH"], sources: ["REPORT_BUTTON"], automated_detection: true, automated_decision: false },
  facts: [], facts_deleted: false, quote: null, places: [], ...over
});
async function mount(statements: readonly ModerationStatement[] | Error, catalog: Record<string, string> = pub) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const client = { readModerationStatements: vi.fn(async () => { if (statements instanceof Error) throw statements; return { statements: [...statements] }; }) };
  await act(async () => { root!.render(<ModerationNotices catalog={catalog} locale={catalog === ro ? "ro" : "en"} client={client} />); });
  await act(async () => { await Promise.resolve(); });
  return host;
}

describe("the moderation notices page", () => {
  it("a staff hide on a report: what was done, the source, the AI's part, the hold as the ground, what the review is about, and the routes", async () => {
    const page = await mount([statement()]);
    const card = page.querySelector<HTMLElement>("[data-statement-kind=DEBATE_HIDDEN]")!;
    expect(card.id).toBe("57a7e000-0000-4000-8000-000000000001");
    const text = card.textContent!;
    for (const key of ["kind.DEBATE_HIDDEN", "what.DEBATE_HIDDEN", "nowHidden", "source.REPORT_BUTTON", "automatedDetection", "groundIntro", "ground.REVIEW_HOLD", "suspectedIntro", "ground.HATE_SPEECH", "routes"]) {
      expect(text, key).toContain((pub as Record<string, string>)[`public.moderation.${key}`]);
    }
    expect(text).toContain("office@dezbatere.ro");
    expect(text).toContain("six months");
    expect(card.querySelector("a")!.getAttribute("href")).toBe(`/public/debate/${REF}`);
  });

  it("the automatic hide names the rule it found as relied on, and shows the words it found, on this page only", async () => {
    const page = await mount([statement({ ground: { recorded: true, interim: true, grounds: ["REVIEW_HOLD"], suspected: ["HATE_SPEECH"], sources: ["REPORT_BUTTON"], automated_detection: true, automated_decision: true },
      quote: "the words the check found" })]);
    const text = page.textContent!;
    expect(text).toContain(pub["public.moderation.automatedDecision"]);
    expect(text).not.toContain(pub["public.moderation.suspectedIntro"]);
    expect(text).toContain(pub["public.moderation.ground.HATE_SPEECH"]);
    expect(page.querySelector("blockquote")!.textContent).toBe("the words the check found");
  });

  it("a removal shows the facts staff typed; a correction lists its places; facts past twelve months say they were deleted; a step with no ground says so", async () => {
    const page = await mount([
      statement({ statement_id: "57a7e000-0000-4000-8000-000000000002", kind: "CONTRIBUTION_REMOVED", piece_kind: "DIG", hidden_now: false,
        ground: { recorded: true, interim: false, grounds: ["PERSONAL_DATA"], suspected: [], sources: ["OWN_INITIATIVE"], automated_detection: false, automated_decision: false }, facts: ["It names a private person's address."] }),
      statement({ statement_id: "57a7e000-0000-4000-8000-000000000003", kind: "CORRECTED", hidden_now: false, places: [{ piece_kind: "UPDATE", pointer: "/paths/2/line" }] }),
      statement({ statement_id: "57a7e000-0000-4000-8000-000000000004", facts_deleted: true }),
      statement({ statement_id: "57a7e000-0000-4000-8000-000000000005", ground: { recorded: false, interim: false, grounds: [], suspected: [], sources: [], automated_detection: false, automated_decision: false } })
    ]);
    const [removed, corrected, deleted, none] = [...page.querySelectorAll<HTMLElement>("section")];
    expect(removed!.textContent).toContain("It names a private person's address.");
    expect(removed!.textContent).toContain(pub["public.moderation.noAutomation"]);
    expect(removed!.textContent).toContain(pub["public.moderation.source.OWN_INITIATIVE"]);
    expect(removed!.textContent).toContain(pub["public.moderation.nowPublic"]);
    expect(corrected!.textContent).toContain("In a contribution, at /paths/2/line");
    expect(deleted!.textContent).toContain(pub["public.moderation.factsDeleted"]);
    expect(none!.textContent).toContain(pub["public.moderation.groundNone"]);
    for (const card of [removed, corrected, deleted, none]) expect(card!.textContent).toContain(pub["public.moderation.routes"]);
  });

  it("the final decision to a contributor and to a reporter is listed, with its own title and sentence, in en and ro", async () => {
    for (const catalog of [pub, ro]) {
      const page = await mount([
        statement({ statement_id: "57a7e000-0000-4000-8000-000000000006", kind: "CONTRIBUTION_DECIDED", piece_kind: null }),
        statement({ statement_id: "57a7e000-0000-4000-8000-000000000007", kind: "REPORT_DECIDED", piece_kind: null })], catalog);
      for (const kind of ["CONTRIBUTION_DECIDED", "REPORT_DECIDED"]) {
        const card = page.querySelector<HTMLElement>(`[data-statement-kind=${kind}]`)!;
        expect(card.textContent).toContain(catalog[`public.moderation.kind.${kind}`]);
        expect(card.textContent).toContain(catalog[`public.moderation.what.${kind}`]);
      }
      expect(catalog["public.moderation.what.CONTRIBUTION_DECIDED"]).not.toBe(catalog["public.moderation.what.REPORT_DECIDED"]);
      act(() => root?.unmount()); host?.remove();
    }
    expect(ro["public.moderation.what.REPORT_DECIDED"]).not.toBe(pub["public.moderation.what.REPORT_DECIDED"]);
  });

  it("says when there are none, and when they could not be read", async () => {
    expect((await mount([])).textContent).toContain(pub["public.moderation.empty"]);
    act(() => root?.unmount()); host?.remove();
    expect((await mount(new Error("down"))).querySelector("[role=alert]")!.textContent).toBe(pub["public.moderation.unavailable"]);
  });

  it("reads in Romanian, and every UI locale has every line", async () => {
    const page = await mount([statement()], ro);
    expect(page.textContent).toContain(ro["public.moderation.routes"]);
    expect(ro["public.moderation.routes"]).not.toBe(pub["public.moderation.routes"]);
    const keys = Object.keys(pub).filter((key) => key.startsWith("public.moderation."));
    const messages = join(process.cwd(), "apps/ui/messages");
    for (const locale of readdirSync(messages).filter((name) => /^[a-z]{2}$/u.test(name))) {
      const catalog = JSON.parse(readFileSync(join(messages, locale, "public.json"), "utf8")) as Record<string, string>;
      for (const key of keys) expect(catalog[key], `${locale} ${key}`).toBeTruthy();
    }
  });
});

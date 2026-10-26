import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PublicationReviewRecord } from "@debateai/serve";
import { collectSnapshot, type RawExportRows } from "../../apps/api/src/data-export/snapshot.js";
import { OwnerViewAdapter } from "../../apps/api/src/data-export/owner-view-adapter.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { renderYourDataHtml } from "../../apps/api/src/data-export/html-page.js";

const rawFixture = JSON.parse(readFileSync(new URL("../fixtures/data-export/raw-a.json", import.meta.url), "utf8"));
const refusalReason = 'Test refusal reason <private> & "quoted"';
const reviewerStaffId = "reviewer-staff-secret";
const reviewerUserId = "reviewer-user-secret";
const decisions = [
  {
    originVersion: 1, askOrdinal: 1, askedAt: new Date("2026-10-05T10:00:00.000Z"),
    decision: { outcome: "REFUSE", decidedAt: new Date("2026-10-05T11:00:00.000Z"), reason: refusalReason,
      staff_id: reviewerStaffId, user_id: reviewerUserId },
  },
  {
    originVersion: 1, askOrdinal: 2, askedAt: new Date("2026-10-06T12:00:00.000Z"),
    decision: { outcome: "APPROVE", decidedAt: new Date("2026-10-06T13:00:00.000Z"),
      staff_id: reviewerStaffId, user_id: reviewerUserId },
  },
] as unknown as PublicationReviewRecord[];

async function ownerExport(ownerRef = "owner-1", locale = "en") {
  const raw = structuredClone(rawFixture) as RawExportRows;
  const reviews = {
    readStates: async (input: { ownerRef: string; runId: string; answerId: string }) =>
      input.ownerRef === "owner-1" && input.runId === "run-1" && input.answerId === "answer-1" ? decisions : [],
  };
  const adapter = new OwnerViewAdapter({ application: {} as never }, { exists: async () => true }, reviews);
  const ownerView = {
    runKeyPresent: async () => true,
    runRemovedByCheck: async () => false,
    resolveRunRef: async (runId: string) => runId,
    readSynthesisChecks: async () => [],
    readPublicationReviews: (owner: string, run: string, answer: string) => adapter.readPublicationReviews(owner, run, answer),
    readRun: async () => ({ state: "SETTLED", question_line: "Owner question" }),
    readRunAnswer: async () => ({ answer_id: "answer-1", answer_version: 2 }),
    readAnswer: async (_owner: string, _answer: string, version: number) => ({ answer_id: "answer-1", answer_version: version, nodes: [] }),
    readInspection: async () => ({}),
    readLedgerDigest: async () => ({}),
    readStory: async () => null,
    readDisclosure: async () => null,
    readNode: async () => null,
  };
  const snapshot = await collectSnapshot({
    claim: { exportId: "export-1", userId: "user-1", ownerRef, sessionId: "session-1", locale,
      requestedAt: new Date("2026-10-07T00:00:00.000Z"), attempt: 1 },
    workerId: "worker-1", source: { readRaw: async () => raw }, ownerView,
    decrypt: { openUserField: async () => "owner@example.test", openRecord: () => "record", openSupport: async () => "support" },
    now: () => new Date("2026-10-07T01:00:00.000Z"),
  });
  return { snapshot, html: renderYourDataHtml(snapshot, loadArchiveCatalog(locale)) };
}

describe("publication reviews in the owner's data export", () => {
  it("after one refusal and one approval the export lists both asks with times, the refusal with its reason, and the approval", async () => {
    const { snapshot, html } = await ownerExport();
    expect(snapshot.debates.debates[0]?.answers?.[0]?.publication_reviews).toEqual([
      { asked_at: "2026-10-05T10:00:00.000Z", outcome: "REFUSE", decided_at: "2026-10-05T11:00:00.000Z", reason: refusalReason },
      { asked_at: "2026-10-06T12:00:00.000Z", outcome: "APPROVE", decided_at: "2026-10-06T13:00:00.000Z", reason: null },
    ]);
    expect(html).toContain('<p class="label section-label">Publication review</p>');
    expect(html.match(/<p class="check">Asked [^<]*2026[^<]*<\/p>/gu)).toHaveLength(2);
    expect(html).toMatch(/Refused [^<]*2026[^<]* · Test refusal reason/gu);
    expect(html).toMatch(/Approved [^<]*2026/gu);
    const missingAskedAt = new OwnerViewAdapter({ application: {} as never }, { exists: async () => true }, {
      readStates: async () => [{ originVersion: 1, askOrdinal: 1, decision: null }] as PublicationReviewRecord[],
    });
    await expect(missingAskedAt.readPublicationReviews("owner-1", "run-1", "answer-1"))
      .rejects.toThrow("PUBLICATION_REVIEW_ASKED_AT_MISSING");
  });

  it("the export JSON and the readable page contain no reviewer staff_id or user_id", async () => {
    const { snapshot, html } = await ownerExport();
    for (const text of [JSON.stringify(snapshot.debates), html]) {
      expect(text).not.toContain(reviewerStaffId);
      expect(text).not.toContain(reviewerUserId);
      expect(text).not.toContain("staff_id");
      expect(text).not.toContain("user_id");
    }
    expect(snapshot.debates.debates[0]?.answers?.[0]?.publication_reviews?.[0]?.reason).toBe(refusalReason);
    expect(html).toContain("Test refusal reason &lt;private&gt; &amp; &quot;quoted&quot;");
    expect(html).not.toContain(refusalReason);
  });

  it("another account's export lists none of these", async () => {
    const { snapshot, html } = await ownerExport("owner-2");
    expect(snapshot.debates.debates[0]?.answers?.[0]?.publication_reviews).toEqual([]);
    expect(html).not.toContain("Publication review");
    expect(JSON.stringify(snapshot.debates)).not.toContain(refusalReason);
  });

  it("a Romanian export prints the Romanian archive.reviewApproved and archive.reviewRefused words for the approval and the refusal and the reason as written, its readable page holds neither APPROVE nor REFUSE as a word, and its JSON keeps outcome APPROVE and REFUSE", async () => {
    const { snapshot, html } = await ownerExport("owner-1", "ro");
    const catalog = loadArchiveCatalog("ro");
    expect(catalog["archive.reviewApproved"]).toBeTruthy();
    expect(catalog["archive.reviewRefused"]).toBeTruthy();
    expect(html).toContain(catalog["archive.reviewApproved"]);
    expect(html).toContain(catalog["archive.reviewRefused"]);
    expect(html).toContain("Test refusal reason &lt;private&gt; &amp; &quot;quoted&quot;");
    expect(html).not.toMatch(/\b(?:APPROVE|REFUSE)\b/u);
    expect(snapshot.debates.debates[0]?.answers?.[0]?.publication_reviews?.map((review) => review.outcome)).toEqual(["REFUSE", "APPROVE"]);
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { HONESTY_EVENT_CONSUMERS, StalenessStateSchema } from "@debateai/contract";
import { auditOrphans } from "../../tools/orphan-audit/src/index.js";

describe("S11 / AC-05/64/72 — liveness structure", () => {
  it("mints the projection vocabulary and declares the subscription consumer", () => {
    expect(StalenessStateSchema.options).toEqual(["FRESH", "UNDER_REVIEW", "STALE", "ARCHIVED_REVIVED"]);
    expect(HONESTY_EVENT_CONSUMERS["honesty.staleness_trigger_fired"]).toEqual(["W6", "W11"]);
  });

  it("lands append-only liveness carriers and snapshot stamps", async () => {
    const [migration, drizzle] = await Promise.all([
      readFile(new URL("../../migrations/0014_s11.sql", import.meta.url), "utf8"),
      readFile(new URL("../../packages/db/src/schema.ts", import.meta.url), "utf8")
    ]);
    for (const carrier of ["core.revision_trigger", "core.review_clock", "core.staleness_state", "core.question_liveness_event"])
      expect(migration).toContain(carrier);
    expect(migration).toContain("relevant_as_of");
    expect(migration).toContain("reject_mutation");
    expect(migration).not.toMatch(/DELETE FROM core\.(node|revision_trigger|review_clock|staleness_state)/);
    for (const carrier of ["revisionTrigger", "reviewClock", "stalenessState", "questionLivenessEvent"])
      expect(drizzle).toContain(carrier);
  });

  it("derives S11 production attachment from the API and scheduler roots", async () => {
    const report = await auditOrphans();
    expect(report.s11Surface).toEqual(expect.arrayContaining([
      expect.objectContaining({ package: "packages/liveness.LivenessRepository.recordQuery", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/liveness.LivenessRepository.recordTriggerFired", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/liveness.LivenessRepository.sweep", attachment: "ATTACHED" }),
      expect.objectContaining({ package: "packages/liveness.foldStaleness", attachment: "ATTACHED" })
    ]));
  });
});

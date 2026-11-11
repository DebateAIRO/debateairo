// Web search (plan 2026-10-30 task W4-1; design PERPLEXITY-DESIGN.md v2 §3.5 "Sure" 1): the locator check. On a debate
// that kept packs, a point keeps "looked up" only when its locator is exactly an extract id of THIS debate's packs; a
// remembered citation, or an id of another debate's packs, becomes "reasoning" with the downgrade note the engine already
// has. A debate with no packs keeps today's rule.
import { describe, expect, it } from "vitest";
import { Judge, bindWayOfKnowingDowngrade, resolveWayOfKnowing, type JudgeInput } from "@debateai/judgement";
import type { ProviderGateway } from "@debateai/providers";
import { debateWebPacks, webCitedExtractsOf, type WebPack } from "../../apps/runner/src/web-packs.js";

/** This debate's packs: path a1 kept S1-1 and S1-2, path a2 kept S2-1. */
const PACKS: readonly WebPack[] = [
  { pathRef: "a1", pages: [{ pageId: "p-1", rank: 1, title: "Nurse pay in Bavaria", site: "stat.example.de", date: "2026-03-01", readDepth: "whole" }],
    extracts: [{ label: "S1-1", pageId: "p-1", quote: "Starting pay is EUR 3,400 a month." },
      { label: "S1-2", pageId: "p-1", quote: "Most hospitals add a night bonus." }] },
  { pathRef: "a2", pages: [{ pageId: "p-2", rank: 1, title: null, site: "rent.example.de", date: null, readDepth: "preview" }],
    extracts: [{ label: "S2-1", pageId: "p-2", quote: "A one-room flat costs EUR 1,250." }] }
];
const OURS = debateWebPacks(PACKS)!;

/** A judge reply claiming LOOKED_UP with `locator`. */
function replying(locator: string | null): ProviderGateway {
  return {
    call: async () => ({
      rawArtifactRef: "artifact:web-locator", ledgerEntryRef: "ledger:web-locator",
      content: JSON.stringify({
        statement: "The pay is higher in Munich.", way_of_knowing: "LOOKED_UP", locator,
        restatement_text: "The pay is higher in Munich.", restatement_status: "PASS", value_laden: false,
        steelman: { summary: "Higher starting pay.", fidelity: 0.8 },
        critic: { summary: "Rent eats the gain.", counterargumentStrength: 0.4, basis: "PLAUSIBLE_COUNTER" },
        evidence: { quality: 0.7, relevance: 0.9 }, context: { fit: 0.8, ambiguityFlags: [] }, fallacy: { severity: 0.1, fatalFlags: [] }
      }),
      provider: "openai-compatible-http", model: "fixture/model", maker: "fixture", modelVersion: "fixture-version"
    })
  };
}

const input = (extra: Partial<JudgeInput> = {}): JudgeInput => ({
  runId: null, subjectItemId: "node:web-locator", callSiteKey: "fixture:judge", questionLine: "Should I move to Munich as a nurse?",
  leg: { kind: "primary-root" }, providerRef: "provider:test", contractHash: "contract:test",
  bound: { maxAttempts: 1, tokenCeiling: 64, deadlineMs: 5_000 }, ...extra
});

describe("the locator check (W4-1)", () => {
  it("keeps 'looked up' for an extract id of this debate's own packs", async () => {
    expect(resolveWayOfKnowing("LOOKED_UP", "S1-2", OURS.extractIds)).toEqual({ wayOfKnowing: "LOOKED_UP", locator: "S1-2" });
    const judged = await new Judge(replying("S2-1")).judge(input({ debateExtractIds: OURS.extractIds }));
    expect(judged).toMatchObject({ wayOfKnowing: "LOOKED_UP", locator: "S2-1", wayOfKnowingDowngrade: null });
  });

  it("downgrades a remembered citation to reasoning, with the downgrade note the engine already has", async () => {
    const remembered = "Bavarian Hospital Society, 2024 pay report";
    expect(resolveWayOfKnowing("LOOKED_UP", remembered, OURS.extractIds)).toEqual({ wayOfKnowing: "REASONING", locator: null });
    const judged = await new Judge(replying(remembered)).judge(input({ debateExtractIds: OURS.extractIds }));
    expect(judged).toMatchObject({ wayOfKnowing: "REASONING", locator: null,
      wayOfKnowingDowngrade: { claimedWayOfKnowing: "LOOKED_UP", resolvedWayOfKnowing: "REASONING" } });
    const note = bindWayOfKnowingDowngrade(judged.wayOfKnowingDowngrade!, "node-1");
    expect(note.mark).toBe("WAY-OF-KNOWING-DOWNGRADED");
    expect(note.reason).toBe("Node node-1 claimed way of knowing LOOKED_UP; normalization resolved REASONING. A LOOKED_UP claim keeps "
      + "its label only when it carries a resolving locator.");
  });

  it("downgrades another debate's extract id, and anything that is not exactly one of ours", async () => {
    // Another debate's pack: its path 3 kept S3-4; this debate has no path 3. Its rows' uuids are no ids of ours either.
    for (const other of ["S3-4", "S1-9", "6f1c2d9e-0b7a-4c55-9d0e-7a1b2c3d4e5f", "S1-1, S1-2", "s1-1", "S1-1 (page 1)"]) {
      expect(resolveWayOfKnowing("LOOKED_UP", other, OURS.extractIds)).toEqual({ wayOfKnowing: "REASONING", locator: null });
    }
    const judged = await new Judge(replying("S3-4")).judge(input({ debateExtractIds: OURS.extractIds }));
    expect(judged).toMatchObject({ wayOfKnowing: "REASONING", locator: null,
      wayOfKnowingDowngrade: { claimedWayOfKnowing: "LOOKED_UP", resolvedWayOfKnowing: "REASONING" } });
  });

  it("a debate with no packs keeps today's rule: any locator keeps 'looked up', none loses it", async () => {
    expect(debateWebPacks([])).toBeNull();
    expect(resolveWayOfKnowing("LOOKED_UP", "Bavarian Hospital Society, 2024", undefined)).toEqual({
      wayOfKnowing: "LOOKED_UP", locator: "Bavarian Hospital Society, 2024" });
    expect(resolveWayOfKnowing("LOOKED_UP", null, undefined)).toEqual({ wayOfKnowing: "REASONING", locator: null });
    expect(resolveWayOfKnowing("REASONING", "S1-1", OURS.extractIds)).toEqual({ wayOfKnowing: "REASONING", locator: null });
    const judged = await new Judge(replying("Bavarian Hospital Society, 2024")).judge(input());
    expect(judged).toMatchObject({ wayOfKnowing: "LOOKED_UP", locator: "Bavarian Hospital Society, 2024", wayOfKnowingDowngrade: null });
  });

  it("only a kept looked-up point carries its extract to the readers, copied from the stored pack", () => {
    const cited = webCitedExtractsOf(OURS, [
      { nodeId: "n1", wayOfKnowing: "LOOKED_UP", locator: "S1-1" },
      { nodeId: "n2", wayOfKnowing: "REASONING", locator: null },
      { nodeId: "n3", wayOfKnowing: "LOOKED_UP", locator: "Bavarian Hospital Society" },
      { nodeId: "n4", wayOfKnowing: "LOOKED_UP", locator: "S2-1" }
    ]);
    expect([...cited.keys()]).toEqual(["n1", "n4"]);
    expect(cited.get("n1")).toEqual({ id: "S1-1", quote: "Starting pay is EUR 3,400 a month.", title: "Nurse pay in Bavaria",
      site: "stat.example.de", date: "2026-03-01" });
    expect(cited.get("n4")).toEqual({ id: "S2-1", quote: "A one-room flat costs EUR 1,250.", title: null, site: "rent.example.de", date: null });
    expect(webCitedExtractsOf(null, [{ nodeId: "n1", wayOfKnowing: "LOOKED_UP", locator: "S1-1" }]).size).toBe(0);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PublicDebateSchema, type Answer, type PublicDebate } from "../../packages/contract/src/index.js";
import { publicHasWords, publicMapOf, publicSidesOf } from "../../apps/ui/lib/v4/publicMap.js";
import { publicReportWriting, reportShown } from "../../apps/ui/lib/v4/publicReport.js";
import { pointsOf, pointsOfNodes } from "../../apps/ui/lib/v4/trust.js";
import { seedPublicDebates } from "../../tools/v4-mock-api/public-seed.js";

/*
 * Owner's screen review, 3 Nov 2026 (public-d1 A, public-f1, r2-20 A, journey-f12, public-f9): the public page reads a public debate as the person's own
 * map reads theirs. Each published point gets its trust word by the own map's builder (one rule), each path its one word and its bar, exactly one star on a
 * question a public page can dig into, and "For" and "Against" in one sentence each. Nothing of the engine's numbers leaves lib/v4/publicMap.ts.
 */
const PUBLIC = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/public.json"), "utf8")) as Record<string, string>;
const seeded = (): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[0]);
const authorGone = (): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[1]);

describe("a public debate as a V4 map", () => {
  it("words every published point by the own map's builder, so the two pages never word a point apart", () => {
    const debate = seeded();
    const nodes = debate.answer.nodes!;
    const own = pointsOf({ nodes, web: undefined } as unknown as Answer, null, new Set());
    const shared = pointsOfNodes(nodes, { free: false, fell: new Set() });
    expect([...shared.values()]).toEqual([...own.values()]);
    const { map } = publicMapOf(debate);
    expect(map.points.map((point) => [point.id, point.trust])).toEqual([
      ["p-fares", "SURE_FOR_CASE"], ["n-fares", "SURE_FOR_CASE"], ["n-drivers", "STILL_ARGUED"], ["p-service", "SURE_FOR_CASE"],
      ["n-service", "SURE"], ["p-targeted", "SURE_FOR_CASE"], ["n-targeted", "SURE_FOR_CASE"]
    ]);
    // The point on a checked page carries its source, cut as the own map cuts it.
    expect(map.points.find((point) => point.id === "n-service")!.sources![0]!.link).toBe("https://example.org/made-up-lines");
    expect(publicHasWords(map)).toBe(true);
  });

  it("gives each path its newest text, its position's one word and its own points' bar", () => {
    const { map, views } = publicMapOf(seeded());
    expect(map.paths.map((path) => path.id)).toEqual(["p-fares", "p-service", "p-targeted"]);
    const fares = map.paths[0]!;
    expect(fares.line).toContain("also in small towns");
    expect(fares.trust).toBe("SURE_FOR_CASE");
    expect(fares.counts).toEqual({ SURE: 0, SURE_FOR_CASE: 2, STILL_ARGUED: 1, DIDNT_HOLD: 0 });
    expect(map.paths[1]!.counts.SURE).toBe(1);
    expect(views.get("p-fares")!.additions[0]!.contributor).toBe("Quiet Heron");
  });

  it("has exactly one star, on a question under a path; the questions under the question itself are shown but never starred", () => {
    const { map } = publicMapOf(seeded());
    const starred = [...map.open, ...map.paths.flatMap((path) => path.open)].filter((question) => question.star);
    expect(starred).toHaveLength(1);
    expect(starred[0]!.id).toBe("p:n-drivers");
    expect(starred[0]!.pathId).toBe("p-fares");
    expect(map.open.map((question) => question.kind)).toEqual(["OBJECTION", "WOULD_CHANGE"]);
    expect(map.open.every((question) => !question.star)).toBe(true);
  });

  it("a path that fell says \"Didn't hold\", also when a contribution made it fall and when no tree was published", () => {
    const base = authorGone();
    const fallen = { ...base, story_short: { ...base.story_short!, paths: [{ ...base.story_short!.paths[0]!, fate: "FELL" as const }] } };
    const { map } = publicMapOf(fallen);
    expect(map.paths[0]!.trust).toBe("DIDNT_HOLD");
    expect(map.points).toEqual([]);
    expect(publicHasWords(map)).toBe(false);
    const debate = seeded();
    const contributed = { ...debate, contributions: [{ ...debate.contributions![0]!, fate: "FELL" as const }] };
    const after = publicMapOf(contributed).map;
    expect(after.paths[0]!.trust).toBe("DIDNT_HOLD");
    expect(after.points.find((point) => point.id === "p-fares")!.trust).toBe("DIDNT_HOLD");
  });

  it("a published tree with no story reads as the own map does: one path holding every point, with no word of its own", () => {
    const { story_short: _story, contributions: _c, ...rest } = seeded();
    const { map, views } = publicMapOf(rest);
    expect(map.paths.map((path) => path.id)).toEqual(["all"]);
    expect(map.paths[0]!.points).toHaveLength(7);
    expect(map.paths[0]!.trust).toBeUndefined();
    expect(views.size).toBe(0);
    expect(map.fallbackText).toContain("You asked whether cities should make public transport free.");
  });

  it("a debate published without its tree has no points, no bar and no sides; nothing is invented", () => {
    const debate = authorGone();
    expect(publicMapOf(debate).map.points).toEqual([]);
    expect(publicSidesOf(debate, PUBLIC)).toEqual({ forSide: null, againstSide: null });
  });
});

describe("For and Against", () => {
  it("the strongest published point on each side, as one sentence, with its node for a reviewer's Read and nothing else", () => {
    const sides = publicSidesOf(seeded(), PUBLIC);
    expect(sides).toEqual({
      forSide: { line: "Riders follow frequent, reliable lines.", nodeId: "n-service" },
      againstSide: { line: "Free fares move many drivers out of their cars.", nodeId: "n-drivers" }
    });
  });

  it("the page's map carries no engine number: no score, strength or model reaches it", () => {
    const text = JSON.stringify(publicMapOf(seeded()).map);
    expect(text).not.toMatch(/base_score|final_strength|probability|mock-model|maker_lineage|"value"/u);
  });
});

describe("a report being written on a public page (public-f9)", () => {
  const debate = seeded();
  it("reads the server's optional word only when it has the shape; today it is absent", () => {
    expect(publicReportWriting(debate)).toBeNull();
    const at = "2026-11-04T10:00:00.000Z";
    const withField = (field: unknown): PublicDebate => ({ ...debate, report_writing: field } as PublicDebate);
    expect(publicReportWriting(withField({ report_version: 2, state: "WRITING", started_at: at }))).toEqual({ report_version: 2, state: "WRITING", started_at: at });
    expect(publicReportWriting(withField({ report_version: 2, state: "FAILED" }))).toEqual({ report_version: 2, state: "FAILED" });
    for (const broken of [null, "WRITING", { report_version: 0, state: "WRITING", started_at: at }, { report_version: 2, state: "DONE" },
      { report_version: 2, state: "WRITING" }, { report_version: 2, state: "WRITING", started_at: "soon" }, { report_version: 1.5, state: "FAILED" }]) {
      expect(publicReportWriting(withField(broken)), JSON.stringify(broken)).toBeNull();
    }
  });

  it("a version is shown once the debate holds it or a newer one", () => {
    expect(reportShown(debate, 1)).toBe(true);
    expect(reportShown(debate, 2)).toBe(false);
  });
});

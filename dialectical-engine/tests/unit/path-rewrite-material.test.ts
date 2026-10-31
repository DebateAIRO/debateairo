// tests/unit/path-rewrite-material.test.ts
// W3-5 (dig-model revision 2026-10-30): the path rewrite's material is built by code, the same bytes every time; the 100K
// guard (W0-1 §1.4) passes a body of 195,904 bytes and refuses 195,905; the ladder keeps whole statements, never cutting
// inside a text, and a material that fits on no step is TOO_LARGE. Made-up debates.
import { describe, expect, it } from "vitest";
import { buildFramedPrompt, type PromptPacket } from "@debateai/providers";
import { canonicalPromptFingerprint } from "@debateai/scorecard";
import { PATH_REWRITE_WRITER_PROMPT_CONTRACT } from "@debateai/story";
import {
  PATH_REWRITE_BODY_MAX_BYTES, PATH_REWRITE_BODY_OTHER_MEMBERS_BYTES, PATH_REWRITE_INPUT_OVER_LIMIT, buildPathRewriteMaterial,
  pathRewriteBodyBytes, pathRewriteBodyFits, pathRewriteDigPathsOf, pathRewriteGuard, type PathRewriteDigPath,
  type PathRewriteMaterialInput, type PathRewritePoint
} from "../../apps/runner/src/path-rewrite-material.js";
import { AI_PICK, DIG_NODES, OWN_VIEW, dig, digSnapshot, storyParentPath } from "../support/path-rewrite-world.js";

const input = (overrides: Partial<PathRewriteMaterialInput> = {}): PathRewriteMaterialInput => ({
  question: dig().question, parent: storyParentPath(), picks: [AI_PICK, OWN_VIEW],
  digPaths: pathRewriteDigPathsOf(digSnapshot("55555555-5555-4555-8555-555555555555", { resolve: () => null, backups: [] }),
    new Map([[DIG_NODES.bridge, { reviewOutcome: "dispute" as const }]])),
  ...overrides
});
const built = (material: ReturnType<typeof buildPathRewriteMaterial>) => {
  if (material.kind !== "BUILT") throw new Error("expected a built material");
  return material;
};
const fieldsOf = (material: ReturnType<typeof built>) => new Map(material.material.writer.map((entry) => [entry.name, entry.content] as const));

describe("W3-5 the rewrite's material", () => {
  it("is the same bytes every time, and the framed prompts are byte-identical once the fence and canary are masked", () => {
    const one = built(buildPathRewriteMaterial(input()));
    const two = built(buildPathRewriteMaterial(input()));
    expect(JSON.stringify(two.material.writer)).toBe(JSON.stringify(one.material.writer));
    const packet = (fields: typeof one.material.writer) => buildFramedPrompt({ contract: PATH_REWRITE_WRITER_PROMPT_CONTRACT, material: fields }).packet;
    expect(canonicalPromptFingerprint(packet(two.material.writer).messages)).toBe(canonicalPromptFingerprint(packet(one.material.writer).messages));
    expect([...fieldsOf(one).keys()]).toEqual(["question", "place", "purpose", "path", "picks", "dig_paths", "reader"]);
    expect(one.ladderStep).toBe(1);
  });

  it("carries the parent path with its trust words and only the extracts its points cite, the picks marked, the dig's paths in the judges' order", () => {
    const material = built(buildPathRewriteMaterial(input({ parent: storyParentPath({ extracts: [
      ...storyParentPath().extracts, { pointId: "not-a-point-of-the-path", label: "S9-9", site: "x.example", title: null, quote: "Unrelated." }] }) })));
    const fields = fieldsOf(material);
    expect(JSON.parse(fields.get("path")!)).toEqual({
      line: "Yes: a second pier would cut the queues.", fate: "HELD_UP",
      points: [{ ref: "P1", text: "Queues at the pier run long at rush hour.", on: "path", side: "for", trust: "SURE_FOR_CASE" },
        { ref: "P2", text: "A pier costs more than a bus line.", on: "path", side: "against", trust: "STILL_ARGUED", disputed: true }],
      sources: [{ ref: "S1-1", point: "P1", site: "harbour.example", title: "Pier queues", quote: "Queues reach forty minutes at eight." }]
    });
    expect(JSON.parse(fields.get("picks")!)).toEqual([{ text: AI_PICK.text, marked: "AI_SUGGESTION" }, { text: OWN_VIEW.text, marked: "PERSON_OWN_VIEW" }]);
    const digPaths = JSON.parse(fields.get("dig_paths")!) as Array<{ ref: string; place: number; statement: string; points: unknown[] }>;
    expect(digPaths.map((path) => [path.ref, path.place, path.statement])).toEqual([
      ["D1", 1, "No: winter ridership falls by half."], ["D2", 2, "Yes: winter crowds fill both piers."]]);
    expect(digPaths[0]!.points).toEqual([{ ref: "P3", text: "Winter queues are short.", on: "D1", side: "for" },
      { ref: "P4", text: "The bridge takes winter traffic.", on: "D1", side: "for", disputed: true }]);
    expect(material.material.index).toEqual({ pointRefs: new Set(["P1", "P2", "P3", "P4", "P5"]), digPathRefs: ["D1", "D2"], personWords: true });
    expect(material.digPathRefs.get("D1")).toBe(DIG_NODES.no);
    expect(material.pointIds.get("P4")).toBe(DIG_NODES.bridge);
  });

  it("the 100K guard: (bytes / 2) + 2,048 ≤ 100,000 passes 195,904 and refuses 195,905, on every packet sent", () => {
    expect(PATH_REWRITE_BODY_MAX_BYTES).toBe(195_904);
    expect(pathRewriteBodyFits(195_904)).toBe(true);
    expect(pathRewriteBodyFits(195_905)).toBe(false);
    const packetOf = (bodyBytes: number): PromptPacket => {
      const empty = Buffer.byteLength(JSON.stringify({ messages: [{ role: "user", content: "" }] }), "utf8") + PATH_REWRITE_BODY_OTHER_MEMBERS_BYTES;
      return { messages: [{ role: "user", content: "x".repeat(bodyBytes - empty) }] };
    };
    expect(pathRewriteBodyBytes(packetOf(195_904))).toBe(195_904);
    expect(pathRewriteGuard(packetOf(195_904))).toEqual(packetOf(195_904));
    expect(() => pathRewriteGuard(packetOf(195_905))).toThrow(expect.objectContaining({ code: PATH_REWRITE_INPUT_OVER_LIMIT }));
  });

  it("the ladder: a big dig keeps fewer WHOLE points, disputed first, with only their extracts; no text is ever cut", () => {
    const long = (label: string, at: number) => `${label} ${String(at)}: ${"winter ferries carry fewer riders than summer ones; ".repeat(60)}end.`;
    const points = (pathAt: number): PathRewritePoint[] => Array.from({ length: 12 }, (_, at) => ({
      id: `p-${String(pathAt)}-${String(at)}`, text: long(`point ${String(pathAt)}`, at), onId: null, side: "for" as const, trust: null, disputed: at === 11 }));
    const bigPaths: PathRewriteDigPath[] = Array.from({ length: 6 }, (_, pathAt) => ({ positionRef: `pos-${String(pathAt)}`,
      statement: long("answer", pathAt), points: points(pathAt),
      extracts: points(pathAt).map((point) => ({ pointId: point.id, label: `E-${point.id}`, site: "x.example", title: null, quote: long("quote", pathAt) })) }));
    const whole = new Set([...bigPaths.flatMap((path) => [path.statement, ...path.points.map((point) => point.text), ...path.extracts.map((entry) => entry.quote)])]);
    const material = built(buildPathRewriteMaterial(input({ digPaths: bigPaths })));
    expect(material.ladderStep).toBeGreaterThan(1);
    expect(pathRewriteBodyFits(material.bodyBytes)).toBe(true);
    const digPaths = JSON.parse(fieldsOf(material).get("dig_paths")!) as Array<{ statement: string; points: Array<{ ref: string; text: string; disputed?: true }>;
      sources: Array<{ point: string; quote: string }> }>;
    expect(digPaths).toHaveLength(6);
    for (const path of digPaths) {
      // Every statement stays, whole; every kept text is one of the input's texts, whole.
      expect(whole.has(path.statement)).toBe(true);
      for (const point of path.points) expect(whole.has(point.text)).toBe(true);
      for (const source of path.sources) expect(whole.has(source.quote)).toBe(true);
      expect(path.points.length).toBeLessThan(12);
      // The disputed point is kept first, and only the kept points' extracts ride along.
      if (path.points.length > 0) expect(path.points.some((point) => point.disputed === true)).toBe(true);
      expect(path.sources.every((source) => path.points.some((point) => point.ref === source.point))).toBe(true);
    }
    // A point the step left out is not a ref the reply may rest on; refs keep their numbers across steps.
    const kept = new Set(digPaths.flatMap((path) => path.points.map((point) => point.ref)));
    expect([...material.material.index.pointRefs].filter((name) => !["P1", "P2"].includes(name)).sort()).toEqual([...kept].sort());
    expect(material.pointIds.get("P3")).toBe("p-0-0");
  });

  it("nothing fits on any step: TOO_LARGE (the rewrite is stored FAILED, the path keeps its text)", () => {
    const huge = "a ferry line that runs all night ".repeat(7000);
    expect(buildPathRewriteMaterial(input({ parent: storyParentPath({ line: huge }) }))).toMatchObject({ kind: "TOO_LARGE" });
  });

  it("the dig's own paths: the winner, the runner-up, then by strength; each point once; a set-aside node is left out", () => {
    const snapshot = digSnapshot("55555555-5555-4555-8555-555555555555", { resolve: () => null, backups: [] });
    const third = { ...snapshot.nodes[0]!, nodeId: "aaaaaaaa-0000-4000-8000-000000000009", claim: "Maybe: build it later.", finalStrength: 0.9 };
    const aside = { ...snapshot.nodes[2]!, nodeId: "aaaaaaaa-0000-4000-8000-00000000000a", claim: "Set aside.", excludedReason: "OFF_TOPIC" };
    const paths = pathRewriteDigPathsOf({ ...snapshot, nodes: [...snapshot.nodes, third, aside],
      arrows: [...snapshot.arrows, { sourceNodeId: aside.nodeId, targetNodeId: DIG_NODES.no, polarity: "attack" as const }] }, new Map());
    expect(paths.map((path) => path.positionRef)).toEqual([DIG_NODES.no, DIG_NODES.yes, third.nodeId]);
    expect(paths[0]!.points.map((point) => point.id)).toEqual([DIG_NODES.queues, DIG_NODES.bridge]);
    expect(paths[1]!.points.map((point) => [point.id, point.side])).toEqual([[DIG_NODES.buses, "against"]]);
  });
});

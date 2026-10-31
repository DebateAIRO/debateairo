// W4-7 and R22 (the owner's "top 3 pages for each chosen path"): every path of a dig's map reads every chosen path's pack, each
// under the words of the pick it belongs to. Each pick keeps its pack under its own ref (0132 ties a pack to its searches' path); every
// map path's step outcome names them all. Cut by the same rule, the same bytes on a run claimed again. A first debate is unchanged:
// each path its own pack, a path with none reads none.
import { describe, expect, it } from "vitest";
import { WEB_EVIDENCE_CARRIERS, type WebEvidenceRead } from "@debateai/db";
import { LENGTH_GUIDANCE_START, type LengthGuide } from "@debateai/kernel";
import { framedJudgePromptForTest, type JudgeLeg } from "@debateai/judgement";
import { readPromptFrame } from "@debateai/providers";
import {
  debateWebPacks, legWithWebSources, readDebateWebPacks, webSourcesText, type WebPack
} from "../../apps/runner/src/web-packs.js";
import type { WebStepPorts } from "../../apps/runner/src/web-step.js";
import { CIPHER } from "../support/web-step-world.js";

const GUIDE: LengthGuide = { words: 120, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const Q = "Would winter ridership fill a second ferry pier?";
const RUN = "66666666-6666-4666-8666-666666666666";
const DIG_PACK_ID = "77777777-7777-4777-8777-777777777777";
const page = (pageId: string, rank: number, site: string) =>
  ({ pageId, rank, title: `Page ${pageId}`, site, date: "2026-02-01", readDepth: "whole" as const });

/** One chosen path's pack, kept under its own ref (S1-*). */
const DIG_PACK: WebPack = { pathRef: "dig-pick-1", pages: [page("p1", 1, "ferry.example.org"), page("p2", 2, "harbour.example.org")],
  extracts: [{ label: "S1-1", pageId: "p1", quote: "Winter crossings fall by a third." },
    { label: "S1-2", pageId: "p2", quote: "Tourists fill summer sailings." }] };
const CHOSEN = "Winter ridership falls.";
/** Every map path of the dig names the pick's pack, with its words; b3 is not a path of this dig. */
const DIG_READS = Object.freeze([{ packId: DIG_PACK_ID, chosen: CHOSEN }]);
const DIG_OUTCOMES = Object.freeze([{ pathRef: "b1", packId: DIG_PACK_ID, digPacks: DIG_READS }, { pathRef: "b2", packId: DIG_PACK_ID, digPacks: DIG_READS }]);

const engineRoot = (answer: string): JudgeLeg => ({ kind: "assigned-root", assignedAnswer: answer,
  mapPoints: JSON.stringify({ for: [{ text: "Tourists fill the ferries.", rests_on: "question" }], against: [] }),
  engine: { pointsRaised: "[]", assumptions: "[]" } });
const sourcesField = (leg: JudgeLeg): string | undefined =>
  readPromptFrame(framedJudgePromptForTest(leg, Q, "English", "resolved", null, GUIDE).packet).fields
    .find((field) => field.name === "sources")?.content;

/** The packs reader's store: 0132's read with the pack's row, sealed under the run's key. */
function storeWith(rows: readonly Readonly<{ packId: string; pathRef: string; pack: unknown }>[]) {
  let reads = 0;
  const read = async (): Promise<WebEvidenceRead> => {
    reads += 1;
    return { searches: [], pages: [], readings: [], extracts: [], picks: [], researched: [],
      packs: rows.map((row) => ({ pack_id: row.packId, path_ref: row.pathRef, extract_labels: [], created_at: "now",
        content: CIPHER.seal(WEB_EVIDENCE_CARRIERS.pack, row.packId, row.pack).envelope })) };
  };
  const ports = async (): Promise<WebStepPorts> => ({ store: { read } as unknown as WebStepPorts["store"],
    cipher: CIPHER as unknown as WebStepPorts["cipher"], close: async () => undefined });
  return { ports, reads: () => reads };
}
/** The pack's sealed value, as the web step writes it (`recordPack`). */
const STORED_DIG_PACK = Object.freeze({ path_ref: "dig-pick-1",
  pages: [{ page_id: "p1", rank: 1, title: "Page p1", site: "ferry.example.org", date: "2026-02-01", read_depth: "whole" },
    { page_id: "p2", rank: 2, title: "Page p2", site: "harbour.example.org", date: "2026-02-01", read_depth: "whole" }],
  extracts: [{ label: "S1-1", page_id: "p1", quote: "Winter crossings fall by a third." },
    { label: "S1-2", page_id: "p2", quote: "Tourists fill summer sailings." }] });

describe("a dig: every map path reads each chosen path's pack", () => {
  const sharedOf = () => debateWebPacks([DIG_PACK], [{ pathRef: "b1", reads: [{ keptUnder: "dig-pick-1", chosen: CHOSEN }] },
    { pathRef: "b2", reads: [{ keptUnder: "dig-pick-1", chosen: CHOSEN }] }])!;

  it("case writer, defender, critic and cross-reply read it under its chosen words, the same bytes for every map path", () => {
    const shared = sharedOf();
    expect(shared.digPacksOf("b2")).toEqual([{ chosen: CHOSEN, pack: DIG_PACK }]);
    const own = sourcesField(legWithWebSources(engineRoot("Yes."), shared, { own: "b1" }))!;
    expect((JSON.parse(own) as { chosen: string }[])[0]!.chosen).toBe(CHOSEN);
    expect(sourcesField(legWithWebSources(engineRoot("No."), shared, { own: "b2" }))).toBe(own);
    for (const kind of ["support", "attack"] as const) {
      const leg: JudgeLeg = { kind, positionUnderDebate: "Tourists fill the ferries." };
      expect(sourcesField(legWithWebSources(leg, shared, { own: "b2" }))).toBe(sourcesField(legWithWebSources(leg, shared, { own: "b1" })));
    }
    const cross = JSON.parse(sourcesField(legWithWebSources({ kind: "cross-root", ownPosition: "No.", otherMakersPosition: "Yes." },
      shared, { own: "b2", rival: "b1" }))!) as readonly Readonly<{ for: string; extracts: readonly Readonly<{ id: string }>[] }>[];
    // Once, naming both fields: the rival reads the same packs (the plan's known gap, "a dig's cross-reply shows the shared pack twice").
    expect(cross.map((entry) => [entry.for, entry.extracts.map((extract) => extract.id)]))
      .toEqual([["own_position, other_makers_position", ["S1-1", "S1-2"]]]);
    // The locator check and the cited extracts are the pack's own: nothing new is made up for b2.
    expect([...shared.extractIds]).toEqual(["S1-1", "S1-2"]);
    expect(shared.citedExtract("S1-1")?.quote).toBe("Winter crossings fall by a third.");
  });

  it("without the outcomes, a map path reads no pack", () => {
    const alone = debateWebPacks([DIG_PACK])!;
    expect(alone.packOf("b2")).toBeUndefined();
    expect(sourcesField(legWithWebSources(engineRoot("No."), alone, { own: "b2" }))).toBeUndefined();
  });

  it("the packs reader takes the step's outcomes: each map path reads the pick's stored pack; claimed again, the same bytes", async () => {
    const store = storeWith([{ packId: DIG_PACK_ID, pathRef: "dig-pick-1", pack: STORED_DIG_PACK }]);
    const first = await readDebateWebPacks({ pool: {} as never, runId: RUN, ports: store.ports, paths: DIG_OUTCOMES });
    expect(first!.digPacksOf("b2")[0]!.pack).toEqual(DIG_PACK);
    const again = await readDebateWebPacks({ pool: {} as never, runId: RUN, ports: store.ports, paths: DIG_OUTCOMES });
    for (const pathRef of ["b1", "b2"]) {
      const text = webSourcesText(first, [{ pathRef, for: "assigned_answer" }]);
      expect(text).toBeDefined();
      expect(webSourcesText(again, [{ pathRef, for: "assigned_answer" }])).toBe(text);
      expect(text).toBe(webSourcesText(first, [{ pathRef: "b1", for: "assigned_answer" }]));
    }
    expect(store.reads()).toBe(2);
  });

  it("an outcome naming a pack the store does not hold, or one that does not open, shares nothing", async () => {
    const missing = await readDebateWebPacks({ pool: {} as never, runId: RUN,
      paths: [...DIG_OUTCOMES, { pathRef: "b3", packId: null, digPacks: [{ packId: "88888888-8888-4888-8888-888888888888", chosen: "x" }] }],
      ports: storeWith([{ packId: DIG_PACK_ID, pathRef: "dig-pick-1", pack: STORED_DIG_PACK }]).ports });
    expect(missing!.digPacksOf("b3")).toEqual([]);
    const logged: string[] = [];
    const broken = await readDebateWebPacks({ pool: {} as never, runId: RUN, paths: DIG_OUTCOMES, log: (event) => { logged.push(event); },
      ports: storeWith([{ packId: DIG_PACK_ID, pathRef: "dig-pick-1", pack: { not: "a pack" } }]).ports });
    expect(broken).toBeNull();
    expect(logged).toEqual(["WEB_PACK_INVALID"]);
  });
});

describe("a first debate is unchanged", () => {
  const A1: WebPack = { ...DIG_PACK, pathRef: "a1" };
  const A2: WebPack = { pathRef: "a2", pages: [page("q1", 1, "bus.example.org")],
    extracts: [{ label: "S2-1", pageId: "q1", quote: "Buses reach more of the town." }] };

  it("each path its own pack, a path with none reads none; the outcomes change nothing", async () => {
    const plain = debateWebPacks([A1, A2])!;
    const withOutcomes = debateWebPacks([A1, A2], [])!;
    for (const pathRef of ["a1", "a2", "a3"]) expect(withOutcomes.packOf(pathRef)).toBe(plain.packOf(pathRef));
    const stored = (pack: WebPack) => ({ path_ref: pack.pathRef,
      pages: pack.pages.map((entry) => ({ page_id: entry.pageId, rank: entry.rank, title: entry.title, site: entry.site, date: entry.date,
        read_depth: entry.readDepth })),
      extracts: pack.extracts.map((extract) => ({ label: extract.label, page_id: extract.pageId, quote: extract.quote })) });
    const store = storeWith([{ packId: "a1-pack", pathRef: "a1", pack: stored(A1) }, { packId: "a2-pack", pathRef: "a2", pack: stored(A2) }]);
    const outcomes = [{ pathRef: "a1", packId: "a1-pack" }, { pathRef: "a2", packId: "a2-pack" }, { pathRef: "a3", packId: null }];
    const read = await readDebateWebPacks({ pool: {} as never, runId: RUN, ports: store.ports, paths: outcomes });
    const readAlone = await readDebateWebPacks({ pool: {} as never, runId: RUN, ports: store.ports });
    for (const pathRef of ["a1", "a2", "a3"]) {
      expect(webSourcesText(read, [{ pathRef, for: "assigned_answer" }])).toBe(webSourcesText(readAlone, [{ pathRef, for: "assigned_answer" }]));
    }
    expect(read!.packOf("a3")).toBeUndefined();
    expect(read!.packOf("a2")!.extracts.map((extract) => extract.label)).toEqual(["S2-1"]);
  });
});

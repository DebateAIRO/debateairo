import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type PublicDebate } from "../../packages/contract/src/index.js";
import { ContractHttpError, type ContractClient } from "../../packages/contract/src/client.js";
import { createDebate } from "../../apps/ui/lib/api.js";
import { contributorName, pressPublicReport, publicDigAsk, publicDigRefusalWords, publicPathViews, reportsNewestFirst } from "../../apps/ui/lib/v4/publicPage.js";
import { digQuestion } from "../../apps/ui/lib/v4/askText.js";
import { ownViewPick } from "../../apps/ui/lib/v4/suggestions.js";
import { seedPublicDebates, PUBLIC_REF, PUBLIC_UPDATE_REF } from "../../tools/v4-mock-api/public-seed.js";

/*
 * Decisions 13, 16 and 22: what a public page reads of its contributions, what its dig and report presses send and how refusals read, and the Free notice's
 * legal-weight sentence in all 35 catalogues.
 */
const messages = resolve(import.meta.dirname, "../../apps/ui/messages");
const read = (locale: string, name: string) => JSON.parse(readFileSync(resolve(messages, `${locale}/${name}.json`), "utf8")) as Record<string, string>;
const CATALOG = read("en", "v4");
const debate = (at = 0): PublicDebate => PublicDebateSchema.parse(seedPublicDebates()[at]);

describe("the Free notice in every language", () => {
  const KEY = "newDebate.freePublicNotice";
  const locales = readdirSync(messages, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  it("the owner's exact English, and a translator's note", () => {
    expect(read("en", "newDebate")[KEY]).toBe("On the Free plan your question and its debate are public. Don't include personal details.");
    expect(read("en", "_notes")[KEY]).toContain("legal-weight");
  });
  it("35 languages, each its own real sentence pair, no English left, no placeholder", () => {
    expect(locales).toHaveLength(35);
    const english = read("en", "newDebate")[KEY]!;
    const seen = new Set<string>();
    for (const locale of locales.filter((code) => code !== "en")) {
      const words = read(locale, "newDebate")[KEY];
      expect(words, locale).toBeTruthy();
      expect(words, locale).not.toBe(english);
      expect(words, locale).not.toMatch(/\{|\bpublic\b.*\bpersonal\b/u);
      seen.add(words!);
    }
    // Two languages may never have been handed one sentence by a slip of the table.
    expect(seen.size).toBe(34);
  });
  it("each language names its own plan word as its catalogue has it", () => {
    // The plan's name, as the same catalogue's own label writes it, or its stem where the sentence inflects it (the owner's note: the catalogue's own name).
    const stems: Readonly<Record<string, string>> = { ar: "المجانية", cs: "Zdarma", da: "Gratis", de: "kostenlos", es: "Gratuito", et: "Tasuta", fi: "Maksuttom", fr: "Gratuite", he: "החינמית",
      hi: "निःशुल्क", hr: "besplatn", id: "Gratis", it: "Gratuito", ja: "無料", ko: "무료", lt: "Nemokam", lv: "Bezmaksas", mt: "B’xejn", pl: "Bezpłatn", pt: "Gratuito", ro: "Gratuit", ru: "бесплатн", sk: "bezplatn",
      sl: "brezplačn", sv: "kostnadsfri", tr: "Ücretsiz", uk: "безкоштовн", vi: "Miễn phí", zh: "免费", bg: "Безплатен", el: "δωρεάν", ga: "saor in aisce", hu: "ingyenes", nl: "gratis" };
    for (const [locale, stem] of Object.entries(stems)) expect(read(locale, "newDebate")["newDebate.freePublicNotice"], locale).toContain(stem);
    expect(Object.keys(stems)).toHaveLength(34);
  });
  it("Romanian is formal", () => expect(read("ro", "newDebate")[KEY]).toContain("dvs."));
});

describe("the public page's words", () => {
  const OWNER_WORDS: Readonly<Record<string, string>> = {
    "v4.contribution.CHECKING": "An AI is checking this before it can change the public page.",
    "v4.contribution.ON_THE_PAGE": "This changed the public page.",
    "v4.contribution.KEPT_PRIVATE": "This stayed private: it did not pass the check, so the public page is unchanged. Only you can see it.",
    "v4.public.report.ongoing": "Something is still being added to this debate. Try again when it is finished.",
    "v4.public.report.noCarrier": "This debate's first author has left and no dig is on it yet, so a report can't be written. Dig into a path first.",
    "v4.public.report.write": "Write a report",
    // journey-f13 (owner's screen review, 3 Nov): "Dig here" on every page, own and public, in place of decision 22's "Dig into this";
    // the box's Start reads as the map's picks button ("Dig into this · up to 3%" for one pick, lib/v4/digQuota.ts).
    "v4.public.dig.open": "Dig here",
    // Round 2, r2-17 (owner, 3 Nov): a whole sentence, "Quiet Heron added to this on 2 November".
    "v4.public.addedBy": "{name} added to this on {date}",
    "v4.public.addedByGone": "A contributor added to this on {date}",
    // r2-14, r2-15, r2-16 and r2-21 (owner, 3 Nov), word for word.
    "v4.public.report": "Report a problem",
    "v4.public.flag.NOT_FOUND": "An automatic check didn't find this. You can report again with more details, and a person will read it. You can also write to support@dezbatere.ro.",
    "v4.public.dig.terms": "This uses your own quota. An AI checks it before it can change this public page.",
    "v4.public.dig.howItWorks": "How this works",
    "v4.public.signedOut.createAccount": "Create a free account",
    "v4.public.signedOut.signIn": "Sign in",
    "v4.public.report.writtenBy": "Report written by {name}",
    "v4.public.aContributor": "a contributor",
    // The owner's screen review of 3 Nov (public-d2 A, journey-f20, public-f26): the record's own words, word for word.
    "v4.public.dig.writeOwn": "Or write your own",
    "v4.public.dig.dugNear": "Someone dug near here on {date}",
    "v4.public.digCard.stopDone": "Dig done",
    "v4.public.digCard.stopChecked": "Checked",
    "v4.public.digCard.onPage": "On the public page",
    "v4.public.digCard.seeOnPage": "See it on the page",
    "v4.public.digCard.keptPrivate": "Kept with you: the public page is unchanged.",
    // journey-f10: the public dig's win sentence is the map's own "What your digs did" line, one key (WHOLE-8).
    "v4.digsDid.holds": "Confirmed: the answer holds.",
    "v4.publicMark.public": "Public",
    "v4.publicMark.seePage": "See its page",
    "v4.publicMark.copyLink": "Copy link",
    "v4.publicMark.willBePublic": "This will be public."
  };
  it("the briefed sentences, word for word", () => {
    for (const [key, words] of Object.entries(OWNER_WORDS)) expect(CATALOG[key], key).toBe(words);
  });
  it("no refusal and no line of the lane says a number, a price or an engine word", () => {
    const lane = Object.entries(CATALOG).filter(([key]) => key.startsWith("v4.public.") || key.startsWith("v4.contribution."));
    expect(lane.length).toBeGreaterThan(20);
    for (const [key, line] of lane) {
      expect(line.replace(/\{[a-zA-Z]+\}/gu, ""), key).not.toMatch(/\d|[$€£]|\bscore|\bthreshold|\bcredit|\bpublic_|\b[A-Z_]{4,}\b/u);
    }
  });
  it("these strings stay in English only: no other language has a v4 catalogue (owner N10)", () => {
    expect(readdirSync(resolve(messages, "ro")).filter((name) => name === "v4.json")).toEqual([]);
  });
});

describe("a path at its newest text", () => {
  it("the contribution's text replaces the first, with who and when, and its dig's own paths under it", () => {
    const [fares, service] = publicPathViews(debate());
    expect(fares!.line).toContain("also in small towns");
    expect(fares!.summary).toContain("A dig looked at small towns");
    expect(fares!.additions).toEqual([{ contributor: "Quiet Heron", on: "2026-10-28", whatChanged: expect.any(Array) }]);
    expect(fares!.digs[0]!.paths[0]).toMatchObject({ ref: "p-towns", digRef: PUBLIC_UPDATE_REF, canDig: true });
    // A path nobody touched keeps its first text and no name.
    expect(service!.summary).toBeNull();
    expect(service!.additions).toEqual([]);
    expect(service!.digRef).toBeNull();
  });

  it("two contributions: the newest text wins, both names stay, newest first; a row that only moved a higher path opens no dig", () => {
    const base = debate();
    const first = base.contributions![0]!;
    const views = publicPathViews({ ...base, contributions: [first, {
      position_ref: "p-fares", contributor: null, contributed_on: "2026-10-30", line: "The newest line.", summary: "The newest summary.", fate: "FELL", what_changed: [], own_rewrite: false,
      update_ref: "f2000000-0000-4000-8000-000000000002", on_ref: PUBLIC_UPDATE_REF
    }] });
    expect(views[0]).toMatchObject({ line: "The newest line.", fate: "FELL", summary: "The newest summary." });
    expect(views[0]!.additions.map((added) => added.contributor)).toEqual([null, "Quiet Heron"]);
    expect(views[0]!.digs).toHaveLength(1);
  });

  it("a dig on a dig's path lands under that dig's path, and its text moves that path", () => {
    const base = debate();
    const views = publicPathViews({ ...base, contributions: [base.contributions![0]!, {
      position_ref: "p-towns", contributor: "Second", contributed_on: "2026-10-30", line: "Towns, newer.", summary: "Newer.", fate: "HELD_UP", what_changed: [], own_rewrite: true,
      update_ref: "f2000000-0000-4000-8000-000000000003", on_ref: PUBLIC_UPDATE_REF, dig_paths: [{ position_ref: "p-deep", line: "Deeper.", fate: "HELD_UP", points: [] }]
    }] });
    const towns = views[0]!.digs[0]!.paths[0]!;
    expect(towns.line).toBe("Towns, newer.");
    expect(towns.additions[0]!.contributor).toBe("Second");
    expect(towns.digs[0]!.paths[0]).toMatchObject({ ref: "p-deep", digRef: "f2000000-0000-4000-8000-000000000003" });
    // The first path above it is untouched by that row.
    expect(views[0]!.additions).toHaveLength(1);
  });

  it("no story: no paths, nothing invented", () => {
    const { story_short: _gone, ...rest } = debate();
    expect(publicPathViews({ ...rest, contributions: [] })).toEqual([]);
  });

  it("reports read newest first; a gone name reads a contributor", () => {
    const report = debate().reports![0]!;
    expect(reportsNewestFirst([report, { ...report, report_version: 3 }, { ...report, report_version: 2 }]).map((one) => one.report_version)).toEqual([3, 2, 1]);
    expect(contributorName(null, CATALOG)).toBe("a contributor");
    expect(contributorName("Quiet Heron", CATALOG)).toBe("Quiet Heron");
  });
});

describe("what a dig on a public page sends", () => {
  const path = { ref: "p-fares", digRef: null, line: "Free fares for everyone.", fate: "PARTLY_HELD" as const };
  it("a path of the debate: places, quick, own views, no dig_ref; the question as a dig's question is on the map", () => {
    const sent = publicDigAsk({ publicRef: PUBLIC_REF, question: "Should cities make public transport free?", path, views: ["  Small towns differ.  ", "", "Rural buses too."], catalog: CATALOG, locale: "en" })!;
    expect(sent.parent).toEqual({ public_ref: PUBLIC_REF, places: ["path:p-fares"], mode: "quick", picks: [
      { kind: "OWN_VIEW", suggestion_id: null, place: "path:p-fares", text: "Small towns differ." },
      { kind: "OWN_VIEW", suggestion_id: null, place: "path:p-fares", text: "Rural buses too." }
    ] });
    const expected = digQuestion({ kind: "picks", path: { id: "p-fares", fate: "PARTLY_HELD", line: path.line, points: [], counts: { SURE: 0, SURE_FOR_CASE: 0, STILL_ARGUED: 0, DIDNT_HOLD: 0 }, unchecked: 0, open: [] },
      picks: [ownViewPick("p-fares", "Small towns differ.", 0), ownViewPick("p-fares", "Rural buses too.", 1)] }, "Should cities make public transport free?", CATALOG, "en");
    expect(sent.questionLine).toBe(expected);
    expect(sent.questionLine).toContain("Free fares for everyone.");
    expect(sent.questionLine).toContain("Small towns differ.");
    expect(sent.questionLine).toContain("Should cities make public transport free?");
  });
  it("a dig's own path names the contribution it hangs under", () => {
    const sent = publicDigAsk({ publicRef: PUBLIC_REF, question: "Q?", path: { ...path, ref: "p-towns", digRef: PUBLIC_UPDATE_REF }, views: ["Mine."], catalog: CATALOG, locale: "en" })!;
    expect(sent.parent).toMatchObject({ dig_ref: PUBLIC_UPDATE_REF, places: ["path:p-towns"] });
  });
  it("an empty box sends nothing", () => {
    expect(publicDigAsk({ publicRef: PUBLIC_REF, question: "Q?", path, views: ["  "], catalog: CATALOG, locale: "en" })).toBeNull();
  });
  it("owner screen review (public-f11, public-d2 A): Thorough when chosen, and the path's own suggestions the person tapped, first", () => {
    const chip = { suggestion_id: "pub-fares-drivers", kind: "CONTRADICTING" as const, side: null, text: "Did any city see many drivers switch?", places: ["path:p-fares"] };
    const sent = publicDigAsk({ publicRef: PUBLIC_REF, question: "Q?", path, views: ["Mine."], chips: [chip], mode: "thorough", catalog: CATALOG, locale: "en" })!;
    expect(sent.parent).toEqual({ public_ref: PUBLIC_REF, places: ["path:p-fares"], mode: "thorough", picks: [
      { kind: "CONTRADICTING", suggestion_id: "pub-fares-drivers", place: "path:p-fares", text: "Did any city see many drivers switch?" },
      { kind: "OWN_VIEW", suggestion_id: null, place: "path:p-fares", text: "Mine." }
    ] });
    // The dig as the site's one Undo list keeps it: the path's picks, under the path.
    expect(sent.target).toMatchObject({ kind: "picks", path: { id: "p-fares", line: path.line } });
    expect(sent.questionLine).toContain("Did any city see many drivers switch?");
    // Tapped chips alone are a dig too; with no mode named it is a quick look.
    expect(publicDigAsk({ publicRef: PUBLIC_REF, question: "Q?", path, views: [], chips: [chip], catalog: CATALOG, locale: "en" })!.parent.mode).toBe("quick");
  });
});

describe("refusals in plain words", () => {
  const refusal = (status: number, code: string) => new ContractHttpError(status === 404 ? "NOT_FOUND" : status === 400 ? "MALFORMED_REQUEST" : "SERVER_FAILURE", status, code, code);
  const words = (status: number, code: string, room: never | null = null) => publicDigRefusalWords(refusal(status, code), CATALOG, room, "en");
  it("each of the dig's refusals has its own sentence", () => {
    expect(words(404, "RUN_NOT_FOUND")).toBe(CATALOG["v4.public.refusal.notFound"]);
    expect(words(400, "PUBLIC_DIG_NEEDS_A_PATH")).toBe(CATALOG["v4.public.refusal.needsAPath"]);
    expect(words(400, "DIG_FREE_PICKS_MAX")).toBe(CATALOG["v4.public.refusal.freeMax"]);
    expect(words(409, "DIG_TOO_DEEP")).toBe(CATALOG["v4.public.refusal.tooDeep"]);
    expect(words(409, "PUBLIC_DEBATE_REPORT_WRITING")).toBe(CATALOG["v4.public.refusal.reportWriting"]);
    expect(words(409, "PUBLIC_DEBATE_WAITS_FOR_RESET")).toBe(CATALOG["v4.public.refusal.waitsForReset"]);
  });
  it("a used-up limit says when, when the room read knows; anything else goes on to the ask's own handling", () => {
    const room = { room: "FULL", scope: "PERSON_DAY", resets_at: "2026-11-02T00:00:00.000Z", waiting_run_ref: null, plan_id: "FREE", new_starts: "BLOCKED_UNTIL_RESET" } as never;
    expect(publicDigRefusalWords(refusal(409, "PUBLIC_DEBATE_WAITS_FOR_RESET"), CATALOG, room, "en")).toContain("New questions and digs can start after");
    expect(words(500, "ANYTHING")).toBeNull();
    expect(publicDigRefusalWords(new Error("x"), CATALOG, null, "en")).toBeNull();
  });
  it("a report's press: 202, and every refusal the API has", async () => {
    const press = (answer: unknown) => pressPublicReport(PUBLIC_REF, { catalog: CATALOG, room: null, locale: "en" }, { writePublicReport: async () => answer } as never);
    expect(await press({ state: "WRITING", report_version: 2 })).toEqual({ kind: "WRITING", version: 2 });
    expect(await press({ error: "PUBLIC_DEBATE_ONGOING", message: "x" })).toEqual({ kind: "REFUSED", message: CATALOG["v4.public.report.ongoing"] });
    expect(await press({ error: "PUBLIC_DEBATE_NO_CARRIER", message: "x" })).toEqual({ kind: "REFUSED", message: CATALOG["v4.public.report.noCarrier"] });
    expect(await press({ error: "PUBLIC_DEBATE_WAITS_FOR_RESET", message: "x" })).toEqual({ kind: "REFUSED", message: CATALOG["v4.public.refusal.waitsForReset"] });
    const failing = await pressPublicReport(PUBLIC_REF, { catalog: CATALOG, room: null, locale: "en" }, { writePublicReport: async () => { throw new Error("404"); } } as never);
    expect(failing).toEqual({ kind: "REFUSED", message: CATALOG["v4.public.report.failed"] });
  });
});

describe("the ask on the wire", () => {
  const config = { risk_tier: "standard", plan_tier: "free", tier_source: "ASKER", tier_provenance_ref: "wire", composition_budget_tier: "low", as_of: "2026-11-01T10:00:00.000Z", depth: 1, decision_scope: "public lane wire" } as never;
  const client = () => {
    const submitAsk = vi.fn(async (_ask: Record<string, unknown>) => ({ run_ref: "run:wire" }));
    return { submitAsk, client: { submitAsk } as unknown as ContractClient };
  };
  it("no notice, no flag: an ask stays as it was", async () => {
    const wire = client();
    await createDebate("Should the city fund the tram?", config, "test-token", wire.client);
    expect(wire.submitAsk.mock.calls[0]![0]).not.toHaveProperty("free_public_notice");
    expect(wire.submitAsk.mock.calls[0]![0]).not.toHaveProperty("public_parent");
  });
  it("the notice shown goes with the ask", async () => {
    const wire = client();
    await createDebate("Should the city fund the tram?", config, "test-token", wire.client, undefined, undefined, undefined, { freePublicNotice: true });
    expect(wire.submitAsk.mock.calls[0]![0].free_public_notice).toBe(true);
  });
  it("a public dig goes as public_parent, never as parent", async () => {
    const wire = client();
    const publicParent = { public_ref: PUBLIC_REF, places: ["path:p-fares"], mode: "quick" as const, picks: [{ kind: "OWN_VIEW" as const, suggestion_id: null, place: "path:p-fares", text: "Mine." }] };
    await createDebate("Look deeper.", config, "test-token", wire.client, undefined, undefined, undefined, { publicParent });
    expect(wire.submitAsk.mock.calls[0]![0].public_parent).toEqual(publicParent);
    expect(wire.submitAsk.mock.calls[0]![0]).not.toHaveProperty("parent");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARCHIVE_KEYS, loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { renderYourDataHtml } from "../../apps/api/src/data-export/html-page.js";
// pre-flight PF-R2b4.1: the class's own list type; the PublicationApplication interface's items have no floor_verdict.
import type { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import { DATA_EXPORT_LOCALES } from "../../packages/contract/src/index.js";
import { snapshotA } from "../fixtures/data-export/snapshot-a.js";
import { SPLIT_WORDS } from "../support/r2-split-words.js";

const closeCall = (locale: string): string =>
  (JSON.parse(readFileSync(`apps/ui/messages/${locale}/public.json`, "utf8")) as Record<string, string>)["public.story.label.contested"]!;

type ListedVerdict = Awaited<ReturnType<PostgresPublicationApplication["list"]>>["items"][number]["verdict"];
type ListedFloor = Awaited<ReturnType<PostgresPublicationApplication["list"]>>["items"][number]["floor_verdict"];

describe("R2 SPLIT in the data export (Q1 option 1)", () => {
  it("adds one archive key", () => {
    expect(ARCHIVE_KEYS).toHaveLength(19);
    expect(ARCHIVE_KEYS).toContain("archive.verdictSplit");
    expect(ARCHIVE_KEYS.indexOf("archive.verdictSplit")).toBe(ARCHIVE_KEYS.indexOf("archive.verdictUnsupported") + 1);
  });

  it.each(DATA_EXPORT_LOCALES)("%s: SPLIT says the old CONTESTED word, CONTESTED says the story's close-call word", (locale) => {
    const catalog = loadArchiveCatalog(locale);
    expect(catalog["archive.verdictSplit"]).toBe(SPLIT_WORDS[locale]);
    expect(catalog["archive.verdictContested"]).toBe(closeCall(locale));
    expect(catalog["archive.verdictSplit"]).not.toBe(catalog["archive.verdictContested"]);
  });

  it("keeps the SUPPORTED and UNSUPPORTED words (engine 1 sees only the CONTESTED rename)", () => {
    const en = loadArchiveCatalog("en");
    expect([en["archive.verdictSupported"], en["archive.verdictContested"], en["archive.verdictUnsupported"], en["archive.verdictSplit"]])
      .toEqual(["Supported", "Close call", "Unsupported", "Contested"]);
  });

  it("prints a SPLIT debate's pill in the archive, and a CONTESTED one as a close call", () => {
    const [first, second] = snapshotA.debates.debates;
    const split = { ...first!, run_answer: { ...(first!.run_answer as Record<string, unknown>), verdict_state: "SPLIT" } };
    const contested = { ...second!, run_answer: { ...(second!.run_answer as Record<string, unknown>), verdict_state: "CONTESTED" } };
    const html = renderYourDataHtml({ ...snapshotA, debates: { debates: [split, contested] } }, loadArchiveCatalog("en"));
    expect(html).toMatch(/<span class="pill split">Contested<\/span>/u);
    expect(html).toMatch(/<span class="pill contested">Close call<\/span>/u);
  });

  it("lists SPLIT as a published verdict and as a floor (types follow the contract)", () => {
    const verdict: ListedVerdict = "SPLIT";
    const floor: ListedFloor = "SPLIT";
    expect([verdict, floor]).toEqual(["SPLIT", "SPLIT"]);
  });
});

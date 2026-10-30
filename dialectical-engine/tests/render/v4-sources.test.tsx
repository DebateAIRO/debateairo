// @vitest-environment jsdom

import * as React from "react";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerSchema, type Answer, type WebOtherPage, type WebPath, type WebSource } from "@debateai/contract";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
import { buildV4Map } from "../../apps/ui/lib/v4/mapModel.js";
import type { ReadingLevel, V4Map, V4Selection } from "../../apps/ui/lib/v4/types.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

/*
 * Perplexity plan W2-6 (2026-10-30): the sources under each point, each path's search note and other pages, and the web
 * notes, on the map's panel and on the report. Owner rules: each quote at most 120 characters with reader 1's line (what
 * the page is about and why it matters) above it, then the link and the site; "preview only" and "fewer readers" marked;
 * never a grade; the Free note and the failure note; the report's old "no web yet" line is gone. Made-up pages only.
 */

const mocks = vi.hoisted(() => ({ load: null as unknown }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("token") }));
vi.mock("@/components/v4/V4Header", () => ({ V4Header: ({ children }: { children?: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/v4/load", async (importActual) => ({
  ...(await importActual<typeof import("../../apps/ui/lib/v4/load.js")>()),
  loadV4: async () => mocks.load,
  loadStory: async () => { throw new Error("not read in this test"); },
  loadDigView: async () => { throw new Error("no digs in this test"); }
}));
vi.mock("@/lib/v4/digIndex", () => ({ readQuestionIndex: async () => [], digLinksFor: () => [] }));
vi.mock("@/lib/v4/accountMemory", () => ({ readDigRecords: async () => null, mergeDigLinks: () => [] }));
vi.mock("@/lib/v4/storage", async (importActual) => ({
  ...(await importActual<typeof import("../../apps/ui/lib/v4/storage.js")>()),
  useReadingLevel: (initial: ReadingLevel | null) => [initial, () => {}]
}));

import { V4OtherPages, V4SearchNote, V4SourceList, V4WebNoteLine } from "../../apps/ui/components/v4/V4Sources.js";
import { V4Panel } from "../../apps/ui/components/v4/V4Panel.js";
import { V4ReportClient } from "../../apps/ui/components/v4/V4ReportClient.js";

const catalog = v4English as Readonly<Record<string, string>>;
const css = readFileSync(resolve(import.meta.dirname, "../../apps/ui/app/v4/v4-map.css"), "utf8");

const LONG = "This made-up page says a great many things about the costs of new power plants, and it keeps on going well past the limit we set.";

const source = (id: string, extra: Partial<WebSource> = {}): WebSource => ({
  extract_id: id,
  quote: `A made-up line from page ${id}.`,
  title: `Made-up report ${id}`,
  site: "grid-costs.example",
  link: `https://grid-costs.example/${id}`,
  read_depth: "WHOLE",
  explanation: { text: `Reader one says what page ${id} is about and why it matters.`, language: "en" },
  published_on: "2025-06-12",
  ...extra
});

const other = (ref: string, extra: Partial<WebOtherPage> = {}): WebOtherPage => ({
  page_ref: ref,
  title: `Another made-up page ${ref}`,
  site: "storage-watch.example",
  link: `https://storage-watch.example/${ref}`,
  read_depth: "WHOLE",
  explanation: { text: `Why page ${ref} might matter.`, language: "en" },
  ...extra
});

function dom(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

const noop = () => {};

/** The fixture debate with a web part: n-yes-pay rests on a checked extract; paths searched, not planned and failed. */
function webAnswer(paths: readonly WebPath[], checked = true): Answer {
  const nodes = STORY_FIXTURE_ANSWER.nodes.map((node) => node.node_id !== "n-yes-pay" ? node : {
    ...node,
    locator: "S2-1",
    sources: [source("S2-1", { quote: "The offer is about a third above the current pay after tax." }), source("S2-2", { read_depth: "PREVIEW_ONLY", fewer_readers: true })],
    looked_up_checked: checked
  });
  return { ...STORY_FIXTURE_ANSWER, nodes, web: { paths: [...paths] } };
}

const PAID_PATHS: readonly WebPath[] = [
  { position_ref: "n-yes", search: { status: "SEARCHED" }, other_pages: [other("pg-1"), other("pg-2", { researched: { state: "ADDS_NOTHING" } })], suggestions: [] },
  { position_ref: "n-hybrid", search: { status: "NO_SEARCH_PLANNED", reason: "A matter of what the family wants; no page can settle it." }, other_pages: [], suggestions: [] },
  { position_ref: "n-not-now", search: { status: "FAILED" }, other_pages: [], suggestions: [] }
];
const FREE_PATHS: readonly WebPath[] = ["n-yes", "n-hybrid", "n-not-now"]
  .map((position) => ({ position_ref: position, search: { status: "NOT_ON_PLAN" as const }, other_pages: [], suggestions: [] }));

const mapOf = (answer: Answer): V4Map => buildV4Map({ runId: "run-1", answer, story: storyFixture("READY") });

function panel(map: V4Map, selected: V4Selection, level: ReadingLevel = "background", onAddResearched?: (pathId: string, pageRef: string) => void) {
  return (
    <V4Panel
      map={map}
      digs={[]}
      selected={selected}
      readingLevel={level}
      picked={new Set()}
      onTogglePick={noop}
      onSelect={noop}
      digMode="quick"
      onDigMode={noop}
      onDig={noop}
      digBusy={false}
      {...(onAddResearched === undefined ? {} : { onAddResearched })}
      headingRef={createRef<HTMLHeadingElement>()}
      catalog={catalog}
      locale="en"
    />
  );
}

const roots: { root: Root; node: HTMLElement }[] = [];
afterEach(() => { for (const { root, node } of roots.splice(0)) { act(() => root.unmount()); node.remove(); } });

async function mount(element: React.ReactElement): Promise<HTMLElement> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  roots.push({ root, node });
  await act(async () => { root.render(element); });
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
  return node;
}

describe("sources under a point (V4SourceList)", () => {
  it("shows reader 1's line above the quote, the quote cut to 120 characters, then the link, site and date", () => {
    expect(Array.from(LONG).length).toBeGreaterThan(120);
    const root = dom(renderToStaticMarkup(<V4SourceList sources={[source("S1-1", { quote: LONG })]} catalog={catalog} locale="en" />));
    const item = root.querySelector("li.v4Source")!;
    const why = item.querySelector(".v4SourceWhy")!;
    expect(why.textContent).toBe("Reader one says what page S1-1 is about and why it matters.");
    expect(why.getAttribute("data-ai-generated")).toBe("true");
    expect(why.getAttribute("lang")).toBe("en");
    const quote = item.querySelector("blockquote")!.textContent!;
    expect(Array.from(quote).length).toBeLessThanOrEqual(120);
    expect(quote.endsWith("…")).toBe(true);
    expect(LONG.startsWith(quote.slice(0, -1))).toBe(true);
    // The line comes first, then the quote, then where it is from.
    expect([...item.children].map((child) => child.className)).toEqual(["v4SourceWhy", "v4SourceQuote", "v4SourceMeta"]);
    const link = item.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://grid-costs.example/S1-1");
    expect(link.textContent).toBe("Made-up report S1-1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(item.querySelector(".v4SourceSite")!.textContent).toBe("grid-costs.example");
    expect(item.querySelector("time")!.getAttribute("dateTime")).toBe("2025-06-12");
    expect(item.querySelector("time")!.textContent).toBe("Jun 12, 2025");
  });

  it("marks preview-only and abstract-only pages, and a page fewer AIs read, and nothing on a whole page", () => {
    const root = dom(renderToStaticMarkup(
      <V4SourceList
        sources={[source("S1-1"), source("S1-2", { read_depth: "PREVIEW_ONLY" }), source("S1-3", { read_depth: "ABSTRACT_ONLY", fewer_readers: true })]}
        catalog={catalog}
        locale="en"
      />
    ));
    const flags = [...root.querySelectorAll("li.v4Source")].map((item) => [...item.querySelectorAll(".v4SourceFlag")].map((flag) => flag.textContent));
    expect(flags).toEqual([
      [],
      [t(catalog, "v4.web.previewOnly")],
      [t(catalog, "v4.web.previewOnly"), t(catalog, "v4.web.fewerReaders")]
    ]);
  });

  it("uses the site when a page has no title, and shows no line when reader 1 wrote none", () => {
    const root = dom(renderToStaticMarkup(<V4SourceList sources={[source("S1-1", { title: null, explanation: null, published_on: null })]} catalog={catalog} locale="en" />));
    expect(root.querySelector("a")!.textContent).toBe("grid-costs.example");
    expect(root.querySelector(".v4SourceWhy")).toBeNull();
    expect(root.querySelector("time")).toBeNull();
  });

  it("shows nothing for a point without sources", () => {
    expect(renderToStaticMarkup(<V4SourceList sources={[]} catalog={catalog} locale="en" />)).toBe("");
    expect(renderToStaticMarkup(<V4SourceList sources={undefined} catalog={catalog} locale="en" />)).toBe("");
  });
});

describe("notes (V4SearchNote, V4WebNoteLine)", () => {
  it("says the owner-approved Free note and failure note word for word", () => {
    expect(dom(renderToStaticMarkup(<V4WebNoteLine note="FREE" catalog={catalog} />)).textContent).toBe("Not checked on the web; paid plans look things up.");
    expect(dom(renderToStaticMarkup(<V4WebNoteLine note="FAILED" catalog={catalog} />)).textContent)
      .toBe("We couldn't look things up on the web this time. The points below come from the AIs' own knowledge.");
    expect(dom(renderToStaticMarkup(<V4WebNoteLine note="SWITCHED_OFF" catalog={catalog} />)).textContent).toBe(t(catalog, "v4.web.switchedOff"));
    expect(renderToStaticMarkup(<V4WebNoteLine note={null} catalog={catalog} />)).toBe("");
  });

  it("gives each path's search its note, the planner's reason marked as AI text, and none when it searched", () => {
    const reason = "A matter of values; no page can settle it.";
    const planned = dom(renderToStaticMarkup(<V4SearchNote search={{ status: "NO_SEARCH_PLANNED", reason }} catalog={catalog} />));
    expect(planned.textContent).toBe(t(catalog, "v4.web.noSearch", { reason }));
    expect(planned.querySelector("[data-ai-generated]")!.textContent).toBe(reason);
    expect(dom(renderToStaticMarkup(<V4SearchNote search={{ status: "NO_SEARCH_PLANNED", reason: null }} catalog={catalog} />)).textContent)
      .toBe(t(catalog, "v4.web.noSearch.noReason"));
    expect(dom(renderToStaticMarkup(<V4SearchNote search={{ status: "FAILED" }} catalog={catalog} />)).textContent).toBe(t(catalog, "v4.web.failed"));
    expect(dom(renderToStaticMarkup(<V4SearchNote search={{ status: "NOT_ON_PLAN" }} catalog={catalog} />)).textContent).toBe(t(catalog, "v4.web.free"));
    expect(dom(renderToStaticMarkup(<V4SearchNote search={{ status: "SWITCHED_OFF" }} catalog={catalog} />)).textContent).toBe(t(catalog, "v4.web.switchedOff"));
    expect(renderToStaticMarkup(<V4SearchNote search={{ status: "SEARCHED" }} catalog={catalog} />)).toBe("");
  });
});

describe("other pages (V4OtherPages)", () => {
  it("lists each page with its line, never a grade, and 'Add to researched' that waits for W4-4's wiring", () => {
    const root = dom(renderToStaticMarkup(<V4OtherPages pages={[other("pg-1"), other("pg-2", { read_depth: "PREVIEW_ONLY" })]} catalog={catalog} locale="en" actions />));
    expect(root.querySelector("h4")!.textContent).toBe(t(catalog, "v4.web.otherPages"));
    const items = [...root.querySelectorAll("li.v4OtherPage")];
    expect(items.map((item) => item.querySelector("a")!.getAttribute("href"))).toEqual(["https://storage-watch.example/pg-1", "https://storage-watch.example/pg-2"]);
    expect(items[0]!.querySelector(".v4SourceWhy")!.textContent).toBe("Why page pg-1 might matter.");
    expect(items[1]!.textContent).toContain(t(catalog, "v4.web.previewOnly"));
    const buttons = [...root.querySelectorAll("button")];
    expect(buttons.map((button) => [button.textContent, button.hasAttribute("disabled")])).toEqual([
      [t(catalog, "v4.web.addResearched"), true],
      [t(catalog, "v4.web.addResearched"), true]
    ]);
    expect(root.textContent).not.toMatch(/grade|score|\b[0-3]\s*\/\s*3\b/iu);
  });

  it("shows what became of a page added to researched, with the quotes it added", () => {
    const root = dom(renderToStaticMarkup(
      <V4OtherPages
        pages={[
          other("pg-1", { researched: { state: "READING" } }),
          other("pg-2", { researched: { state: "ADDS", sources: [source("S1-7")] } }),
          other("pg-3", { researched: { state: "ADDS_NOTHING" } }),
          other("pg-4", { researched: { state: "FAILED" } })
        ]}
        catalog={catalog}
        locale="en"
        actions
      />
    ));
    const items = [...root.querySelectorAll("li.v4OtherPage")];
    expect(items.map((item) => item.querySelector(".v4OtherPageOutcome > .v4SourceFlag")!.textContent)).toEqual(
      ["READING", "ADDS", "ADDS_NOTHING", "FAILED"].map((state) => t(catalog, `v4.web.researched.${state}`))
    );
    expect(items[0]!.querySelector("[role=status]")).not.toBeNull();
    expect(items[1]!.querySelector("blockquote")!.textContent).toBe("A made-up line from page S1-7.");
    expect(root.querySelectorAll("button")).toHaveLength(0);
  });

  it("lists pages without buttons on the report, and calls the handler once W4-4 passes one", async () => {
    expect(dom(renderToStaticMarkup(<V4OtherPages pages={[other("pg-1")]} catalog={catalog} locale="en" actions={false} />)).querySelector("button")).toBeNull();
    const added: string[] = [];
    const node = await mount(<V4OtherPages pages={[other("pg-1")]} catalog={catalog} locale="en" actions onAddResearched={(ref) => added.push(ref)} />);
    const button = node.querySelector("button")!;
    expect(button.hasAttribute("disabled")).toBe(false);
    await act(async () => { button.click(); });
    expect(added).toEqual(["pg-1"]);
  });
});

describe("the panel (V4Panel) with a web part", () => {
  it("puts the sources under their point and marks it 'Sure' with the approved line", () => {
    const answer = webAnswer(PAID_PATHS);
    expect(AnswerSchema.safeParse(answer).success).toBe(true);
    const root = dom(renderToStaticMarkup(panel(mapOf(answer), "path:n-yes")));
    const sure = root.querySelector(".v4PanelPointSURE")!;
    expect(sure.querySelector(".v4PanelPointText")!.textContent).toBe(STORY_FIXTURE_ANSWER.nodes.find((node) => node.node_id === "n-yes-pay")!.claim);
    expect(sure.querySelector(".v4PanelBasis")!.textContent).toBe("A second AI agreed, and the point rests on a page we looked up.");
    expect([...sure.querySelectorAll("blockquote")].map((quote) => quote.textContent)).toEqual([
      "The offer is about a third above the current pay after tax.", "A made-up line from page S2-2."
    ]);
    // Only that point is "Sure": the remembered citation next to it is "Sure, for the case named".
    expect(root.querySelectorAll(".v4PanelPointSURE")).toHaveLength(1);
    expect(root.querySelector(".v4PanelPointSURE_FOR_CASE")).not.toBeNull();
  });

  it("shows the sources at every reading level, the plain one too", () => {
    for (const level of ["plain", "background", "expert"] as const) {
      const root = dom(renderToStaticMarkup(panel(mapOf(webAnswer(PAID_PATHS)), "path:n-yes", level)));
      expect(root.querySelectorAll(".v4PanelPointSURE blockquote"), level).toHaveLength(2);
    }
  });

  it("lists a searched path's other pages; a path with no search says why, above its points; a failed one says so", () => {
    const map = mapOf(webAnswer(PAID_PATHS));
    const yes = dom(renderToStaticMarkup(panel(map, "path:n-yes")));
    expect(yes.querySelector(".v4WebNote")).toBeNull();
    expect([...yes.querySelectorAll(".v4OtherPage a")].map((link) => link.textContent)).toEqual(["Another made-up page pg-1", "Another made-up page pg-2"]);
    expect(yes.querySelectorAll(".v4OtherPageAdd")).toHaveLength(1);
    expect(yes.textContent).toContain(t(catalog, "v4.web.researched.ADDS_NOTHING"));

    const hybrid = dom(renderToStaticMarkup(panel(map, "path:n-hybrid")));
    const note = hybrid.querySelector(".v4WebNote")!;
    expect(note.textContent).toBe(t(catalog, "v4.web.noSearch", { reason: "A matter of what the family wants; no page can settle it." }));
    expect(note.compareDocumentPosition(hybrid.querySelector(".v4PanelGroups")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hybrid.querySelector(".v4OtherPages")).toBeNull();

    const notNow = dom(renderToStaticMarkup(panel(map, "path:n-not-now")));
    expect(notNow.querySelector(".v4WebNote")!.textContent).toBe(t(catalog, "v4.web.failed"));
  });

  it("calls the handler with the path and the page once a page passes one (W4-4)", async () => {
    const added: string[][] = [];
    const node = await mount(panel(mapOf(webAnswer(PAID_PATHS)), "path:n-yes", "background", (pathId, pageRef) => added.push([pathId, pageRef])));
    const button = node.querySelector<HTMLButtonElement>(".v4OtherPageAdd")!;
    await act(async () => { button.click(); });
    expect(added).toEqual([["n-yes", "pg-1"]]);
  });

  it("on Free: the Free note on the question and on each path, and never 'Sure'", () => {
    const map = mapOf(webAnswer(FREE_PATHS));
    expect(map.counts.SURE).toBe(0);
    const root = dom(renderToStaticMarkup(panel(map, "root")));
    expect(root.querySelector(".v4WebNote")!.textContent).toBe("Not checked on the web; paid plans look things up.");
    expect(root.querySelector(".v4PanelPointSURE")).toBeNull();
    const path = dom(renderToStaticMarkup(panel(map, "path:n-yes")));
    expect(path.querySelector(".v4WebNote")!.textContent).toBe(t(catalog, "v4.web.free"));
    expect(path.querySelector(".v4OtherPages")).toBeNull();
  });

  it("an answer from before R22 shows no web note and no sources", () => {
    const root = dom(renderToStaticMarkup(panel(mapOf(STORY_FIXTURE_ANSWER), "root")));
    expect(root.querySelector(".v4WebNote")).toBeNull();
    expect(root.querySelector(".v4Sources")).toBeNull();
    expect(root.querySelector(".v4PanelPointSURE")).toBeNull();
  });
});

describe("the report (V4ReportClient) shows the same", () => {
  const report = async (answer: Answer, level: ReadingLevel) => {
    mocks.load = { kind: "SERVED", runId: "run-1", answer, story: storyFixture("READY") };
    return mount(<V4ReportClient id="run-1" locale="en" initialLevel={level} catalog={catalog} newDebateCatalog={{}} />);
  };

  it("drops the old 'no web yet' line for the Free note, shown once above the paths", async () => {
    const node = await report(webAnswer(FREE_PATHS), "background");
    expect(node.textContent).not.toContain("does not search the web");
    const notes = [...node.querySelectorAll(".v4WebNote")].map((note) => note.textContent);
    expect(notes).toEqual(["Not checked on the web; paid plans look things up."]);
    expect(node.querySelector(".v4RepPaths")!.previousElementSibling!.textContent).toBe(notes[0]);
    // "How this was checked" says what "Sure" means now, in the approved words of its basis.
    const sure = [...node.querySelectorAll(".v4RepWord")].find((item) => item.querySelector("b")!.textContent === t(catalog, "v4.trust.SURE"))!;
    expect(sure.querySelector("span")!.textContent).toBe("A second AI agreed, and the point rests on a page we looked up.");
  });

  it("at the expert level: each point's sources, each path's note and other pages, with no buttons", async () => {
    const node = await report(webAnswer(PAID_PATHS), "expert");
    expect(node.textContent).not.toContain("does not search the web");
    expect([...node.querySelectorAll(".v4RepPoint blockquote")].map((quote) => quote.textContent)).toEqual([
      "The offer is about a third above the current pay after tax.", "A made-up line from page S2-2."
    ]);
    const notes = [...node.querySelectorAll(".v4RepPath .v4WebNote")].map((note) => note.textContent);
    expect(notes).toEqual([
      t(catalog, "v4.web.noSearch", { reason: "A matter of what the family wants; no page can settle it." }),
      t(catalog, "v4.web.failed")
    ]);
    expect([...node.querySelectorAll(".v4RepPath .v4OtherPage a")].map((link) => link.getAttribute("href")))
      .toEqual(["https://storage-watch.example/pg-1", "https://storage-watch.example/pg-2"]);
    expect(node.querySelector(".v4OtherPageAdd")).toBeNull();
  });

  it("an answer from before R22 has no web note on the report", async () => {
    const node = await report(STORY_FIXTURE_ANSWER, "expert");
    expect(node.querySelector(".v4RepDoc")).not.toBeNull();
    expect(node.querySelector(".v4WebNote")).toBeNull();
    expect(node.textContent).not.toContain("does not search the web");
  });
});

describe("phone width (375px)", () => {
  /** The rule block of one selector in v4-map.css. */
  const rule = (selector: string): string => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf("}", at));
  };

  it("lets long titles, quotes and addresses wrap inside the panel, with no fixed width", () => {
    expect(rule(".v4Source")).toMatch(/min-width: 0/u);
    expect(rule(".v4Source")).toMatch(/overflow-wrap: anywhere/u);
    expect(rule(".v4SourceLink")).toMatch(/overflow-wrap: anywhere/u);
    expect(rule(".v4SourceMeta")).toMatch(/flex-wrap: wrap/u);
    const block = css.slice(css.indexOf("Perplexity plan W2-6"));
    // No width, and no padding or gap that alone would take a 375px screen's room (16px gutters each side).
    expect(block).not.toMatch(/(?:^|[\s;{])(?:min-)?width:\s*[0-9]{3,}px/mu);
    for (const match of block.matchAll(/([0-9]+)px/gu)) expect(Number(match[1]), match[0]).toBeLessThanOrEqual(44);
  });

  it("keeps the 'Add to researched' button at the 44px touch height", () => {
    expect(rule(".v4OtherPageAdd")).toMatch(/min-height: 44px/u);
  });
});

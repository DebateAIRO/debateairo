/*
 * The web part of the mock's seeded debates (draft shapes from web-draft.ts). Every page here is MADE UP: the sites are
 * on the reserved ".example" names, and no title, line or quote is taken from a real article (plan §2, copyright).
 *
 * Three cases, one per kind of debate:
 *   - PAID:   a paid debate whose web step ran. Paths n-mix, n-renew and n-nuclear were searched; n-smr had no search
 *             planned (the planner's reason is shown). Sources sit under the looked-up points, read whole, preview only
 *             or abstract only, one with fewer readers; those points' locators are their extract ids, so the server's
 *             "checked looked up" flag is set. n-mix-cost keeps a REMEMBERED citation (no source), so it is not checked.
 *             Other pages, "added to researched" choices with every outcome, and dig suggestions of every kind and side.
 *   - FAILED: a paid debate whose search failed: every path FAILED, no sources, no other pages.
 *   - FREE:   a Free debate: every path NOT_ON_PLAN, no sources (Free never searches).
 */
import { cutQuote, type DraftDigSuggestion, type DraftNodeWeb, type DraftOtherPage, type DraftSource, type DraftWebPath } from "./web-draft.js";

export type WebCase = "PAID" | "FAILED" | "FREE";
export const WEB_CASES: readonly WebCase[] = Object.freeze(["PAID", "FAILED", "FREE"]);

type PageSpec = Readonly<{ title: string; site: string; path: string; published_on: string | null }>;

/** Reader 1's one line, in the site's language at the time (the mock's site is English). */
const line = (text: string) => ({ text, language: "en" as const });

/** An extract as reader 1 copied it (often longer than the page may show); people see it cut to 120 characters. */
function source(input: Readonly<{
  id: string; extract: string; explanation: string; page: PageSpec; depth?: DraftSource["read_depth"]; fewerReaders?: boolean;
}>): DraftSource {
  return {
    extract_id: input.id,
    quote: cutQuote(input.extract),
    title: input.page.title,
    site: input.page.site,
    link: `https://${input.page.site}/${input.page.path}`,
    read_depth: input.depth ?? "WHOLE",
    explanation: line(input.explanation),
    published_on: input.page.published_on,
    ...(input.fewerReaders === true ? { fewer_readers: true as const } : {})
  };
}

/** A page found outside the path's top pages: title, site, link, reader 1's line; never a grade. */
function otherPage(ref: string, page: Omit<PageSpec, "published_on">, explanation: string, researched?: DraftOtherPage["researched"]): DraftOtherPage {
  return {
    page_ref: ref,
    title: page.title,
    site: page.site,
    link: `https://${page.site}/${page.path}`,
    read_depth: "WHOLE",
    explanation: line(explanation),
    ...(researched === undefined ? {} : { researched })
  };
}

const COST_SURVEY: PageSpec = {
  title: "What new power costs in 2025: a survey of recent auctions",
  site: "grid-costs.example", path: "reports/new-power-costs-2025", published_on: "2025-06-12"
};
const BATTERY_NOTE: PageSpec = {
  title: "Battery pack prices over fifteen years",
  site: "storage-watch.example", path: "notes/pack-prices", published_on: "2024-01-15"
};
const REACTOR_RECORD: PageSpec = {
  title: "Building reactors in Europe and North America: the record since 2005",
  site: "project-records.example", path: "nuclear/build-record", published_on: "2025-03-02"
};
const REACTOR_DIARY: PageSpec = {
  title: "Twelve years on one site: a construction diary",
  site: "engineering-letters.example", path: "2024/construction-diary", published_on: "2024-09-20"
};
const LIFE_CYCLE: PageSpec = {
  title: "Life-cycle emissions of electricity sources: a review",
  site: "open-energy-journal.example", path: "articles/life-cycle-review", published_on: "2023-11-08"
};

/** Sources under the looked-up points of the PAID case; the first one's id is the point's locator. */
const PAID_SOURCES: Readonly<Record<string, readonly DraftSource[]>> = Object.freeze({
  "n-renew-cost": [
    source({
      id: "S2-1",
      extract: "Across the auctions we tracked in 2025, new solar and onshore wind cleared at the lowest prices of any new generation in most markets, often well below new gas and far below new nuclear.",
      explanation: "A survey of 2025 power auctions; it compares what each kind of new plant costs.",
      page: COST_SURVEY
    })
  ],
  "n-renew-battery": [
    source({
      id: "S2-2",
      extract: "Average pack prices fell by close to nine tenths between 2010 and 2023.",
      explanation: "A short note on battery prices; only its opening could be read.",
      page: BATTERY_NOTE, depth: "PREVIEW_ONLY", fewerReaders: true
    })
  ],
  "n-nuclear-build": [
    source({
      id: "S3-1",
      extract: "Of the large reactors started in Western Europe and the United States since 2005, none was finished in under twelve years, and the final cost of each was two to three times the first budget.",
      explanation: "A record of recent reactor projects, with their start and finish dates and costs.",
      page: REACTOR_RECORD
    }),
    source({
      id: "S3-2",
      extract: "The delays came less from the reactor itself than from first-of-a-kind civil works, supply chains that had to be rebuilt and repeated design changes during construction.",
      explanation: "An engineer's account of why one project took so long.",
      page: REACTOR_DIARY
    })
  ],
  "n-nuclear-clean": [
    source({
      id: "S3-3",
      extract: "Median life-cycle emissions for nuclear and onshore wind fall in the same narrow band, a small fraction of those of coal or gas.",
      explanation: "A review of life-cycle emission studies; only its summary was open to read.",
      page: LIFE_CYCLE, depth: "ABSTRACT_ONLY"
    })
  ]
});

/** The point a page added to "researched" joined (its checked quote). */
const RESEARCHED_FIRM_POWER = source({
  id: "S1-1",
  extract: "In each of the three grids studied, the hardest week of the year was a cold, windless spell in which firm sources carried most of the load for several days.",
  explanation: "Explains why long, windless weeks need a firm source, with examples from three grids.",
  page: { title: "Firm power in grids with high shares of wind and sun", site: "power-systems.example", path: "firm-power", published_on: "2025-02-10" }
});

const suggestion = (id: string, kind: DraftDigSuggestion["kind"], text: string, places: string[], side: DraftDigSuggestion["side"] = null): DraftDigSuggestion =>
  ({ suggestion_id: id, kind, side, text, places });

const STORAGE_CONTRADICTING = suggestion("renew-contradicting", "CONTRADICTING",
  "Can batteries and power lines really cover several windless days at an acceptable cost?", ["p:n-renew-storage"]);
const SMR_UNDOCUMENTED = suggestion("smr-undocumented", "UNDOCUMENTED",
  "What would the first small modular reactors have to cost for this path to hold?", ["p:n-smr-cost"]);

function paidPaths(): DraftWebPath[] {
  return [
    {
      position_ref: "n-mix",
      search: { status: "SEARCHED" },
      other_pages: [
        otherPage("W1-1", { title: "Firm power in grids with high shares of wind and sun", site: "power-systems.example", path: "firm-power" },
          "Explains why long, windless weeks need a firm source, with examples from three grids.", { state: "ADDS", sources: [RESEARCHED_FIRM_POWER] }),
        otherPage("W1-2", { title: "How much land does each kind of power plant use?", site: "land-use-notes.example", path: "power-land-use" },
          "Compares the land each source needs per unit of energy.", { state: "READING" }),
        otherPage("W1-3", { title: "A guide to grid planning for city councils", site: "civic-energy.example", path: "guide" },
          "A general guide; it says little about nuclear or storage.")
      ],
      suggestions: [
        suggestion("mix-helps-for", "HELPS_MAIN_QUESTION",
          "Which countries already have the grid and the regulator to add some nuclear, and how much would it lower their total cost?", ["path:n-mix"], "FOR"),
        suggestion("mix-undocumented", "UNDOCUMENTED",
          "Nuclear needs less land than wind or solar: how much less, and does it matter in crowded countries?", ["p:n-mix-land"])
      ]
    },
    {
      position_ref: "n-renew",
      search: { status: "SEARCHED" },
      other_pages: [
        otherPage("W2-1", { title: "Multi-day storage pilots: what they cost so far", site: "storage-watch.example", path: "pilots/multi-day" },
          "Lists the first pilots of storage that lasts several days and what they cost.", { state: "ADDS_NOTHING" }),
        otherPage("W2-2", { title: "Winter demand and solar output across Europe", site: "seasons-and-grids.example", path: "winter" },
          "Shows how far winter demand and solar output drift apart in the north.", { state: "FAILED" })
      ],
      suggestions: [
        STORAGE_CONTRADICTING,
        suggestion("renew-more-web", "NEEDS_MORE_WEB",
          "What do the first pilots of storage that lasts several days cost so far?", ["p:n-renew-storage", "path:n-renew"]),
        suggestion("renew-helps-against", "HELPS_MAIN_QUESTION",
          "How large would seasonal storage need to be in a northern country that runs on renewables alone?", ["path:n-renew"], "AGAINST")
      ]
    },
    {
      position_ref: "n-nuclear",
      search: { status: "SEARCHED" },
      other_pages: [
        otherPage("W3-1", { title: "Reactor projects in Asia: build times compared", site: "project-records.example", path: "nuclear/asia" },
          "Build times outside Europe and North America, which were often shorter.")
      ],
      suggestions: [
        suggestion("nuclear-helps-for", "HELPS_MAIN_QUESTION",
          "Were reactors built faster outside Europe and North America, and could that be repeated here?", ["path:n-nuclear"], "FOR")
      ]
    },
    {
      position_ref: "n-smr",
      search: { status: "NO_SEARCH_PLANNED", reason: "Whether these reactors will be cheap is a forecast; no published report can settle it yet." },
      other_pages: [],
      suggestions: [SMR_UNDOCUMENTED]
    }
  ];
}

const POSITIONS = ["n-mix", "n-renew", "n-nuclear", "n-smr"] as const;

/** The draft fields for one case: what each node gains (and its locator, when it rests on a source) and each path's web part. */
export function webCase(kind: WebCase, nodeIds: readonly string[]): {
  nodes: Readonly<Record<string, DraftNodeWeb & { locator?: string }>>;
  paths: DraftWebPath[];
} {
  const nodes: Record<string, DraftNodeWeb & { locator?: string }> = {};
  for (const id of nodeIds) {
    const sources = kind === "PAID" ? [...(PAID_SOURCES[id] ?? [])] : [];
    // Only a point resting on an extract of THIS debate is checked (and all four were agreed by the reviewer).
    nodes[id] = sources.length > 0 ? { sources, looked_up_checked: true, locator: sources[0]!.extract_id } : { sources, looked_up_checked: false };
  }
  if (kind === "PAID") return { nodes, paths: paidPaths() };
  const status = kind === "FAILED" ? "FAILED" as const : "NOT_ON_PLAN" as const;
  // Suggestions that need no web (Free digs never search): the disputed storage point and the unpriced reactors.
  const offline: Readonly<Record<string, DraftDigSuggestion[]>> = { "n-renew": [STORAGE_CONTRADICTING], "n-smr": [SMR_UNDOCUMENTED] };
  return {
    nodes,
    paths: POSITIONS.map((position) => ({ position_ref: position, search: { status }, other_pages: [], suggestions: [...(offline[position] ?? [])] }))
  };
}

/*
 * The web part of the mock's seeded debates (draft shapes from web-draft.ts). Every page here is MADE UP: the sites are
 * on the reserved ".example" names, and no title, line or quote is taken from a real article (plan §2, copyright).
 *
 * Three cases, one per kind of debate:
 *   - PAID:   a paid debate whose web step ran. Paths n-mix, n-renew and n-nuclear were searched; n-smr had no search
 *             planned (the planner's reason is shown). Sources sit under the looked-up points, read whole, preview only
 *             or abstract only, one with fewer readers; n-mix-cost keeps a REMEMBERED citation (no source), so it is not
 *             "checked looked up". Other pages, researched choices with every outcome, and dig suggestions of every kind.
 *   - FAILED: a paid debate whose search failed: every path FAILED, no sources, no other pages.
 *   - FREE:   a Free debate: every path NOT_ON_PLAN, no sources (Free never searches).
 */
import { cutQuote, type DraftNodeWeb, type DraftPathResearch, type DraftSource } from "./web-draft.js";

export type WebCase = "PAID" | "FAILED" | "FREE";
export const WEB_CASES: readonly WebCase[] = Object.freeze(["PAID", "FAILED", "FREE"]);

type PageSpec = Readonly<{
  title: string;
  site: string;
  path: string;
  published_on: string | null;
}>;

const page = (spec: PageSpec) => ({
  title: spec.title,
  site: spec.site,
  url: `https://${spec.site}/${spec.path}`,
  published_on: spec.published_on
});

/** An "other page" shows its title, site, link and reader 1's line: no date, and never a grade. */
const otherPage = (pageId: string, spec: Omit<PageSpec, "published_on">, line: string) => ({
  page_id: pageId, title: spec.title, site: spec.site, url: `https://${spec.site}/${spec.path}`, line
});

/** An extract as reader 1 copied it (longer than the page may show); the page shows it cut to 120 characters. */
function source(input: Readonly<{
  id: string; extract: string; explanation: string; page: PageSpec; depth?: DraftSource["read_depth"]; fewerReaders?: boolean;
}>): DraftSource {
  return {
    extract_id: input.id,
    quote: cutQuote(input.extract),
    explanation: input.explanation,
    ...page(input.page),
    read_depth: input.depth ?? "WHOLE",
    fewer_readers: input.fewerReaders ?? false
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

/** Sources under the looked-up points of the PAID case. */
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

const OTHER_PAGES_MIX = [
  otherPage("W1-1", { title: "Firm power in grids with high shares of wind and sun", site: "power-systems.example", path: "firm-power" },
    "Explains why long, windless weeks need a firm source, with examples from three grids."),
  otherPage("W1-2", { title: "How much land does each kind of power plant use?", site: "land-use-notes.example", path: "power-land-use" },
    "Compares the land each source needs per unit of energy."),
  otherPage("W1-3", { title: "A guide to grid planning for city councils", site: "civic-energy.example", path: "guide" },
    "A general guide; it says little about nuclear or storage.")
] as const;

const OTHER_PAGES_RENEW = [
  otherPage("W2-1", { title: "Multi-day storage pilots: what they cost so far", site: "storage-watch.example", path: "pilots/multi-day" },
    "Lists the first pilots of storage that lasts several days and what they cost."),
  otherPage("W2-2", { title: "Winter demand and solar output across Europe", site: "seasons-and-grids.example", path: "winter" },
    "Shows how far winter demand and solar output drift apart in the north.")
] as const;

const OTHER_PAGES_NUCLEAR = [
  otherPage("W3-1", { title: "Reactor projects in Asia: build times compared", site: "project-records.example", path: "nuclear/asia" },
    "Build times outside Europe and North America, which were often shorter.")
] as const;

function paidPaths(): DraftPathResearch[] {
  return [
    {
      position_ref: "n-mix",
      web: { status: "SEARCHED" },
      other_pages: [...OTHER_PAGES_MIX],
      researched: [{ page_id: "W1-1", outcome: "ADDS" }, { page_id: "W1-2", outcome: "READING" }],
      dig_suggestions: [
        {
          suggestion_id: "g:mix-helps-for", kind: "HELPS_FOR",
          text: "Which countries already have the grid and the regulator to add some nuclear, and how much would it lower their total cost?",
          places: ["path:n-mix"]
        },
        {
          suggestion_id: "g:mix-undocumented", kind: "UNDOCUMENTED",
          text: "Nuclear needs less land than wind or solar: how much less, and does it matter in crowded countries?",
          places: ["p:n-mix-land"]
        }
      ]
    },
    {
      position_ref: "n-renew",
      web: { status: "SEARCHED" },
      other_pages: [...OTHER_PAGES_RENEW],
      researched: [{ page_id: "W2-1", outcome: "ADDS_NOTHING" }, { page_id: "W2-2", outcome: "FAILED" }],
      dig_suggestions: [
        {
          suggestion_id: "g:renew-contradicting", kind: "CONTRADICTING",
          text: "Can batteries and power lines really cover several windless days at an acceptable cost?",
          places: ["p:n-renew-storage"]
        },
        {
          suggestion_id: "g:renew-more-web", kind: "NEEDS_MORE_WEB",
          text: "What do the first pilots of storage that lasts several days cost so far?",
          places: ["p:n-renew-storage", "path:n-renew"]
        },
        {
          suggestion_id: "g:renew-helps-against", kind: "HELPS_AGAINST",
          text: "How large would seasonal storage need to be in a northern country that runs on renewables alone?",
          places: ["path:n-renew"]
        }
      ]
    },
    {
      position_ref: "n-nuclear",
      web: { status: "SEARCHED" },
      other_pages: [...OTHER_PAGES_NUCLEAR],
      researched: [],
      dig_suggestions: [
        {
          suggestion_id: "g:nuclear-helps-for", kind: "HELPS_FOR",
          text: "Were reactors built faster outside Europe and North America, and could that be repeated here?",
          places: ["path:n-nuclear"]
        }
      ]
    },
    {
      position_ref: "n-smr",
      web: { status: "NO_SEARCH_PLANNED", reason: "Whether these reactors will be cheap is a forecast; no published report can settle it yet." },
      other_pages: [],
      researched: [],
      dig_suggestions: [
        {
          suggestion_id: "g:smr-undocumented", kind: "UNDOCUMENTED",
          text: "What would the first small modular reactors have to cost for this path to hold?",
          places: ["p:n-smr-cost"]
        }
      ]
    }
  ];
}

/** Suggestions that need no web, for the FAILED and FREE cases (Free digs never search). */
function noWebSuggestions(path: string): DraftPathResearch["dig_suggestions"] {
  if (path === "n-renew") {
    return [{
      suggestion_id: "g:renew-contradicting", kind: "CONTRADICTING",
      text: "Can batteries and power lines really cover several windless days at an acceptable cost?",
      places: ["p:n-renew-storage"]
    }];
  }
  if (path === "n-smr") {
    return [{
      suggestion_id: "g:smr-undocumented", kind: "UNDOCUMENTED",
      text: "What would the first small modular reactors have to cost for this path to hold?",
      places: ["p:n-smr-cost"]
    }];
  }
  return [];
}

const POSITIONS = ["n-mix", "n-renew", "n-nuclear", "n-smr"] as const;

/** The draft fields for one case: what each node gains and each path's research. */
export function webCase(kind: WebCase, nodeIds: readonly string[]): {
  nodes: Readonly<Record<string, DraftNodeWeb>>;
  pathResearch: DraftPathResearch[];
} {
  const nodes: Record<string, DraftNodeWeb> = {};
  for (const id of nodeIds) {
    const sources = kind === "PAID" ? [...(PAID_SOURCES[id] ?? [])] : [];
    // Only a point resting on an extract of THIS debate (and agreed by the reviewer; all four are) is checked.
    nodes[id] = { sources, looked_up_checked: sources.length > 0 };
  }
  if (kind === "PAID") return { nodes, pathResearch: paidPaths() };
  const status = kind === "FAILED" ? "FAILED" as const : "NOT_ON_PLAN" as const;
  return {
    nodes,
    pathResearch: POSITIONS.map((position) => ({
      position_ref: position, web: { status }, other_pages: [], researched: [], dig_suggestions: noWebSuggestions(position)
    }))
  };
}

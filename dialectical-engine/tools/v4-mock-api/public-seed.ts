/*
 * Decisions 13, 16 and 22 of 31 Oct: the mock's public debates. Everything is made up, in plain English, and passes PublicDebateSchema at the mock's start.
 * PUBLIC_DEBATE: a story with four paths, one contribution with its dig's own paths, a changed main answer and one report. Its tree is published
 * (public-d1 A, owner review 3 Nov): every point carries a second AI's review, so the page shows each path's trust word and bar and the strongest point
 * For and Against; one point is still argued (an open question under its path, with the star) and one rests on a checked page ("Sure").
 * PUBLIC_AUTHOR_GONE: the author's account is gone and no dig is on it (a report is refused NO_CARRIER; a dig is allowed).
 * Run ids never appear here: only the page's own references.
 */
export const PUBLIC_REF = "f1000000-0000-4000-8000-000000000001";
export const PUBLIC_REF_AUTHOR_GONE = "f1000000-0000-4000-8000-000000000002";
export const PUBLIC_UPDATE_REF = "f2000000-0000-4000-8000-000000000001";

const QUESTION = "Should cities make public transport free?";

const storyShort = {
  headline: "Our answer: cheaper fares help most when the service is already good; free fares alone rarely move drivers out of their cars.",
  summary: "You asked whether cities should make public transport free. Free fares fill buses mostly with people who already walked or cycled. Service that runs often does more to win over drivers, and it costs the same money.",
  confidence: "How sure we are: fairly sure about the direction, less sure for very small towns.",
  paths: [
    { position_ref: "p-fares", fate: "PARTLY_HELD", line: "Free fares for everyone: partly held. They help people with little money, but few drivers switch.", node_refs: ["p-fares", "n-fares", "n-drivers"] },
    { position_ref: "p-service", fate: "HELD_UP", line: "Better service first: held up. People follow frequent, reliable lines.", node_refs: ["p-service", "n-service"] },
    { position_ref: "p-targeted", fate: "HELD_UP", line: "Free fares only for those who need them: held up. The same help costs far less.", node_refs: ["p-targeted", "n-targeted"] }
  ],
  change: { text: "A large city that made fares free and saw many drivers leave their cars for years, not months.", node_refs: ["n-fares"] },
  reviewer_note: null,
  double_checked: true
};

const answer = {
  terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true, confidence_band: "moderate",
  summary_segments: [{ text: storyShort.summary }], badges: [], residual_objections: ["Small towns were barely studied."],
  reversal_point: storyShort.change.text, as_of: "2026-10-20T08:00:00.000Z"
};

/** A made-up number the engine would carry; the public page never shows it (public-f1), it only ranks the strongest point on each side. */
function made(value: number) {
  return { value, kind: "probability", source: "mock", producer: "mock", provenance_ref: "REDACTED_OWNER_ONLY", replay_handle: "REDACTED_OWNER_ONLY" };
}

/** One published point with a second AI's review (agree / dispute); `checked`: it rests on a page this debate looked up and checked. */
function point(id: string, claim: string, outcome: "agree" | "dispute", score: number, checked = false): Record<string, unknown> {
  const page = { extract_id: "S1-1", quote: "Riders follow lines that come every ten minutes.", title: "A made-up study of bus lines", site: "example.org",
    link: "https://example.org/made-up-lines", read_depth: "WHOLE", explanation: { text: "A made-up page for the click-test.", language: "en" }, published_on: "2026-03-01" };
  return {
    node_id: id, claim, way_of_knowing: checked ? "LOOKED_UP" : "REASONING", base_score: made(score), final_strength: made(score), provenance_ref: "REDACTED_OWNER_ONLY",
    maker_lineage: { maker: "mock", model_id: "mock-model" },
    review: { outcome, reasons: [outcome === "agree" ? "The second AI agreed." : "The second AI was not convinced."], provenance_ref: "REDACTED_OWNER_ONLY",
      reviewer_lineage: { maker: "mock", model_id: "mock-model" } },
    locator: checked ? "S1-1" : null, stranger_restatement: { check_status: "NOT_SAMPLED" }, defeater_refs: [], defeater_exhaustion_marked: true,
    disagreement: null, condition_marks: [], abstention: null, staleness_state: "FRESH", relevant_as_of: "2026-10-20T08:00:00.000Z",
    ...(checked ? { sources: [page], looked_up_checked: true } : {})
  };
}

/** An argument for (support) or against (attack) the point it answers. */
function edge(id: string, from: string, to: string, relation: "support" | "attack"): Record<string, unknown> {
  return { edge_id: id, from_node_ref: from, target_kind: "NODE", target_ref: to, relation, strength: { status: "PRESENT", number: made(0.6) },
    provenance_ref: "REDACTED_OWNER_ONLY", placeholder: false };
}

/** PUBLIC_DEBATE's published tree: three positions, the points under them, and which side each point argues. */
const tree = {
  nodes: [
    point("p-fares", "Free fares for everyone are worth their cost.", "agree", 0.5),
    point("n-fares", "Free fares help people with little money get to work.", "agree", 0.7),
    point("n-drivers", "Free fares move many drivers out of their cars.", "dispute", 0.3),
    point("p-service", "Better service does more than free fares.", "agree", 0.7),
    point("n-service", "Riders follow frequent, reliable lines.", "agree", 0.8, true),
    point("p-targeted", "Free fares only for those who need them give the same help for less.", "agree", 0.6),
    point("n-targeted", "Targeted passes cost a fraction of free fares for all.", "agree", 0.6)
  ],
  edges: [
    edge("e-fares", "n-fares", "p-fares", "support"),
    edge("e-drivers", "n-drivers", "p-fares", "attack"),
    edge("e-service", "n-service", "p-service", "support"),
    edge("e-targeted", "n-targeted", "p-targeted", "support")
  ],
  tree_included: true
};

const REPORT = {
  report_version: 1,
  written_at: "2026-10-30T10:00:00.000Z",
  writer: "Quiet Heron",
  answer: { segments: ["Service first, and free fares for those who need them. A dig on small towns found the same picture there, with fewer studies."] },
  story: {
    short_answer: "Service first, and free fares for those who need them.",
    what_would_change: "A large city that made fares free and kept many former drivers on its buses for years.",
    how_it_went: [{ dig_run_id: PUBLIC_UPDATE_REF, paragraph: "A dig asked about small towns: the same picture, with fewer studies behind it." }],
    still_open: ["How much the answer holds for very small towns."]
  },
  sources: [{ site: "example.org", title: "A made-up page on bus use", quote: "A made-up line this page was found to hold.", line: "A made-up study of one city's buses.", link: "https://example.org/made-up" }],
  shortened: false
};

export function seedPublicDebates(): readonly Record<string, unknown>[] {
  return [
    {
      public_ref: PUBLIC_REF, author_pseudonym: "Calm Otter", question: QUESTION, published_at: "2026-10-20T08:00:00.000Z", language: "en", answer: { ...answer, ...tree },
      story_short: storyShort,
      contributions: [{
        position_ref: "p-fares", contributor: "Quiet Heron", contributed_on: "2026-10-28",
        line: "Free fares for everyone: partly held, also in small towns, where the few studies show the same small move away from cars.",
        summary: "A dig looked at small towns. Free fares filled buses there too, mostly with people who already walked.",
        fate: "PARTLY_HELD", what_changed: ["Small towns are now covered, with a note that the studies are few."],
        update_ref: PUBLIC_UPDATE_REF, own_rewrite: true, on_ref: null,
        dig_paths: [{ position_ref: "p-towns", line: "Small towns behave like large cities here: partly held.", fate: "PARTLY_HELD", points: ["Only a few towns were studied."] }]
      }],
      main_answer_update: { updated_at: "2026-10-28T16:00:00.000Z", segments: [{ text: "Better service first, and free fares for those who need them, also in small towns, though the studies there are few." }] },
      reports: [REPORT]
    },
    {
      public_ref: PUBLIC_REF_AUTHOR_GONE, author_pseudonym: "a contributor", author_name_gone: true, question: "Should schools start an hour later?",
      published_at: "2026-10-22T08:00:00.000Z", language: "en", answer: { ...answer, as_of: "2026-10-22T08:00:00.000Z" },
      story_short: { ...storyShort, headline: "Our answer: a later start helps teenagers most.", summary: "You asked whether schools should start an hour later. Teenagers sleep longer and do a little better; younger children gain less.", paths: [
        { position_ref: "p-teens", fate: "HELD_UP", line: "Teenagers gain the most: held up.", node_refs: ["n-teens"] }
      ], change: { text: "Long studies that find no gain in sleep.", node_refs: ["n-teens"] } }
    }
  ];
}

/**
 * Owner screen review (3 Nov, public-d2 A), DRAFT field `dig_suggestions` of the public read: each path's own suggestions, as the page's dig box shows
 * them as chips; one has been dug near since (`dug_on`, `dug_ref`: that dig's contribution), so its chip opens that result instead. The contract's
 * PublicDebate is strict and does not name the field yet, so the website does not receive it: it is on the draft view only
 * (`/__mock/draft/v1/public/debates/<ref>`).
 */
export const PUBLIC_DIG_SUGGESTIONS: readonly Record<string, unknown>[] = [
  { position_ref: "p-fares", suggestions: [
    { suggestion_id: "pub-fares-towns", kind: "UNDOCUMENTED", side: null, text: "Do free fares work the same way in small towns?", places: ["path:p-fares"],
      dug_on: "2026-10-28", dug_ref: PUBLIC_UPDATE_REF },
    { suggestion_id: "pub-fares-drivers", kind: "CONTRADICTING", side: null, text: "Did any city see many drivers switch for good after fares went free?", places: ["path:p-fares"] }
  ] },
  { position_ref: "p-service", suggestions: [
    { suggestion_id: "pub-service-cost", kind: "HELPS_MAIN_QUESTION", side: "FOR", text: "What does running buses more often cost compared with free fares?", places: ["path:p-service"] }
  ] }
];

/**
 * Owner screen review (public-f26): where a debate is on its way to a public page, for the click-test: `/__mock/set?publicstate=…`. The visibility read
 * says PUBLISHED (with the first public debate's reference) for PUBLISHED and PRIVATE for every other one; the draft view adds the DRAFT field
 * `public_stage` (WILL_BE_PUBLIC, BEING_CHECKED, KEPT_PRIVATE), which the contract does not name yet.
 */
export const PUBLIC_STATES = ["PRIVATE", "WILL_BE_PUBLIC", "BEING_CHECKED", "PUBLISHED", "KEPT_PRIVATE"] as const;
export type PublicState = (typeof PUBLIC_STATES)[number];

/** The visibility read for a debate of the asker's, in the click-test's public state; `draft` adds the stage field. */
export function visibilityOf(state: PublicState, draft: boolean): Record<string, unknown> {
  const body = state === "PUBLISHED" ? { state: "PUBLISHED", public_ref: PUBLIC_REF } : { state: "PRIVATE", public_ref: null };
  return draft && state !== "PRIVATE" && state !== "PUBLISHED" ? { ...body, public_stage: state } : body;
}

/**
 * What a dig or a report waits on, for the click-test: `/__mock/set?public=…`. REPORT_STUCK (public-f9): "Write a report" is accepted but its version
 * never arrives, so the page keeps its "Being written" card, its checks slow down, and after 10 minutes it says it is taking longer, with "Check again".
 */
export const PUBLIC_MODES = ["OPEN", "ONGOING", "REPORT_WRITING", "TOO_DEEP", "REPORT_STUCK"] as const;
export type PublicMode = (typeof PUBLIC_MODES)[number];

/** A new report the mock "writes" a few seconds after the press. */
export function writtenReport(version: number, writtenAt: string): Record<string, unknown> {
  return { ...REPORT, report_version: version, written_at: writtenAt, writer: "Mock Tester", story: { ...REPORT.story, how_it_went: [] },
    answer: { segments: [`Version ${String(version)}: service first, and free fares for those who need them.`] } };
}

/**
 * The digger's own rewrite of the path, as the dig's answer carries it once it is on the page (`contribution.rewrite`): the new text of a
 * contribution, or, with "#confirm" in the view, the path's text as it was and nothing changed ("Confirmed: the answer holds.").
 */
export function contributionRewriteOf(contribution: Record<string, unknown> | null, sameLine: string | null): Record<string, unknown> {
  if (contribution === null) return { line: sameLine ?? "", summary: "The dig looked again and the path holds as it was.", fate: "PARTLY_HELD", what_changed: [] };
  return { line: contribution.line, summary: contribution.summary, fate: contribution.fate, what_changed: contribution.what_changed };
}

/** A dig that passed the check, as its page shows it. */
export function contributionOf(positionRef: string, onRef: string | null, updateRef: string, on: string, view: string): Record<string, unknown> {
  return {
    position_ref: positionRef, contributor: "Mock Tester", contributed_on: on,
    line: "This path, after a dig from the click-test: partly held, with one more point in it.",
    summary: `A dig weighed this view and kept what held: ${view.slice(0, 200)}`,
    fate: "PARTLY_HELD", what_changed: ["The dig added one point to this path."], update_ref: updateRef, own_rewrite: true, on_ref: onRef,
    dig_paths: [{ position_ref: `p-${updateRef.slice(0, 8)}`, line: "A path of this dig's own.", fate: "HELD_UP", points: ["A made-up point this dig argued."] }]
  };
}

/** Decision 35's pretend check: "hide" in the claim hides, "#person" goes to a person, anything else is the one refusal every refusal shares (the DSA notices, D5). */
export function mockFlagStateOf(claim: string): "WITH_A_PERSON" | "HIDDEN" | "NOT_FOUND" {
  return claim.includes("#person") ? "WITH_A_PERSON" : claim.includes("hide") ? "HIDDEN" : "NOT_FOUND";
}

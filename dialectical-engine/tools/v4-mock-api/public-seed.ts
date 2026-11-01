/*
 * Decisions 13, 16 and 22 of 31 Oct: the mock's public debates. Everything is made up, in plain English, and passes PublicDebateSchema at the mock's start.
 * PUBLIC_DEBATE: a story with four paths, one contribution with its dig's own paths, a changed main answer and one report.
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
    { position_ref: "p-fares", fate: "PARTLY_HELD", line: "Free fares for everyone: partly held. They help people with little money, but few drivers switch.", node_refs: ["n-fares"] },
    { position_ref: "p-service", fate: "HELD_UP", line: "Better service first: held up. People follow frequent, reliable lines.", node_refs: ["n-service"] },
    { position_ref: "p-targeted", fate: "HELD_UP", line: "Free fares only for those who need them: held up. The same help costs far less.", node_refs: ["n-targeted"] }
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
      public_ref: PUBLIC_REF, author_pseudonym: "Calm Otter", question: QUESTION, published_at: "2026-10-20T08:00:00.000Z", language: "en", answer, story_short: storyShort,
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

/** What a dig or a report waits on, for the click-test: `/__mock/set?public=…`. */
export const PUBLIC_MODES = ["OPEN", "ONGOING", "REPORT_WRITING", "TOO_DEEP"] as const;
export type PublicMode = (typeof PUBLIC_MODES)[number];

/** A new report the mock "writes" a few seconds after the press. */
export function writtenReport(version: number, writtenAt: string): Record<string, unknown> {
  return { ...REPORT, report_version: version, written_at: writtenAt, writer: "Mock Tester", story: { ...REPORT.story, how_it_went: [] },
    answer: { segments: [`Version ${String(version)}: service first, and free fares for those who need them.`] } };
}

/** A dig that passed the check, as its page shows it. */
export function contributionOf(positionRef: string, onRef: string | null, updateRef: string, on: string, view: string): Record<string, unknown> {
  return {
    position_ref: positionRef, contributor: "Mock Tester", contributed_on: on,
    line: "This path, after a dig from the click-test: partly held.",
    summary: `A dig weighed this view and kept what held: ${view.slice(0, 200)}`,
    fate: "PARTLY_HELD", what_changed: ["The dig added one point to this path."], update_ref: updateRef, own_rewrite: true, on_ref: onRef,
    dig_paths: [{ position_ref: `p-${updateRef.slice(0, 8)}`, line: "A path of this dig's own.", fate: "HELD_UP", points: ["A made-up point this dig argued."] }]
  };
}

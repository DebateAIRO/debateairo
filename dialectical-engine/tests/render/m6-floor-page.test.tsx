// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, PublicDebateSchema, type Answer, type AnswerDisclosure, type AnswerFloor, type RunEvent } from "@debateai/contract";
import { contractNodesById, debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { LOCALE_COOKIE, type LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import composeEnglish from "../../apps/ui/messages/en/compose.json" with { type: "json" };
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import publicRomanian from "../../apps/ui/messages/ro/public.json" with { type: "json" };

/**
 * Task M6 (spec 2026-09-26 §14.4.4): a components-only answer whose label the
 * engine kept (the floor) reads as an answer. The verdict area shows the label
 * in human words, "Our best answer:" and the leading position's own statement
 * instead of the "Components-only…" line; the owner's story strip takes its
 * label from the floor; the public page shows the same, its fixed words in the
 * question's language. A components-only answer without a floor reads as today.
 */

const mocks = vi.hoisted(() => ({
  readAnswerStory: vi.fn(),
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  readAnswerDisclosure: vi.fn(),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn(),
  getDebateServer: vi.fn(),
  locale: "en"
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  const readClient = {
    readRun: mocks.readRun,
    readRunAnswer: mocks.readRunAnswer,
    readAnswer: mocks.readAnswer,
    readAnswerDisclosure: mocks.readAnswerDisclosure
  };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      readSession: vi.fn(async()=>({asker_id:"owner:33333333-3333-4333-8333-333333333333",session_id:"22222222-2222-4222-8222-222222222222",caller_scope:"ASKER",ownership_provenance:"server_session",provisional_identity_model:false})),
      readAnswerStory: mocks.readAnswerStory,
      streamEvents: mocks.streamEvents,
      readEvents: mocks.readEvents,
      readLedgerDigest: mocks.readLedgerDigest,
      readRunVisibility: mocks.readRunVisibility
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  getDebateServer: mocks.getDebateServer
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("t".repeat(43))
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: name === LOCALE_COOKIE ? mocks.locale : "t".repeat(43) })
  }),
  headers: async () => new Headers({ "user-agent": "vitest-render-browser" })
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePage from "../../apps/ui/app/debate/[id]/page.js";
import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import type { ResolvedFloor } from "../../apps/ui/lib/v3/floorAnswer.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** A catalogue value that must exist: a missing key fails here, never as undefined equal to undefined. */
function words(catalog: Record<string, string>, key: string): string {
  const value = catalog[key];
  if (value === undefined) throw new Error(`catalogue lacks ${key}`);
  return value;
}

const LEADING = STORY_FIXTURE_ANSWER.nodes.find((node) => node.node_id === "n-hybrid")!;
const COMPONENTS_ONLY_WORDS = composeEnglish["compose.v3.componentsOnlyVerdict"];

const FLOOR_ANSWER: Answer = {
  ...STORY_FIXTURE_ANSWER,
  terminal: "COMPONENTS_ONLY",
  serve_state: "COMPONENTS_ONLY",
  verdict_state: null,
  verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" },
  confidence_band: null,
  band_ceiling: null,
  composed_text: []
};
const FLOOR: AnswerFloor = { verdict_state: "CONTESTED", leading_node_id: "n-hybrid", basis_incomplete: false };
const THIN_FLOOR: AnswerFloor = { ...FLOOR, basis_incomplete: true };

function disclosureOf(floor: AnswerFloor | null): AnswerDisclosure {
  return {
    answer_id: STORY_FIXTURE_DEBATE_ID,
    answer_version: 1,
    floor,
    floor_reason: floor === null ? null : "ENVELOPE_EXHAUSTED",
    writer: null,
    checker: null,
    checker_same_as_writer: false,
    digest: null,
    cut_short: { arguing: null, answer_writing: "MONEY" }
  };
}

const notFound = () => Promise.reject(new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"));

let root: Root | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await flush();
  return container;
}

type OwnerProps = Readonly<{
  answer: Answer;
  initialFloor: AnswerFloor | null;
  storyLocale?: LocaleCode;
}>;

function owner(props: OwnerProps): ReactElement {
  return (
    <DebatePageClient
      id={STORY_FIXTURE_DEBATE_ID}
      initialDebate={debateDetailFromAnswer(props.answer)}
      initialAnswer={props.answer}
      initialFloor={props.initialFloor}
      timeCatalog={{}}
      questionLocale="ro"
      storyLocale={props.storyLocale ?? "ro"}
      storyCatalog={publicRomanian}
    />
  );
}

function verdictOf(container: HTMLElement): HTMLElement {
  const verdict = container.querySelector<HTMLElement>(".synthVerdictBody");
  if (verdict === null) throw new Error("no verdict area");
  return verdict;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  mocks.locale = "en";
  mocks.readAnswerStory.mockReset().mockResolvedValue(storyFixture("WRITING"));
  mocks.readRun.mockReset().mockResolvedValue({
    run_ref: STORY_FIXTURE_ANSWER.run_ref,
    question_line: STORY_FIXTURE_ANSWER.question_line,
    state: "SETTLED",
    terminal_reason: null,
    hold_until: null,
    argument_language: { tag: "ro", name: "Romanian" }
  });
  mocks.readRunAnswer.mockReset().mockResolvedValue(FLOOR_ANSWER);
  mocks.readAnswer.mockReset();
  mocks.readAnswerDisclosure.mockReset().mockResolvedValue(disclosureOf(FLOOR));
  mocks.readEvents.mockReset().mockResolvedValue([]);
  mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
  mocks.streamEvents.mockReset().mockImplementation(async (_runRef: string, _emit: (event: RunEvent) => void) => {
    await new Promise<void>(() => {});
  });
  mocks.getDebateServer.mockReset();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the owner's page shows a floor answer as an answer (§14.4.4)", () => {
  it("shows the label in words, 'Our best answer:' and the leading position's statement, never 'Components-only'", async () => {
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: FLOOR }));
    const verdict = verdictOf(container);
    // The verdict area's fixed words follow the interface (English); the statement is the debate's own (Romanian).
    expect(verdict.querySelector(".floorAnswerLabel")?.textContent).toBe(words(publicEnglish, "public.story.label.contested"));
    expect(verdict.querySelector(".floorAnswerLead")?.textContent).toBe("Our best answer:");
    expect(verdict.querySelector(".floorAnswerStatement")?.textContent).toBe(LEADING.claim);
    expect(verdict.querySelector(".floorAnswerStatement")?.getAttribute("lang")).toBe("ro");
    expect(verdict.querySelector(".floorAnswerNote")).toBeNull();
    expect(container.textContent).not.toContain("Components-only");
    expect(container.textContent).not.toContain(COMPONENTS_ONLY_WORDS);
    expect(mocks.readAnswerDisclosure).toHaveBeenCalledWith(STORY_FIXTURE_DEBATE_ID);
  });

  it("says plainly when the label had less than usual to compare", async () => {
    mocks.readAnswerDisclosure.mockResolvedValue(disclosureOf(THIN_FLOOR));
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: THIN_FLOOR }));
    expect(verdictOf(container).querySelector(".floorAnswerNote")?.textContent).toBe("We had less to compare than usual for this answer.");
  });

  it("learns the floor from its own refresh when the server read none", async () => {
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: null }));
    expect(verdictOf(container).querySelector(".floorAnswerStatement")?.textContent).toBe(LEADING.claim);
    expect(container.textContent).not.toContain(COMPONENTS_ONLY_WORDS);
  });

  it("keeps the floor it has when a refresh cannot read the record", async () => {
    mocks.readAnswerDisclosure.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "boom"));
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: FLOOR }));
    expect(verdictOf(container).querySelector(".floorAnswerStatement")?.textContent).toBe(LEADING.claim);
  });

  it("renders a components-only answer without a floor exactly as today", async () => {
    mocks.readAnswerDisclosure.mockImplementation(notFound);
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: null }));
    expect(verdictOf(container).textContent).toBe(COMPONENTS_ONLY_WORDS);
    expect(container.querySelector(".floorAnswer")).toBeNull();
    expect(container.textContent).toContain(composeEnglish["compose.v3.completion.componentsOnly"]);
  });

  it("never reads a record for a served answer, and shows its prose", async () => {
    mocks.readRunAnswer.mockResolvedValue(STORY_FIXTURE_ANSWER);
    const container = await mount(owner({ answer: STORY_FIXTURE_ANSWER, initialFloor: null }));
    expect(container.querySelector(".floorAnswer")).toBeNull();
    expect(verdictOf(container).textContent).toContain(STORY_FIXTURE_ANSWER.composed_text[0]!.text);
    expect(mocks.readAnswerDisclosure).not.toHaveBeenCalled();
  });

  it("gives the story strip the floor's label, and the floor answer in the question's language while the story is written", async () => {
    mocks.readAnswerDisclosure.mockResolvedValue(disclosureOf(THIN_FLOOR));
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: THIN_FLOOR }));
    const panel = container.querySelector<HTMLElement>("section.storyPanel");
    expect(panel?.getAttribute("data-story-status")).toBe("WRITING");
    expect(panel?.querySelector(".storyPanelLabel")?.textContent).toBe("Decizie strânsă");
    const interim = panel?.querySelector(".floorAnswer");
    expect(interim?.querySelector(".floorAnswerLead")?.textContent).toBe(words(publicRomanian, "public.story.floorLead"));
    expect(interim?.querySelector(".floorAnswerStatement")?.textContent).toBe(LEADING.claim);
    expect(interim?.querySelector(".floorAnswerNote")?.textContent).toBe(words(publicRomanian, "public.story.floorThinBasis"));
    // The pill already says the label: the strip does not say it twice.
    expect(interim?.querySelector(".floorAnswerLabel")).toBeNull();
  });

  it("gives a READY story of a floor answer the floor's label", async () => {
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: FLOOR }));
    const panel = container.querySelector<HTMLElement>("section.storyPanel");
    expect(panel?.getAttribute("data-story-status")).toBe("READY");
    expect(panel?.querySelector(".storyPanelLabel")?.textContent).toBe("Decizie strânsă");
    expect(panel?.querySelector(".floorAnswer")).toBeNull();
  });

  it("keeps a ready floor story's label in the strip when the record cannot be read (fix round 1)", async () => {
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    mocks.readAnswerDisclosure.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "boom"));
    const container = await mount(owner({ answer: FLOOR_ANSWER, initialFloor: null }));
    const panel = container.querySelector<HTMLElement>("section.storyPanel");
    expect(panel?.getAttribute("data-story-status")).toBe("READY");
    expect(panel?.querySelector(".storyPanelLabel")?.textContent).toBe("Decizie strânsă");
  });

  it("tells both drawers when the page shows a floor (fix round 1)", () => {
    const owner = readFileSync(resolve(process.cwd(), "apps/ui/app/debate/[id]/DebatePageClient.tsx"), "utf8");
    expect(owner).toMatch(/<AnswerHonestyDrawer[\s\S]*?floorShown=\{floorView !== null\}/u);
    const publicPage = readFileSync(resolve(process.cwd(), "apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx"), "utf8");
    expect(publicPage).toMatch(/<PublicHonestyDrawer[\s\S]*?floorShown=\{publicFloor !== null\}/u);
  });

  it("hands the server's floor to the page (page.tsx)", async () => {
    mocks.getDebateServer.mockResolvedValue({
      ok: true,
      debate: debateDetailFromAnswer(FLOOR_ANSWER),
      answer: FLOOR_ANSWER,
      questionLanguage: { tag: "ro", name: "Romanian" },
      floor: THIN_FLOOR
    });
    const page = await DebatePage({ params: Promise.resolve({ id: STORY_FIXTURE_DEBATE_ID }), searchParams: Promise.resolve({}) });
    const markup = renderToStaticMarkup(page as ReactElement);
    expect(markup).toContain("Our best answer:");
    expect(markup).toContain(words(publicEnglish, "public.story.floorThinBasis"));
    expect(markup).not.toContain("Components-only");
  });
});

/** A published components-only debate, argued in Romanian, read by an English reader. */
function snapshot(floor: AnswerFloor | undefined) {
  return PublicDebateSchema.parse({
    public_ref: "22222222-2222-4222-8222-222222222222",
    author_pseudonym: "Stable Public Author",
    question: STORY_FIXTURE_ANSWER.question_line,
    published_at: "2026-09-26T10:00:00.000Z",
    answer: {
      terminal: "COMPONENTS_ONLY",
      verdict: null,
      verdict_available: false,
      confidence_band: null,
      summary_segments: [],
      badges: [],
      residual_objections: [],
      reversal_point: "O locuință mai ieftină în Cluj.",
      as_of: "2026-09-26T09:00:00.000Z",
      tree_included: true,
      nodes: STORY_FIXTURE_ANSWER.nodes.map((node) => ({ ...node, node_id: node.node_id === "n-hybrid" ? LEADING_GUID : node.node_id, disagreement: null })),
      edges: []
    },
    language: "ro",
    ...(floor === undefined ? {} : { floor: { ...floor, leading_node_id: LEADING_GUID } })
  });
}
const LEADING_GUID = "33333333-3333-4333-8333-333333333333";

describe("the public page shows the same floor answer, in the question's language", () => {
  async function overview(floor: AnswerFloor | undefined): Promise<HTMLElement> {
    return mount(
      <PublicDebateOverview
        debate={snapshot(floor)}
        catalog={publicEnglish}
        storyCatalog={publicRomanian}
        storyLocale="ro"
        onDetails={() => undefined}
        onRead={() => undefined}
      />
    );
  }

  it("shows the label, 'Our best answer:' and the statement in Romanian, with the thin-basis line", async () => {
    const container = await overview(THIN_FLOOR);
    const pill = container.querySelector("#public-verdict-label");
    expect(pill?.textContent).toBe("Decizie strânsă");
    expect(pill?.getAttribute("lang")).toBe("ro");
    const text = container.querySelector(".publicVerdictText")!;
    expect(text.querySelector(".floorAnswerLead")?.textContent).toBe(words(publicRomanian, "public.story.floorLead"));
    expect(text.querySelector(".floorAnswerStatement")?.textContent).toBe(LEADING.claim);
    expect(text.querySelector(".floorAnswerNote")?.textContent).toBe(words(publicRomanian, "public.story.floorThinBasis"));
    expect(container.textContent).not.toContain(words(publicEnglish, "public.overview.composedVerdictUnavailable"));
  });

  it("renders a snapshot without a floor as today", async () => {
    const container = await overview(undefined);
    expect(container.querySelector("#public-verdict-label")?.textContent).toBe(words(publicEnglish, "public.overview.verdictUnavailable"));
    expect(container.querySelector(".floorAnswer")).toBeNull();
    expect(container.querySelector(".publicVerdictText")?.textContent).toBe(words(publicEnglish, "public.overview.composedVerdictUnavailable"));
  });

  it("shows the floor in the public workspace's verdict area with the question's words", async () => {
    const debate = snapshot(FLOOR);
    // What the public page resolves from the snapshot (resolveFloor, tests/unit/m6-floor-answer.test.ts).
    const publicFloor: ResolvedFloor = { label: "CONTESTED", leadingNodeId: LEADING_GUID, statement: LEADING.claim, basisIncomplete: false };
    const container = await mount(
      <DebatePageClient
        id={debate.public_ref}
        initialDebate={debateDetailFromAnswer({ ...FLOOR_ANSWER, answer_id: debate.public_ref })}
        initialAnswer={null}
        timeCatalog={{}}
        publicMode
        publicFloor={publicFloor}
        questionLocale="ro"
        storyLocale="ro"
        storyCatalog={publicRomanian}
      />
    );
    const verdict = verdictOf(container);
    expect(verdict.querySelector(".floorAnswerLabel")?.textContent).toBe("Decizie strânsă");
    expect(verdict.querySelector(".floorAnswerLead")?.textContent).toBe(words(publicRomanian, "public.story.floorLead"));
    expect(verdict.querySelector(".floorAnswer")?.getAttribute("lang")).toBe("ro");
    expect(container.textContent).not.toContain("Components-only");
    expect(mocks.readAnswerDisclosure).not.toHaveBeenCalled();
  });

  it("wires the snapshot's floor into the public workspace (PublicDebatePageClient)", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx"), "utf8");
    expect(source).toMatch(/publicFloor=\{publicFloor\}/);
    expect(source).toMatch(/resolveFloor\(publicFloorHost\(debate\.answer\), debate\.floor\)/);
  });
});

/**
 * M6 review carry (Task M8). The owner's answer carries condition records whose
 * reasons name owner-only stop causes (a vendor that reported no usage, the
 * budget). A public node pill must never word itself by them: the page hands
 * the node drawer no records in public mode, even if an answer were ever
 * loaded there, so the pill reads the neutral words.
 */
describe("a public node pill never names an owner-only stop cause", () => {
  it("hands the node drawer no records in public mode, even with an answer loaded", async () => {
    const usageStop: Answer["condition_mark_records"][number] = {
      mark: "ENVELOPE_EXHAUSTED", scope: "answer", subject_ref: "run:story", reason: "PROVIDER_USAGE_UNREPORTED",
      lift_path: null, served_root_rule: null, call_site_key: null, planned_leg_count: null,
      terminal_transport_outcome: null, review_outcome: null, hidden_strength: null, hidden_score_threshold: null,
      hidden_score_threshold_source_ref: null, excluded_from_served_number: null, judged_basis_count: null,
      affected_node_ids: ["n-yes"]
    };
    const answer: Answer = {
      ...STORY_FIXTURE_ANSWER,
      condition_marks: [...STORY_FIXTURE_ANSWER.condition_marks, "ENVELOPE_EXHAUSTED"],
      condition_mark_records: [usageStop]
    };
    const stopped = { ...answer.nodes.find((node) => node.node_id === "n-yes")!, condition_marks: ["ENVELOPE_EXHAUSTED" as const] };
    const container = await mount(
      <DebatePageClient
        id={STORY_FIXTURE_DEBATE_ID}
        initialDebate={debateDetailFromAnswer(answer)}
        initialAnswer={answer}
        timeCatalog={{}}
        publicMode
        publicNodesById={contractNodesById({ nodes: [stopped] })}
        publicOverview={({ onRead }) => <button type="button" data-test-read onClick={() => onRead("n-yes")}>read</button>}
        storyLocale="en"
        storyCatalog={publicEnglish}
      />
    );
    await act(async () => container.querySelector<HTMLButtonElement>("[data-test-read]")!.click());
    await flush();
    const pill = container.querySelector<HTMLElement>('.drawerConditionPill[title="ENVELOPE_EXHAUSTED"]');
    expect(pill?.textContent).toBe("Ended early");
    expect(container.textContent).not.toContain("problem with an AI service");
    expect(container.textContent).not.toContain("to stay within budget");
  });
});

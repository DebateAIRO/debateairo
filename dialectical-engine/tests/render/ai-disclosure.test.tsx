// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "../../apps/ui/components/landing/LandingPage.js";
import { DebateCanvas } from "../../apps/ui/components/DebateCanvas.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { PublicDebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import AiTransparencyPage from "../../apps/ui/app/ai-transparency/page.js";
import { Assistant, type SupportAssistantClient } from "../../apps/ui/components/support/Assistant.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { availablePaymentMarks } from "../../apps/ui/lib/billing/paymentMarks.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import homeEnglish from "../../apps/ui/messages/en/home.json" with { type: "json" };
import settingsEnglish from "../../apps/ui/messages/en/settings.json" with { type: "json" };
import supportEnglish from "../../apps/ui/messages/en/support.json" with { type: "json" };
import { resetSupportOfferedForTests, SUPPORT_OFFERED_STORAGE_KEY } from "../../apps/ui/components/support/availability.js";
import type { ReactElement } from "react";
import { DebateMap } from "../../apps/ui/components/DebateMap.js";
import { RecommendedInvestigations } from "../../apps/ui/components/RecommendedInvestigations.js";
import { DebateWorkspaceDrawer } from "../../apps/ui/components/DebateWorkspaceDrawer.js";
import { InvestigationDrawer } from "../../apps/ui/components/InvestigationDrawer.js";
import { I18nProvider } from "../../apps/ui/lib/i18n/I18nProvider.js";
import { V4ContributionNote } from "../../apps/ui/components/v4/V4ContributionNote.js";
import { V4SignInAgain } from "../../apps/ui/components/v4/V4LoadingOutline.js";
import { V4WaitCard } from "../../apps/ui/components/v4/V4WaitCard.js";
import type { DebateDetail, RecommendedInvestigation } from "../../apps/ui/lib/types.js";
import v4English from "../../apps/ui/messages/en/v4.json" with { type: "json" };

describe("AI disclosure at the point of use", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(SUPPORT_OFFERED_STORAGE_KEY, "true");
    resetSupportOfferedForTests();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetSupportOfferedForTests();
  });

  it("makes the linked explanation available without signing in", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    try {
      await act(async () => root.render(await AiTransparencyPage()));
      const html = container.innerHTML;
    expect(html).toContain(settingsEnglish["settings.transparency.title"]);
    expect(settingsEnglish["settings.transparency.title"]).toBe("How we label AI content");
    expect(html).toContain("How we label AI content");
    expect(html).toContain("ai_disclosure");
    expect(html).toContain('href="/help"');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("keeps AI markings on the scores when an argument is opened in the drawer", () => {
    const answer = buildFairShapedAnswer();
    const detail = debateDetailFromAnswer(answer);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<NodeDetailDrawer
      node={detail.tree!.children[0]!} v3={answer.nodes[0]!} token={null}
      onClose={() => {}} onFocusRecommendationNode={() => false} canFocusRecommendationNode={() => false}
      onQueued={() => {}} onError={() => {}} onAuthRejected={() => {}}
    />);
    for (const label of ["BASE SCORE", "FINAL STRENGTH"]) {
      const row = [...container.querySelectorAll("tr")].find((row) => row.querySelector("th")?.textContent === label)!;
      expect(row.querySelector("td")?.closest('[data-ai-generated="true"]')).not.toBeNull();
    }
    expect(container.querySelector(".drawerFreshness")?.closest('[data-ai-generated="true"]')).toBeNull();
  });

  it("marks the public library verdict and confidence without marking the author's question", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<PublicDebatesBuffer debates={[{
      public_ref: "33333333-3333-4333-8333-333333333333", author_pseudonym: "Asker",
      question: "A human question", published_at: "2026-08-24T00:00:00.000Z",
      verdict: "CONTESTED", confidence_band: "bounded", models: []
    }]} />);
    expect(container.querySelector(".libStatus")?.closest('[data-ai-generated="true"]')).not.toBeNull();
    expect(container.querySelector('.libRowMeta [data-ai-generated="true"]')?.textContent).toContain("bounded");
    expect(container.querySelector(".libRowClaim")?.closest('[data-ai-generated="true"]')).toBeNull();
  });

  it("identifies AI output before the landing samples and exposes the full transparency notice", () => {
    const container = document.createElement("div");
    // The props app/page.tsx gives it: the home and chrome catalogues, no price read, billing off.
    container.innerHTML = renderToStaticMarkup(<LandingPage catalog={{ ...homeEnglish, ...chromeEnglish }} lowestPaidPrice={null}
      footerBilling={{ billingOn: false, marks: availablePaymentMarks() }} />);
    const hero = container.querySelector('[data-landing-section="hero"]')!;
    expect(hero.textContent).toContain("AI-generated content.");
    const transparency = container.querySelector("#ai-transparency");
    expect(transparency?.textContent).toContain("No human editorial review");
    expect(transparency?.textContent).toContain("may be inaccurate or incomplete");
    expect(transparency?.querySelector('a[href="/ai-transparency"]')).not.toBeNull();
  });

  it("marks generated arguments without marking the user's root claim", () => {
    const detail = debateDetailFromAnswer(buildFairShapedAnswer());
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<DebateCanvas
      root={detail.tree!} expanded={new Set()} selectedNodeId={null}
      meta={{ claims: 1, depth: 1, judged: 1, derivedStanding: 1, setAside: 0 }}
      onOpenNode={() => {}} onChallengeNode={() => {}} onToggleExpand={() => {}}
    />);
    const argument = container.querySelector(`[data-node-id="${detail.tree!.children[0]!.id}"]`)!;
    const question = container.querySelector(`[data-node-id="${detail.tree!.id}"]`)!;
    expect(argument.getAttribute("data-ai-generated")).toBe("true");
    expect(question.closest('[data-ai-generated="true"]')).toBeNull();
  });

  it.each([false, true])("discloses AI before the first support message (full page: %s)", (fullPage) => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<Assistant fullPage={fullPage} signedIn={false} />);
    const notice = container.querySelector('[aria-label="AI disclosure"]');
    const conversation = container.querySelector('[aria-label="Support conversation"]')!;
    expect(notice?.textContent).toContain("This conversation is with an AI support agent.");
    expect(notice?.textContent).toContain("can be wrong");
    expect(notice?.textContent).toContain(supportEnglish["support.aiBanner"]);
    expect(notice!.compareDocumentPosition(conversation) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("marks a model reply but keeps user messages and fixed support notices distinct", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client: SupportAssistantClient = {
      sendMessage: async () => ({ outcome: "ANSWER_GROUNDED", text: "A generated reply", link: "/new" })
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Assistant client={client} signedIn={false} />));
      expect(container.querySelector('[data-ai-generated="true"]')).toBeNull();
      await act(async () => {
        container.querySelector<HTMLInputElement>('[name="support-message"]')!.value = "How do I start?";
        container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      const generated = container.querySelector('[data-ai-generated="true"]');
      expect(generated?.textContent).toContain("A generated reply");
      expect(container.querySelector('[data-role="user"]')?.closest('[data-ai-generated="true"]')).toBeNull();
      expect(container.querySelector(".supportCitation")?.textContent).toContain("AI ·");
      // Dev's citation copy, byte for byte.
      expect(container.querySelector(".supportCitation")?.textContent).toContain("AI · DOCS · PRODUCT GUIDE");
      expect(container.querySelector(".supportCitation a")?.textContent).toBe("View source →");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

/*
 * EU AI Act Art. 50(2): every AI-generated text sits inside data-ai-generated="true"; the person's own question never does,
 * even when its words first came from an AI (the owner: "Never mark the question"; settings.transparency.machineReadableMiddle).
 */
describe("machine-readable marks: AI text marked, the person's question never", () => {
  const html = (element: ReactElement): HTMLElement => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<I18nProvider locale="en" catalog={chromeEnglish}>{element}</I18nProvider>);
    return container;
  };
  const marked = (element: Element | null | undefined): boolean => element?.closest('[data-ai-generated="true"]') != null;

  it("the reference map marks each AI claim's segment (its label and title), never the question's hub", () => {
    const detail = debateDetailFromAnswer(buildFairShapedAnswer());
    const root = html(<DebateMap root={detail.tree!} onOpenSplit={() => {}} />);
    const arcs = [...root.querySelectorAll("svg path[role=button]")];
    expect(arcs.length).toBeGreaterThan(0);
    for (const arc of arcs) {
      expect(marked(arc)).toBe(true);
      expect(marked(arc.querySelector("title"))).toBe(true);
    }
    expect(marked(root.querySelector("svg circle[role=button]"))).toBe(false);
  });

  it("marks a recommended investigation's reason, not the site's own words around it", () => {
    const recommendations = [{ action: "find_evidence", reason: "A generated reason.", priority: 1, target_node_id: "node:1" }] as unknown as RecommendedInvestigation[];
    const root = html(<RecommendedInvestigations recommendations={recommendations} />);
    expect(root.querySelector(".recommendationReason")?.getAttribute("data-ai-generated")).toBe("true");
    expect(marked(root.querySelector(".recommendationMeta"))).toBe(false);
    expect(marked(root.querySelector(".recommendationActions"))).toBe(false);
  });

  it("the workspace drawer marks what the analyzers and agents wrote, not their fallbacks", () => {
    const debate = {
      analyzer_runs: [{ id: "a1", analyzer_type: "fallacy", status: "done", output: { findings: ["An AI finding."] }, provenance: {} }],
      agent_runs: [{ id: "g1", agent_name: "Agent", role: "pro", status: "done", summary: "An AI summary.", agent: {}, skills_used: [],
        pros: ["An AI pro."], cons: ["An AI con."], provenance: {} }]
    } as unknown as DebateDetail;
    const root = html(<DebateWorkspaceDrawer debate={debate} singleShot={null} onClose={() => {}} />);
    const textOf = (words: string) => [...root.querySelectorAll("p, li")].find((element) => element.textContent === words);
    for (const words of ["An AI finding.", "An AI summary.", "An AI pro.", "An AI con."]) expect(marked(textOf(words)), words).toBe(true);
    expect(marked(root.querySelector("h3"))).toBe(false);
    const empty = { analyzer_runs: [{ id: "a2", analyzer_type: "fallacy", status: "done", output: {}, provenance: {} }], agent_runs: [] } as unknown as DebateDetail;
    const none = html(<DebateWorkspaceDrawer debate={empty} singleShot={null} onClose={() => {}} />);
    expect(none.querySelector('[data-ai-generated="true"]')).toBeNull();
  });

  it("the investigation drawer marks the flagged AI claim and its flagged words, never the question itself", () => {
    const detail = debateDetailFromAnswer(buildFairShapedAnswer());
    const argument = detail.tree!.children[0]!;
    const root = html(<InvestigationDrawer node={argument} status="working" flagged="some words" onClose={() => {}} onResolve={() => {}} onClear={() => {}} />);
    expect(marked(root.querySelector(".invFlaggedClaim"))).toBe(true);
    const span = root.querySelector(".invFlaggedSpan")!;
    expect(span.querySelector('[data-ai-generated="true"]')?.textContent).toBe("some words");
    expect(marked(span)).toBe(false);
    const question = html(<InvestigationDrawer node={detail.tree!} status="working" flagged="words" onClose={() => {}} onResolve={() => {}} onClear={() => {}} />);
    expect(question.querySelector('[data-ai-generated="true"]')).toBeNull();
  });

  it("a dig's rewrite of a public path is AI text; the note's own words are not", () => {
    const contribution = { public_ref: "f1000000-0000-4000-8000-000000000001", state: "KEPT_PRIVATE",
      rewrite: { line: "A rewritten line.", summary: "What the rewrite says.", fate: "PARTLY_HELD", what_changed: ["One thing changed."] } };
    const root = html(<V4ContributionNote contribution={contribution as never} catalog={v4English} />);
    const rewrite = root.querySelector("[data-contribution-rewrite=READY]")!;
    for (const words of ["A rewritten line.", "What the rewrite says.", "One thing changed."]) {
      const element = [...rewrite.querySelectorAll("p, li, strong")].find((node) => node.textContent === words);
      expect(marked(element), words).toBe(true);
    }
    expect(marked(rewrite.querySelector("h3"))).toBe(false);
    expect(marked(root.querySelector(".v4ContributionNote"))).toBe(false);
  });

  it("the sign-in-again card and the waiting card show the question and the one gone back to unmarked", () => {
    const signIn = html(<V4SignInAgain questionLine="Should we do the thing?" signInHref="/login" catalog={v4English} />);
    expect(signIn.textContent).toContain("Should we do the thing?");
    expect(signIn.querySelector('[data-ai-generated="true"]')).toBeNull();
    const wait = html(<V4WaitCard state={{ kind: "LOOKING" }} question="Should we do the thing?" back={{ href: "/v4/debate/p", question: "The earlier question?" }}
      catalog={v4English} locale="en" />);
    expect(wait.textContent).toContain("The earlier question?");
    expect(wait.querySelector(".v4WaitQuestion")?.textContent).toBe("Should we do the thing?");
    expect(wait.querySelector('[data-ai-generated="true"]')).toBeNull();
  });
});

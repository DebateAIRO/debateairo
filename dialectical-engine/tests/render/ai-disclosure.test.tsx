// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "../../apps/ui/components/landing/LandingPage.js";
import { DebateCanvas } from "../../apps/ui/components/DebateCanvas.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { PublicDebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import AiTransparencyPage from "../../apps/ui/app/ai-transparency/page.js";
import { Assistant, type SupportAssistantClient } from "../../apps/ui/components/support/Assistant.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

describe("AI disclosure at the point of use", () => {
  it("makes the linked explanation available without signing in", () => {
    const html = renderToStaticMarkup(<AiTransparencyPage />);
    expect(html).toContain("How we label AI content");
    expect(html).toContain("ai_disclosure");
    expect(html).toContain('href="/help"');
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
    container.innerHTML = renderToStaticMarkup(<LandingPage />);
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
    expect(notice!.compareDocumentPosition(conversation) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("marks a model reply but keeps user messages and fixed support notices distinct", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client: SupportAssistantClient = {
      createSession: async () => ({ sessionId: "session-1", token: "token-1", identityBound: false }),
      sendMessage: async () => ({ messageId: "reply-1", outcome: "ANSWER_GROUNDED", text: "A generated reply", link: "/new" }),
      rate: async () => {},
      escalate: async () => ({ token: "case-1", text: "Case opened" })
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
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

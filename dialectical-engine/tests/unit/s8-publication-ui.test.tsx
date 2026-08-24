import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { PublicAnswerDisclosure as ApplicationDisclosure } from "../../apps/ui/components/PublicAnswerDisclosure.js";
import { PublicAnswerDisclosure as WebDisclosure } from "../../web/components/PublicAnswerDisclosure.js";

describe("S8 duplicated public readers", () => {
  it("renders downgraded limitations and the evidence time basis in both compositions", () => {
    const answer = PublicDebateSchema.parse({
      public_ref: "0c0ea1f8-c4a5-4b84-9489-01da731b6a1a",
      author_pseudonym: "stable-public-name",
      question: "What is visible?",
      published_at: "2026-08-24T00:00:00.000Z",
      answer: {
        terminal: "COMPONENTS_ONLY",
        verdict: null,
        verdict_available: false,
        confidence_band: null,
        summary_segments: [{ text: "Only available components are shown." }],
        badges: [],
        residual_objections: [],
        reversal_point: "A complete settlement.",
        as_of: "2026-08-23T12:34:56.000Z"
      }
    }).answer;
    for (const Disclosure of [ApplicationDisclosure, WebDisclosure]) {
      const html = renderToStaticMarkup(<Disclosure answer={answer} />);
      expect(html).toContain("Answer status: COMPONENTS_ONLY");
      expect(html).toContain("Verdict unavailable in this published serving mode.");
      expect(html).toContain("Evidence as of");
      expect(html).toContain("2026");
    }
  });
});

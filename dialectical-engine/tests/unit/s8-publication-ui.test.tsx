import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicDebateSchema } from "@debateai/contract";
import { PublicAnswerDisclosure as ApplicationDisclosure } from "../../apps/ui/components/PublicAnswerDisclosure.js";

describe("S8 duplicated public readers", () => {
  it("renders downgraded limitations and the evidence time basis in both compositions", () => {
    const englishPublic = JSON.parse(
      readFileSync(resolve(process.cwd(), "apps/ui/messages/en/public.json"), "utf8")
    ) as Readonly<Record<string, string>>;
    const disclosureSource = readFileSync(
      resolve(process.cwd(), "apps/ui/components/PublicAnswerDisclosure.tsx"),
      "utf8"
    );
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
    const expectedEvidenceDate = new Intl.DateTimeFormat("en", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(answer.as_of));
    for (const [key, english] of [
      ["public.disclosure.answerStatus", "Answer status: {status}"],
      ["public.disclosure.verdictUnavailableMode", "Verdict unavailable in this published serving mode."],
      ["public.disclosure.evidenceAsOf", "Evidence as of {date}."],
      [
        "public.disclosure.indexing",
        "Published debates may be indexed by search engines. Copies may persist after unpublishing."
      ]
    ] as const) {
      expect(disclosureSource).toContain(`t(catalog, "${key}"`);
      expect(englishPublic[key], `${key} English catalogue value`).toBe(english);
    }
    for (const Disclosure of [ApplicationDisclosure]) {
      const html = renderToStaticMarkup(
        <Disclosure answer={answer} catalog={englishPublic} locale="en" />
      );
      expect(html).toContain("Answer status: COMPONENTS_ONLY");
      expect(html).toContain("Verdict unavailable in this published serving mode.");
      expect(html).toContain(`Evidence as of ${expectedEvidenceDate}.`);
      expect(html).toContain("may be indexed by search engines");
      expect(html).toContain("Copies may persist after unpublishing");
    }
  });
});

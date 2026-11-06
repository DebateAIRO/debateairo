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
    // English pages write the day first on the 24-hour clock (owner's answer to question 5, 5 Nov 2026), and the evidence
    // date in the long form with the year, its clock in the 24-hour form (question 4 A). The third round (5 Nov afternoon):
    // only the data download, the sign-in link email and the classic report PDF keep "at"; pages keep the comma, so the
    // public page writes "23 August 2026, 12:34".
    const when = new Date(answer.as_of);
    const expectedEvidenceDate = `${new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(when)}, ${
      new Intl.DateTimeFormat("en-GB", { timeStyle: "short", hourCycle: "h23" }).format(when)}`;
    expect(expectedEvidenceDate).toMatch(/^\d{1,2} August 2026, \d{2}:\d{2}$/u);
    for (const [key, english] of [
      ["public.disclosure.answerStatus", "Answer status: {status}"],
      ["public.disclosure.verdictUnavailableMode", "Verdict unavailable in this published serving mode."],
      ["public.disclosure.evidenceAsOf", "Evidence as of {date}."],
      [
        "public.disclosure.indexing",
        "Published debates may be indexed by search engines, and copies may remain elsewhere."
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
      expect(html).not.toMatch(/Evidence as of [^.]* at /u);
      expect(html).toContain("may be indexed by search engines");
      expect(html).toContain("copies may remain elsewhere");
    }
  });
});

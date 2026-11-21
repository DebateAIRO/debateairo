import { describe, expect, it } from "vitest";
import { legalText } from "../support/legalText.js";

/**
 * We send no marketing email: there is no box at sign-up, no Settings control and no unsubscribe link. So the English
 * Privacy Policy must not promise any of them: no "Sending you product news" row in section 4, no right to object to
 * marketing, no marketing consent to withdraw, and no sentence on marketing email under CASL in Annex B.3.
 */

/** English: each pair is [the wording that promised it, the wording the text carries now]. */
const MARKETING: readonly (readonly [string, string])[] = [
  [
    "| Sending you product news | Email address | **Consent** — Art. 6(1)(a), an unticked box; withdraw any time from any email or from Settings |\n| Meeting tax,",
    "| Meeting tax,"
  ],
  ["section 6 says how we decide. Object to marketing at any time, and we stop |", "section 6 says how we decide |"],
  [
    "| Withdraw marketing consent from any email or from Settings; withdraw the sensitive-data consent",
    "| Withdraw the sensitive-data consent"
  ],
  [
    "including lawful access by authorities. Marketing email is sent only with your express consent under CASL. We report",
    "including lawful access by authorities. We report"
  ]
];

describe("Privacy Policy: no marketing promises", () => {
  it("English carries each line without its marketing promise, once", () => {
    const text = legalText("PRIVACY", "en");
    for (const [gone, now] of MARKETING) {
      expect(text.split(now), now.slice(0, 50)).toHaveLength(2);
      expect(text, gone.slice(0, 50)).not.toContain(gone);
    }
    expect(text).not.toMatch(/product news \|/u);
    expect(text).not.toMatch(/\bCASL\b/u);
  });
});

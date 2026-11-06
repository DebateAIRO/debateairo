import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnswerMainAnswer } from "../../packages/contract/src/index.js";
import { V4MainAnswer } from "../../apps/ui/components/v4/V4MainAnswer.js";

/*
 * The owner's answer to question 4 (5 Nov 2026, A): dates take the long form with the year ("Version 2 · written 3
 * November 2026", report-f13), "updated" among them, so the main answer's "Updated on …" and each earlier version's date
 * read "3 November 2026", never all in numbers (the wave-4 checks: "05/11/2026" reads as May 11 to a United States reader).
 */
const V4 = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const version = (number: number, at: string) => ({
  version: number, updated_at: at, trigger: "PATH_REWRITE" as const, position_ref: "n-mix", segments: [{ text: "An answer." }]
});

describe("question 4 A: the V4 main answer's dates", () => {
  it.each(["en", "en-US", "en-GB"])("%s: 'Updated on' and the earlier versions use the long form with the year", (locale) => {
    const mainAnswer = {
      current: version(2, "2026-11-03T10:00:00.000Z"),
      history: [version(1, "2026-10-29T10:00:00.000Z"), version(2, "2026-11-03T10:00:00.000Z")]
    } as unknown as AnswerMainAnswer;
    const html = renderToStaticMarkup(<V4MainAnswer mainAnswer={mainAnswer} catalog={V4} locale={locale} />);
    expect(html).toContain(V4["v4.mainAnswer.updated"]!.replace("{date}", "3 November 2026"));
    expect(html).toContain(V4["v4.mainAnswer.version"]!.replace("{version}", "1").replace("{date}", "29 October 2026"));
    expect(html).not.toMatch(/\d+\/\d+\/\d{4}/u);
  });
});

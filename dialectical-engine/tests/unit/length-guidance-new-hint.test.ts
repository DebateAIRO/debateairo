import { readFileSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- the root test compiler has no JSX mode; Vitest transpiles this TSX module.
import { answerLengthHintVars } from "../../apps/ui/app/new/defaults.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";

const MESSAGES = new URL("../../apps/ui/messages/", import.meta.url);
const LOCALES = readdirSync(MESSAGES).sort();
const hintOf = (locale: string): string =>
  (JSON.parse(readFileSync(new URL(`${locale}/newDebate.json`, MESSAGES), "utf8")) as Record<string, string>)["newDebate.answerLengthHint"]!;

describe("the /new answer-length hint (spec §3.8)", () => {
  it("every locale names the three placeholders once each, in order, and no number of its own", () => {
    expect(LOCALES).toHaveLength(35);
    for (const locale of LOCALES) {
      const hint = hintOf(locale);
      const at = ["{short}", "{standard}", "{detailed}"].map((placeholder) => hint.indexOf(placeholder));
      for (const index of at) expect(index, locale).toBeGreaterThan(-1);
      expect(at[0]! < at[1]! && at[1]! < at[2]!, locale).toBe(true);
      for (const placeholder of ["{short}", "{standard}", "{detailed}"]) expect(hint.split(placeholder).length - 1, locale).toBe(1);
      expect(hint.replace(/\{(short|standard|detailed)\}/gu, ""), locale).not.toMatch(/\p{Nd}/u);
    }
  });

  // pre-flight PF-C6.3: with no room read the hint shows the program's start values (OVERVIEW C-1: 200 / 350 / 1,000).
  it("English with no room read", () => {
    expect(t(null, "newDebate.answerLengthHint", answerLengthHintVars(null, "en")))
      .toBe("About 200, 350 or 1,000 words: a target, not a hard limit.");
  });

  it("the plan's words, formatted by the page's language with Latin digits", () => {
    expect(answerLengthHintVars({ short: 250, standard: 800, detailed: 2000 }, "en")).toEqual({ short: "250", standard: "800", detailed: "2,000" });
    expect(answerLengthHintVars(null, "de").detailed).toBe("1.000");
    expect(answerLengthHintVars(null, "ro").detailed).toBe("1.000");
    expect(answerLengthHintVars(null, "ar").detailed).toMatch(/^1\D?000$/u);
    // Explicit words still group by the language: 1,500 in German.
    expect(answerLengthHintVars({ short: 300, standard: 700, detailed: 1500 }, "de").detailed).toBe("1.500");
  });
});

describe("the hint's numbers on any browser (R1c final wave A8, whole-branch review M4)", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("a language the browser has no number data for is formatted in English", () => {
    vi.spyOn(Intl.NumberFormat, "supportedLocalesOf").mockReturnValue([]);
    expect(answerLengthHintVars(null, "de")).toEqual({ short: "200", standard: "350", detailed: "1,000" });
  });

  it("a language the browser knows keeps its own grouping", () => {
    expect(Intl.NumberFormat.supportedLocalesOf("de")).toEqual(["de"]);
    expect(answerLengthHintVars(null, "de").detailed).toBe("1.000");
  });

  it("the element holding the formatted numbers tolerates a server/browser grouping difference (no text change)", () => {
    const page = readFileSync(new URL("../../apps/ui/app/new/NewDebatePageClient.tsx", import.meta.url), "utf8");
    expect(page).toContain("<div className=\"ndHint\" id={`${field}-hint`} suppressHydrationWarning={hintHoldsFormattedNumbers}>{hint}</div>");
    const row = page.slice(page.indexOf("field=\"answerLength\""), page.indexOf("onChange={(value) => setAnswerLength(value as AnswerLength)}"));
    expect(row).toContain("hintHoldsFormattedNumbers");
    expect(page.split("hintHoldsFormattedNumbers\n").length - 1).toBe(1); // only the answer-length row passes it
  });
});

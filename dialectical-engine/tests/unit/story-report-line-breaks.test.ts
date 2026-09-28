import { describe, expect, it } from "vitest";
import { reportBreakPieces, reportBreaksBetween, reportLineBreaker } from "../../apps/ui/lib/report/reportLineBreaks.js";
import { reportWordPieces } from "../../apps/ui/lib/report/reportModel.js";

const LONG_URL =
  "https://www.exemplu-imobiliare.ro/anunturi/inchiriere/cluj-napoca/apartamente-3-camere/zorilor?pret_min=2500&pret_max=4200&sortare=pret&pagina=12&id=9";

describe("where a CJK line may break (lib/report/reportLineBreaks.ts, UAX #14 style)", () => {
  it("breaks between any two ideographs, kana or fullwidth characters", () => {
    expect(reportBreakPieces("我们的答案")).toEqual(["我", "们", "的", "答", "案"]);
    expect(reportBreakPieces("段階的に引っ越す")).toEqual(["段", "階", "的", "に", "引っ", "越", "す"]);
    expect(reportBreakPieces("ＡＢＣ")).toEqual(["Ａ", "Ｂ", "Ｃ"]);
  });

  it("never starts a line with closing punctuation, a small kana or the long-vowel mark, nor ends one with opening punctuation", () => {
    expect(reportBreakPieces("答え。次に")).toEqual(["答", "え。", "次", "に"]);
    expect(reportBreakPieces("「テスト」です")).toEqual(["「テ", "ス", "ト」", "で", "す"]);
    expect(reportBreakPieces("ちょっと")).toEqual(["ちょっ", "と"]);
    expect(reportBreakPieces("モデル、データー")).toEqual(["モ", "デ", "ル、", "デー", "ター"]);
    expect(reportBreakPieces("工资（税后）高")).toEqual(["工", "资", "（税", "后）", "高"]);
    for (const [before, after] of [["答", "。"], ["答", "、"], ["答", "）"], ["（", "答"], ["「", "テ"], ["ち", "ょ"], ["デ", "ー"], ["答", "\u00A0"]]) {
      expect(reportBreaksBetween(before!, after!), `${before}|${after}`).toBe(false);
    }
  });

  it("keeps Latin words and numbers whole inside CJK text, and may break where they meet an ideograph", () => {
    expect(reportBreakPieces("模型Claude给论点P3打了66%的分")).toEqual(["模", "型", "Claude", "给", "论", "点", "P3", "打", "了", "66%", "的", "分"]);
  });

  it("does not break Korean between syllables: Korean breaks at its spaces", () => {
    expect(reportBreakPieces("하이브리드")).toEqual(["하이브리드"]);
    expect(reportBreaksBetween("이", "브")).toBe(false);
  });

  it("changes nothing for a word without Han or kana: the long-word rule alone, so Latin reports are unchanged", () => {
    for (const word of ["Anunțurile", "Răspunsul", "Ответ", "απάντηση", "הדרגה", "तनख़्वाह", LONG_URL]) {
      expect(reportBreakPieces(word), word).toEqual(reportWordPieces(word));
      expect(reportLineBreaker(word)(word), word).toEqual(reportWordPieces(word).flatMap((piece, index) => (index === 0 ? [piece] : ["", piece])));
    }
  });

  it("returns the pieces with an empty piece between each two, the zero-width break textkit prints nothing at", () => {
    const pieces = reportLineBreaker("我们的答案")("我们的答案");
    expect(pieces).toEqual(["我", "", "们", "", "的", "", "答", "", "案"]);
    expect(pieces.join("")).toBe("我们的答案");
  });
});

describe("breaks where textkit splits a text into runs (reportLineBreaker)", () => {
  // textkit splits 日本語のテキスト into the runs 日本語 (Han), の (Hiragana) and テキスト (Katakana) and hands each to the rule.
  it("lets a run start on a new line when the text allows a break before it", () => {
    const rule = reportLineBreaker("日本語のテキスト");
    expect(rule("の")).toEqual(["", "の"]);
    expect(rule("テキスト")).toEqual(["", "テ", "", "キ", "", "ス", "", "ト"]);
    // Nothing before the text's first run.
    expect(rule("日本語")).toEqual(["日", "", "本", "", "語"]);
  });

  it("never breaks before a run that follows opening punctuation, or before a [Pn] citation", () => {
    const quoted = reportLineBreaker("これは「テスト」です");
    // textkit's runs: これは「 (Hiragana, with the bracket), テスト」 (Katakana), です.
    expect(quoted("テスト」")[0]).toBe("テ");
    expect(quoted("です")[0]).toBe("");
    const cited = reportLineBreaker("答えです。\u00A0[P3]");
    expect(cited("\u00A0[P3]")).toEqual(["\u00A0[P3]"]);
  });

  it("breaks before a run only where every place the run appears in the text allows it", () => {
    const rule = reportLineBreaker("「の」との");
    // の follows 「 once (no break) and と once (a break): the rule cannot tell which place textkit is at, so it keeps both.
    expect(rule("の")).toEqual(["の"]);
    expect(reportLineBreaker("Claude模型")("模型")).toEqual(["", "模", "", "型"]);
    expect(reportLineBreaker("Ответ Claude")("Claude")).toEqual(["Claude"]);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  JUDGE_ARTIFACT_PROSE,
  JUDGE_ARTIFACT_READING,
  JUDGE_ASSESSMENT_PROSE,
  NODE_REVIEW_PROSE,
  classifyStructuredArtifact,
  judgeArtifactSchema,
  judgeAssessmentSchema,
  nodeReviewArtifactSchema
} from "@debateai/judgement";
import {
  TEXT_NOT_IN_QUESTION_LANGUAGE,
  argumentLanguageDirective,
  detectArgumentLanguage,
  lockedReplyLanguageExpectation,
  replyLanguageCheck,
  replyLanguageExpectation,
  replyLanguageIssues,
  replyProseFieldsAt,
  replyTextHasStrayScript,
  replyTextLanguageVerdict,
  withQuestionStrayScript,
  type ReplyLanguageExpectation
} from "@debateai/kernel";
import { decodeModelJson, schemaFailureLocator } from "@debateai/providers";
import { STORY_BODY_PROSE, STORY_CHECKER_PROSE } from "@debateai/story";
import { COMPOSED_PROSE, EVALUATOR_PROSE } from "../../apps/runner/src/index.js";

/**
 * REPLY LANGUAGE (2026-10-12). In two preview practice debates on an English question, MiMo-V2.6-Pro answered 10 of
 * its 71 replies in another language (Polish, French, Spanish, Catalan, German, Portuguese, or Chinese ambiguity flags
 * inside an English reply); no other model did, and nothing checked. These tests replay the real replies, verbatim
 * (tests/support/fixtures/reply-language), and the check's language independence on the professionally translated
 * legal pages of every interface language.
 */
interface PracticeReply {
  readonly source: string;
  readonly model: string;
  readonly callSiteKey: string;
  readonly kind: "author" | "panel" | "review" | "writer" | "evaluator" | "story" | "checker";
  readonly outcome: string;
  readonly replyForm: string;
  readonly language: string;
  readonly content: string;
}
const PRACTICE = JSON.parse(readFileSync(new URL("../support/fixtures/reply-language/practice-2026-10-12-replies.json", import.meta.url), "utf8")) as {
  readonly question: string;
  readonly replies: readonly PracticeReply[];
};
const STRAY = JSON.parse(readFileSync(new URL("../support/fixtures/reply-language/stray-script-2026-10.json", import.meta.url), "utf8")) as {
  readonly cases: readonly { source: string; model: string; callSiteKey: string; language: string; question: string; path: string; text: string; siblings?: readonly string[] }[];
};
const QUESTION = PRACTICE.question;
const STOP = { finishReason: "stop" } as const;
const PROSE: Readonly<Record<PracticeReply["kind"], readonly string[]>> = {
  author: JUDGE_ARTIFACT_PROSE, panel: JUDGE_ASSESSMENT_PROSE, review: NODE_REVIEW_PROSE, writer: COMPOSED_PROSE,
  evaluator: EVALUATOR_PROSE, story: STORY_BODY_PROSE, checker: STORY_CHECKER_PROSE
};
const decoded = (reply: PracticeReply): unknown => {
  const result = decodeModelJson(reply.content, STOP);
  if (!result.ok) throw new Error(`${reply.source} does not decode`);
  return result.value;
};
const issuePaths = (reply: PracticeReply): string[] =>
  replyLanguageCheck(QUESTION, PROSE[reply.kind])(decoded(reply)).map((issue) => issue.path.join("."));
const byId = (source: string): PracticeReply => {
  const reply = PRACTICE.replies.find((entry) => entry.source === source);
  if (reply === undefined) throw new Error(`no fixture ${source}`);
  return reply;
};
const EN: ReplyLanguageExpectation = { tag: "en", script: "Latin" };

describe("the question's language: the root cause", () => {
  it("the practice question is English, so every step is told to write in English (it was 'und' before)", () => {
    expect(QUESTION).toBe("Should a mid-sized city make its central bus lines free to ride?");
    expect(detectArgumentLanguage(QUESTION)).toEqual({ tag: "en", nameEn: "English", confidence: "high" });
    expect(argumentLanguageDirective(detectArgumentLanguage(QUESTION).nameEn))
      .toMatch(/^Write every natural-language field in English, the language of the question, even where the material quotes another language\. /u);
    expect(replyLanguageExpectation(QUESTION)).toEqual(EN);
  });

  it("an undetected question still expects its own writing system, and nothing finer", () => {
    expect(replyLanguageExpectation("Government should act.")).toEqual({ tag: "und", script: "Latin" });
    expect(replyLanguageExpectation("Дали треба да се укинат субвенциите за гориво?")).toEqual({ tag: "und", script: "Cyrillic" });
    expect(replyLanguageExpectation("Ναι")).toEqual({ tag: "und", script: null });
  });
});

describe("the real practice replies", () => {
  const wrong = PRACTICE.replies.filter((reply) => reply.language !== "en");
  const english = PRACTICE.replies.filter((reply) => reply.language === "en");

  it("holds MiMo's ten wrong-language replies and English replies from all four models, every step", () => {
    expect(wrong.map((reply) => `${reply.source}=${reply.language}`)).toEqual([
      "debate-2#331=pl", "debate-2#478=fr", "debate-3c#116=zh", "debate-3c#160=es", "debate-3c#178=pl",
      "debate-3c#219=pl", "debate-3c#241=de", "debate-3c#260=ca", "debate-3c#288=fr", "debate-3c#381=pt"
    ]);
    expect(new Set(wrong.map((reply) => reply.model))).toEqual(new Set(["XiaomiMiMo/MiMo-V2.6-Pro"]));
    expect(new Set(english.map((reply) => reply.model))).toEqual(new Set([
      "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5", "deepseek-ai/DeepSeek-V4.1-Flash"
    ]));
    expect(new Set(english.map((reply) => reply.kind))).toEqual(new Set(Object.keys(PROSE)));
  });

  it.each(english.map((reply) => [reply.source, reply.model, reply.kind, reply] as const))(
    "%s (%s, %s) is English: no issue", (_source, _model, _kind, reply) => {
      expect(issuePaths(reply)).toEqual([]);
    });

  it("each wrong-language reply is refused at the members a reader would meet", () => {
    expect(Object.fromEntries(wrong.map((reply) => [reply.source, issuePaths(reply)]))).toEqual({
      "debate-2#331": ["steelman.summary", "critic.summary", "context.ambiguityFlags", "fallacy.fatalFlags.0.description"],
      "debate-2#478": ["reasons"],
      // English everywhere but the four ambiguity flags, which MiMo wrote in Chinese.
      "debate-3c#116": ["context.ambiguityFlags"],
      "debate-3c#160": ["reasons"],
      "debate-3c#178": ["steelman.summary", "context.ambiguityFlags", "fallacy.fatalFlags.0.description", "fallacy.fatalFlags.1.description"],
      "debate-3c#219": ["steelman.summary", "critic.summary", "context.ambiguityFlags", "fallacy.fatalFlags.0.description", "fallacy.fatalFlags.1.description"],
      "debate-3c#241": ["statement", "restatement_text", "steelman.summary", "critic.summary", "context.ambiguityFlags"],
      // Catalan is not an interface language: it is refused as "not English", which is all the check asks.
      "debate-3c#260": ["steelman.summary", "critic.summary", "context.ambiguityFlags", "fallacy.fatalFlags.0.description", "fallacy.fatalFlags.1.description"],
      "debate-3c#288": ["reasons"],
      "debate-3c#381": ["steelman.summary", "critic.summary", "fallacy.fatalFlags.0.description", "fallacy.fatalFlags.1.description"]
    });
  });

  it("the judge family's own classifiers refuse them as SCHEMA_FAILED under the language code (seven were accepted)", () => {
    const classify = (reply: PracticeReply) => {
      if (reply.kind === "author") {
        return classifyStructuredArtifact(reply.content, judgeArtifactSchema, STOP, JUDGE_ARTIFACT_READING,
          replyLanguageCheck(QUESTION, JUDGE_ARTIFACT_PROSE));
      }
      if (reply.kind === "panel") {
        return classifyStructuredArtifact(reply.content, judgeAssessmentSchema, STOP, JUDGE_ARTIFACT_READING,
          replyLanguageCheck(QUESTION, JUDGE_ASSESSMENT_PROSE));
      }
      const edges = (decoded(reply) as { edge_bearings?: unknown[] }).edge_bearings?.length ?? 0;
      return classifyStructuredArtifact(reply.content, nodeReviewArtifactSchema(edges), STOP, undefined,
        replyLanguageCheck(QUESTION, NODE_REVIEW_PROSE));
    };
    const accepted = wrong.filter((reply) => reply.outcome === "OK");
    expect(accepted.map((reply) => reply.source)).toEqual([
      "debate-2#331", "debate-2#478", "debate-3c#116", "debate-3c#219", "debate-3c#241", "debate-3c#260", "debate-3c#288", "debate-3c#381"
    ]);
    for (const reply of accepted) {
      const classified = classify(reply);
      expect(classified.parseStatus, reply.source).toBe("SCHEMA_FAILED");
      if (classified.parseStatus === "PARSED") continue;
      expect(schemaFailureLocator(classified).code, reply.source).toBe(TEXT_NOT_IN_QUESTION_LANGUAGE);
      for (const issue of JSON.parse(classified.parseError) as { code: string; message: string }[]) {
        expect(issue).toMatchObject({ code: TEXT_NOT_IN_QUESTION_LANGUAGE, message: TEXT_NOT_IN_QUESTION_LANGUAGE });
      }
    }
    // The same classifiers still accept the English controls exactly as before.
    for (const reply of english.filter((entry) => ["author", "panel", "review"].includes(entry.kind))) {
      expect(classify(reply).parseStatus, reply.source).toBe("PARSED");
    }
  });

  it("the old detector read three English panel replies as Hungarian; the reply check does not", () => {
    for (const source of ["debate-2#250", "debate-3c#256", "debate-3c#463"]) {
      const reply = byId(source);
      expect(reply.language).toBe("en");
      for (const field of replyProseFieldsAt(decoded(reply), JUDGE_ASSESSMENT_PROSE)) {
        expect(replyTextLanguageVerdict(EN, field.text), `${source} ${field.path.join(".")}`).not.toBe("OTHER");
      }
    }
  });

  it("English with Polish-style quotation marks (the frame's former „ ” advice) is English", () => {
    const reply = byId("debate-2#490");
    expect(reply.content).toContain("„");
    expect(issuePaths(reply)).toEqual([]);
  });
});

/** Every paragraph of a locale's translated Terms and Privacy Policy, drafting notes ("[...]") left out. */
function legalParagraphs(locale: string): string[] {
  const files = locale === "en"
    ? ["../../apps/ui/lib/termsOfService.ts", "../../apps/ui/lib/privacyPolicy.ts"]
    : [`../../apps/ui/lib/legal/${locale}/termsOfService.ts`, `../../apps/ui/lib/legal/${locale}/privacyPolicy.ts`];
  return files.flatMap((file) => [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/text: "((?:[^"\\]|\\.)*)"/gu)]
    .map((match) => JSON.parse(`"${match[1]!}"`) as string)
    .filter((text) => text.length >= 120 && !text.startsWith("[")));
}
const LOCALES = ["en", ...readdirSync(new URL("../../apps/ui/lib/legal/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()];
const SCRIPT_OF: Readonly<Record<string, ReplyLanguageExpectation["script"]>> = {
  ar: "Arabic", he: "Hebrew", hi: "Devanagari", ko: "Hangul", ja: "CJK", zh: "CJK", el: "Greek", ru: "Cyrillic", uk: "Cyrillic", bg: "Cyrillic"
};
const expectationOf = (tag: string): ReplyLanguageExpectation => ({ tag, script: SCRIPT_OF[tag] ?? "Latin" });

describe("language independence, on the translated legal pages of every interface language", () => {
  it("covers the 35 interface languages", () => {
    expect(LOCALES).toHaveLength(35);
  });

  it.each(LOCALES)("%s: no paragraph, and no paragraph's first twelve words, is refused in its own language", (locale) => {
    const paragraphs = legalParagraphs(locale);
    expect(paragraphs.length).toBeGreaterThan(50);
    for (const text of paragraphs) {
      expect(replyTextLanguageVerdict(expectationOf(locale), text), text).not.toBe("OTHER");
      const opening = text.split(/\s+/u).slice(0, 12).join(" ");
      expect(replyTextLanguageVerdict(expectationOf(locale), opening), opening).not.toBe("OTHER");
    }
  });

  it.each(LOCALES.filter((locale) => locale !== "en"))("%s: English paragraphs are refused, and so are its own against English", (locale) => {
    const refusedShare = (texts: readonly string[], expected: ReplyLanguageExpectation): number =>
      texts.filter((text) => replyTextLanguageVerdict(expected, text) === "OTHER").length / texts.length;
    expect(refusedShare(legalParagraphs("en"), expectationOf(locale))).toBeGreaterThanOrEqual(0.95);
    expect(refusedShare(legalParagraphs(locale), EN)).toBeGreaterThanOrEqual(0.9);
  });

  it.each(LOCALES)("%s: no paragraph is refused for a stray letter in its own language", (locale) => {
    for (const text of legalParagraphs(locale)) expect(replyTextHasStrayScript(expectationOf(locale), text), text).toBe(false);
  });

  it("neighbours that share their small words are told apart (Spanish and French, Czech and Slovak, Danish and Swedish)", () => {
    const share = (from: string, as: string): number => {
      const texts = legalParagraphs(from);
      return texts.filter((text) => replyTextLanguageVerdict(expectationOf(as), text) === "OTHER").length / texts.length;
    };
    for (const [from, as] of [["es", "fr"], ["fr", "es"], ["es", "pt"], ["pt", "es"], ["it", "es"], ["ro", "it"],
      ["cs", "sk"], ["pl", "cs"], ["da", "sv"], ["sv", "da"], ["lt", "lv"], ["et", "fi"], ["uk", "ru"]] as const) {
      expect(share(from, as), `${from} read as ${as}`).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe("the check's rules", () => {
  const RO: ReplyLanguageExpectation = { tag: "ro", script: "Latin" };
  const field = (path: string, text: string) => ({ path: path.split(".").map((segment) => /^\d+$/u.test(segment) ? Number(segment) : segment), text });

  it("names in another script or spelling are fine; a quoted passage in another language is not read", () => {
    expect(replyTextLanguageVerdict(EN, "Fare-free buses in Łódź and Wrocław raised ridership, and Gdańsk is weighing the same move for its tram lines.")).toBe("EXPECTED");
    expect(replyTextLanguageVerdict(EN, "The regulator fined Газпром because its pipeline contracts locked smaller buyers into long terms.")).toBe("EXPECTED");
    expect(replyTextLanguageVerdict(RO, "Primăria a citat raportul „Free fares do not pay for themselves in the long run, the study concludes” ca argument împotriva gratuității.")).toBe("EXPECTED");
    expect(replyTextLanguageVerdict({ tag: "ar", script: "Arabic" }, "المتحكم في بياناتك الشخصية هو DMS Merchandise Shop S.R.L.، Str. 1 Decembrie")).not.toBe("OTHER");
  });

  it("Romanian written without diacritics is still Romanian", () => {
    expect(replyTextLanguageVerdict(RO, "Orasul ar trebui sa faca gratuite liniile centrale doar daca poate inlocui veniturile din bilete cu o sursa stabila de finantare.")).not.toBe("OTHER");
  });

  it("a short member alone proves nothing, unless it is wholly in another writing system", () => {
    expect(replyTextLanguageVerdict(EN, "Fiscal scale unclear")).toBe("UNSURE");
    expect(replyTextLanguageVerdict(EN, "Skala nieokreślona")).toBe("UNSURE");
    expect(replyTextLanguageVerdict(EN, "「中心公交线路」的地理范围与网络角色未明确")).toBe("OTHER");
  });

  it("letters only one Cyrillic language uses, and kana, tell same-script languages apart", () => {
    const RU: ReplyLanguageExpectation = { tag: "ru", script: "Cyrillic" };
    const UK: ReplyLanguageExpectation = { tag: "uk", script: "Cyrillic" };
    const russian = "Бесплатный проезд в центральных автобусах может увеличить пассажиропоток, но городу нужно стабильное финансирование, чтобы не сократить рейсы.";
    const ukrainian = "Безкоштовний проїзд у центральних автобусах може збільшити пасажиропотік, але місту потрібне стабільне фінансування, щоб не скоротити рейси.";
    expect(replyTextLanguageVerdict(RU, russian)).toBe("EXPECTED");
    expect(replyTextLanguageVerdict(UK, ukrainian)).toBe("EXPECTED");
    expect(replyTextLanguageVerdict(RU, ukrainian)).toBe("OTHER");
    expect(replyTextLanguageVerdict(UK, russian)).toBe("OTHER");
    const japanese = "中心部のバス路線を無料にすると利用者は増えるが、失われる運賃収入を安定した財源で補う必要がある。";
    const chinese = "让中心公交线路免费可以增加乘客，但城市必须用稳定的公共资金弥补失去的票价收入。";
    expect(replyTextLanguageVerdict({ tag: "ja", script: "CJK" }, japanese)).toBe("EXPECTED");
    expect(replyTextLanguageVerdict({ tag: "zh", script: "CJK" }, chinese)).toBe("EXPECTED");
    expect(replyTextLanguageVerdict({ tag: "ja", script: "CJK" }, chinese)).toBe("OTHER");
    expect(replyTextLanguageVerdict({ tag: "zh", script: "CJK" }, japanese)).toBe("OTHER");
  });

  it("an undetected Latin question checks the writing system only", () => {
    const und = replyLanguageExpectation("Government should act.");
    expect(replyTextLanguageVerdict(und, "Rząd powinien działać, ponieważ bezpłatne autobusy wymagają stabilnego finansowania.")).toBe("EXPECTED");
    expect(replyTextLanguageVerdict(und, "政府应该采取行动，因为免费公交需要稳定的资金来源和可靠的服务。")).toBe("OTHER");
  });

  it("a wrong-language reply refuses its short members too; a good reply refuses only a long member clearly in another language", () => {
    const polish = byId("debate-3c#219");
    const value = decoded(polish) as { steelman: { summary: string } };
    expect(replyLanguageIssues(EN, [
      field("statement", "A mid-sized city should make central bus lines free only with stable replacement funding and protected frequency."),
      field("steelman.summary", value.steelman.summary),
      field("context.ambiguityFlags.0", "Scale of the city unclear"),
      field("context.ambiguityFlags.1", "Funding source not named")
    ]).map((issue) => issue.path.join("."))).toEqual(["steelman.summary"]);
    expect(replyLanguageIssues(EN, [
      field("steelman.summary", value.steelman.summary),
      field("context.ambiguityFlags.0", "Skala miasta nieokreślona"),
      field("context.ambiguityFlags.1", "Brak źródła finansowania")
    ]).map((issue) => issue.path.join("."))).toEqual(["steelman.summary", "context.ambiguityFlags"]);
  });

  it("an array is named whole only when every element is refused", () => {
    const issues = replyLanguageIssues(EN, [
      field("reasons.0", "The node supports the target on its central point: free central lines, a dedicated source and kept frequency."),
      field("reasons.1", "Le nœud attaque directement la cible 1 en visant son contenu propre : le couplage de la gratuité avec une hausse de fréquence.")
    ]);
    expect(issues).toEqual([{ code: TEXT_NOT_IN_QUESTION_LANGUAGE, path: ["reasons", 1], message: TEXT_NOT_IN_QUESTION_LANGUAGE }]);
  });

  it("reads members by pattern, every array element included, and skips what is missing", () => {
    expect(replyProseFieldsAt({ a: { b: "x" }, list: [{ text: "y" }, { text: 3 }, { other: "z" }], tags: ["p", "q"] },
      ["a.b", "list.*.text", "tags.*", "missing.path"])).toEqual([
      { path: ["a", "b"], text: "x" }, { path: ["list", 0, "text"], text: "y" }, { path: ["tags", 0], text: "p" }, { path: ["tags", 1], text: "q" }
    ]);
  });
});

describe("a few Chinese characters inside a sentence in the question's language (practice 2026-10-14 to R19)", () => {
  const toPath = (dotted: string) => dotted.split(".").map((segment) => /^\d+$/u.test(segment) ? Number(segment) : segment);

  it("holds the eight real slips: GLM, MiMo, Qwen and Haiku, map, judge, panel and story", () => {
    expect(STRAY.cases.map((entry) => entry.callSiteKey)).toEqual([
      "MAP:choose", "JUDGE:cross-root:4->0", "PANEL:JUDGE:defender:root0:r1:p0:preview:mimo-v2-6-pro", "STORY:STORYTELLER:2",
      "PANEL:JUDGE:cross-root:1->0:preview:claude-haiku-5-5", "PANEL:JUDGE:cross-root:0->2:preview:qwen-3-8-flash",
      "PANEL:JUDGE:defender:root3:r1:p3:preview:fixture-a", "PANEL:JUDGE:cross-root:2->3:preview:claude-haiku-5-5"
    ]);
  });

  it.each(STRAY.cases.map((entry) => [entry.source, entry] as const))("%s: read as its own language, refused at its own path only", (_source, entry) => {
    const expected = replyLanguageExpectation(entry.question);
    expect(expected).toEqual({ tag: entry.language, script: "Latin" });
    // Why it got through: the language reading is unchanged and still says the expected language.
    expect(replyTextLanguageVerdict(expected, entry.text)).toBe("EXPECTED");
    expect(replyTextHasStrayScript(expected, entry.text)).toBe(true);
    const path = toPath(entry.path);
    const fields = entry.siblings === undefined
      ? [{ path, text: entry.text }]
      : entry.siblings.map((text, index) => ({ path: [...path.slice(0, -1), index], text }));
    expect(replyLanguageIssues(expected, fields)).toEqual([{ code: TEXT_NOT_IN_QUESTION_LANGUAGE, path, message: TEXT_NOT_IN_QUESTION_LANGUAGE }]);
  });

  it("the same sentences in the question's own words pass", () => {
    const r19 = STRAY.cases[3]!;
    const fixed = r19.text.replace("are大于 the", "are greater than the");
    expect(replyLanguageIssues(replyLanguageExpectation(r19.question), [{ path: toPath(r19.path), text: fixed }])).toEqual([]);
  });

  it("kana and Hangul are caught too; one letter is enough", () => {
    expect(replyTextHasStrayScript(EN, "The ministry's バス plan was dropped after the audit found the costs were understated.")).toBe(true);
    expect(replyTextHasStrayScript(EN, "The ministry's 원자력 plan was dropped after the audit found the costs were understated.")).toBe(true);
    expect(replyTextHasStrayScript(EN, "Costs rose毙 sharply.")).toBe(true);
  });

  it("names and symbols in other writing systems stay fine, as before", () => {
    expect(replyTextHasStrayScript(EN, "The regulator fined Газпром because its pipeline contracts locked smaller buyers into long terms.")).toBe(false);
    expect(replyTextHasStrayScript(EN, "A spread of σ = 0.4 around the 5 °C estimate leaves the ranking unchanged.")).toBe(false);
  });

  it("a quoted term is not read", () => {
    for (const text of [
      "The phrase “躺平” (lying flat) describes young workers who refuse to compete for promotions.",
      "The phrase \"躺平\" (lying flat) describes young workers who refuse to compete for promotions.",
      "The phrase 「躺平」 (lying flat) describes young workers who refuse to compete for promotions.",
      "“躺平”"
    ]) expect(replyTextHasStrayScript(EN, text), text).toBe(false);
  });

  it("a question that holds such letters turns the rule off", () => {
    const question = "Is “tang ping” (躺平) a rational answer to overwork for young people?";
    const expected = replyLanguageExpectation(question);
    expect(expected.questionHasStrayScript).toBe(true);
    expect(replyTextHasStrayScript(expected, "Young people who choose 躺平 are answering an overwork culture that stopped paying off.")).toBe(false);
    expect(lockedReplyLanguageExpectation({ code: "en", name: "English" }, question).questionHasStrayScript).toBe(true);
    expect(lockedReplyLanguageExpectation({ code: "en", name: "English" }, "Should buses be free?")).toEqual({ tag: "en", script: "Latin" });
    expect(withQuestionStrayScript(EN, "Should buses be free?")).toBe(EN);
  });

  it("the rule is off for CJK and Hangul questions and for an unknown script", () => {
    expect(replyTextHasStrayScript({ tag: "ja", script: "CJK" }, "中心部のバス路線を無料にすると利用者は増える。")).toBe(false);
    expect(replyTextHasStrayScript({ tag: "zh", script: "CJK" }, "让中心公交线路免费可以增加乘客。")).toBe(false);
    expect(replyTextHasStrayScript({ tag: "ko", script: "Hangul" }, "정부(政府)는 중앙 버스 노선을 무료로 해야 한다.")).toBe(false);
    expect(replyTextHasStrayScript({ tag: "und", script: null }, "Costs rose毙 sharply in every region we looked at.")).toBe(false);
    expect(withQuestionStrayScript({ tag: "ja", script: "CJK" }, "中心部のバス路線を無料にすべきか？")).toEqual({ tag: "ja", script: "CJK" });
  });

  it("the R19 checker objection, which quoted the slip in ASCII single quotes, is refused (a reader may see it as the reservation)", () => {
    const objection = "Several fixes are needed, most important first. (1) The final paragraph of 'The alternative answers' contains Chinese characters: 'hidden system costs are大于 the renewables camp admits' — write it in English ('greater than').";
    expect(replyLanguageIssues(EN, [{ path: ["objection"], text: objection }]).map((issue) => issue.path)).toEqual([["objection"]]);
  });
});

describe("the re-ask's code", () => {
  it("a reply refused only for its language is re-asked under the language code; any other refusal keeps SCHEMA_FAILED", () => {
    const language = JSON.stringify([{ code: TEXT_NOT_IN_QUESTION_LANGUAGE, path: ["reasons", 0], message: TEXT_NOT_IN_QUESTION_LANGUAGE }]);
    expect(schemaFailureLocator({ parseStatus: "SCHEMA_FAILED", parseError: language }))
      .toEqual({ code: TEXT_NOT_IN_QUESTION_LANGUAGE, path: "reasons.0" });
    const mixed = JSON.stringify([
      { code: TEXT_NOT_IN_QUESTION_LANGUAGE, path: ["reasons", 0], message: TEXT_NOT_IN_QUESTION_LANGUAGE },
      { code: "custom", path: ["objection"], message: "STORY_CHECKER_OBJECTION_REQUIRED" }
    ]);
    expect(schemaFailureLocator({ parseStatus: "SCHEMA_FAILED", parseError: mixed })).toEqual({ code: "SCHEMA_FAILED", path: "reasons.0" });
  });
});

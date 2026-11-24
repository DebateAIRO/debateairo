import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import {
  ANTHROPIC_PREVIEW_PROVIDER,
  DEEPINFRA_PROVIDER,
  PROVIDER_PURPOSES,
  providerRegister,
  SUPPORT_PROVIDER
} from "../../apps/ui/lib/legal/pages.js";
import { cells, legalLines, legalText, sectionLine } from "../support/legalText.js";

/**
 * What the Privacy Policy says happens when you press Next, and about the questions not started yet: several AIs from
 * several companies read the question to suggest what to look into, even if you never start, and those calls count in
 * the allowance; the account keeps a question not started yet, up to 20 of them, each under a key of its own, until
 * Start, Delete or the account's closing; and the browser tab keeps the question's words only. Section 2 has a row for
 * it and a paragraph on Next, and section 7 has a row that names section 2's. English is pinned word for word; the
 * translations are checked by their structure, and the Register gives the two jobs before a debate starts to the
 * companies that do them.
 */

const root = process.cwd();

/** Section 2's paragraph on Next, its first three sentences, in English. */
const NEXT_SENTENCE =
  "When you press Next, several AIs from several companies read your question to suggest what to look into, even if you never start. These calls count in your allowance. Once our check of the question has passed, your account keeps the question and what you do before you start (the row \"Questions not started yet\" above), and our server also holds the AIs' reading in memory for 10 minutes, so that pressing Next again with the same words asks no AI again.";

/** The paragraph's last sentence: the tab keeps the words only. */
const TAB_SENTENCE = "Your question's words are also kept in this browser tab until you close it; we cannot read them there.";

/** English: section 2's row. */
const SAVED_ROW =
  "| **Questions not started yet** | When you press Next, agree that the AIs may read your question and our check of it passes, your account keeps the question and everything you do with it before you start, updated as you go: the paths the AIs suggested, the clarifying questions and your answers to them, the paths you combine, split, rewrite, add or remove, how many paths you want looked into, Quick look or Thorough, and whether the AIs may carry on to the report. It is stored encrypted under keys specific to your account and to that question. The ask page lists them under \"Not started yet\": you can pick one up where you left it, which asks no AI and uses none of your allowance, or delete it. We keep up to 20; while 20 are kept, a new one is not kept until you delete one. When something you write there reads like the words of a person in crisis, that change is not kept | You, and the AIs that read your question when you press Next |";

/** English: section 7's row. */
const SAVED_RETENTION_ROW =
  "| Questions not started yet | No time limit: until you press Start, delete it on the ask page or close your account | At Start the debate holds the question and your paths, and the rows on debate content apply. When you delete it, or start it, the key specific to that question is destroyed, so it can no longer be read, and the record is deleted. When you close your account, the key specific to your account is destroyed, so it can no longer be read, and the record is deleted with the account |";

/**
 * The paragraph's first two sentences in each language, joined by the language's gap, by sha256: they were approved
 * word for word and must not change when the rest of the paragraph does.
 */
const FIRST_TWO_SENTENCES: Readonly<Record<string, string>> = {
  ar: "124322baa93d7342daa0098bcdb300fb31ba7dbab6b210ac1c266afd64c0d71a",
  bg: "2228dcceffb2150838c97a21615520e96caf95433fec48f1e643abd2d98f69be",
  cs: "a6601bfbbbf9b3baae1c04b022a6f091010dafdfb5af7f0f47d90afe87377afe",
  da: "4844da96b93ab764a0781af223f0a7d97f888488a9f5c1ade10829efd36cf21e",
  de: "3c6a9be9ddf7c93cadff0637c2b32384d651075d76f5344675bc1f05c9dfb379",
  el: "ceef101582ecc0d8a293f8e3565f7e3bc9640c4f323419187af3a45a1f03e8cd",
  en: "040147091c73825a805b5b8b5f4611ae6ba464d7c6fc07aa98a6251da491d0a7",
  es: "670c0e6a0a54c1b249aaa3ba2faf86a760a40729241e4661d4ea3b0db5cad67c",
  et: "808eda24950f8463d447a89937da29d2896828a7c177231e4a54134d043442c8",
  fi: "92a6fd85f57f11571e37f000f17292259e84fbaab8635a27de34cfcb2248250b",
  fr: "3f2568eaac71dc495de45752adbfad461348c0016ff5e49e0f9625c8851fb5d9",
  ga: "9c98760b55b9f4da1a6e69f4da5382c38913c883049455471fc3ea89f908d549",
  he: "ec29fd05868dde4a41ce29b1a343385f45af3e6a35e21ebbd56f73204fa6927b",
  hi: "1976cab97be15bc9b61bf13f6995168cf1393722fd0cacf411ae0928ed51d5e7",
  hr: "5c25903e54779868b8673d01b5d97715e76dbfcb514b5e22953cc363ab70de0b",
  hu: "07bac115d4d13b8535f96abd7ad0b7f64d3dc81466a40e01eae4b17c202b1ac7",
  id: "bc34dd80f788aa24012cb42500adbcc5f0960b58417713b5c3785ee31b597210",
  it: "bb7bafa8df449f4155dd7beabd6b9dd915b1af4e9bbc330a71dbcc33de03ac4f",
  ja: "b574510b6ae644e214d9d9f6e60e16267bf1b49d8fde97623af66db14133e5b0",
  ko: "8891becc7f391ccc6bea5d432724d628a47031c31e11c4ccae6bc268ac2e6260",
  lt: "453b81d566f3bc9cbf52fc88e2e9325e2ad4d24407c4920be04c76cd049339e3",
  lv: "f399392d1a36b081dab4c20ba3dee4147db7317d288b91134ac8d7f58534af52",
  mt: "0eb3fd8b73f511670b5c4f3c07e30b1b76c72f25339240599b7b367e4284c5a5",
  nl: "126b1a14a307dd8341df2d8e45d4badb3a79b309c3e1964f6f4128735c44f487",
  pl: "b91bd73655dce25805df7535316df2db44455d840c124aa30a82d1534e6d22a8",
  pt: "a83cb8327785bdb0019321e6a0be4dda9804e1a5a6267bd9b5713f1ba67d59da",
  ro: "a996b44b0432d8e6e10a693d3ad9c45ea1424b6f4b32bd962d2acd4642ff359b",
  ru: "72bcead957a4f815a8fa5547ed79f8d244e251f2ede0aaad4bd2f139429a7084",
  sk: "ebc99ef6ee6a8f924be2b1fd82909ed43d731b0e6172cd7c3c38d9e814d355a3",
  sl: "3e667990085b9e597b4ca8f26b5b4f288350353faf8f9825ebf11c089cee486e",
  sv: "2ec8e8dcbb23c81083ae0200d53ffab100ce667a13df7e1dfaca1241b2bf487f",
  tr: "c1deca636d804a90e7914d9c018eaeb92e5bb9548b5b2422b04f3493c138d27e",
  uk: "528c1b88bc903283a167d0ae1898f7d115f1918c11be057a57aed7165f843d84",
  vi: "23ebc28199a2dc87d463cbcebd6aba90a7b858f1d034b8c5425bc983c1ebe571",
  zh: "92ff38757b1b3b3b09f3ce222119daf1243edaf147f8a8efa1b442192c90f766"
};

/** Each language's words for "after a site update": the tab sentence once said them, and no line may say them now. */
const SITE_UPDATE_CLAUSE: Readonly<Record<string, string>> = {
  ar: "وبعد تحديث الموقع",
  bg: "след обновяване на сайта",
  cs: "po aktualizaci webu",
  da: "efter en opdatering af webstedet",
  de: "nach einer Aktualisierung der Website",
  el: "μετά από ενημέρωση του ιστότοπου",
  en: "after a site update",
  es: "tras una actualización del sitio",
  et: "pärast saidi uuendamist",
  fi: "sivuston päivityksen jälkeen",
  fr: "après une mise à jour du site",
  ga: "tar éis nuashonrú ar an suíomh",
  he: "ולאחר עדכון של האתר",
  hi: "साइट के अपडेट के बाद",
  hr: "nakon ažuriranja web-mjesta",
  hu: "a webhely frissítése után",
  id: "setelah situs diperbarui",
  it: "dopo un aggiornamento del sito",
  ja: "サイトの更新後",
  ko: "사이트 업데이트 후",
  lt: "po svetainės atnaujinimo",
  lv: "pēc vietnes atjaunināšanas",
  mt: "wara aġġornament tas-sit",
  nl: "na een update van de site",
  pl: "po aktualizacji serwisu",
  pt: "após uma atualização do site",
  ro: "după o actualizare a site-ului",
  ru: "после обновления сайта",
  sk: "po aktualizácii webu",
  sl: "po posodobitvi spletnega mesta",
  sv: "efter en uppdatering av webbplatsen",
  tr: "site güncellemesinden sonra",
  uk: "після оновлення сайту",
  vi: "sau khi trang web được cập nhật",
  zh: "网站更新后"
};

/** The two purpose labels of the Register, as approved in English. */
const LABELS = {
  suggestPaths: "Before a debate starts: suggesting what to look into",
  clarifyQuestions: "Before a debate starts: suggesting clarifying questions"
} as const;

const legalCatalog = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/messages", code, "legal.json"), "utf8"));

/** Where the three lines stand: section 2's row and its paragraph on Next, and section 7's row. */
const savedRow = (lines: readonly string[]): string => sectionLine(lines, 2, 15);
const nextParagraph = (lines: readonly string[]): string => sectionLine(lines, 2, 26);
const savedRetentionRow = (lines: readonly string[]): string => sectionLine(lines, 7, 22);

/**
 * The languages whose paragraph on Next is still its first translation: English, and each translation that
 * apps/ui/legal/translated-from.json does not record as translated from the current English text or from an English
 * text released since launch (the archive keeps each one). A translation brought up to date for a release was written
 * again from the English, so its first two sentences are not pinned here; `legal-documents-locale-complete` holds it
 * to the English structure, and the release check (`legal-english-first`) to the current English text.
 */
const englishNow = createHash("sha256").update(legalText("PRIVACY", "en"), "utf8").digest("hex");
const translatedFrom = (JSON.parse(readFileSync(resolve(root, "apps/ui/legal/translated-from.json"), "utf8")) as {
  PRIVACY: Record<string, { version: string; sha256: string }>;
}).PRIVACY;
const releasedEnglish = new Set(Object.keys((JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8")) as {
  archive: { PRIVACY?: Record<string, Record<string, unknown>> };
}).archive.PRIVACY?.en ?? {}));
const fromEnglishSinceLaunch = (code: string): boolean =>
  translatedFrom[code]?.sha256 === englishNow || releasedEnglish.has(translatedFrom[code]?.sha256 ?? "");
const FIRST_TRANSLATION = LOCALES.map(({ code }) => code)
  .filter((code) => code === "en" || !fromEnglishSinceLaunch(code));

const sha256Of = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
/** What stands between two sentences: nothing after the CJK full stop, else one space. */
const sentenceGap = (code: string): string => (code === "ja" || code === "zh" ? "" : " ");

/** A sentence end: ". " after a non-digit (so the "2. " of "2. szakasz" ends nothing), the CJK full stop, or the danda and a space. */
const SENTENCE_END = /(?<!\d)\. |。|। /gu;

/** The sentences of `text`, each without the space after it; joined by the locale's gap they give `text` back. */
const sentencesOf = (text: string): string[] => {
  const sentences: string[] = [];
  let from = 0;
  for (const end of text.matchAll(SENTENCE_END)) {
    const to = end.index! + end[0].length;
    sentences.push(text.slice(from, to).trimEnd());
    from = to;
  }
  if (from < text.length) sentences.push(text.slice(from));
  return sentences;
};

describe("Privacy Policy: what happens when you press Next, and the questions not started yet", () => {
  it("pins the first two sentences and the site-update words of all 35 languages", () => {
    expect(LOCALES).toHaveLength(35);
    expect(Object.keys(FIRST_TWO_SENTENCES).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(Object.keys(SITE_UPDATE_CLAUSE).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
  });

  it("leaves out of the first-translation checks only the translations brought up to date from an English text released since launch", () => {
    const left = LOCALES.map(({ code }) => code).filter((code) => !FIRST_TRANSLATION.includes(code));
    expect([...left].sort()).toEqual(["fr", "ja", "ko", "ro"]);
    for (const code of left) expect(fromEnglishSinceLaunch(code), code).toBe(true);
  });

  it("English says the three approved rules: the tab keeps the words only, up to 20 questions, a key for each", () => {
    const text = legalText("PRIVACY", "en");
    const next = legalLines("PRIVACY", "en");
    const row = savedRow(next);
    const kept = savedRetentionRow(next);
    expect(row).toBe(SAVED_ROW);
    expect(kept).toBe(SAVED_RETENTION_ROW);
    expect(nextParagraph(next)).toBe(`${NEXT_SENTENCE} ${TAB_SENTENCE}`);
    // The browser tab keeps the words only.
    expect(text).not.toMatch(/site update/u);
    // Up to 20, and nothing goes without you.
    expect(row).toContain("We keep up to 20");
    expect(text).not.toMatch(/\bsixth\b|\bthe oldest\b/iu);
    // A key of its own for each question, destroyed at Delete and at Start.
    expect(row).toContain("It is stored encrypted under keys specific to your account and to that question.");
    expect(cells(kept)[2]).toContain("When you delete it, or start it, the key specific to that question is destroyed, so it can no longer be read, and the record is deleted.");
    for (const line of [row, kept]) {
      expect(line).not.toContain("Deleted when you delete it.");
      expect(line).not.toContain("under a key specific to your account");
    }
  });

  it.each(FIRST_TRANSLATION.map((code) => [code]))("%s: the rows and the paragraph on Next", (code) => {
    const gap = sentenceGap(code);
    const text = legalText("PRIVACY", code);
    const next = legalLines("PRIVACY", code);

    // Section 2's row: three cells and a bold category, as its neighbours; section 7's row names it.
    const row = savedRow(next);
    expect(row.startsWith("| ") && row.endsWith(" |"), `${code}: section 2's row is a table row`).toBe(true);
    const category = cells(row);
    expect(category, `${code}: section 2's row shape`).toHaveLength(3);
    expect(category[0], `${code}: a bold category`).toMatch(/^\*\*[^*]+\*\*$/u);
    expect(category[1], `${code}: up to 20`).toMatch(/(^|\D)20(\D|$)/u);
    const kept = savedRetentionRow(next);
    expect(kept.startsWith("| ") && kept.endsWith(" |"), `${code}: section 7's row is a table row`).toBe(true);
    expect(cells(kept), `${code}: section 7's row shape`).toHaveLength(3);
    expect(cells(kept)[0], `${code}: section 7's row names section 2's`).toBe(category[0]!.slice(2, -2));

    // The paragraph on Next: as many sentences as the English, the first two unchanged since they were approved.
    const said = sentencesOf(nextParagraph(next));
    expect(said, `${code}: the paragraph's sentences`).toHaveLength(sentencesOf(`${NEXT_SENTENCE} ${TAB_SENTENCE}`).length);
    expect(said.join(gap), `${code}: one gap between the sentences`).toBe(nextParagraph(next));
    expect(sha256Of(`${said[0]!}${gap}${said[1]!}`), `${code}: the first two sentences, unchanged`).toBe(FIRST_TWO_SENTENCES[code]);
    // The third sentence names the 10 minutes and section 2's row; the tab sentence is last.
    expect(said[2], `${code}: the third sentence names the 10 minutes`).toMatch(/(^|\D)10(\D|$)/u);
    expect(said[2], `${code}: the third sentence names section 2's row`).toContain(category[0]!.slice(2, -2));
    expect(said[3], `${code}: the last sentence is the tab's, not the account's`).not.toContain(category[0]!.slice(2, -2));
    expect(text, `${code}: no line says "after a site update"`).not.toContain(SITE_UPDATE_CLAUSE[code]!);

    if (code !== "en") {
      expect(row, `${code}: section 2's row is translated`).not.toBe(SAVED_ROW);
      expect(kept, `${code}: section 7's row is translated`).not.toBe(SAVED_RETENTION_ROW);
      expect(said.slice(2).join(gap), `${code}: the last two sentences are translated`).not.toBe(sentencesOf(`${NEXT_SENTENCE} ${TAB_SENTENCE}`).slice(2).join(" "));
    }
  });
});

describe("the Register names the two jobs before a debate starts", () => {
  it("adds the two purposes to the purpose list", () => {
    expect(PROVIDER_PURPOSES).toContain("suggestPaths");
    expect(PROVIDER_PURPOSES).toContain("clarifyQuestions");
  });

  it("DeepInfra suggests what to look into; Anthropic does both; the support row names both when Anthropic's is not shown", () => {
    expect(DEEPINFRA_PROVIDER.purposes).toEqual(["arguments", "judging", "story", "suggestPaths"]);
    expect(ANTHROPIC_PREVIEW_PROVIDER.purposes).toEqual(["arguments", "judging", "story", "synthesisCheck", "publicationCheck", "questionCheck", "reportCheck", "clarifyQuestions", "suggestPaths"]);
    expect(SUPPORT_PROVIDER.purposes).toEqual(["support"]);
    expect(providerRegister(["deepinfra"]).at(-1)?.purposes).toEqual(["synthesisCheck", "publicationCheck", "questionCheck", "reportCheck", "clarifyQuestions", "suggestPaths", "support"]);
    expect(providerRegister(["anthropic", "deepinfra"]).at(-1)).toBe(SUPPORT_PROVIDER);
  });

  // Whichever companies the API's targets reach, the clarifying questions stand on exactly one row (Anthropic's, else
  // the support chat's) and what to look into on DeepInfra's and Anthropic's rows, else the support chat's. No model
  // DeepInfra forwards to a partner company is seated, so no such company suggests anything either.
  it.each([
    // Amazon Bedrock's model is a line-up model like DeepInfra's, so its row names the same job.
    ["no answer from the API (the whole reviewed catalogue)", null, ["claude"], ["claude", "deepinfra", "amazon"]],
    ["targets on Anthropic, DeepInfra and Amazon", ["anthropic", "deepinfra", "amazon"], ["claude"], ["claude", "deepinfra", "amazon"]],
    ["targets on DeepInfra only", ["deepinfra"], ["support"], ["deepinfra", "support"]],
    ["targets on Anthropic and DeepInfra", ["anthropic", "deepinfra"], ["claude"], ["claude", "deepinfra"]],
    ["a target on a host no catalogue row knows", ["host:api.acme.example"], ["support"], ["support"]]
  ] as const)("names the rows that do each job before a debate starts: %s", (_build, companies, clarifying, suggesting) => {
    const register = providerRegister(companies);
    const rowsWith = (purpose: "clarifyQuestions" | "suggestPaths") =>
      register.filter((entry) => entry.purposes.includes(purpose)).map((entry) => entry.key);
    expect(rowsWith("clarifyQuestions")).toEqual(clarifying);
    expect(rowsWith("suggestPaths")).toEqual(suggesting);
  });

  it("English labels read exactly as the owner approved", () => {
    const en = legalCatalog("en");
    expect(en["legal.providers.purpose.suggestPaths"]).toBe(LABELS.suggestPaths);
    expect(en["legal.providers.purpose.clarifyQuestions"]).toBe(LABELS.clarifyQuestions);
  });

  it.each(LOCALES.filter(({ code }) => code !== "en").map(({ code }) => [code]))("%s: both labels are translated", (code) => {
    const catalog = legalCatalog(code);
    for (const key of ["suggestPaths", "clarifyQuestions"] as const) {
      const label = catalog[`legal.providers.purpose.${key}`];
      expect(typeof label, `${code}: ${key}`).toBe("string");
      expect(label!.trim(), `${code}: ${key}`).not.toBe("");
      expect(label, `${code}: ${key} is not the English`).not.toBe(LABELS[key]);
    }
    expect(catalog["legal.providers.purpose.suggestPaths"]).not.toBe(catalog["legal.providers.purpose.clarifyQuestions"]);
  });
});

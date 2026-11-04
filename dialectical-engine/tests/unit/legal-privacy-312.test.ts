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

/**
 * Privacy Policy 3.12 (V4 start step, plan Task 83; the owner's Day-1 answers 13 and 14 of 3 Nov 2026,
 * docs/research/2026-10-28-v4-initial/START-STEP-DECISIONS-2026-11-03.md): section 2 says what happens when you press
 * Next — several AIs from several companies read the question to suggest what to look into, even if you never start,
 * and those calls count in the allowance — and the AI Provider Register (part of section 5) gives the two jobs before
 * a debate starts to the companies that do them.
 *
 * Every locale's draft is compared, line by line, with its last 3.11 text in the archive: the same number of lines,
 * and only the eyebrow, the end marker, the version line, the Next sentence and the change log's first sentence and
 * new entry differ. The rest of the change log stays byte for byte, so `legal-report-button`'s pin still finds 3.11,
 * 3.10 and 3.9 on that line. English is pinned word for word; the 34 translations are drafts for native readers.
 */

/**
 * Answer 14: 3.12 takes effect on the upload day, written in when the owner approves the upload. Until then the build
 * carries this placeholder, the build day; plan Task 93 Step 4 re-dates it (this date, the DATES table and the drafts).
 */
const EFFECTIVE = "2026-11-04";

/** Answer 13, verbatim: section 2's sentence. */
const NEXT_SENTENCE =
  "When you press Next, several AIs from several companies read your question to suggest what to look into, even if you never start. The suggestions are held in memory for a few minutes at most on our side, and on your page until you start or leave. These calls count in your allowance.";

/** Answer 13, verbatim: section 14's new entry. */
const CHANGE_ENTRY =
  "Version 3.12 replaced version 3.11: when you press Next, several AIs from several companies read your question to suggest what to look into, even if you never start, and these calls count in your allowance (sections 2 and 5).";

/** Answer 13, verbatim: the two purpose labels of the Register. */
const LABELS = {
  suggestPaths: "Before a debate starts: suggesting what to look into",
  clarifyQuestions: "Before a debate starts: suggesting clarifying questions"
} as const;

/** The last 3.11 text of each locale (d3bf346e5), by the sha256 the archive names it with. */
const PRIOR: Readonly<Record<string, string>> = {
  ar: "55e255f34ef47ed4df60f7a697780bdd8244b2cbd53ca28fc511ce36741b1726",
  bg: "049ef7254a789601d3f6c232c7723886d20f7ac6cf68cfcaa6a064b02d078883",
  cs: "a423b633c08e342c0661611ee3a48e6ea21532d6673d66bbda67361acaf71bf6",
  da: "a2696348b253292309891f4763201f54561470357a0145ab8e103741ca52c723",
  de: "147c3ab0b9fa5ab7af64e7951e7125c9436b880f386fc028694e37c592583ddd",
  el: "df69b511b781b9b0b850b2832312f374731cb568e7e863ef556ceab01344ac2a",
  en: "7252fafd0b72f3a23a822668170bc76b93297e067dd5f12324a900dd43167a53",
  es: "e2af98103eede479613bc92943a3166e0980dbc7e496243742ddf5e6b03e166b",
  et: "808986df541038f9751485cbb0787fffd9a2281d358ee945e19c778483a9bb2c",
  fi: "8d123be9cbed68e93341e52050ade21b63725394b18069ed46ffe47b603c35bf",
  fr: "cd19a3a39f727e49b53a436fb4792e822f4b6016bf4cc9c929bc56eced0bd7a3",
  ga: "f748cbc8525f8da09eea4c271cb7aea339af9533c46a4e5a0389fc81a77e649f",
  he: "866c7322c7ed68ef74f2d9f1712ac9ec672e8717074610f44c489e2a56de512b",
  hi: "87b4a05ab7c17cb13e72e23ae79ee8a876ab215b596ed7cf4bb0ef7fb503aed9",
  hr: "5f9be5a72049a4f3b268483cd1014bec9525521addbbf94399aaa2817819f2f4",
  hu: "5e07c727acc4cd6dc312f9bc8b01d1710d2dd2c67213d83b8369248cbf72995e",
  id: "2c43c29d715154df598a25e41eefe56bec4f8bc81a6394631efdda5157ae9d24",
  it: "5163148781cbb2a1898ee955a53b53232c376671faae663d09b4b41f602b29f2",
  ja: "d4270d811eff235939ebe281f5582d6a144c65eb7f1536a11ffe4420b08a53d2",
  ko: "77b4b99213b9d2d97fd8c5682caaa51591b6aa803326a94f6a4b26fb24daa799",
  lt: "dd31acce76be672dd590297f673ba66151143c99c3e0b96bc7948953a4016420",
  lv: "527ece34a3c8700840fde85e051c24613322b44e286f4b6579955d6d174e7b6f",
  mt: "8ce4002927548f43e523be4f193b5c06556f63c21c08245f1f1061cecda11be0",
  nl: "c3d6d45fdc0d1e9796b6f3eef35bf2eef3b3fcfc362a8913b7aa40588db44862",
  pl: "7c04e12e57acc8d5f247dc746cf38a8a1a6ae5a2e4e8bb4b7df68f98048d336c",
  pt: "c481f355704c67d82a811fb650bd211248d35d4796e9927b6be15f488e1ab4dc",
  ro: "fc400136334354f3658928d2ea9d0f23b693a883a63c13e3919134a34ed5423c",
  ru: "746d01e372296d5a1305f35c6856bffe0f5ac28fc6695e9e5e22acaf1cb6842a",
  sk: "fc02b3072c1c6d8d037e2363398841e4caa15b6fbf9726fcbc9f28d575dad035",
  sl: "6d1931f30ddcce72b357ab255bedd53b92626b146d6219e3a2f20bb799db3cec",
  sv: "266aa35ec19e21290c28619ed57d9db54c01057ee565b7d93176319e186ffa82",
  tr: "5685b3cac61196cb9bb6cc77be42af8e9eb1409e82daea686152848b8a9a2716",
  uk: "85b307bb12e3501c6fb099baab43f0550dc3bb85bd0f6dac61b5624f3473b466",
  vi: "8762fb92aacea0f4e0847c1a8b2d729ed89fa1d8c383578ddc3b53557d00e8d0",
  zh: "b130c700a5821fc7ccead39f8a5a5bd32249c5964382cfd50599f2cb75b46210"
};

/**
 * EFFECTIVE as each locale writes it: in the eyebrow (index 4, capitals where the eyebrow uses them), in the version
 * line (index 21) and in the change log's first sentence (index 255, in the case that sentence needs).
 */
const DATES: Readonly<Record<string, Readonly<{ eyebrow: string; line: string; updated: string }>>> = {
  ar: { eyebrow: "4 نوفمبر 2026", line: "4 نوفمبر 2026", updated: "4 نوفمبر 2026" },
  bg: { eyebrow: "4 НОЕМВРИ 2026 Г.", line: "4 ноември 2026 г.", updated: "4 ноември 2026 г." },
  cs: { eyebrow: "4. LISTOPADU 2026", line: "4. listopadu 2026", updated: "4. listopadu 2026" },
  da: { eyebrow: "4. NOVEMBER 2026", line: "4. november 2026", updated: "4. november 2026" },
  de: { eyebrow: "4. NOVEMBER 2026", line: "4. November 2026", updated: "4. November 2026" },
  el: { eyebrow: "4 ΝΟΕΜΒΡΙΟΥ 2026", line: "4 Νοεμβρίου 2026", updated: "4 Νοεμβρίου 2026" },
  en: { eyebrow: "4 NOVEMBER 2026", line: "4 November 2026", updated: "4 November 2026" },
  es: { eyebrow: "4 DE NOVIEMBRE DE 2026", line: "4 de noviembre de 2026", updated: "4 de noviembre de 2026" },
  et: { eyebrow: "4. NOVEMBRIST 2026", line: "4. november 2026", updated: "4. novembril 2026" },
  fi: { eyebrow: "4. MARRASKUUTA 2026", line: "4. marraskuuta 2026", updated: "4. marraskuuta 2026" },
  fr: { eyebrow: "4 NOVEMBRE 2026", line: "4 novembre 2026", updated: "4 novembre 2026" },
  ga: { eyebrow: "4 SAMHAIN 2026", line: "4 Samhain 2026", updated: "4 Samhain 2026" },
  he: { eyebrow: "4 בנובמבר 2026", line: "4 בנובמבר 2026", updated: "4 בנובמבר 2026" },
  hi: { eyebrow: "4 नवंबर 2026", line: "4 नवंबर 2026", updated: "4 नवंबर 2026" },
  hr: { eyebrow: "4. STUDENOGA 2026", line: "4. studenoga 2026", updated: "4. studenoga 2026" },
  hu: { eyebrow: "2026. NOVEMBER 4.", line: "2026. november 4.", updated: "2026. november 4." },
  id: { eyebrow: "4 NOVEMBER 2026", line: "4 November 2026", updated: "4 November 2026" },
  it: { eyebrow: "4 NOVEMBRE 2026", line: "4 novembre 2026", updated: "4 novembre 2026" },
  ja: { eyebrow: "2026年11月4日", line: "2026年11月4日", updated: "2026年11月4日" },
  ko: { eyebrow: "2026년 11월 4일", line: "2026년 11월 4일", updated: "2026년 11월 4일" },
  lt: { eyebrow: "2026 M. LAPKRIČIO 4 D.", line: "2026 m. lapkričio 4 d.", updated: "2026 m. lapkričio 4 d." },
  lv: { eyebrow: "2026. GADA 4. NOVEMBRA", line: "2026. gada 4. novembris", updated: "2026. gada 4. novembrī" },
  mt: { eyebrow: "4 TA’ NOVEMBRU 2026", line: "4 ta’ Novembru 2026", updated: "4 ta’ Novembru 2026" },
  nl: { eyebrow: "4 NOVEMBER 2026", line: "4 november 2026", updated: "4 november 2026" },
  pl: { eyebrow: "4 LISTOPADA 2026", line: "4 listopada 2026", updated: "4 listopada 2026" },
  pt: { eyebrow: "4 DE NOVEMBRO DE 2026", line: "4 de novembro de 2026", updated: "4 de novembro de 2026" },
  ro: { eyebrow: "4 NOIEMBRIE 2026", line: "4 noiembrie 2026", updated: "4 noiembrie 2026" },
  ru: { eyebrow: "4 НОЯБРЯ 2026 Г.", line: "4 ноября 2026 г.", updated: "4 ноября 2026 г." },
  sk: { eyebrow: "4. NOVEMBRA 2026", line: "4. novembra 2026", updated: "4. novembra 2026" },
  sl: { eyebrow: "4. NOVEMBRA 2026", line: "4. novembra 2026", updated: "4. novembra 2026" },
  sv: { eyebrow: "4 NOVEMBER 2026", line: "4 november 2026", updated: "4 november 2026" },
  tr: { eyebrow: "4 KASIM 2026", line: "4 Kasım 2026", updated: "4 Kasım 2026" },
  uk: { eyebrow: "4 ЛИСТОПАДА 2026 Р.", line: "4 листопада 2026 р.", updated: "4 листопада 2026 р." },
  vi: { eyebrow: "4 THÁNG 11 NĂM 2026", line: "4 tháng 11 năm 2026", updated: "4 tháng 11 năm 2026" },
  zh: { eyebrow: "2026 年 11 月 4 日", line: "2026 年 11 月 4 日", updated: "2026 年 11 月 4 日" }
};

/** 0-based line indexes: the eyebrow, the end marker, the version line, section 2's Next sentence, section 14's log. */
const EYEBROW = 4;
const END_MARKER = 7;
const VERSION_LINE = 21;
const NEXT_LINE = 53;
const CHANGE_LOG = 255;
const CHANGED = [EYEBROW, END_MARKER, VERSION_LINE, NEXT_LINE, CHANGE_LOG];

const root = process.cwd();
const draftBytes = (code: string): Buffer => readFileSync(resolve(root, "apps/ui/legal", code, "privacy-policy.md"));
const lines = (text: string): string[] => text.split("\n");
const manifest = (): {
  documents: Record<string, Record<string, { version: string; sha256: string }>>;
  archive: Record<string, Record<string, Record<string, { version: string; path: string }>>>;
} => JSON.parse(readFileSync(resolve(root, "packages/legal-manifest/src/manifest.json"), "utf8"));
const legalCatalog = (code: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(root, "apps/ui/messages", code, "legal.json"), "utf8"));

/**
 * Where the change-log entry naming `version` first begins: just after the sentence end before it (". ", the CJK
 * full stop, or the Devanagari danda and a space), so the first sentence is everything before it.
 */
const entryStart = (line: string, version: string): number => {
  const at = line.indexOf(version);
  expect(at, `the change log names ${version}`).toBeGreaterThan(0);
  return Math.max(line.lastIndexOf(". ", at) + 2, line.lastIndexOf("。", at) + 1, line.lastIndexOf("। ", at) + 2);
};

/**
 * `next` is `prior` with only its date replaced by `date` (and the version token moved from 3.11 to 3.12): the text
 * before and after the date is the prior's, and what the prior had in its place is a short 2026 date.
 */
const onlyDateChanged = (next: string, prior: string, date: string, label: string): void => {
  const parts = next.split(date);
  expect(parts, `${label}: names the effective date once`).toHaveLength(2);
  const before = parts[0]!.replace("3.12", "3.11");
  const after = parts[1]!;
  expect(prior.startsWith(before), `${label}: the words before the date are the prior's`).toBe(true);
  expect(prior.endsWith(after), `${label}: the words after the date are the prior's`).toBe(true);
  const priorDate = prior.slice(before.length, prior.length - after.length);
  expect(priorDate, `${label}: the prior date stood there`).toMatch(/2026/u);
  expect(priorDate.length, `${label}: nothing but the date changed`).toBeLessThanOrEqual(date.length + 8);
  expect(priorDate, `${label}: the date moved`).not.toBe(date);
};

describe("Privacy Policy 3.12: what happens when you press Next", () => {
  it("covers the 35 languages, each with a prior 3.11 text and the effective date in its own words", () => {
    expect(LOCALES).toHaveLength(35);
    expect(Object.keys(PRIOR).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    expect(Object.keys(DATES).sort()).toEqual(LOCALES.map(({ code }) => code).sort());
    const [year, month, day] = EFFECTIVE.split("-").map(Number) as [number, number, number];
    for (const [code, dates] of Object.entries(DATES)) {
      for (const date of [dates.eyebrow, dates.line, dates.updated]) {
        expect(date, `${code}: the year`).toContain(String(year));
        expect(date, `${code}: the day`).toMatch(new RegExp(`(^|\\D)${day}(\\D|$)`, "u"));
        if (["ja", "ko", "vi", "zh"].includes(code)) expect(date, `${code}: the month`).toMatch(new RegExp(`(^|\\D)${month}(\\D|$)`, "u"));
      }
    }
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: only the five lines differ from the last 3.11 text", (code) => {
    const sha256 = PRIOR[code]!;
    const archived = manifest().archive.PRIVACY?.[code]?.[sha256];
    expect(archived, `${code}: the prior text is in the archive index`).toEqual({ version: "3.11", path: `apps/ui/legal/archive/${code}/${sha256}.md` });
    const priorBytes = readFileSync(resolve(root, archived!.path));
    expect(createHash("sha256").update(priorBytes).digest("hex"), `${code}: the archived bytes`).toBe(sha256);
    const prior = lines(priorBytes.toString("utf8"));
    const next = lines(draftBytes(code).toString("utf8"));

    expect(next, `${code}: the line count is unchanged`).toHaveLength(prior.length);
    const differing = next.flatMap((line, index) => (line === prior[index] ? [] : [index]));
    expect(differing, `${code}: the changed lines`).toEqual(CHANGED);

    const dates = DATES[code]!;
    expect(next[EYEBROW], `${code}: the eyebrow names 3.12`).toMatch(/ v3\.12 · /u);
    onlyDateChanged(next[EYEBROW]!, prior[EYEBROW]!, dates.eyebrow, `${code}: the eyebrow`);
    expect(next[END_MARKER], `${code}: the end marker`).toBe(prior[END_MARKER]!.replace(/v3\.11$/u, "v3.12"));
    expect(next[VERSION_LINE]!.startsWith("**Version 3.12 · Effective "), `${code}: the version line`).toBe(true);
    onlyDateChanged(next[VERSION_LINE]!, prior[VERSION_LINE]!, dates.line, `${code}: the version line`);
    expect(next[NEXT_LINE]!.trim(), `${code}: the Next sentence is a plain paragraph`).toMatch(/^[^|#\-<]/u);

    // Section 14: the first sentence takes the new date; the new entry comes next; the rest is the 3.11 line unchanged.
    const log = next[CHANGE_LOG]!;
    const priorLog = prior[CHANGE_LOG]!;
    const tail = priorLog.slice(entryStart(priorLog, "3.11"));
    expect(log.endsWith(tail), `${code}: from the 3.11 entry to the end, the log is unchanged`).toBe(true);
    const start = entryStart(log, "3.12");
    onlyDateChanged(log.slice(0, start), priorLog.slice(0, entryStart(priorLog, "3.11")), dates.updated, `${code}: the log's first sentence`);
    const entry = log.slice(start, log.length - tail.length);
    expect(entry, `${code}: the new entry names 3.12 and the version it replaced`).toMatch(/3\.12[^]*3\.11/u);
    expect(entry, `${code}: the new entry names no older version`).not.toMatch(/3\.10|3\.9/u);
    expect(entry, `${code}: the new entry names sections 2 and 5`).toMatch(/2[^]*5/u);
    expect(entry, `${code}: the new entry ends its sentence before the 3.11 entry`).toMatch(/[.。।] ?$/u);
    expect(log.includes("3.11") && log.includes("3.10") && log.includes("3.9"), `${code}: legal-report-button's pin still finds the old log`).toBe(true);
  });

  it("English reads exactly as the owner approved", () => {
    const next = lines(draftBytes("en").toString("utf8"));
    expect(next[EYEBROW]).toBe("eyebrow: PRIVACY POLICY · v3.12 · EFFECTIVE 4 NOVEMBER 2026");
    expect(next[END_MARKER]).toBe("endMarker: END OF POLICY · GDPR (EU) 2016/679 · v3.12");
    expect(next[VERSION_LINE]).toBe("**Version 3.12 · Effective 4 November 2026 · Previous versions at dezbatere.ro/privacy/versions · Controller: DMS Merchandise Shop S.R.L., Piatra Neamț**");
    expect(next[NEXT_LINE]).toBe(NEXT_SENTENCE);
    const prior = lines(readFileSync(resolve(root, "apps/ui/legal/archive/en", `${PRIOR.en}.md`), "utf8"));
    const tail = prior[CHANGE_LOG]!.slice(prior[CHANGE_LOG]!.indexOf("Version 3.11 replaced version 3.10:"));
    expect(next[CHANGE_LOG]).toBe(`This policy was last updated on 4 November 2026. ${CHANGE_ENTRY} ${tail}`);
  });

  it.each(LOCALES.map(({ code }) => [code]))("%s: the manifest carries 3.12 for the draft's exact bytes", (code) => {
    const current = manifest().documents.PRIVACY?.[code];
    expect(current).toEqual({ version: "3.12", sha256: createHash("sha256").update(draftBytes(code)).digest("hex") });
  });
});

describe("the Register names the two jobs before a debate starts", () => {
  it("adds the two purposes to the purpose list", () => {
    expect(PROVIDER_PURPOSES).toContain("suggestPaths");
    expect(PROVIDER_PURPOSES).toContain("clarifyQuestions");
  });

  it("DeepInfra suggests what to look into; Anthropic does both; the support row names both when Anthropic's is not shown", () => {
    expect(DEEPINFRA_PROVIDER.purposes).toEqual(["arguments", "judging", "story", "suggestPaths"]);
    expect(ANTHROPIC_PREVIEW_PROVIDER.purposes).toEqual(["arguments", "judging", "story", "synthesisCheck", "questionCheck", "reportCheck", "clarifyQuestions", "suggestPaths"]);
    expect(SUPPORT_PROVIDER.purposes).toEqual(["support"]);
    expect(providerRegister(["deepinfra"]).at(-1)?.purposes).toEqual(["synthesisCheck", "questionCheck", "reportCheck", "clarifyQuestions", "suggestPaths", "support"]);
    expect(providerRegister(["anthropic", "deepinfra"]).at(-1)).toBe(SUPPORT_PROVIDER);
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

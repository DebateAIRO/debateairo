import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// cookie-compliance S02 (SPEC-v2 R05, tightened by PLAN C2-1 for REQ-REV-CC-2-p2 N1 and N2): what the help bot is
// given about cookies names no preference, consent, analytics, telemetry, tracking or opt-out, and hedges on none —
// except the one reference sentence (the shipped /cookies denial), exactly once in privacy-consent and its recovery
// texts. The checker lives here; nothing is exported.

type Lang = "en" | "ro";
type Unit = Readonly<{ name: string; id: string; lang: Lang; kind: "md" | "recovery"; text: string }>;

const IDS = ["privacy-consent", "settings-help-menus", "app-navigation", "account-settings"] as const;
const LANGS: readonly Lang[] = ["en", "ro"];
const FIELDS = ["modelProjection", "fallback"] as const;

const P: Record<Lang, RegExp> = {
  en: /analytic|telemetr|preferenc|consent|track|opt[- ]?(?:in|out)|model quality|statistic|cookie (?:settings|choices)/iu,
  ro: /analitic|analiz|telemetr|preferin[țt]|consim[țt]|urmăr|urmarir|opt[- ]?(?:in|out)|calitatea modelului|alege(?:ți)? ce|set[ăa]ri(?:le)? (?:pentru )?cookie|alegeri(?:le)? cookie/iu,
};
const REF: Record<Lang, string> = {
  en: "We set no analytics, advertising or tracking cookies.",
  ro: "Nu setăm cookie-uri analitice, publicitare sau de urmărire.",
};

const normalize = (t: string): string =>
  t.normalize("NFC").replaceAll("ţ", "ț").replaceAll("Ţ", "Ț").replaceAll("ş", "ș").replaceAll("Ş", "Ș");

// KB file: title value + "." + body after the closing ---; a code span is dropped only when it is a route or an
// anchor (starts with "/" or contains "#"), otherwise its inner text stays; then the two ids are dropped.
function mdProse(raw: string): string {
  const parts = raw.split("---");
  const frontMatter = parts[1] ?? "";
  const body = parts.slice(2).join("---");
  const title = /^title:\s*"?(.*?)"?\s*$/mu.exec(frontMatter)?.[1] ?? "";
  return `${title}.\n${body}`
    .replace(/`([^`]*)`/gu, (_, inner: string) => (inner.startsWith("/") || inner.includes("#") ? " " : inner))
    .replace(/privacy-consent|consent-privacy-heading/gu, " ");
}

// Recovery text: prose in full — no stripping at all (SPEC-v2 R05 "a recovery text is prose in full").
const recoveryProse = (text: string): string => text;

const sentences = (t: string): string[] =>
  t.replace(/\s+/gu, " ").split(/(?<=[.!?])\s+/u).map((s) => s.trim()).filter(Boolean);

function violations(units: readonly Unit[]): string[] {
  const out: string[] = [];
  for (const unit of units) {
    let refCount = 0;
    for (const sentence of sentences(normalize(unit.text))) {
      if (!P[unit.lang].test(sentence)) continue;
      if (sentence === REF[unit.lang]) refCount += 1;
      else out.push(`${unit.name}: class sentence that is not the reference: ${sentence}`);
    }
    const want = unit.id === "privacy-consent" ? 1 : 0;
    if (refCount !== want) out.push(`${unit.name}: reference sentence count ${refCount}, want ${want}`);
  }
  return out;
}

// A corpus is the RAW text of each unit, keyed by unit name; toUnits applies the prose rule of each kind.
type Raw = Readonly<{ id: string; lang: Lang; kind: "md" | "recovery"; raw: string }>;
type Corpus = Map<string, Raw>;

const toUnits = (corpus: Corpus): Unit[] =>
  [...corpus].map(([name, { id, lang, kind, raw }]) => ({
    name,
    id,
    lang,
    kind,
    text: kind === "md" ? mdProse(raw) : recoveryProse(raw),
  }));

function cleanCorpus(): Corpus {
  const corpus: Corpus = new Map();
  for (const id of IDS) {
    for (const lang of LANGS) {
      const ref = id === "privacy-consent" ? ` ${REF[lang]}` : "";
      const title = lang === "en" ? "Clean title" : "Titlu curat";
      const body = lang === "en"
        ? "Open `/settings#consent-privacy-heading` to see the list."
        : "Deschide `/settings#consent-privacy-heading` pentru listă.";
      corpus.set(`md ${id}.${lang}`, {
        id, lang, kind: "md", raw: `---\nid: ${id}\nlang: ${lang}\ntitle: "${title}"\n---\n\n${body}${ref}\n`,
      });
      for (const field of FIELDS) {
        corpus.set(`recovery ${id}.${lang}.${field}`, {
          id, lang, kind: "recovery", raw: `${lang === "en" ? "Clean text." : "Text curat."}${ref}`,
        });
      }
    }
  }
  return corpus;
}

function realCorpus(): Corpus {
  const corpus: Corpus = new Map();
  const content = (file: string) => fileURLToPath(new URL(`../../packages/support-kb/content/${file}`, import.meta.url));
  for (const id of IDS) {
    for (const lang of LANGS) {
      corpus.set(`md ${id}.${lang}`, { id, lang, kind: "md", raw: readFileSync(content(`${id}.${lang}.md`), "utf8") });
    }
  }
  const componentPath = fileURLToPath(new URL("../../packages/support-kb/recovery/components.json", import.meta.url));
  const components = (JSON.parse(readFileSync(componentPath, "utf8")) as {
    components: Array<{ id: string; lang: Lang; modelProjection: string; fallback: string }>;
  }).components;
  for (const component of components) {
    if (!(IDS as readonly string[]).includes(component.id)) continue;
    for (const field of FIELDS) {
      corpus.set(`recovery ${component.id}.${component.lang}.${field}`, {
        id: component.id, lang: component.lang, kind: "recovery", raw: component[field],
      });
    }
  }
  return corpus;
}

// [label, unit name, sentence to append | "remove" (delete the reference sentence)]
const MUTANTS: ReadonlyArray<readonly [string, string, string]> = [
  ["N1 cookie settings (md app-navigation.en)", "md app-navigation.en", "You can switch off optional cookies in cookie settings."],
  ["N1 opt out without hyphen (md settings-help-menus.en)", "md settings-help-menus.en", "You can opt out of cookies from Settings."],
  ["N1 cookie choices (recovery account-settings.en.fallback)", "recovery account-settings.en.fallback", "Settings lets you manage your cookie choices."],
  ["N1 statistics hedge (md privacy-consent.en)", "md privacy-consent.en", "We cannot confirm whether statistics cookies are active."],
  ["N1 trackers (recovery app-navigation.en.modelProjection)", "recovery app-navigation.en.modelProjection", "Trackers may still be active."],
  ["N1 cedilla consimţ (recovery account-settings.ro.fallback)", "recovery account-settings.ro.fallback", "Setările includ consimţământul din browser."],
  ["N1 cedilla preferinţe (md app-navigation.ro)", "md app-navigation.ro", "Preferinţele cookie sunt locale."],
  ["N1 urmărim hedge (md privacy-consent.ro)", "md privacy-consent.ro", "Nu vă urmărim, dar nu putem confirma."],
  ["N1 alegeți ce (recovery settings-help-menus.ro.modelProjection)", "recovery settings-help-menus.ro.modelProjection", "Puteți alege ce module cookie acceptați."],
  ["N2 code span in a recovery text (recovery privacy-consent.en.fallback)", "recovery privacy-consent.en.fallback", "Open `Privacy preferences` in Settings."],
  ["N2 label code span in a KB body (md settings-help-menus.en)", "md settings-help-menus.en", "The `Cookie preferences` control stays in the browser."],
  ["N2 analytics code span in a KB body (md account-settings.en)", "md account-settings.en", "Some `analytics` may still be active."],
  ["B1 manage browser consent (recovery account-settings.en.fallback)", "recovery account-settings.en.fallback", "Choose Settings to manage browser consent."],
  ["B1 consimțământul (recovery account-settings.ro.fallback)", "recovery account-settings.ro.fallback", "Setările includ consimțământul din browser."],
  ["hedge (md privacy-consent.en)", "md privacy-consent.en", "It does not prove that every analytics system is disabled."],
  ["preference (md app-navigation.ro)", "md app-navigation.ro", "Preferințele cookie sunt locale."],
  ["reference twice (md privacy-consent.en)", "md privacy-consent.en", REF.en],
  ["reference outside privacy-consent (md app-navigation.en)", "md app-navigation.en", REF.en],
  ["reference missing (recovery privacy-consent.ro.fallback)", "recovery privacy-consent.ro.fallback", "remove"],
];

function mutate(corpus: Corpus, name: string, edit: string): Corpus {
  const unit = corpus.get(name);
  if (!unit) throw new Error(`mutant names an unknown unit: ${name}`);
  const copy: Corpus = new Map(corpus);
  const raw = edit === "remove"
    ? unit.raw.replace(REF[unit.lang], "")
    : `${unit.raw.replace(/\n$/u, "")} ${edit}${unit.kind === "md" ? "\n" : ""}`;
  if (raw === unit.raw) throw new Error(`mutant did not change ${name}`);
  copy.set(name, { ...unit, raw });
  return copy;
}

describe("Support KB honest prose (cookie-compliance S02, SPEC-v2 R05)", () => {
  it("accepts a clean corpus: the reference sentence once in privacy-consent, route code spans ignored", () => {
    expect(violations(toUnits(cleanCorpus()))).toEqual([]);
  });

  it.each(MUTANTS)("flags %s", (_label, name, edit) => {
    expect(violations(toUnits(mutate(cleanCorpus(), name, edit))).length).toBeGreaterThanOrEqual(1);
  });

  it("the 8 help articles carry no class sentence but the reference", () => {
    const units = toUnits(realCorpus()).filter(({ kind }) => kind === "md");
    expect(units).toHaveLength(8);
    expect(violations(units)).toEqual([]);
  });

  it("the 16 recovery texts carry no class sentence but the reference", () => {
    const units = toUnits(realCorpus()).filter(({ kind }) => kind === "recovery");
    expect(units).toHaveLength(16);
    expect(violations(units)).toEqual([]);
  });
});

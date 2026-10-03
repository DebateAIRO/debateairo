/**
 * S1b — the model scorecard's visitor sentences exist in all 35 interface locales,
 * English exactly as committed, and translated (never an English stand-in) in the
 * five sample locales the catalogue contract samples, and in Romanian.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BACKUP_MODEL_USED_WORDING } from "@debateai/runner";

const MESSAGES = new URL("../../apps/ui/messages/", import.meta.url);
const read = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`${locale}/${namespace}.json`, MESSAGES), "utf8")) as Record<string, string>;
const LOCALES = readdirSync(MESSAGES, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

const ENGLISH: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  newDebate: {
    "newDebate.modelStrength": "Model strength",
    "newDebate.modelStrengthEconomy": "Economy",
    "newDebate.modelStrengthBalanced": "Balanced",
    "newDebate.modelStrengthBest": "Best",
    "newDebate.modelStrengthPendingHint": "How strong the models doing each debate job are",
    "newDebate.modelStrengthNotInEffectHint": "How strong the models doing each debate job are · not in effect until the models have been scored",
    "newDebate.modelStrengthFreeHint": "How strong the models doing each debate job are · fixed by the Free plan",
    "newDebate.modelStrengthPremiumHint": "How strong the models doing each debate job are · this site's usual setting applies until you choose",
    "newDebate.modelStrengthUnavailableHint": "How strong the models doing each debate job are · not available right now",
    "newDebate.planModelsChosenPerPart": "The AI models are chosen for each part of the debate.",
    "requestFailure.kind.MODEL_BUDGET_TOO_SMALL": "This debate would cost more than this site allows for one debate.",
    "requestFailure.kind.MODEL_UNAVAILABLE": "The coordinator refused it: one of the debate's jobs has no AI model it can reach right now. Retry later."
  },
  debateChrome: {
    "debateChrome.condition.backupModelUsed": "Where a planned AI model could not be used, another one stepped in",
    "requestFailure.kind.MODEL_BUDGET_TOO_SMALL": "This debate would cost more than this site allows for one debate.",
    "requestFailure.kind.MODEL_UNAVAILABLE": "The coordinator refused it: one of the debate's jobs has no AI model it can reach right now. Retry later."
  },
  misc: {
    "misc.answerHonesty.modelsChosen.title": "Models chosen for this debate",
    "misc.answerHonesty.modelsChosen.standIn": "Where a chosen model could not be used, another AI model may have stepped in.",
    "misc.answerHonesty.modelsChosen.siteSetting": "This site's usual setting chooses the model for this job.",
    "misc.answerHonesty.modelsChosen.crossExchange": "The model that wrote each opening position also writes its replies to the other positions.",
    "misc.answerHonesty.modelsChosen.job.position": "Writing the opening positions",
    "misc.answerHonesty.modelsChosen.job.supportAttack": "Writing supporting and opposing arguments",
    "misc.answerHonesty.modelsChosen.job.crossExchange": "Replying to the other positions",
    "misc.answerHonesty.modelsChosen.job.judge": "Judging the arguments",
    "misc.answerHonesty.modelsChosen.job.reviewer": "Reviewing the arguments",
    "misc.answerHonesty.modelsChosen.job.answerWriter": "Writing the answer",
    "misc.answerHonesty.modelsChosen.job.answerChecker": "Checking the answer",
    "misc.answerHonesty.backupRecord.standIn.subject": "Planned AI models",
    "misc.answerHonesty.backupRecord.standIn.reason": "One or more AI models planned for this debate could not be used, so other AI models answered in their place.",
    "misc.answerHonesty.backupRecord.standIn.liftPath": "Ask again later to give the planned AI models another chance.",
    "misc.answerHonesty.backupRecord.usual.subject": "Extra AI model",
    "misc.answerHonesty.backupRecord.usual.reason": "An AI model chosen to add variety to this debate could not be used, so the usual AI model answered in its place.",
    "misc.answerHonesty.backupRecord.usual.liftPath": "Ask again later if you want that extra variety."
  }
});

describe("S1b · the model scorecard's sentences in every interface locale", () => {
  it("has 35 locales", () => {
    expect(LOCALES).toHaveLength(35);
  });

  it.each(Object.keys(ENGLISH))("%s: English is exactly the committed sentence", (namespace) => {
    const english = read("en", namespace);
    for (const [key, value] of Object.entries(ENGLISH[namespace]!)) expect(english[key], key).toBe(value);
  });

  it.each(Object.keys(ENGLISH))("%s: every locale carries every key, never empty", (namespace) => {
    for (const locale of LOCALES) {
      const catalog = read(locale, namespace);
      for (const key of Object.keys(ENGLISH[namespace]!)) {
        expect(typeof catalog[key], `${locale}/${namespace}:${key}`).toBe("string");
        expect(catalog[key]!.trim(), `${locale}/${namespace}:${key}`).not.toBe("");
      }
    }
  });

  it.each(Object.keys(ENGLISH))("%s: translated, not an English stand-in, in ar de es fr ja and ro", (namespace) => {
    for (const locale of ["ar", "de", "es", "fr", "ja", "ro"]) {
      const catalog = read(locale, namespace);
      for (const [key, value] of Object.entries(ENGLISH[namespace]!)) {
        expect(catalog[key], `${locale}/${namespace}:${key}`).not.toBe(value);
      }
    }
  });

  it("words both refusals identically in the two catalogues that read them, in every locale", () => {
    for (const locale of LOCALES) {
      const create = read(locale, "newDebate");
      const chrome = read(locale, "debateChrome");
      for (const kind of ["MODEL_BUDGET_TOO_SMALL", "MODEL_UNAVAILABLE"]) {
        expect(chrome[`requestFailure.kind.${kind}`], `${locale} ${kind}`).toBe(create[`requestFailure.kind.${kind}`]);
      }
    }
  });

  it("keys the drawer's two BACKUP-MODEL-USED records by the runner's own subjects, and words them in English exactly as the runner does", () => {
    const drawer = readFileSync(new URL("../../apps/ui/components/AnswerHonestyDrawer.tsx", import.meta.url), "utf8");
    const english = read("en", "misc");
    for (const [kind, wording] of [["standIn", BACKUP_MODEL_USED_WORDING.STAND_IN], ["usual", BACKUP_MODEL_USED_WORDING.USUAL]] as const) {
      // A reworded runner subject would leave the drawer's table keyed by a subject no record carries.
      expect(drawer, kind).toContain(`${JSON.stringify(wording.subject)}: Object.freeze({`);
      expect(english[`misc.answerHonesty.backupRecord.${kind}.subject`], kind).toBe(wording.subject);
      expect(english[`misc.answerHonesty.backupRecord.${kind}.reason`], kind).toBe(wording.reason);
      expect(english[`misc.answerHonesty.backupRecord.${kind}.liftPath`], kind).toBe(wording.liftPath);
    }
  });
});

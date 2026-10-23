import { AskRequestSchema, ContractHttpError, type AskRequest, type ContractClient, type QuestionLanguageOffer } from "@debateai/contract";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- the root test compiler has no JSX mode; Vitest transpiles this TSX module.
import { buildNewDebateAskConfig } from "../../apps/ui/app/new/defaults.js";
import { createDebate, isQuestionLanguageCheckStale, QuestionLanguageChoiceNeededError } from "../../apps/ui/lib/api.js";
import { classifyRequestFailure } from "../../apps/ui/lib/v3/requestFailure.js";

/**
 * Question language (spec 2026-10-13), P2L Task 18: /new sends the page's language with the ask and
 * reads the server's real-mix offer as data. Without the fifth argument createDebate is today's call.
 */

const SUBMIT_TIME = new Date("2026-10-13T10:00:00.000Z");
const CONFIG = buildNewDebateAskConfig({
  riskTier: "standard", budgetTier: "low", decisionScope: "language wire", asOf: "2026-10-13T09:00:00.000Z",
  depth: 2, asOfWasEdited: false, planTier: "premium"
}, SUBMIT_TIME);
const OFFER: QuestionLanguageOffer = { check_ref: "ref.sig", main_language: { code: "ro", name: "Romanian" },
  languages_seen: [{ code: "ro", name: "Romanian" }, { code: "en", name: "English" }], proposed_question: "Q în română?" };

function capturingClient(outcome: "ACCEPTED" | "LANGUAGE_CHOICE_NEEDED" = "ACCEPTED") {
  const today: AskRequest[] = [];
  const withChoice: AskRequest[] = [];
  const client = {
    submitAsk: async (ask: AskRequest) => { today.push(ask); return { run_ref: "run:today", status: "QUEUED" }; },
    submitAskOrLanguageChoice: async (ask: AskRequest) => {
      withChoice.push(ask);
      return outcome === "ACCEPTED"
        ? { kind: "ACCEPTED", accepted: { run_ref: "run:language", status: "QUEUED" } }
        : { kind: "LANGUAGE_CHOICE_NEEDED", offer: OFFER };
    }
  };
  return { client: client as unknown as ContractClient, today, withChoice };
}

const stale = (code: string, status = 409) => new ContractHttpError("SERVER_FAILURE", status, `${code}: ${code}`, code);

describe("P2L Task 18 — the ask's language fields on the wire", () => {
  it("without the fifth argument the ask is today's ask, sent by today's call", async () => {
    const { client, today, withChoice } = capturingClient();
    expect(await createDebate("Should the city fund the tram?", CONFIG, "test-token", client)).toEqual({ id: "run:today" });
    expect(withChoice).toEqual([]);
    expect(today[0]).not.toHaveProperty("site_language");
    expect(today[0]).not.toHaveProperty("question_language_choice");
  });

  it("sends the site language, and the person's choice only when there is one", async () => {
    const { client, today, withChoice } = capturingClient();
    expect(await createDebate("Q?", CONFIG, "test-token", client, { siteLanguage: "ro" })).toEqual({ id: "run:language" });
    expect(withChoice[0]).toMatchObject({ question_line: "Q?", site_language: "ro" });
    expect(withChoice[0]).not.toHaveProperty("question_language_choice");
    const choice = { check_ref: "ref.sig", choice: "KEEP_MINE" } as const;
    await createDebate("Q?", CONFIG, "test-token", client, { siteLanguage: "ro", choice });
    expect(withChoice[1]).toMatchObject({ site_language: "ro", question_language_choice: choice });
    expect(today).toEqual([]);
  });

  it("M4: the strict contract accepts exactly what the page builds: no choice, USE_REWRITE and KEEP_MINE", async () => {
    const { client, withChoice } = capturingClient();
    await createDebate("Q mixed?", CONFIG, "test-token", client, { siteLanguage: "ro" });
    await createDebate(OFFER.proposed_question, CONFIG, "test-token", client, { siteLanguage: "ro",
      choice: { check_ref: OFFER.check_ref, choice: "USE_REWRITE", original_question_line: "Q mixed?" } });
    await createDebate("Q mixed?", CONFIG, "test-token", client, { siteLanguage: "en",
      choice: { check_ref: OFFER.check_ref, choice: "KEEP_MINE" } });
    expect(withChoice).toHaveLength(3);
    for (const ask of withChoice) expect(AskRequestSchema.parse(ask)).toEqual(ask);
    expect(withChoice.map((ask) => ask.question_language_choice?.choice)).toEqual([undefined, "USE_REWRITE", "KEEP_MINE"]);
  });

  it("an offer is thrown as QuestionLanguageChoiceNeededError carrying the server's offer", async () => {
    const { client } = capturingClient("LANGUAGE_CHOICE_NEEDED");
    const failure = await createDebate("Q?", CONFIG, "test-token", client, { siteLanguage: "en" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QuestionLanguageChoiceNeededError);
    expect((failure as QuestionLanguageChoiceNeededError).offer).toEqual(OFFER);
  });

  it("a stale check is read from serverCode on a 409, never from the client's .code", () => {
    for (const code of ["QUESTION_LANGUAGE_CHECK_INVALID", "QUESTION_LANGUAGE_CHECK_EXPIRED", "QUESTION_LANGUAGE_CHOICE_MISMATCH"]) {
      expect(isQuestionLanguageCheckStale(stale(code))).toBe(true);
      expect(isQuestionLanguageCheckStale(stale(code, 422))).toBe(false);
    }
    expect(isQuestionLanguageCheckStale(stale("QUESTION_LANGUAGE_CHOICE_NEEDED"))).toBe(false);
    expect(isQuestionLanguageCheckStale(new ContractHttpError("SERVER_FAILURE", 409, "x"))).toBe(false);
    expect(isQuestionLanguageCheckStale(new Error("QUESTION_LANGUAGE_CHECK_EXPIRED"))).toBe(false);
  });

  it("side-by-side §13 (Task S12): the room read's settings version rides with the ask, on both calls, and only when named", async () => {
    const named = buildNewDebateAskConfig({
      riskTier: "standard", budgetTier: "low", decisionScope: "language wire", asOf: "2026-10-13T09:00:00.000Z",
      depth: 2, asOfWasEdited: false, planTier: "premium", settingsVersion: 17
    }, SUBMIT_TIME);
    expect(named).toMatchObject({ settings_version: 17 });
    expect(CONFIG).not.toHaveProperty("settings_version");
    const { client, today, withChoice } = capturingClient();
    await createDebate("Q?", named, "test-token", client);
    await createDebate("Q?", named, "test-token", client, { siteLanguage: "ro" });
    await createDebate("Q?", CONFIG, "test-token", client);
    expect(today[0]).toMatchObject({ settings_version: 17 });
    expect(withChoice[0]).toMatchObject({ settings_version: 17, site_language: "ro" });
    expect(today[1]).not.toHaveProperty("settings_version");
    // The strict contract accepts exactly what the page builds.
    for (const ask of [...today, ...withChoice]) expect(AskRequestSchema.parse(ask)).toEqual(ask);
    await expect(createDebate("Q?", { ...named, settings_version: 0 }, "test-token", client)).rejects.toThrow(/settings_version/u);
  });

  it("a stale check or an offer the page could not answer reads 'try again', never the coordinator failing", () => {
    expect(classifyRequestFailure("DEBATE_CREATE", stale("QUESTION_LANGUAGE_CHECK_EXPIRED")).kind).toBe("BUSY");
    expect(classifyRequestFailure("DEBATE_CREATE", new QuestionLanguageChoiceNeededError(OFFER)).kind).toBe("BUSY");
    // Any other 409 keeps today's reading.
    expect(classifyRequestFailure("DEBATE_CREATE", stale("SOMETHING_ELSE")).kind).toBe("SERVER_FAILED");
  });
});

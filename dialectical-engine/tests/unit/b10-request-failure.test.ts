import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ContractHttpError, createContractClient, type AskRequest } from "@debateai/contract";
import { classifyRequestFailure, isAskSettingsChanged, requestFailureMessage } from "../../apps/ui/lib/v3/requestFailure.js";
import { ROOM_KEYS, composerRoomCatalog } from "../../apps/ui/lib/billing/roomCatalog.js";

const catalogue = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(`apps/ui/messages/${locale}/${namespace}.json`, "utf8")) as Record<string, string>;
const alreadyWaiting = () => new ContractHttpError(
  "UNPROCESSABLE", 422, "ASK_ALREADY_WAITING: ASK_ALREADY_WAITING", "ASK_ALREADY_WAITING"
);
const WAITS_UNTIL = "2026-10-01T03:00:00.000Z";
const answering = (status: number, body: unknown) =>
  createContractClient("https://api.debateai.test", (async () => Response.json(body, { status })) as typeof fetch);
const anAsk = {
  question_line: "Should cities ban cars downtown?", plan_tier: "free", risk_tier: "standard", tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:plan-tier-free", composition_budget_tier: "low", depth_params: { depth: 2 },
  decision_scope: "b10", as_of: "2026-09-29T00:00:00.000Z", steering_presets: [], steering_annotations: []
} as unknown as AskRequest;

describe("the contract client keeps the waiting run's start from the 422 body (budget spec §2.7)", () => {
  it("reads run_ref and waits_until onto the error, and nothing from any other refusal", async () => {
    const refused = await answering(422, {
      error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING", run_ref: "run:waiting", waits_until: WAITS_UNTIL
    }).submitAsk(anAsk).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ContractHttpError);
    expect(refused).toMatchObject({ status: 422, serverCode: "ASK_ALREADY_WAITING", waiting: { runRef: "run:waiting", waitsUntil: WAITS_UNTIL } });
    const other = await answering(422, { error: "ASK_PLAN_TIER_INVALID", message: "x" }).submitAsk(anAsk).catch((error: unknown) => error);
    expect(other).toMatchObject({ serverCode: "ASK_PLAN_TIER_INVALID", waiting: null });
    const malformed = await answering(422, { error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING", run_ref: "run:waiting" })
      .submitAsk(anAsk).catch((error: unknown) => error);
    expect(malformed).toMatchObject({ serverCode: "ASK_ALREADY_WAITING", waiting: null });
  });

  it("keeps waits_for OWN_DEBATES from the 422 body, and none when the body names none (Important 1)", async () => {
    const ownDebates = await answering(422, {
      error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING", run_ref: "run:waiting", waits_until: WAITS_UNTIL,
      waits_for: "OWN_DEBATES"
    }).submitAsk(anAsk).catch((error: unknown) => error);
    expect(ownDebates).toMatchObject({ waiting: { runRef: "run:waiting", waitsUntil: WAITS_UNTIL, waitsFor: "OWN_DEBATES" } });
    const reset = await answering(422, {
      error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING", run_ref: "run:waiting", waits_until: WAITS_UNTIL
    }).submitAsk(anAsk).catch((error: unknown) => error);
    expect((reset as ContractHttpError).waiting).toEqual({ runRef: "run:waiting", waitsUntil: WAITS_UNTIL });
  });
});

describe("422 ASK_ALREADY_WAITING is its own kind (budget spec §2.11)", () => {
  it("classifies as ALREADY_WAITING with sentence D's first sentence, in the site language", () => {
    expect(classifyRequestFailure("DEBATE_CREATE", alreadyWaiting()).kind).toBe("ALREADY_WAITING");
    expect(requestFailureMessage("DEBATE_CREATE", alreadyWaiting(), catalogue("en", "newDebate"))).toBe(
      "Starting this debate did not complete. One question can wait at a time. Ask this one after your waiting debate has started."
    );
    expect(requestFailureMessage("DEBATE_CREATE", alreadyWaiting(), catalogue("ro", "newDebate")))
      .toContain(catalogue("ro", "newDebate")["requestFailure.kind.ALREADY_WAITING"]!);
  });

  it("leaves every other 422 as before", () => {
    const other = new ContractHttpError("UNPROCESSABLE", 422, "ASK_PLAN_TIER_INVALID: x", "ASK_PLAN_TIER_INVALID");
    expect(classifyRequestFailure("DEBATE_CREATE", other).kind).toBe("PLAN_TIER_INVALID");
  });
});

describe("the home composer ships the room sentences and nothing more", () => {
  it("hands over exactly the room keys, in the interface's language", () => {
    const handed = composerRoomCatalog(catalogue("ro", "newDebate"));
    expect(Object.keys(handed).sort()).toEqual([...ROOM_KEYS].sort());
    expect(handed["newDebate.room.siteFull"]).toBe(catalogue("ro", "newDebate")["newDebate.room.siteFull"]);
  });

  it("keeps every {time} placeholder in all 35 locales, and no figure of money", () => {
    for (const locale of readdirLocales()) {
      const catalog = catalogue(locale, "newDebate");
      for (const key of ROOM_KEYS) {
        const english = catalogue("en", "newDebate")[key]!;
        expect(catalog[key], `${locale} ${key}`).toBeTypeOf("string");
        expect(catalog[key]!.includes("{time}"), `${locale} ${key} {time}`).toBe(english.includes("{time}"));
        expect(catalog[key], `${locale} ${key}`).not.toMatch(/\$|USD|\p{Nd}/u);
      }
    }
  });
});

/**
 * Side-by-side spec §13 (Task S12; wording owner-approved 2026-10-22): the choices for new debates changed between the
 * page's room read and the ask. POST /v1/asks answers 409 ASK_SETTINGS_CHANGED; /new reads the room again and shows one
 * plain sentence, `newDebate.settingsChanged`, in every locale — never the code.
 */
describe("409 ASK_SETTINGS_CHANGED is the one 'please choose again' sentence (side-by-side spec §13)", () => {
  const KEY = "newDebate.settingsChanged";
  const ENGLISH = "The choices for new debates just changed. Please check yours and ask again.";
  const changed = () => new ContractHttpError("SERVER_FAILURE", 409, "ASK_SETTINGS_CHANGED: ASK_SETTINGS_CHANGED", "ASK_SETTINGS_CHANGED");

  it("the contract client reads the 409 body's code, on both ask calls", async () => {
    const body = { error: "ASK_SETTINGS_CHANGED", message: "ASK_SETTINGS_CHANGED" };
    for (const call of [
      () => answering(409, body).submitAsk(anAsk),
      () => answering(409, body).submitAskOrLanguageChoice(anAsk)
    ]) {
      const refused = await call().catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(ContractHttpError);
      expect(refused).toMatchObject({ status: 409, serverCode: "ASK_SETTINGS_CHANGED" });
      expect(isAskSettingsChanged(refused)).toBe(true);
    }
  });

  it("is the approved sentence alone, with or without the English catalogue", () => {
    expect(requestFailureMessage("DEBATE_CREATE", changed())).toBe(ENGLISH);
    expect(requestFailureMessage("DEBATE_CREATE", changed(), catalogue("en", "newDebate"))).toBe(ENGLISH);
    expect(catalogue("en", "newDebate")[KEY]).toBe(ENGLISH);
  });

  it("every locale has the key, translated, with no code, status or figure (the locale-parity check for this key)", () => {
    for (const locale of readdirLocales()) {
      const value = catalogue(locale, "newDebate")[KEY];
      expect(value, `${locale} ${KEY}`).toBeTypeOf("string");
      expect(value!.trim().length, `${locale} ${KEY}`).toBeGreaterThan(0);
      expect(requestFailureMessage("DEBATE_CREATE", changed(), catalogue(locale, "newDebate"))).toBe(value);
      if (locale !== "en") expect(value, `${locale} is translated`).not.toBe(ENGLISH);
      expect(value, locale).not.toMatch(/\p{Nd}|ASK_|SETTINGS|409|coordinat/u);
    }
    expect(catalogue("ro", "newDebate")[KEY]).not.toMatch(/[şţŞŢ]/u);
  });

  it("only the 409 the ask route answers is this sentence; other subjects and codes read as before", () => {
    const wrongStatus = new ContractHttpError("UNPROCESSABLE", 422, "ASK_SETTINGS_CHANGED: x", "ASK_SETTINGS_CHANGED");
    expect(isAskSettingsChanged(wrongStatus)).toBe(false);
    expect(requestFailureMessage("DEBATE_CREATE", wrongStatus)).not.toBe(ENGLISH);
    expect(requestFailureMessage("DEBATE_READ", changed())).not.toBe(ENGLISH);
    expect(isAskSettingsChanged(new ContractHttpError("SERVER_FAILURE", 409, "x"))).toBe(false);
    expect(isAskSettingsChanged(new Error("ASK_SETTINGS_CHANGED"))).toBe(false);
  });
});

function readdirLocales(): string[] {
  const locales = readdirSync("apps/ui/messages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  expect(locales).toHaveLength(35);
  return locales;
}

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ContractHttpError, createContractClient, type AskRequest } from "@debateai/contract";
import { classifyRequestFailure, requestFailureMessage } from "../../apps/ui/lib/v3/requestFailure.js";
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

function readdirLocales(): string[] {
  const locales = readdirSync("apps/ui/messages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  expect(locales).toHaveLength(35);
  return locales;
}

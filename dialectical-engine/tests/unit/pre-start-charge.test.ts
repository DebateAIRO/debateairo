/**
 * V4 start step, Task 17 (spec 2026-11-03 §5.2): the small AIs before Start (the angle planner, the list writers, the
 * merges, the combine and the fit check) are charged as PRE_START: run-less, written only by
 * identity.record_pre_start_charge (0158), in the person's windows through their own reader, and in the person's export
 * as the time and the kind only, never the cost or the person's key.
 */
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  PRE_START_CHARGE_KINDS, PRE_START_CHARGE_WRITER, PRE_START_TRY_CHARGE_WRITER, PostgresModelSpendStore, linkPreStartTry, preStartSpendRef, readRunQuotaUsed,
  recordPreStartCharge
} from "@debateai/budget";
import { RAW_SECTIONS, KEEP_COLUMNS, collectSnapshot } from "../../apps/api/src/data-export/snapshot.js";
import { buildArchive } from "../../apps/api/src/data-export/archive.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { readZip } from "../support/zip-reader.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const at = (iso: string) => new Date(iso);

describe("the pre-Start charge", () => {
  it("names each call by its kind, its company and its model", () => {
    expect(PRE_START_CHARGE_KINDS).toEqual(["ANGLES", "LIST", "MERGE", "MERGE_LATE", "COMBINE", "FIT"]);
    expect(PRE_START_CHARGE_WRITER).toBe("identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint)");
    expect(preStartSpendRef("LIST", "deepinfra", "zai-org/GLM-5.3-Flash")).toBe("pre-start:list:deepinfra:zai-org/GLM-5.3-Flash");
    expect(preStartSpendRef("MERGE_LATE", "anthropic", "claude-haiku-5-5")).toBe("pre-start:merge-late:anthropic:claude-haiku-5-5");
  });

  it("is written by its own function only, in one call with the kind beside the reference", async () => {
    const calls: unknown[][] = [];
    const pool = { query: async (text: string, values: unknown[]) => { calls.push([text, values]); return { rows: [] }; } } as unknown as Pool;
    await recordPreStartCharge(pool, { spendId: "s", ownerRef: "o", grant: { grantId: "g", grantEventId: "e" }, kind: "FIT",
      providerRef: "pre-start:fit:anthropic:claude-haiku-5-5", chargedOn: "2026-11-03", chargeMicros: 40, inputTokens: 700, outputTokens: 90 });
    expect(calls[0]).toEqual(["SELECT identity.record_pre_start_charge($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::date,$8::bigint,$9::bigint,$10::bigint)",
      ["s", "o", "g", "e", "FIT", "pre-start:fit:anthropic:claude-haiku-5-5", "2026-11-03", 40, 700, 90]]);
    const store = new PostgresModelSpendStore({ query: async () => { throw new Error("no query may run"); } } as unknown as Pool);
    await expect(store.recordSpend({ spendSource: "PRE_START", runId: null } as never)).rejects.toMatchObject({ code: "MODEL_SPEND_PRE_START_FUNCTION_ONLY" });
  });

  // V4 start step, Task 57c (owner, 5 Nov: a failed question gives back its path-list charge): a call made for a try names it (0165).
  it("a call made for a try is written by 0165's writer with the try, in one call; the link at Start and the failed debate's quota read are 0165's", async () => {
    const TRY = "a".repeat(64);
    const calls: unknown[][] = [];
    const pool = { query: async (text: string, values: unknown[]) => {
      calls.push([text, values]);
      return { rows: [text.includes("link_pre_start_try") ? { given: 2 } : { used: "NONE" }] };
    } } as unknown as Pool;
    await recordPreStartCharge(pool, { spendId: "s", ownerRef: "o", grant: null, kind: "LIST", providerRef: "pre-start:list:deepinfra:zai-org/GLM-5.3-Flash",
      chargedOn: "2026-11-05", chargeMicros: 40, inputTokens: 700, outputTokens: 90, tryRef: TRY });
    expect(PRE_START_TRY_CHARGE_WRITER).toBe("identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text)");
    expect(calls[0]).toEqual(["SELECT identity.record_pre_start_try_charge($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::date,$8::bigint,$9::bigint,$10::bigint,$11::text)",
      ["s", "o", null, null, "LIST", "pre-start:list:deepinfra:zai-org/GLM-5.3-Flash", "2026-11-05", 40, 700, 90, TRY]]);
    expect(await linkPreStartTry(pool, { ownerRef: OWNER, tryRef: TRY, runId: "r" })).toBe(2);
    expect(calls[1]).toEqual(["SELECT identity.link_pre_start_try($1::uuid,$2::text,$3::uuid) AS given", [OWNER, TRY, "r"]]);
    expect(await readRunQuotaUsed(pool, { ownerRef: OWNER, runId: "r" })).toBe("NONE");
    expect(calls[2]).toEqual(["SELECT identity.read_run_quota_used($1::uuid,$2::uuid) AS used", [OWNER, "r"]]);
    const answering = (used: unknown) => ({ query: async () => ({ rows: [{ used }] }) }) as unknown as Pool;
    expect(await readRunQuotaUsed(answering("SOME"), { ownerRef: OWNER, runId: "r" })).toBe("SOME");
    expect(await readRunQuotaUsed(answering(null), { ownerRef: OWNER, runId: "r" })).toBeNull();
    expect(await readRunQuotaUsed(answering("MAYBE"), { ownerRef: OWNER, runId: "r" })).toBeNull();
  });

  it("counts in both of the person's subscription window readers", async () => {
    const texts: string[] = [];
    const pool = { query: async (text: string, values: unknown[]) => {
      texts.push(text);
      return { rows: Array.isArray(values[1]) ? (values[1] as unknown[]).map((_v, index) => ({ ordinal: String(index + 1), total: "0" })) : [{ total: "0" }] };
    } } as unknown as Pool;
    const store = new PostgresModelSpendStore(pool);
    await store.readOwnerSpentMicros(OWNER, at("2026-11-01T00:00:00.000Z"), at("2026-11-02T00:00:00.000Z"));
    await store.readOwnerSpentInRangesMicros(OWNER, [{ from: at("2026-11-01T00:00:00.000Z"), to: at("2026-11-02T00:00:00.000Z") }]);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("identity.read_pre_start_spent($1::uuid, $2::timestamptz, $3::timestamptz)");
    expect(texts[1]).toContain("identity.read_pre_start_spent($1::uuid, window_range.from_at, window_range.to_at)");
  });
});

describe("the pre-Start charge in the person's export", () => {
  it("is the time and the kind only, in account.json", async () => {
    const raw: Record<string, unknown> = Object.fromEntries(RAW_SECTIONS.map(section => [section, []]));
    raw.user = { pseudonym: "Ada", email_ciphertext: {}, recovery_email_ciphertext: null, phone_ciphertext: null, phone_source: null,
      phone_verification_status: null, state: "active", created_at: "2026-01-01T00:00:00.000Z", adult_affirmed_at: "2026-01-01T00:00:00.000Z" };
    raw.registration_region = null;
    raw.recovery_codes = null;
    raw.page_reading_level = null;
    raw.billing = Object.fromEntries(Object.keys(KEEP_COLUMNS.billing).map(key => [key, []]));
    raw.pre_start_calls = [{ recorded_at: "2026-11-03T08:00:00+00:00", kind: "LIST", charge_micros: 40, owner_ref: "secret-owner" }];
    const snapshot = await collectSnapshot({
      claim: { exportId: "export", userId: "user", ownerRef: "owner", sessionId: "session", locale: "en",
        requestedAt: new Date("2026-11-03T10:00:00.000Z"), attempt: 1 }, workerId: "worker",
      source: { readRaw: async () => raw as never }, ownerView: {} as never,
      decrypt: { openPublicFlag: async () => { throw new Error("no report"); }, openUserField: async () => "ada@example.test", openRecord: () => "",
        openSupport: async () => "", openRunContent: async () => [] },
      now: () => new Date("2026-11-03T11:00:00.000Z")
    });
    const text = readZip(buildArchive(snapshot, loadArchiveCatalog("en")).zip).find(entry => entry.name === "account.json")!.bytes.toString("utf8");
    expect(JSON.parse(text).before_start_readings).toEqual([{ recorded_at: "2026-11-03T08:00:00.000Z", kind: "LIST" }]);
    for (const absent of ["secret-owner", "charge_micros"]) expect(text, absent).not.toContain(absent);
  });
});

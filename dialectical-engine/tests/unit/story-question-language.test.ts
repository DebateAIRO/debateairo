import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ContractHttpError, RunProjectionSchema, type Answer, type ContractClient } from "@debateai/contract";
import { RunRepository } from "@debateai/db";
import { PostgresAskApplication } from "../../apps/api/src/index.js";
import { getDebateServer, questionLanguageTagOf } from "../../apps/ui/lib/serverApi.js";
import { languageOfferLocale, localeDirection, questionLocale } from "../../apps/ui/lib/i18n/questionLocale.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * R2 (spec 2026-09-26 §14.3): the question's language reaches the UI on its
 * own, through the run read, because the story row is null while the story is
 * WRITING or UNAVAILABLE. The tag is dev's core.run.argument_language_tag.
 */

const LEGACY_OWNER = Object.freeze({ ownerRef: null, legacyAskerId: "asker:owner" });

const RUN = {
  run_ref: "run:settled",
  question_line: "Ar trebui să ne mutăm la Cluj?",
  state: "SETTLED" as const,
  terminal_reason: null,
  hold_until: null
};

describe("the run read carries the question's language", () => {
  it("parses a run with its language, with none recorded, and from before the field existed", () => {
    expect(RunProjectionSchema.parse({ ...RUN, argument_language: { tag: "ro", name: "Romanian" } }).argument_language)
      .toEqual({ tag: "ro", name: "Romanian" });
    expect(RunProjectionSchema.parse({ ...RUN, argument_language: null }).argument_language).toBeNull();
    expect(RunProjectionSchema.parse(RUN).argument_language).toBeUndefined();
  });

  it("stays strict about the language's shape", () => {
    const refused = [
      { tag: "", name: "Romanian" },
      { tag: "x".repeat(36), name: "Romanian" },
      { tag: "ro", name: "" },
      { tag: "ro" },
      { tag: "ro", name: "Romanian", native: "Română" },
      "ro"
    ];
    for (const argument_language of refused) {
      expect(RunProjectionSchema.safeParse({ ...RUN, argument_language }).success, JSON.stringify(argument_language)).toBe(false);
    }
  });

  function fakePool(columnsApplied: boolean) {
    const calls: string[] = [];
    const query = async (text: string) => {
      calls.push(text);
      if (text.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
      if (text.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
      if (text.includes("run_private_content_is_live")) return { rows: [{ run_id: "run:settled", live: true }] };
      if (text.includes("column_name IN ('argument_language_tag','argument_language_name')")) {
        return { rows: [{ applied: columnsApplied }] };
      }
      if (text.includes("information_schema.columns")) return { rows: [{ applied: false }] };
      if (text.includes("core.run_is_owned_by")) {
        return {
          rows: [{
            run_id: "run:settled",
            question_line: RUN.question_line,
            content_ciphertext: null,
            state: "SETTLED",
            terminal_reason: null,
            hold_until: null,
            ...(columnsApplied ? { argument_language_tag: "ro", argument_language_name: "Romanian" } : {})
          }]
        };
      }
      throw new Error(`UNEXPECTED_QUERY:${text}`);
    };
    return { calls, pool: { query, connect: async () => ({ query, release: () => undefined }) } as unknown as Pool };
  }

  it("reads the tag and its English name from core.run once dev's migration 0072 is applied", async () => {
    const { calls, pool } = fakePool(true);
    const projection = await new RunRepository(pool).readLoadingProjection("run:settled", "asker:owner");
    expect(projection?.argumentLanguage).toEqual({ tag: "ro", name: "Romanian" });
    expect(calls.find((text) => text.includes("core.run_is_owned_by"))).toMatch(/run\.argument_language_tag, run\.argument_language_name/u);
  });

  it("reads no language, and selects no such column, on a database without the columns", async () => {
    const { calls, pool } = fakePool(false);
    const projection = await new RunRepository(pool).readLoadingProjection("run:settled", "asker:owner");
    expect(projection?.argumentLanguage).toBeNull();
    expect(calls.find((text) => text.includes("core.run_is_owned_by"))).not.toContain("argument_language_tag");
  });

  it("GET /v1/runs/{id} answers with the language (the API's run read)", async () => {
    const { pool } = fakePool(true);
    const other = () => ({ query: async () => ({ rows: [] }) }) as unknown as Pool;
    const application = new PostgresAskApplication(
      pool, {} as never, {} as never, { read: async () => null } as never, other(), { server: other(), legacy: other() }
    );
    const run = await application.readRun("run:settled", {} as never, LEGACY_OWNER);
    expect(run).toEqual({ ...RUN, argument_language: { tag: "ro", name: "Romanian" } });
    const { pool: legacyPool } = fakePool(false);
    const legacy = new PostgresAskApplication(
      legacyPool, {} as never, {} as never, { read: async () => null } as never, other(), { server: other(), legacy: other() }
    );
    expect((await legacy.readRun("run:settled", {} as never, LEGACY_OWNER))?.argument_language).toBeNull();
  });
});

describe("the question's locale (lib/i18n/questionLocale.ts)", () => {
  it("names one of the 35 interface locales by the tag's primary subtag", () => {
    expect(questionLocale("ro", "en")).toBe("ro");
    expect(questionLocale("RO", "en")).toBe("ro");
    expect(questionLocale("pt-BR", "en")).toBe("pt");
    expect(questionLocale("zh-Hant", "de")).toBe("zh");
    for (const { code } of LOCALES) expect(questionLocale(code, code === "en" ? "de" : "en")).toBe(code);
  });

  it("falls back to the interface locale for und, an unknown tag, and no tag at all", () => {
    for (const tag of ["und", "tlh", "sr-Latn", "", "   ", "-ro", null, undefined]) {
      expect(questionLocale(tag, "de"), String(tag)).toBe("de");
    }
  });

  it("offers a switch only when the question's locale differs from the interface's", () => {
    expect(languageOfferLocale("ro", "en")).toMatchObject({ code: "ro", nativeName: "Română" });
    expect(languageOfferLocale("en", "ro")).toMatchObject({ code: "en", nativeName: "English" });
    expect(languageOfferLocale("ro", "ro")).toBeNull();
    expect(languageOfferLocale(null, "en")).toBeNull();
  });

  it("gives Arabic and Hebrew a right-to-left container, everything else left-to-right", () => {
    expect(LOCALES.filter(({ code }) => localeDirection(code) === "rtl").map(({ code }) => code).sort()).toEqual(["ar", "he"]);
    expect(localeDirection("ro")).toBe("ltr");
  });
});

describe("the debate page's server read learns the question's language (serverApi.ts)", () => {
  const answer: Answer = buildFairShapedAnswer({ run_ref: "run:settled" });
  const clientWith = (readRun: ContractClient["readRun"]) => ({
    readAnswer: async () => answer,
    readRunAnswer: async () => answer,
    readRun
  }) as unknown as ContractClient;

  it("reads the served answer's run for its language", async () => {
    const readRun = vi.fn(async () => RunProjectionSchema.parse({ ...RUN, argument_language: { tag: "ro", name: "Romanian" } }));
    const result = await getDebateServer(answer.answer_id, "token:test", clientWith(readRun));
    expect(result).toMatchObject({ ok: true, questionLanguage: { tag: "ro", name: "Romanian" } });
    expect(readRun).toHaveBeenCalledWith("run:settled");
    expect(questionLanguageTagOf(result)).toBe("ro");
  });

  it("never lets the language read fail the page: no language, the answer still shows", async () => {
    const failing = await getDebateServer(answer.answer_id, "token:test", clientWith(async () => {
      throw new ContractHttpError("SERVER_FAILURE", 503, "down");
    }));
    expect(failing).toMatchObject({ ok: true, questionLanguage: null });
    const older = await getDebateServer(answer.answer_id, "token:test", clientWith(async () => RunProjectionSchema.parse(RUN)));
    expect(older).toMatchObject({ ok: true, questionLanguage: null });
    expect(questionLanguageTagOf(older)).toBeNull();
  });

  it("takes a loading or failed run's language from the run it already read", async () => {
    const missing = async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_FOUND"); };
    const loading = await getDebateServer("run:queued", "token:test", {
      readAnswer: missing,
      readRunAnswer: missing,
      readRun: async () => ({ ...RUN, state: "QUEUED", argument_language: { tag: "de", name: "German" } })
    } as unknown as ContractClient);
    expect(loading).toMatchObject({ ok: false, kind: "loading" });
    expect(questionLanguageTagOf(loading)).toBe("de");
    expect(questionLanguageTagOf({ ok: false, kind: "not_found" })).toBeNull();
  });
});

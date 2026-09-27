import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import type { ServeDisclosureModel, ServeDisclosureRead, StoredServeDisclosure } from "@debateai/db";
import { parseServeDisclosureReportEnvironment } from "@debateai/register";
import {
  renderServeDisclosure,
  runServeDisclosureCli,
  type OpenServeDisclosureReader
} from "../../apps/runner/src/serve-disclosure-cli.js";

/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.5), TASK M5 — the operator's report
 * of one answer's disclosure record, `pnpm ops:serve-disclosure
 * <answerId|runId>`: one fact per line, in plain words; ids, codes, counts and
 * model names only. The read over the real database (by answer id and by run
 * id) is in tests/integration/database.test.ts ("Engine money rule M5 …").
 */

const ANSWER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const LEADING = "33333333-3333-4333-8333-333333333333";

const MODEL_A: ServeDisclosureModel = Object.freeze({
  providerRef: "provider:a", maker: "Maker A", modelId: "maker-a/model-1", transport: "openai-compatible-http"
});
const MODEL_C: ServeDisclosureModel = Object.freeze({
  providerRef: "provider:c", maker: "Maker C", modelId: "maker-c/model-2", transport: "openai-compatible-http"
});

function row(overrides: Partial<StoredServeDisclosure> = {}): StoredServeDisclosure {
  return Object.freeze({
    answerId: ANSWER_ID, answerVersion: 1, runId: RUN_ID,
    writerPlannedRef: "provider:a", checkerPlannedRef: "provider:a",
    writerServedRef: "provider:c", checkerServedRef: "provider:c",
    writerFallback: true, checkerFallback: true, fallbackReason: "MONEY", checkerSameAsWriter: true,
    bodyStop: "MONEY", pointsWithoutReview: 2, serveStop: null,
    digestRung: 7, digestPointsOmitted: 140,
    floorVerdictState: null, floorLeadingNodeId: null, floorReason: null,
    createdAt: new Date("2026-09-27T10:00:00.000Z"),
    ...overrides
  });
}

const SERVED: ServeDisclosureRead = Object.freeze({
  row: row(),
  models: Object.freeze({ writerPlanned: MODEL_A, writerServed: MODEL_C, checkerPlanned: MODEL_A, checkerServed: MODEL_C })
});

const FLOOR: ServeDisclosureRead = Object.freeze({
  row: row({
    writerServedRef: null, checkerServedRef: null, writerFallback: false, checkerFallback: false,
    fallbackReason: null, checkerSameAsWriter: false, bodyStop: null, pointsWithoutReview: null,
    serveStop: "TRANSPORT_DEATH", digestRung: 0, digestPointsOmitted: 0,
    floorVerdictState: "CONTESTED", floorLeadingNodeId: LEADING, floorReason: "TRANSPORT_DEATH"
  }),
  models: Object.freeze({ writerPlanned: null, writerServed: null, checkerPlanned: MODEL_A, checkerServed: null })
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    output: { stdout: (text: string) => out.push(text), stderr: (text: string) => err.push(text) },
    out: () => out.join(""),
    err: () => err.join("")
  };
}

function opener(read: ServeDisclosureRead | null, seen: string[] = [], closed: boolean[] = []): OpenServeDisclosureReader {
  return async () => ({
    read: async (id) => {
      seen.push(id);
      return read;
    },
    close: async () => {
      closed.push(true);
    }
  });
}

describe("M5 · the operator's disclosure report prints a row, one fact per line", () => {
  it("prints a served answer's record: the models planned and used, the swap, the stops and the digest", () => {
    expect(renderServeDisclosure(SERVED)).toBe([
      `answer: ${ANSWER_ID} (version 1)`,
      `run: ${RUN_ID}`,
      "recorded at: 2026-09-27T10:00:00.000Z",
      "answer: written by a model and checked",
      "floor: none",
      "answer writer planned: Maker A · maker-a/model-1 (provider:a)",
      "answer writer used: Maker C · maker-c/model-2 (provider:c)",
      "answer checker planned: Maker A · maker-a/model-1 (provider:a)",
      "answer checker used: Maker C · maker-c/model-2 (provider:c)",
      "a lower-cost model was used: yes, for money",
      "one model both wrote and checked the answer: yes",
      "arguing cut short by: money",
      "points left without a cross-review: 2",
      "answer-writing cut short by: nothing",
      "digest the answer-writer read: rung 7, the spine (some points left out)",
      "points left out of that digest: 140",
      ""
    ].join("\n"));
  });

  it("prints a floor answer's record: the floor, its reason, and no model used", () => {
    const text = renderServeDisclosure(FLOOR);
    expect(text.split("\n")).toEqual(expect.arrayContaining([
      "answer: not written by a model; the floor stands in for it",
      `floor: CONTESTED, on the leading position ${LEADING}`,
      "floor reason: TRANSPORT_DEATH",
      "answer writer planned: provider:a (no call by it is recorded in this run)",
      "answer writer used: none (no checked round was served)",
      "answer checker planned: Maker A · maker-a/model-1 (provider:a)",
      "answer checker used: none (no checked round was served)",
      "a lower-cost model was used: no",
      "one model both wrote and checked the answer: no",
      "arguing cut short by: nothing",
      "points left without a cross-review: not counted",
      "answer-writing cut short by: a dead model connection",
      "digest the answer-writer read: rung 0, whole",
      "points left out of that digest: 0"
    ]));
  });

  it("names every rung and every stop in words", () => {
    const words = (overrides: Partial<StoredServeDisclosure>) => renderServeDisclosure({ ...SERVED, row: row(overrides) });
    expect(words({ digestRung: 3 })).toContain("digest the answer-writer read: rung 3, shortened summaries");
    expect(words({ digestRung: 6 })).toContain("digest the answer-writer read: rung 6, compact (every point kept)");
    expect(words({ digestRung: null, digestPointsOmitted: null }))
      .toContain("digest the answer-writer read: none (no digest was handed to the answer-writer)");
    expect(words({ digestRung: null, digestPointsOmitted: null })).toContain("points left out of that digest: not counted");
    for (const [stop, text] of [
      ["ATTEMPTS", "the attempt ceiling"], ["USAGE", "a vendor that reported no usage"], ["DAILY", "the daily ceiling"]
    ] as const) {
      expect(words({ bodyStop: stop })).toContain(`arguing cut short by: ${text}`);
      expect(words({ serveStop: stop })).toContain(`answer-writing cut short by: ${text}`);
    }
    expect(words({ serveStop: "NO_ARTIFACT" })).toContain("answer-writing cut short by: a draft with nothing to serve");
  });

  it("carries no address, credential, price or text: only ids, codes, counts and model names", () => {
    for (const read of [SERVED, FLOOR]) {
      const text = renderServeDisclosure(read);
      for (const forbidden of ["http", "authorization", "price", "base_url", "secret"]) expect(text).not.toContain(forbidden);
    }
  });
});

describe("M5 · the command", () => {
  it("reads by the one id it is given, prints the report and closes the connection", async () => {
    const seen: string[] = [];
    const closed: boolean[] = [];
    const io = capture();
    expect(await runServeDisclosureCli([RUN_ID], io.output, opener(SERVED, seen, closed))).toBe(0);
    expect(seen).toEqual([RUN_ID]);
    expect(closed).toEqual([true]);
    expect(io.out()).toBe(renderServeDisclosure(SERVED));
    expect(io.err()).toBe("");
  });

  it.each([[[]], [["not-a-uuid"]], [[ANSWER_ID, RUN_ID]], [["--answer", ANSWER_ID]]])(
    "refuses %j with its usage code before opening anything", async (args) => {
      let opened = false;
      const io = capture();
      expect(await runServeDisclosureCli(args, io.output, async () => {
        opened = true;
        return { read: async () => null, close: async () => undefined };
      })).toBe(2);
      expect(opened).toBe(false);
      expect(io.err()).toBe("SERVE_DISCLOSURE_USAGE\n");
      expect(io.out()).toBe("");
    }
  );

  it("says so, by one code, when no record exists for the id", async () => {
    const io = capture();
    const closed: boolean[] = [];
    expect(await runServeDisclosureCli([ANSWER_ID], io.output, opener(null, [], closed))).toBe(1);
    expect(io.err()).toBe("SERVE_DISCLOSURE_NOT_FOUND\n");
    expect(closed).toEqual([true]);
  });

  it("prints a failure as one code and never its message", async () => {
    const io = capture();
    expect(await runServeDisclosureCli([ANSWER_ID], io.output, async () => ({
      read: async () => { throw new TypedDomainError("SERVE_DISCLOSURE_ROW_INVALID", "row near SELECT secret"); },
      close: async () => undefined
    }))).toBe(1);
    expect(io.err()).toBe("SERVE_DISCLOSURE_ROW_INVALID\n");
    const floors = capture();
    expect(await runServeDisclosureCli([ANSWER_ID], floors.output, async () => {
      throw new TypeError("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
    })).toBe(1);
    expect(floors.err()).toBe("DATABASE_URL_TLS_REQUIRED:DATABASE_URL\n");
    const untyped = capture();
    expect(await runServeDisclosureCli([ANSWER_ID], untyped.output, async () => {
      throw new Error("connect ECONNREFUSED postgres://user:secret@host/db");
    })).toBe(1);
    expect(untyped.err()).toBe("SERVE_DISCLOSURE_REPORT_FAILED\n");
  });

  it("takes the runner's DATABASE_URL through its own loader, with the production floors", () => {
    expect(parseServeDisclosureReportEnvironment({
      DATABASE_URL: "postgresql://runner@localhost/debateai?host=/var/run/postgresql", NODE_ENV: "production", OTHER: "x"
    })).toEqual({ DATABASE_URL: "postgresql://runner@localhost/debateai?host=/var/run/postgresql", NODE_ENV: "production" });
    expect(() => parseServeDisclosureReportEnvironment({
      DATABASE_URL: "postgresql://runner:pw@db.example.test/debateai", NODE_ENV: "production"
    })).toThrowError(/^DATABASE_URL_TLS_REQUIRED:DATABASE_URL$/u);
    expect(() => parseServeDisclosureReportEnvironment({ NODE_ENV: "production" })).toThrow();
  });

  it("is a package script, reads no process.env itself, and is documented in the money runbook", async () => {
    const [manifest, cli, readme] = await Promise.all([
      readFile(new URL("../../package.json", import.meta.url), "utf8"),
      readFile(new URL("../../apps/runner/src/serve-disclosure-cli.ts", import.meta.url), "utf8"),
      readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8")
    ]);
    const scripts = (JSON.parse(manifest) as { scripts: Record<string, string> }).scripts;
    expect(scripts["ops:serve-disclosure"]).toBe("tsx apps/runner/src/serve-disclosure-cli.ts");
    expect(cli).not.toContain(["process", "env"].join("."));
    expect(cli).toContain("loadServeDisclosureReportEnvironment()");
    const money = readme.slice(readme.indexOf("### The cost envelopes (V-28)"), readme.indexOf("### Publishing the settings register on this host"));
    expect(money).toContain("pnpm ops:serve-disclosure");
    expect(money).toContain("--property=EnvironmentFile=/etc/debateai/runner.env");
  });
});

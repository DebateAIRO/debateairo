// tests/unit/piece-settings-version.test.ts
// V4 start step, Task 57p (the owner's answer of 8 Nov, "On each piece's record": "A new field on each of the eight records (report,
// rewrite, checks, …) saying which settings wrote that piece. Most precise per piece."): every runner writer of the eight records calls 0169's
// `<writer>_with_settings` with the settings version of the run the piece's calls were charged to, last; none calls an earlier writer (which
// stores NULL, for the release before). And the runner hands each lane that version from its one run → version map. Made-up ids and versions.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PostgresDigModelRunnerRepository, PostgresInvestigationReportRunnerRepository, PostgresPublicTreeRunnerRepository, PostgresTreeUpdateRunnerRepository,
  PostgresWebEvidenceRepository
} from "@debateai/db";
import { composePublicReport } from "../../apps/runner/src/public-contribution.js";
import { PATH_REWRITE_CHECKER_MODEL, PATH_REWRITE_WRITER_MODEL } from "../../apps/runner/src/path-rewrite-composition.js";

const VERSION = 22;
const RUN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SEALED = Object.freeze({ envelope: { sealed: "made-up" } as never, attestation: Buffer.from("made-up") });

/** A made-up pool that answers each writer RECORDED and keeps every statement with its values. */
function capturingPool() {
  const sent: Array<Readonly<{ sql: string; params: readonly unknown[] }>> = [];
  const pool = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      sent.push({ sql, params });
      return { rows: [{ outcome: "RECORDED", answer_seq: 1, spent: "0" }] };
    }
  };
  return { pool: pool as never, sent };
}

const rewrite = Object.freeze({ rewriteId: OTHER, digRunId: RUN, parentAnswerVersion: 1, basedOnRewriteId: null, outcome: "READY", failureCode: null,
  fateBefore: "OPEN", fateAfter: "OPEN", verdict: null, writerLineage: null, checkerLineage: null, rounds: 1, artifactRefs: [], content: SEALED }) as never;
const update = Object.freeze({ updateId: OTHER, basedOn: null, outcome: "READY", failureCode: null, changed: true, fateBefore: "OPEN", fateAfter: "OPEN",
  writerLineage: null, checkerLineage: null, rounds: 1, artifactRefs: [], content: SEALED }) as never;
const answer = Object.freeze({ updateId: OTHER, rootRunId: RUN, basedOnUpdateId: null, triggerKind: "PATH_REWRITE", triggerId: OTHER, triggerRunId: RUN,
  paidByOwnerRef: null, outcome: "READY", failureCode: null, writerLineage: null, checkerLineage: null, rounds: 1, artifactRefs: [], spentMicros: 0, content: SEALED }) as never;
const report = Object.freeze({ investigationId: OTHER, reportVersion: 1, reportId: OTHER, outcome: "READY", storyOutcome: null, failureCode: null, coveredRewrite: null,
  dossierFingerprint: "made-up", ladderStep: 0, leftOut: 0, answerRounds: 1, storyRounds: 0, writerLineage: null, checkerLineage: null, artifactRefs: [],
  spentMicros: 0, content: SEALED }) as never;
const publicReport = Object.freeze({ reportId: OTHER, outcome: "READY", storyOutcome: null, failureCode: null, fingerprint: "made-up", ladderStep: 0, leftOut: 0,
  answerRounds: 1, storyRounds: 0, writerLineage: null, checkerLineage: null, artifactRefs: [], spentMicros: 0, content: SEALED }) as never;
const reading = Object.freeze({ runId: RUN, readingId: OTHER, pageId: OTHER, reader: 1, maker: "anthropic", outcome: "READ", grade: 2, line: SEALED }) as never;
const stamped = <T>(record: T, version: number | null): T => ({ ...(record as object), settingsVersion: version }) as T;

describe("Task 57p: every writer of the eight records calls 0169's writer with the piece's settings version last", () => {
  const cases: ReadonlyArray<readonly [string, (pool: never, version: number | null) => Promise<unknown>, number]> = [
    ["identity.record_investigation_report_version_with_settings", (pool, version) => new PostgresInvestigationReportRunnerRepository(pool).record(stamped(report, version)), 20],
    ["identity.record_path_rewrite_with_settings", (pool, version) => new PostgresDigModelRunnerRepository(pool).recordRewrite(stamped(rewrite, version)), 17],
    ["identity.record_path_rewrite_in_line_with_settings", (pool, version) => new PostgresTreeUpdateRunnerRepository(pool).recordRewriteInLine(null, stamped(rewrite, version)), 19],
    ["identity.record_path_update_with_settings", (pool, version) => new PostgresTreeUpdateRunnerRepository(pool).record(stamped(update, version)), 15],
    ["identity.record_main_answer_update_with_settings", (pool, version) => new PostgresTreeUpdateRunnerRepository(pool).recordMainAnswer(stamped(answer, version)), 17],
    ["identity.record_public_path_update_with_settings", (pool, version) => new PostgresPublicTreeRunnerRepository(pool).record(stamped(update, version)), 15],
    ["identity.record_public_answer_update_with_settings", (pool, version) => new PostgresPublicTreeRunnerRepository(pool).recordGoneAnswer(stamped(answer, version)), 16],
    ["identity.record_public_report_with_settings", (pool, version) => new PostgresPublicTreeRunnerRepository(pool).recordReport(stamped(publicReport, version)), 16],
    ["identity.record_public_check_passed_with_settings", (pool, version) => new PostgresPublicTreeRunnerRepository(pool).recordCheckPassed(RUN, OTHER, version), 3],
    ["identity.record_web_reading_with_settings", (pool, version) => new PostgresWebEvidenceRepository(pool).recordReading(stamped(reading, version)), 10]
  ];
  it.each(cases)("%s", async (writer, write, arity) => {
    for (const version of [VERSION, null]) {
      const { pool, sent } = capturingPool();
      await write(pool, version);
      expect(sent).toHaveLength(1);
      const { sql, params } = sent[0]!;
      expect(sql).toContain(`${writer}(`);
      // The SQL names exactly as many values as it sends, the version the last of them.
      expect(sql).toContain(`$${String(arity)}`);
      expect(sql).not.toContain(`$${String(arity + 1)}`);
      expect(params).toHaveLength(arity);
      expect(params.at(-1)).toBe(version);
    }
  });

  it("no runner-side repository calls an earlier writer any more (the release before still does; it stores NULL)", () => {
    const sources = ["investigation-reports", "dig-model", "tree-updates", "public-tree", "web-evidence"]
      .map((name) => readFileSync(new URL(`../../packages/db/src/${name}.ts`, import.meta.url), "utf8")).join("\n");
    for (const earlier of ["record_investigation_report_version", "record_path_rewrite", "record_path_rewrite_in_line", "record_path_update",
      "record_main_answer_update", "record_public_path_update", "record_public_answer_update", "record_public_report", "record_public_check_passed",
      "record_web_reading"]) {
      expect(sources, earlier).not.toMatch(new RegExp(`SELECT (?:outcome,answer_seq FROM )?identity\\.${earlier}\\(`, "u"));
    }
  });
});

describe("Task 57p: a public debate's report notes the version of its carrier (the run its calls were charged to)", () => {
  it("the report's record reaches 0169's writer with the version the closing stamped on it", async () => {
    const { pool, sent } = capturingPool();
    const composed = composePublicReport({ pool, targets: [{ providerRef: "ref-haiku", model: PATH_REWRITE_WRITER_MODEL }, { providerRef: "ref-glm", model: PATH_REWRITE_CHECKER_MODEL }],
      members: [], priceOf: () => null, reserveMicros: { paid: 0, free: 0 }, log: () => undefined })!;
    await composed.settings.reports.record(stamped(report, VERSION));
    const call = sent.find(({ sql }) => sql.includes("identity.record_public_report_with_settings("));
    expect(call?.params.at(-1)).toBe(VERSION);
  });
});

describe("Task 57p: the runner hands every lane the one run → version map, and each lane stamps the run its calls were charged to", () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").replace(/\s+/gu, " ");
  it("main.ts: one reader of the map, handed to the path rewrite (its tree and public tree too), the closing, the public report and 'Add to researched'", () => {
    const main = read("apps/runner/src/main.ts");
    expect(main).toContain("const pieceSettingsVersionOf = (runId: string): number | undefined => runSettingsVersions.versionOf(runId);");
    for (const composed of ["const pathRewrite = composePathRewrite({", "const investigationCloseComposed = composeInvestigationClose({",
      "const publicReports = composePublicReport({", "const webResearched = composeWebResearched({"]) {
      const at = main.indexOf(composed);
      expect(at, composed).toBeGreaterThan(0);
      expect(main.slice(at, main.indexOf("});", at)), composed).toContain("settingsVersionOf: pieceSettingsVersionOf");
    }
  });
  it("index.ts: the debate's own web readers note the claimed run's version", () => {
    const index = read("apps/runner/src/index.ts");
    expect(index.match(/settingsVersion: settings\.runSettingsVersions\?\.versionOf\(run\.runId\) \?\? null/gu)).toHaveLength(2);
  });
  it("each lane stamps the run its calls were charged to: the root (closing), the dig (rewrite, tree, check), the carrier (as the closing's root), the page's run", () => {
    expect(read("apps/runner/src/investigation-close.ts")).toContain("settings.reports.record({ ...record, settingsVersion: settings.settingsVersionOf?.(closing.rootRunId) ?? null })");
    const rewriteLane = read("apps/runner/src/path-rewrite.ts");
    expect(rewriteLane).toContain("const noted = { ...record, settingsVersion: settings.settingsVersionOf?.(digRunId) ?? null };");
    expect(rewriteLane).toContain("await settings.turns.recordRewrite(noted) : await settings.line.recordRewriteInLine(front.lineBase, noted);");
    const climb = read("apps/runner/src/path-climb.ts");
    expect(climb).toContain("await ports.tree.record({ ...record, settingsVersion: settings.settingsVersionOf?.(level.digRunId) ?? null });");
    expect(climb).toContain("await ports.tree.recordMainAnswer({ ...record, settingsVersion: settings.settingsVersionOf?.(update.digRunId) ?? null });");
    expect(read("apps/runner/src/public-contribution.ts")).toContain("recordCheckPassed(digRunId, checkRef, settings.settingsVersionOf?.(digRunId) ?? null)");
    const researched = read("apps/runner/src/web-researched.ts");
    expect(researched.match(/settingsVersion: settings\.settingsVersionOf\?\.\(runId\) \?\? null/gu)).toHaveLength(2);
    expect(read("apps/runner/src/web-step.ts").match(/settingsVersion: input\.settingsVersion \?\? null/gu)).toHaveLength(2);
  });
});

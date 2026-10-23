/**
 * Final fix wave S5 (FINAL-FIX 18): the practice runs the line-up it says it runs.
 *  - PRACTICE_LINE_UP_NOT_PUBLISHED: a --line-up trial refuses unless the version the debate runs on carries a line-up row
 *    EQUAL to the --line-up file (`assertPracticeLineUpPublished`), not merely some row;
 *  - language mode with --register-export reads the export's line-up row, as debate mode does (the row on the site
 *    version beside an env line-up is the live boot's D15 refusal; a sockets-only settings file takes the row).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createSocketServer, type Server as SocketServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parsePreviewLineUp, type PreviewLineUp } from "@debateai/providers";
import { previewLineUpPolicyRow } from "@debateai/register";
import { assertPracticeLineUpPublished } from "../../tools/preview-practice/practice-debate.js";
import { PRACTICE_REGISTER_EXPORT_SCHEMA } from "../../tools/preview-practice/practice-register-import.js";
import { runPractice } from "../../tools/preview-practice/practice.js";
import { PracticeRefusal } from "../../tools/preview-practice/practice-settings.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const trialJson = { free_model_ids: [GLM, HAIKU], premium_model_ids: [GLM, DEEPSEEK, MIMO, HAIKU], thinking_levels: { [DEEPSEEK]: { level: "low" } } };
const TRIAL: PreviewLineUp = parsePreviewLineUp(trialJson);

const refusalOf = (run: () => unknown): PracticeRefusal => {
  try { run(); } catch (error) { if (error instanceof PracticeRefusal) return error; throw error; }
  throw new Error("expected a PracticeRefusal");
};

describe("final fix wave S5: PRACTICE_LINE_UP_NOT_PUBLISHED checks the version's row EQUALS the --line-up file", () => {
  it("no trial: any row (or none) is the version's own; a trial needs that very row", () => {
    expect(() => assertPracticeLineUpPublished(null, null)).not.toThrow();
    expect(() => assertPracticeLineUpPublished(null, TRIAL)).not.toThrow();
    // The same line-up parsed again (another object, members in another order) is the same row.
    const again = parsePreviewLineUp({ thinking_levels: { [DEEPSEEK]: { level: "low" } }, premium_model_ids: [GLM, DEEPSEEK, MIMO, HAIKU],
      free_model_ids: [GLM, HAIKU] });
    expect(() => assertPracticeLineUpPublished(TRIAL, again)).not.toThrow();
    expect(refusalOf(() => assertPracticeLineUpPublished(TRIAL, null)).code).toBe("PRACTICE_LINE_UP_NOT_PUBLISHED");
    // A row, but another line-up (another level; another roster): refused, never silently run.
    for (const other of [
      parsePreviewLineUp({ ...trialJson, thinking_levels: { [DEEPSEEK]: { level: "high" } } }),
      parsePreviewLineUp({ ...trialJson, premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] }),
      parsePreviewLineUp({ ...trialJson, thinking_levels: null })
    ]) {
      expect(refusalOf(() => assertPracticeLineUpPublished(TRIAL, other)).code).toBe("PRACTICE_LINE_UP_NOT_PUBLISHED");
    }
  });

  it("the debate runs the check on the version it reads, before any AI is asked", () => {
    const source = readFileSync(new URL("../../tools/preview-practice/practice-debate.ts", import.meta.url), "utf8");
    const read = source.indexOf("const versionLineUp = await readPreviewLineUpPolicy(pool, versionSettings.runner.REGISTER_VERSION);");
    const check = source.indexOf("assertPracticeLineUpPublished(lineUpPolicy, versionLineUp);");
    const composed = source.indexOf("const settings = practiceSettingsWithLineUp(versionSettings, versionLineUp, { trial: lineUpPolicy !== null });");
    expect(read).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(read);
    expect(composed).toBeGreaterThan(check);
    // The one refusal site is the helper's (the old existence-only guard is gone).
    expect(source.split('new PracticeRefusal("PRACTICE_LINE_UP_NOT_PUBLISHED"')).toHaveLength(2);
    expect(source).not.toContain("if (lineUpPolicy !== null && versionLineUp === null)");
  });
});

describe("final fix wave S5: language mode with --register-export reads the export's line-up row (as debate mode)", () => {
  let folder: string | undefined;
  const servers: SocketServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
    if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
    folder = undefined;
  });
  /** A gate socket that hangs up at once: a run that gets as far as asking the gate stops there (PRACTICE_GATE_UNREACHABLE). */
  const hangingUp = (path: string) => new Promise<void>((resolve, reject) => {
    const server = createSocketServer((socket) => { socket.destroy(); });
    servers.push(server);
    server.once("error", reject);
    server.listen(path, () => resolve());
  });
  const gate = { deployment: "v3-preview", requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-unit" };
  const oldForm = { ...gate, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN, HAIKU] };
  const settingsWith = (config: unknown) => ["PREVIEW_PROVIDER_TEST_CONFIG_JSON=" + JSON.stringify(config), "PROVIDER_DISCOVERY_TARGETS_JSON=[]",
    "REGISTER_VERSION=11", "DEBATEAI_DEPLOYMENT_MODE=local", "NODE_ENV=production", "CLAIM_MS=3000000", "CLAIM_MARGIN_MS=60000",
    "MAX_RECOMPOSE=1", "JUDGEMENT_NUMBER_KIND=k", "JUDGEMENT_PRODUCER=p", "PROPAGATION_NUMBER_KIND=k", "PROPAGATION_PRODUCER=p",
    "PROVIDER_REF=preview:fixture-a", "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00", "SETTLEMENT_WATCH_HANDLE=h"].join("\n");
  const exportText = (rows: readonly { rowKey: string; valueJsonText: string; sourceRef: string }[]) => JSON.stringify({
    schema: PRACTICE_REGISTER_EXPORT_SCHEMA,
    versions: [{ register_version: "11", row_count: rows.length, base_register_version: "10", publication_id: null, request_sha256: null,
      snapshot_sha256: null, publication_kind: "GENERAL", recorded_at: null }],
    rows: rows.map((row) => ({ register_version: "11", row_key: row.rowKey, value_json: row.valueJsonText, source_ref: row.sourceRef })) });
  const alpha = { rowKey: "alpha", valueJsonText: "1", sourceRef: "live" };

  async function language(settingsConfig: unknown, rows: readonly { rowKey: string; valueJsonText: string; sourceRef: string }[]) {
    folder = mkdtempSync(join(tmpdir(), "ff-lang-"));
    await hangingUp(join(folder, "di.sock"));
    await hangingUp(join(folder, "an.sock"));
    writeFileSync(join(folder, "settings.env"), settingsWith(settingsConfig));
    writeFileSync(join(folder, "status.json"), JSON.stringify({ state: "active", unsent_streak: 0, halts: 0 }));
    writeFileSync(join(folder, "export.json"), exportText(rows));
    const env = { PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: join(folder, "di.sock"),
      PRACTICE_ANTHROPIC_SOCKET: join(folder, "an.sock") };
    const outcome = await runPractice(["language", "--settings", join(folder, "settings.env"),
      "--gate-status-deepinfra", join(folder, "status.json"), "--gate-status-anthropic", join(folder, "status.json"),
      "--register-export", join(folder, "export.json"), "--out", join(folder, "out")], env, { log: () => undefined });
    return outcome.report;
  }

  it("old-form settings and an export whose newest version carries the row: the live boot's D15 refusal, never the env's line-up", async () => {
    expect(await language(oldForm, [alpha, previewLineUpPolicyRow(TRIAL, "kit")]))
      .toMatchObject({ reasons: ["HARNESS_ERROR:PREVIEW_LINE_UP_ENV_CONFLICT"] });
  });

  it("a sockets-only settings file takes the export's row and goes on to the gates; without the row it is refused", async () => {
    expect(await language(gate, [alpha, previewLineUpPolicyRow(TRIAL, "kit")]))
      .toMatchObject({ reasons: ["HARNESS_ERROR:PRACTICE_GATE_UNREACHABLE"] });
    expect(await language(gate, [alpha])).toMatchObject({ reasons: ["HARNESS_ERROR:PREVIEW_LINE_UP_REQUIRED"] });
  });

  it("control: old-form settings and a row-less export run on the env's line-up, as today (as far as the gates)", async () => {
    expect(await language(oldForm, [alpha])).toMatchObject({ reasons: ["HARNESS_ERROR:PRACTICE_GATE_UNREACHABLE"] });
  });
});

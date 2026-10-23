import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalRegisterJson, computeRegisterSnapshotSha256, loadBootstrapRegister, parseCanonicalRegisterJson } from "@debateai/register";
import { assertRegisterPromptContractHashes, codePromptContractHashes } from "@debateai/runner";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import { STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { buildPreviewSourceRowsV2, composePreviewSnapshotV2 } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import {
  composePracticeNextRegisterVersion,
  PRACTICE_REGISTER_EXPORT_SCHEMA,
  type PracticeRegisterExport
} from "../../tools/preview-practice/practice-register-import.js";

/**
 * PRACTICE DEBATE 3 (2026-10-12) — the answer writer's serve.synthesizer.v3 and the answer checker's
 * serve.evaluator.v2 (owner-approved wording) reach the register as a NEW version, never by editing one.
 *
 * The preview runs register version 11, whose `composerContractHash` is v2's 340e11a6…8b70 and whose
 * `conformanceContractHash` is evaluator v1's f205421c…9dcc (measured on the practice export of
 * 2026-10-12). The runner records every answer-writer and answer-checker call under the REGISTER's
 * fingerprint, so this file pins three things:
 *  1. the register 12 the preview publish kit composes on a version-11-shaped base changes exactly three
 *     rows: the judge's (debate shape) and the two synthesis rows, the composer's to v3 + its answer-length variant
 *     (debate shape; since 2026-10-15 v4 + length.v2, the owner-approved plain-words wording) and the checker's to
 *     v2 (the development register carries the same seals);
 *  2. the runner refuses to start on a register that does not carry the fingerprints this code sends;
 *  3. the practice can compose that same version 12 itself (`--register-next`), before any upload.
 */
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const canonical = (value: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(value))) as string;
type Row = { rowKey: string; valueJsonText: string; sourceRef: string };

const V3_COMPOSER = "4b141d3ab287366c4969f89e04649c5f1cc951d433206ffa0295527eba4df90f";
/** The composer seal this code sent after the debate shape (Task 5): v3 + the length variant (history since v4). */
const COMPOSER_P2B = "9a46af295fe2c32c3ce386253dbedb6061004b564b68acdf25a3eccf08b25662";
/**
 * The composer seal this code sends since answer writer v4 (owner-approved wording, 2026-10-15): v4 + its length
 * variant length.v2. It supersedes COMPOSER_P2B in every check below; v3 and length.v1 stay as sealed history.
 */
const COMPOSER_V4 = "879d2c5d0213832fe466537603e5171e53248cce41188473550616d2dd5b4a47";
/** serve.evaluator.v2 alone: the conformance seal before length guidance (history since LG-C Task 13). */
const V2_CONFORMANCE = "660ec7cba5aa70bbd29e190580b7385802cd21bc6b212d11646b54c1d84ee22f";
/** The conformance seal this code sends from length guidance on (LG-C Task 13): serve.evaluator.v2 + length.v1. */
const CONFORMANCE_LENGTH = "108f1b29fb3c4739568a083c806ef5abdb9289e8b621bc9d895d52e5fcad22f6";
/** What the live register version 11 carries (sealed history; never edited). */
const LIVE_11 = Object.freeze({
  judge: "e7f7e4b0e7066fb2b873c4435b2bd593a0a399f8de506604c35b92222fdb1365",
  composer: "340e11a6ec58453a607114f1c31263ddfc92beb8698f70093c75b89472368b70",
  conformance: "f205421cc088ff2f3b4981bfffbfaa09224c2d0ec974c2852ad4b2138e929dcc"
});
/** The judge seal this code sent after the debate shape (Task 4): V1 + six contracts (history since LG-C2 Task 11). */
const JUDGE_P2B = "aac534075f292189027590dcbde6256a9684f085814ad2ab2bb4cb4be9c22612";
/**
 * The judge seal this code sends since length guidance LG-C2 Task 11: V2 (JUDGE_P2B's text, frozen) + the 18 length
 * variants. It supersedes JUDGE_P2B in every check below; JUDGE_P2B stays as sealed history.
 */
const JUDGE_LG_C = "810d611a72cbf486d7027ca444e2181541a60c4843c42ebaed549eb4577bf1ee";

const runtime = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
  operatorSha256: "c".repeat(64), observedAt: "2026-10-11T10:42:25.561Z" };
const DEEPSEEK = { checker: "deepseek", deepseekEnabledOnGate: true } as const;
const owned = (): Row[] => [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
  .map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }));
const sorted = (rows: Row[]) => [...rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey, "en"));

/**
 * A version-11-shaped base: what the kit publishes from this code (DeepSeek checker, rotation on), with the two
 * synthesis fingerprints at the values version 11 holds. `extra` replaces further rows.
 */
async function live11Base(extra: Readonly<Record<string, string>> = {}): Promise<Row[]> {
  const source = await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, DEEPSEEK) as unknown as Row[];
  const replaced: Record<string, string> = {
    judgeContractHash: canonical(LIVE_11.judge),
    composerContractHash: canonical(LIVE_11.composer), conformanceContractHash: canonical(LIVE_11.conformance), ...extra
  };
  return sorted([...source.map((row) => replaced[row.rowKey] === undefined ? row : { ...row, valueJsonText: replaced[row.rowKey]! }), ...owned()]);
}

function exportOf(base: readonly Row[]): PracticeRegisterExport {
  return Object.freeze({
    schema: PRACTICE_REGISTER_EXPORT_SCHEMA,
    versions: Object.freeze([Object.freeze({ register_version: "11", row_count: base.length, sealed: true, base_register_version: "10",
      publication_id: null, request_sha256: null, snapshot_sha256: computeRegisterSnapshotSha256(base as never), publication_kind: "GENERAL",
      recorded_at: null })]),
    rows: Object.freeze(base.map((row) => Object.freeze({ register_version: "11", row_key: row.rowKey, value_json: row.valueJsonText,
      source_ref: row.sourceRef })))
  });
}

describe("register 12: the new prompt seals reach the register as a new version", () => {
  it("the code's prompt fingerprints are the current seals", () => {
    expect(codePromptContractHashes()).toEqual({ judge: JUDGE_LG_C, composer: COMPOSER_V4, conformance: CONFORMANCE_LENGTH });
  });

  it("the development register's builder seals the same values the code sends", async () => {
    const rows = Object.fromEntries((await buildDevelopmentRunnerRegisterRows()).map((row) => [row.rowKey, row.value]));
    expect(rows.composerContractHash).toBe(COMPOSER_V4);
    expect(rows.conformanceContractHash).toBe(CONFORMANCE_LENGTH);
    expect(rows.judgeContractHash).toBe(JUDGE_LG_C);
  });

  it("the preview publish kit, on a version-11-shaped base, changes exactly the judge's and the two synthesis fingerprints", async () => {
    const base = await live11Base();
    const source = await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, DEEPSEEK);
    const plan = composePreviewSnapshotV2({ sourceRows: source, baseRows: base as never, baseRegisterVersion: "11",
      baseSnapshotSha256: computeRegisterSnapshotSha256(base as never) });
    expect(plan.addedKeys).toEqual([]);
    expect([...plan.changedKeys].sort()).toEqual(["composerContractHash", "conformanceContractHash", "judgeContractHash"]);
    const entry = (key: string) => plan.delta.find((row) => row.rowKey === key)!;
    expect([entry("composerContractHash").oldValueJsonText, entry("composerContractHash").newValueJsonText])
      .toEqual([`"${LIVE_11.composer}"`, `"${COMPOSER_V4}"`]);
    expect([entry("conformanceContractHash").oldValueJsonText, entry("conformanceContractHash").newValueJsonText])
      .toEqual([`"${LIVE_11.conformance}"`, `"${CONFORMANCE_LENGTH}"`]);
    expect([entry("judgeContractHash").oldValueJsonText, entry("judgeContractHash").newValueJsonText])
      .toEqual([`"${LIVE_11.judge}"`, `"${JUDGE_LG_C}"`]);
    // The base is not edited: version 11 keeps its values; the new rows are a new snapshot.
    expect(base.find((row) => row.rowKey === "composerContractHash")!.valueJsonText).toBe(`"${LIVE_11.composer}"`);
    expect(plan.snapshotSha256).not.toBe(computeRegisterSnapshotSha256(base as never));
  });
});

describe("the runner refuses a register that does not carry the code's prompt fingerprints", () => {
  it("accepts the code's own fingerprints", () => {
    expect(() => assertRegisterPromptContractHashes(codePromptContractHashes(), 12)).not.toThrow();
  });

  it("refuses version 11's fingerprints, naming all three rows and their values", () => {
    let caught: unknown = null;
    try { assertRegisterPromptContractHashes(LIVE_11, "11"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "REGISTER_PROMPT_CONTRACT_HASH_MISMATCH" });
    const message = (caught as Error).message;
    expect(message).toContain("Register version 11");
    expect(message).toContain(`composerContractHash is ${LIVE_11.composer}, the code's is ${COMPOSER_V4}`);
    expect(message).toContain(`conformanceContractHash is ${LIVE_11.conformance}, the code's is ${CONFORMANCE_LENGTH}`);
    expect(message).toContain(`judgeContractHash is ${LIVE_11.judge}, the code's is ${JUDGE_LG_C}`);
  });

  it("refuses a single differing row, the judge's included", () => {
    for (const key of ["judge", "composer", "conformance"] as const) {
      expect(() => assertRegisterPromptContractHashes({ ...codePromptContractHashes(), [key]: "0".repeat(64) }, 12))
        .toThrowError(expect.objectContaining({ code: "REGISTER_PROMPT_CONTRACT_HASH_MISMATCH" }));
    }
  });

  it("is called by the runner's boot and by the practice composition, right after the register policy is read", () => {
    const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
    // Side-by-side spec §13: the read and the guard are the one per-version loader's, for the version it loads, and both
    // the runner's boot and the practice composition load their site version through it.
    for (const [file, policyLine, indent] of [
      ["apps/runner/src/run-settings.ts", "  const policy = previewRunnerPolicy(await readDevelopmentRunnerPolicy(pool, version), previewGate);", "  "]
    ] as const) {
      const source = read(file);
      const at = source.indexOf(policyLine);
      expect(at, file).toBeGreaterThanOrEqual(0);
      expect(source.split(policyLine), file).toHaveLength(2);
      const guard = source.indexOf(`${indent}assertRegisterPromptContractHashes(policy.hashes, version);`, at);
      expect(guard, file).toBeGreaterThan(at);
      // Nothing that uses the policy runs between the read and the guard: only comment lines stand there.
      const between = source.slice(at + policyLine.length, guard).split("\n").map((line) => line.trim()).filter((line) => line !== "");
      expect(between.every((line) => line.startsWith("//")), file).toBe(true);
    }
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const source = read(file);
      expect(source, file).not.toContain("readDevelopmentRunnerPolicy(");
      expect(source, file).toContain("const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);");
    }
  });
});

describe("the practice can practise register 12 before it is published (--register-next)", () => {
  it("composes the kit's own version 12 on the exported version 11, with its checker, rotation and runtime", async () => {
    const base = await live11Base();
    const next = await composePracticeNextRegisterVersion(exportOf(base));
    const source = await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime, DEEPSEEK);
    const kit = composePreviewSnapshotV2({ sourceRows: source, baseRows: base as never, baseRegisterVersion: "11",
      baseSnapshotSha256: computeRegisterSnapshotSha256(base as never) });
    expect(next).toMatchObject({ baseRegisterVersion: "11", checker: "deepseek", roleRotation: "on", addedKeys: [] });
    expect([...next.changedKeys].sort()).toEqual(["composerContractHash", "conformanceContractHash", "judgeContractHash"]);
    // Byte for byte what the server's plan composes from the same inputs.
    expect(next.rows).toEqual(kit.rows);
    expect(next.snapshotSha256).toBe(kit.snapshotSha256);
    expect(next.deltaSha256).toBe(kit.deltaSha256);
    expect(next.deltaSha256).toBe(sha(JSON.stringify(kit.delta)));
    const value = (key: string) => JSON.parse(next.rows.find((row) => row.rowKey === key)!.valueJsonText);
    expect([value("composerContractHash"), value("conformanceContractHash")]).toEqual([COMPOSER_V4, CONFORMANCE_LENGTH]);
    expect(value("evaluatorRoleRef").providerRef).toBe("preview:deepseek-v4-1-flash");
    expect(value("answerRoleRotationPolicy").enabled).toBe(true);
  });

  it("keeps a GLM checker and a switched-off rotation when the base has them", async () => {
    const base = await live11Base({
      evaluatorRoleRef: canonical({ kind: "EVALUATOR_ROLE_REF", providerRef: "preview:fixture-b", provisional: true }),
      answerRoleRotationPolicy: canonical({ kind: "ANSWER_ROLE_ROTATION_POLICY", rule: "LEAST_SHARE_SEEDED_TIE_V1", enabled: false })
    });
    const next = await composePracticeNextRegisterVersion(exportOf(base));
    expect([next.checker, next.roleRotation]).toEqual(["glm", "off"]);
    const value = (key: string) => JSON.parse(next.rows.find((row) => row.rowKey === key)!.valueJsonText);
    expect(value("evaluatorRoleRef").providerRef).toBe("preview:fixture-b");
    expect(value("answerRoleRotationPolicy").enabled).toBe(false);
  });

  it("refuses when the code changes no row, or when the base cannot be read back", async () => {
    const unchanged = await live11Base({
      judgeContractHash: canonical(JUDGE_LG_C), composerContractHash: canonical(COMPOSER_V4), conformanceContractHash: canonical(CONFORMANCE_LENGTH)
    });
    await expect(composePracticeNextRegisterVersion(exportOf(unchanged)))
      .rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_UNSUPPORTED" });
    const strangeChecker = await live11Base({
      evaluatorRoleRef: canonical({ kind: "EVALUATOR_ROLE_REF", providerRef: "preview:mimo-v2-6-pro", provisional: true })
    });
    await expect(composePracticeNextRegisterVersion(exportOf(strangeChecker)))
      .rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_UNSUPPORTED" });
    const base = await live11Base();
    const unmeasured = base.map((row) => row.rowKey === "nodeRuntimeVersion" ? { ...row, sourceRef: "historical node measurement" } : row);
    await expect(composePracticeNextRegisterVersion(exportOf(unmeasured)))
      .rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_UNSUPPORTED" });
  });

  it("the practice debate publishes the next version on top and runs on it, the settings file staying the live one", () => {
    const source = readFileSync(new URL("../../tools/preview-practice/practice-debate.ts", import.meta.url), "utf8");
    expect(source).toContain("await importPracticeRegister(pool, input.register, input.registerNext ?? null)");
    expect(source).toContain("String(input.settings.runner.REGISTER_VERSION) !== liveVersion");
    expect(source).toContain("String(nextVersion) !== receipt.registerVersion");
    expect(source).toContain("REGISTER_VERSION: nextVersion");
    expect(source).toContain("composePracticeRunner({ pool, environment: settings.runner,");
    const cli = readFileSync(new URL("../../tools/preview-practice/practice.ts", import.meta.url), "utf8");
    expect(cli).toContain("\"--register-next\"");
    expect(cli).toContain("await composePracticeNextRegisterVersion(register)");
  });
});

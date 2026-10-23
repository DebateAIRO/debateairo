// Side-by-side spec §13 "Activating a settings version" and §11 (rollback), Task S15: the operator module that records
// check-version's verdict, activates a version, reads the status, and plans the release switch's settings step. A fake
// client answers the SQL; no database, no gate, no AI call. The real-database pass is
// tests/integration/settings-operator-0124.test.ts.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { previewModelRowForRef } from "@debateai/providers";
import {
  SETTINGS_CHECKER, SETTINGS_CHECK_DETAIL_UNPRINTABLE, settingsCheckLine, settingsCheckReport, type SealedPreviewLineUp, type SettingsCheckReport
} from "@debateai/register";
import {
  ACTIVATED_BY_PATTERN,
  SettingsOperatorRefusal,
  activateSettingsVersion,
  assertSettingsGatesServe,
  parseSeatableEnvironment,
  seatableGateModelsReader,
  canonicalSettingsJson,
  latestPassedSettingsVersion,
  parseSettingsCheckLine,
  parseSettingsCheckOutput,
  readEffectiveActiveSettings,
  readSettingsStatus,
  recordSettingsVerdict,
  settingsForSwitch,
  settingsVerdictOf,
  type ActivationReaders,
  type SettingsOperatorClient,
  type SettingsSeatableEnvironment
} from "../../tools/settings-version/settings-operator.js";
import { runSettingsCli, type SettingsCliDeps } from "../../tools/settings-version/cli.js";

// Keys are built from pieces (the secret scanner reads r<n>-<12 hex> as a key).
const KEY = "r17-" + "0123456789ab";
const NEXT = "r18-" + "abcdef012345";
const SNAPSHOT = "c".repeat(64);

type Handler = (sql: string, params: readonly unknown[]) => Record<string, unknown>[] | Error;
/** A client answering by the first handler whose text the SQL contains; every query is recorded. */
function fakeClient(handlers: ReadonlyArray<readonly [string, Handler]>) {
  const queries: { sql: string; params: readonly unknown[] }[] = [];
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const handler = handlers.find(([text]) => sql.includes(text));
      if (handler === undefined) throw new Error(`unexpected SQL ${sql}`);
      const answer = handler[1](sql, params);
      if (answer instanceof Error) throw answer;
      return { rows: answer };
    }
  } as unknown as SettingsOperatorClient;
  return { client, queries, sqls: () => queries.map(({ sql }) => sql) };
}
const pgError = (code: string, message: string, detail?: string): Error => Object.assign(new Error(message), { code, ...(detail ? { detail } : {}) });
const rows = (...values: Record<string, unknown>[]) => (): Record<string, unknown>[] => values;
const refusal = async (work: Promise<unknown>): Promise<SettingsOperatorRefusal> => {
  try { await work; } catch (error) { expect(error).toBeInstanceOf(SettingsOperatorRefusal); return error as SettingsOperatorRefusal; }
  throw new Error("expected a refusal");
};
const report = (half: "runner" | "api", codes: string[] = [], over: Partial<{ releaseKey: string; version: number; snapshotSha256: string | null }> = {}): SettingsCheckReport =>
  settingsCheckReport({ half, releaseKey: over.releaseKey ?? KEY, version: over.version ?? 18, codes, snapshotSha256: over.snapshotSha256 === undefined ? SNAPSHOT : over.snapshotSha256 });

describe("the verdict (spec §13: PASS only when both halves PASS)", () => {
  it("reads exactly the line S14 prints, and nothing else", () => {
    const runner = report("runner");
    expect(parseSettingsCheckLine(settingsCheckLine(runner))).toEqual(runner);
    const failing = report("api", ["SETTINGS_SITE_MEMBER_DIFFERS:costEnvelopePolicy.daily_ceiling_micros", "SETTINGS_GATE_UNREVIEWED:preview:x"]);
    expect(parseSettingsCheckLine(settingsCheckLine(failing).trimEnd())).toEqual(failing);
    expect(parseSettingsCheckLine(settingsCheckLine(report("runner", [], { snapshotSha256: null })))).toMatchObject({ snapshotSha256: null });
    // S14's own code rule (isSettingsCheckCode): a long detail is a code; a character outside its alphabet is not.
    const long = report("api", [`SETTINGS_GATE_UNREVIEWED:${"x".repeat(300)}`]);
    expect(parseSettingsCheckLine(settingsCheckLine(long))).toEqual(long);
    // FINAL-FIX 20: a ref with such a character never reaches the line: the report records a code the verdict reads (FAIL).
    const odd = report("runner", ["SETTINGS_GATE_UNREVIEWED:preview:a@b"]);
    expect(odd.codes).toEqual([SETTINGS_CHECK_DETAIL_UNPRINTABLE, "SETTINGS_GATE_UNREVIEWED"]);
    expect(parseSettingsCheckLine(settingsCheckLine(odd))).toMatchObject({ verdict: "FAIL", codes: odd.codes });
    const json = JSON.parse(settingsCheckLine(runner).slice("DEBATEAI_SETTINGS_CHECK ".length));
    const variants: string[] = [
      `DEBATEAI_SETTINGS_VERDICT ${JSON.stringify(json)}`,
      `DEBATEAI_SETTINGS_CHECK  ${JSON.stringify(json)}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify(json)}\n\n`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, extra: 1 })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ releaseKey: json.releaseKey, half: json.half, version: json.version, verdict: json.verdict, codes: json.codes, snapshotSha256: json.snapshotSha256, checker: json.checker })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, half: "website" })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, releaseKey: "legacy" })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, version: "18" })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, version: 0 })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, verdict: "FAIL" })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, codes: ["SETTINGS_X"] })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, verdict: "FAIL", codes: ["SETTINGS_B", "SETTINGS_A"] })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, verdict: "FAIL", codes: ["SETTINGS_A", "SETTINGS_A"] })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, verdict: "FAIL", codes: ["settings lower case"] })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, verdict: "FAIL", codes: ["SETTINGS_X:a+b"] })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, snapshotSha256: "C".repeat(64) })}`,
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify({ ...json, checker: "check-version-v0" })}`,
      "DEBATEAI_SETTINGS_CHECK {not json",
      `DEBATEAI_SETTINGS_CHECK ${JSON.stringify(json, null, 1).replace(/\n/gu, "")}`
    ];
    for (const variant of variants) {
      expect(() => parseSettingsCheckLine(variant), variant).toThrow(expect.objectContaining({ code: "SETTINGS_CHECK_REPORT_INVALID" }));
    }
  });

  it("PASS only when both halves PASS; the digest is sha256 of the canonical { releaseKey, version, runner, api }", () => {
    const runner = report("runner"), api = report("api");
    const verdict = settingsVerdictOf(runner, api);
    const expected = createHash("sha256").update(canonicalSettingsJson({ releaseKey: KEY, version: 18, runner, api })).digest("hex");
    expect(verdict).toEqual({ releaseKey: KEY, version: 18, verdict: "PASS", digest: expected });
    // Canonical: key order does not matter, every value does.
    expect(canonicalSettingsJson({ b: 1, a: [2, { d: 3, c: null }] })).toBe('{"a":[2,{"c":null,"d":3}],"b":1}');
    expect(settingsVerdictOf(report("runner", ["SETTINGS_NEEDS_ENV_CHANGE:ROLE_REF:preview:x"]), api).verdict).toBe("FAIL");
    expect(settingsVerdictOf(runner, report("api", ["SETTINGS_HASH_UNDECLARED:mapContractHash"])).verdict).toBe("FAIL");
    expect(settingsVerdictOf(runner, report("api", ["SETTINGS_HASH_UNDECLARED:mapContractHash"])).digest).not.toBe(expected);
  });

  it("mismatched keys, versions or snapshots, a half in the wrong place, a half reported twice or an unknown line: SETTINGS_CHECK_REPORT_INVALID", () => {
    const invalid = expect.objectContaining({ code: "SETTINGS_CHECK_REPORT_INVALID" });
    expect(() => settingsVerdictOf(report("runner"), report("api", [], { releaseKey: NEXT }))).toThrow(invalid);
    expect(() => settingsVerdictOf(report("runner"), report("api", [], { version: 19 }))).toThrow(invalid);
    expect(() => settingsVerdictOf(report("runner"), report("api", [], { snapshotSha256: "e".repeat(64) }))).toThrow(invalid);
    expect(() => settingsVerdictOf(report("runner"), report("runner"))).toThrow(invalid);
    expect(() => settingsVerdictOf(report("api"), report("runner"))).toThrow(invalid);
    const one = settingsCheckLine(report("runner"));
    expect(parseSettingsCheckOutput(`\n${one}\n`)).toEqual(report("runner"));
    expect(() => parseSettingsCheckOutput(one + one)).toThrow(invalid);
    expect(() => parseSettingsCheckOutput(`> pnpm settings:check-runner 18\n${one}`)).toThrow(invalid);
    expect(() => parseSettingsCheckOutput("")).toThrow(invalid);
  });

  it("records through register.record_settings_verdict and keeps the database's SETTINGS_VERDICT_INVALID typed", async () => {
    const verdict = settingsVerdictOf(report("runner"), report("api"));
    const ok = fakeClient([["record_settings_verdict", rows()]]);
    await recordSettingsVerdict(ok.client, verdict);
    expect(ok.queries).toEqual([{ sql: "SELECT register.record_settings_verdict($1::text, $2::bigint, $3::text, $4::text)", params: [KEY, 18, "PASS", verdict.digest] }]);
    const refused = fakeClient([["record_settings_verdict", () => pgError("22023", "SETTINGS_VERDICT_INVALID")]]);
    expect((await refusal(recordSettingsVerdict(refused.client, verdict))).code).toBe("SETTINGS_VERDICT_INVALID");
    // Another error with the same words but another SQLSTATE is not the refusal: it passes through untouched.
    const other = fakeClient([["record_settings_verdict", () => pgError("08006", "SETTINGS_VERDICT_INVALID")]]);
    await expect(recordSettingsVerdict(other.client, verdict)).rejects.toMatchObject({ code: "08006" });
  });
});

/** The database of one activation: current release, pointer, the pass check and the activation itself. */
function activationDatabase(over: Partial<{
  current: string | null; pointer: string | null; passed: boolean; passedList: string[];
  activate: Handler; commit: Handler;
}> = {}) {
  const o = { current: KEY, pointer: "17", passed: true, passedList: ["17", "18"], ...over };
  return fakeClient([
    ["core.read_current_release()", () => (o.current === null ? [] : [{ release_key: o.current }])],
    ["read_active_settings_version()", () => [{ pointer: o.pointer }]],
    ["settings_version_passed", () => [{ passed: o.passed }]],
    ["read_passed_settings_versions", () => o.passedList.map((v) => ({ v }))],
    ["BEGIN ISOLATION LEVEL READ COMMITTED", rows()],
    ["activate_settings_version", o.activate ?? rows({ activation_seq: "3" })],
    ["COMMIT", o.commit ?? rows()],
    ["ROLLBACK", rows()]
  ]);
}
const SEATS = ["preview:fixture-a", "preview:claude-haiku-5-5"];
/** The live condition 6 over injected role refs (the register's readers at the version, as check-version reads them). */
const readersOf = (refs: readonly string[]): ActivationReaders => ({
  readGateModels: async () => {
    const models = [], unreviewed = [];
    for (const ref of refs) {
      const row = previewModelRowForRef(ref);
      if (row === undefined) unreviewed.push(ref); else models.push({ ref, gate: row.provider, model: row.model });
    }
    return { models, unreviewed };
  }
});
const switchDatabase = (pointer: string | null, passed: string[]) => fakeClient([
  ["read_active_settings_version()", rows({ pointer })],
  ["read_passed_settings_versions", () => passed.map((v) => ({ v }))]
]);
const BOTH_GATES = { deepinfra: ["zai-org/GLM-5.3-Flash"], anthropic: ["claude-haiku-5-5"] };
/** The release's env line-up and declared models (required since SA10 fix round 1; the S15 readers here ignore them). */
const SEAT_ENV: SettingsSeatableEnvironment = { envLineUp: null, declaredModels: ["zai-org/GLM-5.3-Flash", "claude-haiku-5-5"] };

describe("the activation (spec §13 activate <v>)", () => {
  it("reads the release and the pointer, checks the gates live, then activates in one READ COMMITTED transaction", async () => {
    const db = activationDatabase();
    const done = await activateSettingsVersion(db.client, { version: 18, activatedBy: "owner", reason: "new lengths", gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS));
    expect(done).toEqual({ activationSeq: "3", previous: 17, releaseKey: KEY });
    expect(db.sqls()).toEqual([
      "SELECT c.release_key FROM core.read_current_release() AS c",
      "SELECT register.read_active_settings_version()::text AS pointer",
      "SELECT register.settings_version_passed($1::text, $2::bigint) AS passed",
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "SELECT register.activate_settings_version($1::bigint, $2::bigint, $3::text, $4::text, $5::text)::text AS activation_seq",
      "COMMIT"
    ]);
    expect(db.queries[4]!.params).toEqual([18, 17, KEY, "owner", "new lengths"]);
    // Never activated: the expected previous is NULL.
    const first = activationDatabase({ pointer: null });
    expect((await activateSettingsVersion(first.client, { version: 18, activatedBy: "owner", reason: "first", gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS))).previous).toBeNull();
    expect(first.queries.find(({ sql }) => sql.includes("activate_settings_version"))!.params[1]).toBeNull();
  });

  it("refuses early, with a plain line naming what passed, when the current release has not passed the version", async () => {
    const db = activationDatabase({ passed: false, passedList: ["17"] });
    const error = await refusal(activateSettingsVersion(db.client, { version: 19, activatedBy: "owner", reason: "x", gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS)));
    expect([error.code, error.passed]).toEqual(["SETTINGS_VERSION_NOT_PASSED", [17]]);
    expect(db.sqls().some((sql) => sql.includes("BEGIN") || sql.includes("activate_settings_version"))).toBe(false);
    const none = activationDatabase({ current: null });
    expect((await refusal(activateSettingsVersion(none.client, { version: 18, activatedBy: "owner", reason: "x", gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS)))).code).toBe("SETTINGS_ACTIVATION_CONFLICT");
  });

  it("condition 6 live: every seat's model on at its gate; a missing gate answer or an unreviewed ref refuses, all codes together, nothing written", async () => {
    const cases: [Record<string, readonly string[]>, readonly string[], string[]][] = [
      [{ deepinfra: ["zai-org/GLM-5.3-Flash"], anthropic: [] }, SEATS, ["SETTINGS_GATE_MODEL_DISABLED:anthropic:claude-haiku-5-5"]],
      [{ deepinfra: ["zai-org/GLM-5.3-Flash"] }, SEATS, ["SETTINGS_GATE_UNANSWERED:anthropic"]],
      [{}, [...SEATS, "preview:not-reviewed"], ["SETTINGS_GATE_UNANSWERED:anthropic", "SETTINGS_GATE_UNANSWERED:deepinfra", "SETTINGS_GATE_UNREVIEWED:preview:not-reviewed"]]
    ];
    for (const [gates, refs, codes] of cases) {
      const db = activationDatabase();
      const error = await refusal(activateSettingsVersion(db.client, { version: 18, activatedBy: "owner", reason: "x", gateEnabledModels: gates, seatableEnvironment: SEAT_ENV }, readersOf(refs)));
      expect([error.code, error.codes]).toEqual(["SETTINGS_GATE_LIVE_CHECK_FAILED", codes]);
      expect(db.sqls().some((sql) => sql.includes("BEGIN"))).toBe(false);
    }
  });

  it("maps the database's refusals by SQLSTATE and code; READ_COMMITTED_REQUIRED by its DETAIL", async () => {
    const cases: [Error, string][] = [
      [pgError("40001", "SETTINGS_ACTIVATION_CONFLICT"), "SETTINGS_ACTIVATION_CONFLICT"],
      [pgError("55000", "SETTINGS_VERSION_NOT_PASSED"), "SETTINGS_VERSION_NOT_PASSED"],
      [pgError("22023", "SETTINGS_ACTIVATION_UNCHANGED"), "SETTINGS_ACTIVATION_UNCHANGED"],
      [pgError("22023", "SETTINGS_VERSION_KIND_INVALID"), "SETTINGS_VERSION_KIND_INVALID"],
      [pgError("22023", "SETTINGS_ACTIVATION_CONFLICT", "READ_COMMITTED_REQUIRED"), "SETTINGS_ACTIVATION_ISOLATION_INVALID"],
      [pgError("23514", "new row violates check constraint"), "SETTINGS_OPERATOR_USAGE"]
    ];
    for (const [error, code] of cases) {
      const db = activationDatabase({ activate: () => error });
      expect((await refusal(activateSettingsVersion(db.client, { version: 18, activatedBy: "owner", reason: "x", gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS)))).code).toBe(code);
      expect(db.sqls().at(-1)).toBe("ROLLBACK");
    }
    // The deferred check fails at COMMIT: the same mapping.
    const atCommit = activationDatabase({ commit: () => pgError("55000", "SETTINGS_VERSION_NOT_PASSED") });
    expect((await refusal(activateSettingsVersion(atCommit.client, { version: 18, activatedBy: "owner", reason: "x", gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS)))).code).toBe("SETTINGS_VERSION_NOT_PASSED");
    // An unmapped error passes through untouched.
    const broken = activationDatabase({ activate: () => pgError("57014", "canceling statement due to statement timeout") });
    await expect(activateSettingsVersion(broken.client, { version: 18, activatedBy: "owner", reason: "x", gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS))).rejects.toMatchObject({ code: "57014" });
  });

  it("--by matches the table's CHECK (no colon) and --reason is one line, both before any read", async () => {
    expect(ACTIVATED_BY_PATTERN.source).toBe("^[A-Za-z0-9][A-Za-z0-9 ._@-]{0,127}$");
    for (const [activatedBy, reason] of [["root:owner", "x"], ["", "x"], [" owner", "x"], ["a".repeat(129), "x"], ["owner", ""], ["owner", "two\nlines"], ["owner", "x".repeat(513)]]) {
      const db = activationDatabase();
      expect((await refusal(activateSettingsVersion(db.client, { version: 18, activatedBy: activatedBy!, reason: reason!, gateEnabledModels: BOTH_GATES, seatableEnvironment: SEAT_ENV }, readersOf(SEATS)))).code).toBe("SETTINGS_OPERATOR_USAGE");
      expect(db.queries).toEqual([]);
    }
  });
});

describe("condition 6 live over every model a version can seat (addition D21, SA10)", () => {
  const GLM = "zai-org/GLM-5.3-Flash", DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash", HAIKU = "claude-haiku-5-5";
  const lineUp = (free: readonly string[], premium: readonly string[] = free): SealedPreviewLineUp =>
    ({ free_model_ids: free, premium_model_ids: premium, thinking_levels: null });
  /** The real seatable reader (settings-operator.ts) over fake register reads: the seats and the line-up row only. */
  const seatable = (seatRefs: readonly string[], row: SealedPreviewLineUp | null): ActivationReaders => ({
    readGateModels: seatableGateModelsReader({ readSeatRefs: async () => seatRefs, readLineUp: async () => row })
  });
  const ENV: SettingsSeatableEnvironment = { envLineUp: null, declaredModels: [GLM, DEEPSEEK] };

  it("a roster model off at its gate refuses the activation, where the seat-only check (S15) would have passed", async () => {
    const gates = { deepinfra: [GLM], anthropic: [HAIKU] };
    // The seats alone (the writer's GLM) are on: S15's check passes.
    await expect(activateSettingsVersion(activationDatabase().client, { version: 18, activatedBy: "owner", reason: "x", gateEnabledModels: gates, seatableEnvironment: ENV },
      readersOf(["preview:fixture-a"]))).resolves.toMatchObject({ activationSeq: "3" });
    // The version's Premium list also seats DeepSeek, which its gate has switched off: refused, nothing written.
    const db = activationDatabase();
    const error = await refusal(activateSettingsVersion(db.client, { version: 18, activatedBy: "owner", reason: "x", gateEnabledModels: gates,
      seatableEnvironment: ENV }, seatable(["preview:fixture-a"], lineUp([GLM], [GLM, DEEPSEEK]))));
    expect([error.code, error.codes]).toEqual(["SETTINGS_GATE_LIVE_CHECK_FAILED", [`SETTINGS_GATE_MODEL_DISABLED:deepinfra:${DEEPSEEK}`]]);
    expect(db.sqls().some((sql) => sql.includes("BEGIN"))).toBe(false);
  });

  it("the structure-repair model counts when a declared target serves it; an unreviewed seat and a dropped roster id are named", async () => {
    const withHaiku = { envLineUp: null, declaredModels: [GLM, HAIKU] };
    const off = await refusal(assertSettingsGatesServe(fakeClient([]).client, { version: 18, gateEnabledModels: { deepinfra: [GLM], anthropic: [] },
      seatableEnvironment: withHaiku }, seatable(["preview:fixture-a", "preview:never"], lineUp([GLM, "vendor/Dropped-1"]))));
    expect(off.codes).toEqual([`SETTINGS_GATE_MODEL_DISABLED:anthropic:${HAIKU}`, "SETTINGS_GATE_UNREVIEWED:preview:never", "SETTINGS_GATE_UNREVIEWED:vendor/Dropped-1"]);
    await expect(assertSettingsGatesServe(fakeClient([]).client, { version: 18, gateEnabledModels: { deepinfra: [GLM], anthropic: [HAIKU] },
      seatableEnvironment: withHaiku }, seatable(["preview:fixture-a"], lineUp([GLM])))).resolves.toBeUndefined();
  });

  it("a row-less version runs on the env's line-up; with none (the sockets-only form) it refuses PREVIEW_LINE_UP_REQUIRED", async () => {
    const gates = { deepinfra: [GLM, DEEPSEEK] };
    await expect(assertSettingsGatesServe(fakeClient([]).client, { version: 18, gateEnabledModels: gates,
      seatableEnvironment: { envLineUp: lineUp([GLM, DEEPSEEK]), declaredModels: [GLM, DEEPSEEK] } }, seatable(["preview:fixture-a"], null))).resolves.toBeUndefined();
    const none = await refusal(assertSettingsGatesServe(fakeClient([]).client, { version: 18, gateEnabledModels: gates,
      seatableEnvironment: { envLineUp: null, declaredModels: [GLM, DEEPSEEK] } }, seatable(["preview:fixture-a"], null)));
    expect([none.code, none.codes]).toEqual(["SETTINGS_GATE_LIVE_CHECK_FAILED", ["PREVIEW_LINE_UP_REQUIRED"]]);
  });

  it("the root wiring's hand-over file: exactly its three members; the config read by the env's own parser", () => {
    const sockets = { budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", deployment: "v3-preview", requested_thinking_level: "high", scope_id: "preview-team" };
    const text = (previewConfig: unknown, declaredModels: unknown = [GLM, GLM], extra: object = {}) =>
      JSON.stringify({ schema: "preview-settings-seatable-env-v1", previewConfig, declaredModels, ...extra });
    expect(parseSeatableEnvironment(text(JSON.stringify(sockets)))).toEqual({ envLineUp: null, declaredModels: [GLM] });
    // The two-maker rule holds for the old six-key form: each list names two makers.
    const oldForm = { ...sockets, free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [DEEPSEEK, GLM] };
    expect(parseSeatableEnvironment(text(JSON.stringify(oldForm))).envLineUp).toEqual({ free_model_ids: [GLM, DEEPSEEK], premium_model_ids: [DEEPSEEK, GLM], thinking_levels: null });
    for (const bad of ["{", text("{}"), text(JSON.stringify(sockets), "x"), text(JSON.stringify(sockets), [""]), text(JSON.stringify(sockets), []), text(null), text(JSON.stringify(sockets), [GLM], { more: 1 }),
      JSON.stringify({ schema: "other", previewConfig: JSON.stringify(sockets), declaredModels: [] })]) {
      expect(() => parseSeatableEnvironment(bad), bad).toThrow(expect.objectContaining({ code: "SETTINGS_SEATABLE_ENV_INVALID" }));
    }
  });
});

describe("the status, the rollback's version and the switch's settings step", () => {
  it("status: the release, the pointer, what new asks use (the site version while nothing was activated), what passed", async () => {
    const set = fakeClient([
      ["core.read_current_release()", rows({ release_key: KEY })],
      ["read_active_settings_version()", rows({ pointer: "18" })],
      ["read_passed_settings_versions", rows({ v: "17" }, { v: "18" })]
    ]);
    expect(await readSettingsStatus(set.client)).toEqual({ currentRelease: KEY, pointer: 18, effectiveActive: 18, passed: [17, 18] });
    const empty = fakeClient([
      ["core.read_current_release()", rows({ release_key: KEY })],
      ["read_active_settings_version()", rows({ pointer: null })],
      ["read_passed_settings_versions", rows({ v: "17" })]
    ]);
    expect(await readSettingsStatus(empty.client)).toEqual({ currentRelease: KEY, pointer: null, effectiveActive: 17, passed: [17] });
    const none = fakeClient([["core.read_current_release()", rows()], ["read_active_settings_version()", rows({ pointer: null })]]);
    expect(await readSettingsStatus(none.client)).toEqual({ currentRelease: null, pointer: null, effectiveActive: null, passed: [] });
  });

  it("the kit's light read (ruling R69): a database without 0124's reader or 0123's release table is asked nothing it lacks", async () => {
    const schema = (releases: boolean, settings: boolean) => rows({ releases, settings });
    const full = fakeClient([
      ["to_regprocedure", schema(true, true)],
      ["core.read_current_release()", rows({ release_key: KEY })],
      ["read_active_settings_version()", rows({ pointer: "18" })]
    ]);
    expect(await readEffectiveActiveSettings(full.client)).toEqual({ currentRelease: KEY, pointer: 18, effectiveActive: 18 });
    expect(full.sqls().some((sql) => sql.includes("read_passed_settings_versions"))).toBe(false);
    // T+1's SB3: T is current (0123 applied), 0124 not applied yet: the pointer is null, the site version is active.
    const before0124 = fakeClient([["to_regprocedure", schema(true, false)], ["core.read_current_release()", rows({ release_key: KEY })]]);
    expect(await readEffectiveActiveSettings(before0124.client)).toEqual({ currentRelease: KEY, pointer: null, effectiveActive: 17 });
    expect(before0124.sqls().some((sql) => sql.includes("read_active_settings_version"))).toBe(false);
    // Neither: no release, no pointer (the caller's old rule decides).
    const before0123 = fakeClient([["to_regprocedure", schema(false, false)]]);
    expect(await readEffectiveActiveSettings(before0123.client)).toEqual({ currentRelease: null, pointer: null, effectiveActive: null });
    expect(before0123.queries).toHaveLength(1);
  });

  it("latest passed: the most recent PASS still PASS (by checked_at), else the release's own site version (D1, T)", async () => {
    const found = fakeClient([["register.settings_verdict", rows({ v: "19" })]]);
    expect(await latestPassedSettingsVersion(found.client, NEXT)).toBe(19);
    expect(found.queries[0]!.params).toEqual([NEXT]);
    expect(found.queries[0]!.sql).toMatch(/DISTINCT ON \(verdict_row\.register_version\)[\s\S]*WHERE latest\.verdict = 'PASS'[\s\S]*ORDER BY latest\.checked_at DESC/u);
    const none = fakeClient([["register.settings_verdict", rows()]]);
    expect(await latestPassedSettingsVersion(none.client, NEXT)).toBe(18);
    expect((await refusal(latestPassedSettingsVersion(none.client, "legacy"))).code).toBe("SETTINGS_OPERATOR_USAGE");
  });

  it("switch: the pointer is the expected value; a pointer the new release passed needs no activation", async () => {
    expect(await settingsForSwitch(switchDatabase("17", ["17", "18"]).client, { newRelease: NEXT })).toEqual({ expectedActiveSettings: 17, activate: null });
  });
  it("switch: no pointer yet activates the new release's own site version (owner answer Q-S2)", async () => {
    expect(await settingsForSwitch(switchDatabase(null, ["18"]).client, { newRelease: NEXT })).toEqual({ expectedActiveSettings: null, activate: 18 });
  });
  it("switch: a pointer the new release has not passed refuses, naming what it passed; --activate a passed version plans it", async () => {
    const error = await refusal(settingsForSwitch(switchDatabase("17", ["18", "19"]).client, { newRelease: NEXT }));
    expect([error.code, error.passed]).toEqual(["SETTINGS_VERSION_NOT_PASSED", [18, 19]]);
    expect(await settingsForSwitch(switchDatabase("17", ["18", "19"]).client, { newRelease: NEXT, activate: 19 })).toEqual({ expectedActiveSettings: 17, activate: 19 });
    expect((await refusal(settingsForSwitch(switchDatabase("17", ["18"]).client, { newRelease: NEXT, activate: 20 }))).passed).toEqual([18]);
    // Activating the pointer itself is nothing to do.
    expect(await settingsForSwitch(switchDatabase("18", ["18"]).client, { newRelease: NEXT, activate: 18 })).toEqual({ expectedActiveSettings: 18, activate: null });
  });
});

describe("cli.ts (one line per command, the exit codes of its header)", () => {
  const output = () => {
    const out: string[] = [], err: string[] = [];
    return { out, err, io: { stdout: (text: string) => { out.push(text); }, stderr: (text: string) => { err.push(text); } } };
  };
  const depsOf = (client: SettingsOperatorClient, files: Record<string, string> = {}): SettingsCliDeps & { closed: () => number } => {
    let closed = 0;
    return {
      connect: async () => ({ client, close: async () => { closed += 1; } }),
      readText: async (path: string) => { if (!Object.hasOwn(files, path)) throw new Error("ENOENT"); return files[path]!; },
      activationReaders: readersOf(SEATS),
      closed: () => closed
    };
  };

  it("verdict: records PASS (exit 0) or FAIL (exit 1) with the codes; a bad report writes nothing (exit 2)", async () => {
    const db = fakeClient([["record_settings_verdict", rows()]]);
    const files = { "/r": settingsCheckLine(report("runner")), "/a": settingsCheckLine(report("api", ["SETTINGS_HASH_UNDECLARED:mapContractHash"])) };
    const o = output();
    const deps = depsOf(db.client, files);
    expect(await runSettingsCli(["verdict", "--runner", "/r", "--api", "/a"], o.io, deps)).toBe(1);
    const printed = JSON.parse(o.out[0]!.slice("DEBATEAI_SETTINGS_VERDICT ".length));
    expect(printed).toMatchObject({ releaseKey: KEY, version: "18", verdict: "FAIL", codes: ["SETTINGS_HASH_UNDECLARED:mapContractHash"] });
    expect(deps.closed()).toBe(1);
    const pass = output();
    expect(await runSettingsCli(["verdict", "--runner", "/r", "--api", "/r2"], pass.io, depsOf(db.client, { ...files, "/r2": settingsCheckLine(report("api")) }))).toBe(0);
    const bad = fakeClient([]);
    const twice = output();
    expect(await runSettingsCli(["verdict", "--runner", "/r", "--api", "/r"], twice.io, depsOf(bad.client, files))).toBe(2);
    expect(JSON.parse(twice.err[0]!.slice("DEBATEAI_SETTINGS_REFUSED ".length))).toEqual({ command: "verdict", code: "SETTINGS_CHECK_REPORT_INVALID" });
    expect(bad.queries).toEqual([]);
  });

  const GATE_ANSWER = (models: string[]) => JSON.stringify({ enabled_models: models, largest_reservation_usd: "0.01", max_concurrent_calls: 4, remaining_calls: 100, remaining_usd: "1.5", state: "active", window_open: true });
  const SEATABLE_FILE = { "/s/env.json": JSON.stringify({ schema: "preview-settings-seatable-env-v1", declaredModels: ["zai-org/GLM-5.3-Flash", "claude-haiku-5-5"],
    previewConfig: JSON.stringify({ budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock", deployment: "v3-preview", requested_thinking_level: "high", scope_id: "preview-team" }) }) };
  const SEATABLE = ["--seatable-env", "/s/env.json"];
  const GATE_FILES = { ...SEATABLE_FILE, "/g/di.json": GATE_ANSWER(["zai-org/GLM-5.3-Flash"]), "/g/an.json": GATE_ANSWER(["claude-haiku-5-5"]) };
  const WITH_GATES = [...SEATABLE, "--gate-remaining", "deepinfra=/g/di.json", "--gate-remaining", "anthropic=/g/an.json"];
  it("activate: the receipt line; unchanged exits 0; conflict 3; not passed 4 (with what passed); usage 2 before any read", async () => {
    const o = output();
    expect(await runSettingsCli(["activate", "18", "--by", "owner", "--reason", "new lengths", ...WITH_GATES], o.io, depsOf(activationDatabase().client, GATE_FILES))).toBe(0);
    expect(o.out).toEqual([`DEBATEAI_SETTINGS_ACTIVATED {"version":"18","previous":"17","releaseKey":"${KEY}","activationSeq":"3"}\n`]);
    const same = output();
    expect(await runSettingsCli(["activate", "17", "--by", "owner", "--reason", "x", ...WITH_GATES], same.io,
      depsOf(activationDatabase({ activate: () => pgError("22023", "SETTINGS_ACTIVATION_UNCHANGED") }).client, GATE_FILES))).toBe(0);
    expect(same.out).toEqual(['SETTINGS_ACTIVATION_UNCHANGED {"version":"17"}\n']);
    const conflict = output();
    expect(await runSettingsCli(["activate", "18", "--by", "owner", "--reason", "x", ...WITH_GATES], conflict.io,
      depsOf(activationDatabase({ activate: () => pgError("40001", "SETTINGS_ACTIVATION_CONFLICT") }).client, GATE_FILES))).toBe(3);
    const notPassed = output();
    expect(await runSettingsCli(["activate", "19", "--by", "owner", "--reason", "x", ...SEATABLE], notPassed.io,
      depsOf(activationDatabase({ passed: false, passedList: ["17"] }).client, SEATABLE_FILE))).toBe(4);
    expect(notPassed.err).toEqual(['DEBATEAI_SETTINGS_REFUSED {"command":"activate","code":"SETTINGS_VERSION_NOT_PASSED","passed":["17"]}\n']);
    // SA10: without the release's line-up and target models (--seatable-env) the seatable set is unknown: usage, never a skip.
    for (const args of [["activate", "18", "--reason", "x"], ["activate", "18", "--by", "root:owner", "--reason", "x"], ["activate", "018", "--by", "o", "--reason", "x"],
      ["activate", "18", "--by", "o", "--by", "p", "--reason", "x"], ["activate", "18", "--by", "o", "--reason", "x"], ["gate-check", "18"], ["gate-check", "x", ...SEATABLE]]) {
      const db = activationDatabase();
      const u = output();
      let connected = 0;
      expect(await runSettingsCli(args, u.io, { ...depsOf(db.client), connect: async () => { connected += 1; return { client: db.client, close: async () => undefined }; } })).toBe(2);
      expect(connected).toBe(0);
    }
  });

  it("activate with no gate answer at all (both gates silent, or a direct pnpm settings:activate) is refused: condition 6 always runs (ruling R59)", async () => {
    const db = activationDatabase();
    const silent = output();
    expect(await runSettingsCli(["activate", "18", "--by", "owner", "--reason", "x", ...SEATABLE], silent.io, depsOf(db.client, SEATABLE_FILE))).toBe(1);
    expect(silent.err).toEqual(['DEBATEAI_SETTINGS_REFUSED {"command":"activate","code":"SETTINGS_GATE_LIVE_CHECK_FAILED","codes":["SETTINGS_GATE_UNANSWERED:anthropic","SETTINGS_GATE_UNANSWERED:deepinfra"]}\n']);
    expect(db.sqls().some((sql) => sql.includes("BEGIN") || sql.includes("activate_settings_version"))).toBe(false);
    // Both answer files unreadable: the same refusal.
    const unreadable = activationDatabase();
    const both = output();
    expect(await runSettingsCli(["activate", "18", "--by", "owner", "--reason", "x", ...SEATABLE, "--gate-remaining", "deepinfra=/g/none.json", "--gate-remaining", "anthropic=/g/none2.json"], both.io, depsOf(unreadable.client, SEATABLE_FILE))).toBe(1);
    expect(unreadable.sqls().some((sql) => sql.includes("activate_settings_version"))).toBe(false);
  });

  it("activate --gate-remaining: each gate's raw /remaining answer; an unreadable or invalid answer is no answer (condition 6 refuses, exit 1)", async () => {
    const answer = (models: string[]) => JSON.stringify({ enabled_models: models, largest_reservation_usd: "0.01", max_concurrent_calls: 4, remaining_calls: 100, remaining_usd: "1.5", state: "active", window_open: true });
    const files = { ...SEATABLE_FILE, "/g/deepinfra.json": answer(["zai-org/GLM-5.3-Flash"]), "/g/anthropic.json": "{\"state\":\"active\"}" };
    const db = activationDatabase();
    const o = output();
    const exit = await runSettingsCli(["activate", "18", "--by", "owner", "--reason", "x", ...SEATABLE, "--gate-remaining", "deepinfra=/g/deepinfra.json",
      "--gate-remaining", "anthropic=/g/anthropic.json", "--gate-remaining", "spare=/g/missing.json"], o.io, depsOf(db.client, files));
    expect(exit).toBe(1);
    expect(o.err).toEqual(['DEBATEAI_SETTINGS_REFUSED {"command":"activate","code":"SETTINGS_GATE_LIVE_CHECK_FAILED","codes":["SETTINGS_GATE_UNANSWERED:anthropic"]}\n']);
    expect(db.sqls().some((sql) => sql.includes("activate_settings_version"))).toBe(false);
    const on = output();
    expect(await runSettingsCli(["activate", "18", "--by", "owner", "--reason", "x", ...SEATABLE, "--gate-remaining", "deepinfra=/g/deepinfra.json",
      "--gate-remaining", "anthropic=/g/on.json"], on.io, depsOf(activationDatabase().client, { ...files, "/g/on.json": answer(["claude-haiku-5-5"]) }))).toBe(0);
    expect(on.out[0]).toMatch(/^DEBATEAI_SETTINGS_ACTIVATED /u);
    const bad = output();
    expect(await runSettingsCli(["activate", "18", "--by", "owner", "--reason", "x", "--gate-remaining", "deepinfra"], bad.io, depsOf(activationDatabase().client))).toBe(2);
  });

  it("gate-check (ruling R60): the same live condition 6, read-only; exit 0 with one line, 1 refused with every code, 2 for a bad hand-over", async () => {
    const db = fakeClient([]);
    const o = output();
    expect(await runSettingsCli(["gate-check", "21", ...WITH_GATES], o.io, depsOf(db.client, GATE_FILES))).toBe(0);
    expect(o.out).toEqual(['DEBATEAI_SETTINGS_GATES_SERVE {"version":"21"}\n']);
    // Nothing is read but the gates' answers and the seats (fake readers here): no write, no transaction.
    expect(db.queries).toEqual([]);
    const off = output();
    expect(await runSettingsCli(["gate-check", "21", ...SEATABLE, "--gate-remaining", "deepinfra=/g/di.json"], off.io, depsOf(fakeClient([]).client, GATE_FILES))).toBe(1);
    expect(off.err).toEqual(['DEBATEAI_SETTINGS_REFUSED {"command":"gate-check","code":"SETTINGS_GATE_LIVE_CHECK_FAILED","codes":["SETTINGS_GATE_UNANSWERED:anthropic"]}\n']);
    const bad = output();
    expect(await runSettingsCli(["gate-check", "21", ...SEATABLE], bad.io, depsOf(fakeClient([]).client, { "/s/env.json": "{}" }))).toBe(2);
    expect(bad.err).toEqual(['DEBATEAI_SETTINGS_REFUSED {"command":"gate-check","code":"SETTINGS_SEATABLE_ENV_INVALID"}\n']);
  });

  it("status, latest-passed and switch-plan print one line each; switch-plan's refusal names what passed (exit 4)", async () => {
    const status = output();
    expect(await runSettingsCli(["status"], status.io, depsOf(fakeClient([
      ["core.read_current_release()", rows({ release_key: KEY })],
      ["read_active_settings_version()", rows({ pointer: null })],
      ["read_passed_settings_versions", rows({ v: "17" })]
    ]).client))).toBe(0);
    expect(status.out).toEqual([`DEBATEAI_SETTINGS_STATUS {"currentRelease":"${KEY}","pointer":null,"effectiveActive":"17","passed":["17"]}\n`]);
    const latest = output();
    expect(await runSettingsCli(["latest-passed", NEXT], latest.io, depsOf(fakeClient([["register.settings_verdict", rows()]]).client))).toBe(0);
    expect(latest.out).toEqual([`DEBATEAI_SETTINGS_LATEST_PASSED {"releaseKey":"${NEXT}","version":"18","siteVersion":"18"}\n`]);
    const plan = output();
    expect(await runSettingsCli(["switch-plan", NEXT], plan.io, depsOf(switchDatabase(null, ["18"]).client))).toBe(0);
    expect(plan.out).toEqual([`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${NEXT}","expectedActiveSettings":null,"activate":"18"}\n`]);
    const rollback = output();
    expect(await runSettingsCli(["switch-plan", KEY, "--latest-passed"], rollback.io, depsOf(fakeClient([
      ["register.settings_verdict", rows()],
      ["read_active_settings_version()", rows({ pointer: "18" })],
      ["read_passed_settings_versions", rows({ v: "17" })]
    ]).client))).toBe(0);
    expect(rollback.out).toEqual([`DEBATEAI_SETTINGS_SWITCH_PLAN {"releaseKey":"${KEY}","expectedActiveSettings":"18","activate":"17"}\n`]);
    const refused = output();
    expect(await runSettingsCli(["switch-plan", NEXT], refused.io, depsOf(switchDatabase("17", ["18"]).client))).toBe(4);
    expect(refused.err).toEqual(['DEBATEAI_SETTINGS_REFUSED {"command":"switch-plan","code":"SETTINGS_VERSION_NOT_PASSED","passed":["18"]}\n']);
    for (const args of [["switch-plan", "legacy"], ["switch-plan", NEXT, "--activate"], ["switch-plan", NEXT, "--latest-passed", "x"], ["status", "x"], ["nonsense"], []]) {
      const u = output();
      expect(await runSettingsCli(args, u.io, depsOf(fakeClient([]).client)), args.join(" ")).toBe(2);
    }
    // An untyped failure (the database could not be asked) is exit 2 with a content-free code.
    const down = output();
    expect(await runSettingsCli(["status"], down.io, { ...depsOf(fakeClient([]).client), connect: async () => { throw new Error("connect ECONNREFUSED /run/x"); } })).toBe(2);
    expect(down.err).toEqual(['DEBATEAI_SETTINGS_REFUSED {"command":"status","code":"SETTINGS_OPERATOR_UNAVAILABLE"}\n']);
    expect(SETTINGS_CHECKER).toBe("check-version-v1");
  });
});

import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import {
  AUTH_POLICY_REGISTER_ROWS,
  MFA_POLICY_REGISTER_ROW,
  PRODUCT_ROLE_POLICY_REGISTER_ROW,
  RECOVERY_POLICY_REGISTER_ROW,
  SESSION_POLICY_REGISTER_ROW,
  parseApiEnvironment
} from "../../packages/register/src/index.js";
import {
  canonicalDecimal,
  canonicalRegisterJson,
  computeGeneralPublicationRequestSha256,
  computeRegisterSnapshotSha256,
  computeSupportPublicationRequestSha256,
  createPostgresRegisterPublicationPort,
  parseCanonicalRegisterJson,
  parseRegisterVersionText,
  registerVersionToSafeLegacyNumber,
  SUPPORT_CONFIGURATION_KEYS,
  type CanonicalJsonAst,
  type CanonicalRegisterJson,
  type RegisterPublicationRow
} from "../../packages/register/src/register-publication.js";

const text = (value: string): CanonicalRegisterJson => parseCanonicalRegisterJson(Buffer.from(value));

const INITIAL_SUPPORT_VALUE_TEXT = Object.freeze<Record<string, string>>({
  support_enabled: "false",
  support_model_ref: '"development:claude-cli"',
  support_relay_concurrency: "2",
  support_daily_call_cap: "500",
  support_limit_anon_msgs_10m: "20",
  support_limit_anon_msgs_24h: "100",
  support_limit_anon_sessions_1h: "5",
  support_limit_session_msgs: "40",
  support_limit_msg_chars: "2000",
  support_limit_account_msgs_10m: "60",
  support_limit_account_msgs_24h: "300",
  support_queue_depth: "10",
  support_lock_after_injections: "3",
  support_ip_cooldown_minutes: "60",
  support_retention_policy: '"keep"',
  support_retention_ratified_by: "null"
});

function completeSupportInitializationPatch() {
  return SUPPORT_CONFIGURATION_KEYS.map((key) => ({
    key,
    valueJsonText: text(INITIAL_SUPPORT_VALUE_TEXT[key]!)
  }));
}

function independentlyComputeInitialSupportRequestSha256(input: Readonly<{
  publicationId: string;
  baseRegisterVersion: string;
  patch: ReturnType<typeof completeSupportInitializationPatch>;
  sourceRef: string;
}>): string {
  const hash = createHash("sha256");
  for (const value of [
    input.publicationId,
    "SUPPORT_CONFIGURATION",
    input.baseRegisterVersion,
    "",
    "1",
    JSON.stringify(input.patch.map((row) => ({
      key: row.key,
      value_json_text: row.valueJsonText
    }))),
    input.sourceRef
  ]) {
    const bytes = Buffer.from(value, "utf8");
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.byteLength));
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asAst(value: unknown): CanonicalJsonAst {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return canonicalDecimal(String(value));
  if (Array.isArray(value)) return value.map(asAst);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, member]) => [key, asAst(member)]));
  }
  throw new TypeError("fixture is not JSON");
}

describe("lossless canonical register JSON", () => {
  const vectors = [
    [
      `{ "b": 2, "a": 1 }`,
      `{"a":1,"b":2}`,
      "7b2261223a312c2262223a327d",
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777"
    ],
    [
      `{"română":"țară\\n\\\"\\\\","slash":"\\/"}`,
      `{"română":"țară\\u000a\\\"\\\\","slash":"/"}`,
      "7b22726f6dc3a26ec483223a22c89b6172c4835c75303030615c225c5c222c22736c617368223a222f227d",
      "9ca9df0333179c9622fe9125d67e453a7f66595fd5b6be6bd3d7eb80a0ce3b4b"
    ],
    [
      `{"😀":1,"":2}`,
      `{"":2,"😀":1}`,
      "7b22ee8080223a322c22f09f9880223a317d",
      "cddbdeacace14eb6923e88dfafb2a3e7df21ec908682f50a886b7b9567692d02"
    ],
    ["9007199254740991", "9007199254740991", "39303037313939323534373430393931", "f40b423c2dd95ff2b2f027e22208f438cf7242862e5e746860e697308c9add26"],
    ["-9007199254740991", "-9007199254740991", "2d39303037313939323534373430393931", "4c933a456bb8f2e9894b2d0b26480439cd72d52fb8a27cbf8fd7f323f22c7815"],
    ["0.000002", "0.000002", "302e303030303032", "42d91fe275fb108b247e0ebcd0577b6a00208780d9604950c172d65887e29ee9"],
    ["5395.831171", "5395.831171", "353339352e383331313731", "242bd69664ce4d46bc186c59d92292d4af3ae27a720f493d9a2f091eec99f132"],
    ["99999999999999.5", "99999999999999.5", "39393939393939393939393939392e35", "555e5e518463b3cc1085e4ed6d3b8c16ef0b0753220694cad6e4686997a71bcb"],
    ["-99999999999999.5", "-99999999999999.5", "2d39393939393939393939393939392e35", "7ed201b96befd4a2162d2a01322b4c16a688f3c1a7a9645f92621eb03b91411c"]
  ] as const;

  it.each(vectors)("canonicalizes %s without losing its token", (raw, canonical, hex, sha256) => {
    const actual = parseCanonicalRegisterJson(Buffer.from(raw, "utf8"));
    expect(actual).toBe(canonical);
    expect(Buffer.from(actual, "utf8").toString("hex")).toBe(hex);
    expect(digest(actual)).toBe(sha256);
  });

  it.each([
    ["9007199254740990.5", "2462fcb9f39718394526e373022a4826fb08b65eec82ac06ce397677381f5fc7"],
    ["-9007199254740990.5", "a45050cfd831e27eada339d9f356ead1cd54c0493ec8013c2eb51d40eea9fe5e"],
    ["1e3", "0b11ca015456e85e4a21de2d495f6bde1f3a7d8624c6d1ab181c4221bc1935eb"]
  ])("rejects the rounded/exponent source %s before conversion", (raw, rawSha256) => {
    expect(digest(raw)).toBe(rawSha256);
    expect(() => parseCanonicalRegisterJson(Buffer.from(raw))).toThrow(/CANONICAL_REGISTER_JSON_INVALID/u);
  });

  it.each([
    "1e-7", "+1", "01", "-01", ".1", "1.", "9007199254740992", "-9007199254740992",
    "0.0000001", "1.1234567", "123456789012345.1", "0.10000000000000002",
    "NaN", "Infinity", "undefined", "[1,]", "{\"a\":1,\"a\":2}", "\"\\u0000\"",
    "\"\\ud800\"", "\"\\udc00\""
  ])("rejects invalid lexical/domain input %s", (raw) => {
    expect(() => parseCanonicalRegisterJson(Buffer.from(raw))).toThrow(/CANONICAL_REGISTER_JSON_INVALID/u);
  });

  it("normalizes fixed decimals without accepting an already-rounded JavaScript number", () => {
    expect(canonicalDecimal("001.2300").text).toBe("1.23");
    expect(canonicalDecimal("-0.000000").text).toBe("0");
    expect(() => canonicalDecimal("9007199254740990.5")).toThrow(/CANONICAL_DECIMAL_INVALID/u);
    expect(() => canonicalRegisterJson(1 as unknown as CanonicalJsonAst)).toThrow(/CANONICAL_REGISTER_JSON_AST_INVALID/u);
  });

  it("rejects unsafe JavaScript AST shapes and emits UTF-8 ordered canonical objects", () => {
    const sparse: CanonicalJsonAst[] = [];
    sparse.length = 1;
    const cyclic: Record<string, CanonicalJsonAst> = {};
    cyclic.self = cyclic;
    const accessor = Object.defineProperty({}, "x", { enumerable: true, get: () => true });
    const withToJson = { toJSON: () => "bad" };
    const nonPlain = Object.create({ inherited: true }) as Record<string, CanonicalJsonAst>;
    nonPlain.x = true;
    for (const value of [sparse, cyclic, accessor, withToJson, nonPlain]) {
      expect(() => canonicalRegisterJson(value as CanonicalJsonAst)).toThrow(/CANONICAL_REGISTER_JSON_AST_INVALID/u);
    }
    for (const value of [undefined, () => undefined, Symbol("x"), 1n, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => canonicalRegisterJson(value as unknown as CanonicalJsonAst)).toThrow(/CANONICAL_REGISTER_JSON_AST_INVALID/u);
    }
    expect(canonicalRegisterJson({ "😀": canonicalDecimal("1"), "": canonicalDecimal("2") }))
      .toBe(`{"":2,"😀":1}`);
  });

  it("rework B1 rejects an accessor-backed decimal node without reading its getters", () => {
    let decimalGetterReads = 0;
    const accessorDecimal = Object.defineProperties({}, {
      kind: {
        enumerable: true,
        get: () => {
          decimalGetterReads += 1;
          return "DECIMAL";
        }
      },
      text: {
        enumerable: true,
        get: () => {
          decimalGetterReads += 1;
          return "1";
        }
      }
    });

    expect(() => canonicalRegisterJson(accessorDecimal as CanonicalJsonAst))
      .toThrow(/CANONICAL_REGISTER_JSON_AST_INVALID/u);
    expect(decimalGetterReads).toBe(0);
  });

  it("rework B1 rejects an accessor-backed array element without reading its getter", () => {
    let arrayGetterReads = 0;
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      get: () => {
        arrayGetterReads += 1;
        return true;
      }
    });
    accessorArray.length = 1;

    expect(() => canonicalRegisterJson(accessorArray as CanonicalJsonAst))
      .toThrow(/CANONICAL_REGISTER_JSON_AST_INVALID/u);
    expect(arrayGetterReads).toBe(0);
  });

  it("rework B1 preserves ordinary and frozen decimal and array neighbors", () => {
    expect(canonicalRegisterJson({ kind: "DECIMAL", text: "1" } as CanonicalJsonAst)).toBe("1");
    expect(canonicalRegisterJson(Object.freeze({ kind: "DECIMAL", text: "1" }) as CanonicalJsonAst)).toBe("1");
    expect(canonicalRegisterJson([true])).toBe("[true]");
    expect(canonicalRegisterJson(Object.freeze([true]))).toBe("[true]");
  });

  it("rework B1 rejects non-enumerable, non-plain, symbol-keyed, and unexpected-key nodes", () => {
    const nonEnumerableDecimal = Object.defineProperties({}, {
      kind: { value: "DECIMAL" },
      text: { value: "1" }
    });
    const nonPlainDecimal = Object.assign(Object.create({ inherited: true }), {
      kind: "DECIMAL",
      text: "1"
    });
    const symbolKeyedObject = Object.assign({ x: true }, { [Symbol("hidden")]: false });
    const unexpectedKeyArray = Object.assign([true], { extra: false });

    for (const value of [nonEnumerableDecimal, nonPlainDecimal, symbolKeyedObject, unexpectedKeyArray]) {
      expect(() => canonicalRegisterJson(value as CanonicalJsonAst))
        .toThrow(/CANONICAL_REGISTER_JSON_AST_INVALID/u);
    }
  });

  it("walks the exact nine policy groups and 248 numeric leaves through publication text", () => {
    const groups = [
      ...AUTH_POLICY_REGISTER_ROWS,
      MFA_POLICY_REGISTER_ROW,
      SESSION_POLICY_REGISTER_ROW,
      RECOVERY_POLICY_REGISTER_ROW,
      PRODUCT_ROLE_POLICY_REGISTER_ROW
    ];
    const numeric: number[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === "number") numeric.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
    };
    groups.forEach((group) => walk(group.value));
    const publicationRows = groups.map((group) => ({
      rowKey: group.rowKey,
      valueJsonText: canonicalRegisterJson(asAst(group.value)),
      sourceRef: "fixture:policy-census"
    } satisfies RegisterPublicationRow));
    expect(groups).toHaveLength(9);
    expect(numeric).toHaveLength(248);
    expect(new Set(numeric.map(String))).toHaveLength(108);
    expect(Math.max(...numeric)).toBe(9_007_199_254_740_991);
    expect(Math.max(...numeric.filter((value) => !Number.isInteger(value)).map((value) => String(value).split(".")[1]?.length ?? 0))).toBe(6);
    expect(Math.max(...numeric.filter((value) => !Number.isInteger(value)).map((value) => String(value).replace(".", "").replace(/^0+/u, "").length))).toBe(10);
    expect(publicationRows.every((row) => typeof row.valueJsonText === "string")).toBe(true);
    expect(publicationRows.every((row) => (
      parseCanonicalRegisterJson(Buffer.from(row.valueJsonText)) === row.valueJsonText
    ))).toBe(true);
  });
});

describe("bigint-safe versions and separate publication hash domains", () => {
  it.each(["1", "9007199254740991", "9007199254740992", "9223372036854775807"])("preserves %s as text", (value) => {
    expect(parseRegisterVersionText(value)).toBe(value);
  });

  it.each([0, 1, 1n, "", "0", "00", "01", "+1", "-1", "1.0", "1e3", " 1"])("rejects noncanonical version %s", (value) => {
    expect(() => parseRegisterVersionText(value)).toThrow(/REGISTER_VERSION_TEXT_INVALID/u);
  });

  it("allows the single checked legacy boundary and rejects unsafe text", () => {
    expect(registerVersionToSafeLegacyNumber(parseRegisterVersionText("9007199254740991"))).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => registerVersionToSafeLegacyNumber(parseRegisterVersionText("9007199254740992")))
      .toThrow(/REGISTER_VERSION_UNSAFE_LEGACY_NUMBER/u);
  });

  it("validates external REGISTER_VERSION as decimal text before the existing API legacy boundary", () => {
    const environment = {
      KEK_PATH: "/run/secrets/kek",
      BLIND_INDEX_KEY_PATH: "/run/secrets/blind",
      AUDIT_KEY_STORE_PATH: "/run/secrets/audit",
      AUDIT_SOURCE_IP_SALT_PATH: "/run/secrets/audit-ip",
      USER_DEK_STORE_PATH: "/run/secrets/dek",
      CONTENT_PROVISION_DATABASE_URL: "postgresql://content:test@127.0.0.1:5432/debateai",
      ERASURE_DATABASE_URL: "postgresql://erasure:test@127.0.0.1:5432/debateai",
      ACCOUNT_ERASURE_GRACE_MS: "604800000",
      MAIL_SENDMAIL_PATH: "/usr/sbin/sendmail",
      MAIL_FROM: "noreply@debateai.test",
      PUBLIC_APP_URL: "https://debateai.test",
      DATABASE_URL: "postgresql://runtime:test@127.0.0.1:5432/debateai",
      AUTHORIZATION_DATABASE_URL: "postgresql://authorization:test@127.0.0.1:5432/debateai",
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      STRANGER_SAMPLE_RATE: "0.1",
      REGISTER_VERSION: "9007199254740991",
      BATTERY_VERSION: "test",
      SETTLEMENT_WATCH_HANDLE: "test",
      HATCHET_CLIENT_TOKEN: "test",
      HATCHET_HOST_PORT: "127.0.0.1:7077",
      HATCHET_API_URL: "http://127.0.0.1:8080",
      HATCHET_TENANT_ID: "test",
      HATCHET_WORKFLOW_NAME: "test",
      HATCHET_TLS_STRATEGY: "none"
    } as const;
    expect(parseApiEnvironment(environment).REGISTER_VERSION).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => parseApiEnvironment({ ...environment, REGISTER_VERSION: "9007199254740992" }))
      .toThrow(/REGISTER_VERSION_UNSAFE_LEGACY_NUMBER/u);
    expect(() => parseApiEnvironment({ ...environment, REGISTER_VERSION: "1e3" })).toThrow();
  });

  it("uses length-prefixed complete rows and distinct request/snapshot domains", () => {
    const rows = [
      { rowKey: "z", valueJsonText: text("true"), sourceRef: "src:z" },
      { rowKey: "a", valueJsonText: text("9007199254740991"), sourceRef: "src:a" }
    ];
    const publicationId = "00000000-0000-4000-8000-000000000001";
    const base = parseRegisterVersionText("9007199254740993");
    expect(computeRegisterSnapshotSha256(rows)).toBe("620e839882bdee2bc4428c4ffb4678e0bd9e4e8ac09b8695a383e2dac641d941");
    expect(computeGeneralPublicationRequestSha256({ publicationId, baseRegisterVersion: base, rows, sourceRef: "src:publication" }))
      .toBe("989566a4cf9f4d08f53fd552c5a421361d90dfea9536d13f4a2a205d1a4905a7");
    expect(computeSupportPublicationRequestSha256({
      publicationId,
      baseRegisterVersion: base,
      expectedSupportRegisterVersion: parseRegisterVersionText("9007199254740992"),
      schemaVersion: 1,
      patch: [{ key: "support_enabled", valueJsonText: text("false") }],
      sourceRef: "src:support"
    })).toBe("c3b946318d275991456d17c35b2292b42656339b47cfa037394a4ca968adeab4");
    const three = new Set([
      computeRegisterSnapshotSha256(rows),
      computeGeneralPublicationRequestSha256({ publicationId, baseRegisterVersion: base, rows, sourceRef: "src:publication" }),
      computeSupportPublicationRequestSha256({
        publicationId, baseRegisterVersion: base,
        expectedSupportRegisterVersion: parseRegisterVersionText("9007199254740992"),
        schemaVersion: 1, patch: [{ key: "support_enabled", valueJsonText: text("false") }],
        sourceRef: "src:support"
      })
    ]);
    expect(three.size).toBe(3);
  });

  it("accepts byte-exact legacy and 1024-character source refs but rejects 1025", () => {
    const legacy = "l".repeat(755);
    const maximum = "m".repeat(1024);
    const tooLong = "x".repeat(1025);
    for (const sourceRef of [legacy, maximum]) {
      const rows = [{ rowKey: "riskTier", valueJsonText: text(`"standard"`), sourceRef }];
      expect(computeRegisterSnapshotSha256(rows)).toMatch(/^[0-9a-f]{64}$/u);
      expect(computeGeneralPublicationRequestSha256({
        publicationId: "00000000-0000-4000-8000-000000000001",
        baseRegisterVersion: parseRegisterVersionText("4"),
        rows,
        sourceRef
      })).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(() => computeRegisterSnapshotSha256([
      { rowKey: "riskTier", valueJsonText: text(`"standard"`), sourceRef: tooLong }
    ])).toThrow("REGISTER_PUBLICATION_INPUT_INVALID");
    expect(() => computeGeneralPublicationRequestSha256({
      publicationId: "00000000-0000-4000-8000-000000000001",
      baseRegisterVersion: parseRegisterVersionText("4"),
      rows: [{ rowKey: "riskTier", valueJsonText: text(`"standard"`), sourceRef: "src:row" }],
      sourceRef: tooLong
    })).toThrow("REGISTER_PUBLICATION_INPUT_INVALID");
  });
});

type DbRow = Record<string, unknown>;
type DbResponse = DbRow | readonly DbRow[] | Error;

const MALFORMED_RESULT_KINDS = ["zero-row", "multi-row", "missing-column", "extra-column", "wrong-type"] as const;

function malformedResultRows(
  kind: typeof MALFORMED_RESULT_KINDS[number],
  valid: DbRow,
  options: Readonly<{ missing: string; wrongType: string; conflict: string }>
): readonly DbRow[] {
  if (kind === "zero-row") return [];
  if (kind === "multi-row") return [valid, { ...valid, [options.conflict]: "conflicting-second-row" }];
  if (kind === "missing-column") {
    return [Object.fromEntries(Object.entries(valid).filter(([key]) => key !== options.missing))];
  }
  if (kind === "extra-column") return [{ ...valid, unexpected_secret: "must-reject" }];
  return [{ ...valid, [options.wrongType]: { invalid: "type" } }];
}

function fakePool(responses: readonly DbResponse[]) {
  const events: Array<Readonly<{ sql: string; values?: readonly unknown[] }>> = [];
  const counts = { connects: 0 };
  let responseIndex = 0;
  const query = async (sql: string, values?: readonly unknown[]) => {
    events.push(values === undefined ? { sql } : { sql, values });
    if (/^(BEGIN|COMMIT|ROLLBACK)/u.test(sql)) return { rows: [], rowCount: 0 } as unknown as QueryResult;
    const response = responses[responseIndex++];
    if (response instanceof Error) throw response;
    const returnedRows = response === undefined ? [] : Array.isArray(response) ? response : [response];
    return { rows: returnedRows, rowCount: returnedRows.length } as unknown as QueryResult;
  };
  const client = {
    query,
    release: () => events.push({ sql: "RELEASE" })
  } as unknown as PoolClient;
  const pool = {
    connect: async () => {
      counts.connects += 1;
      return client;
    },
    query
  } as unknown as Pool;
  return { pool, events, counts };
}

describe("closed PostgreSQL publication port", () => {
  const rows = [{ rowKey: "riskTier", valueJsonText: text(`"standard"`), sourceRef: "src:row" }];
  const id = "00000000-0000-4000-8000-000000000001";
  const base = parseRegisterVersionText("4");

  it("imports history in READ COMMITTED and returns exactly the four historical fields", async () => {
    const snapshotSha256 = computeRegisterSnapshotSha256(rows);
    const fixture = fakePool([{
      register_version: "4", row_count: 1, snapshot_sha256: snapshotSha256, outcome: "CREATED"
    }]);
    const receipt = await createPostgresRegisterPublicationPort(fixture.pool).importHistorical({ registerVersion: base, rows });
    expect(Object.keys(receipt).sort()).toEqual(["outcome", "registerVersion", "rowCount", "snapshotSha256"].sort());
    expect(receipt).toEqual({ registerVersion: "4", rowCount: 1, snapshotSha256, outcome: "CREATED" });
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.import_historical_register_version"), "COMMIT", "RELEASE"
    ]);
    expect(fixture.events[1]?.values).toEqual([
      "4", JSON.stringify([{ row_key: "riskTier", value_json_text: `"standard"`, source_ref: "src:row" }]), snapshotSha256
    ]);
  });

  it("passes 755- and 1024-character row provenance through the historical port unchanged", async () => {
    for (const sourceRef of ["l".repeat(755), "m".repeat(1024)]) {
      const boundedRows = [{ rowKey: "riskTier", valueJsonText: text(`"standard"`), sourceRef }];
      const snapshotSha256 = computeRegisterSnapshotSha256(boundedRows);
      const fixture = fakePool([{
        register_version: "4", row_count: 1, snapshot_sha256: snapshotSha256, outcome: "CREATED"
      }]);
      await expect(createPostgresRegisterPublicationPort(fixture.pool).importHistorical({
        registerVersion: base,
        rows: boundedRows
      })).resolves.toMatchObject({ snapshotSha256 });
      expect(fixture.events[1]?.values?.[1]).toContain(sourceRef);
    }
  });

  it("publishes a complete GENERAL input through one function, verifies receipt, commits, then resolves", async () => {
    const input = { publicationId: id, baseRegisterVersion: base, rows, sourceRef: "src:general" };
    const requestSha256 = computeGeneralPublicationRequestSha256(input);
    const snapshotSha256 = computeRegisterSnapshotSha256(rows);
    const fixture = fakePool([{
      register_version: "9007199254740993", base_register_version: "4", publication_id: id,
      publication_kind: "GENERAL", request_sha256: requestSha256, snapshot_sha256: snapshotSha256,
      row_count: 1, recorded_at: new Date("2026-09-04T00:00:00.000Z")
    }]);
    const receipt = await createPostgresRegisterPublicationPort(fixture.pool).publishGeneral(input);
    expect(receipt.registerVersion).toBe("9007199254740993");
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.publish_register_version"), "COMMIT", "RELEASE"
    ]);
    expect(fixture.events.some((event) => /FROM register\.register_row/u.test(event.sql))).toBe(false);
    expect(fixture.events[1]?.values).toEqual([
      id, requestSha256, "4",
      JSON.stringify([{ row_key: "riskTier", value_json_text: `"standard"`, source_ref: "src:row" }]),
      "src:general"
    ]);
  });

  it("publishes a later one-key SUPPORT patch with verified separate hashes", async () => {
    const input = {
      publicationId: id, baseRegisterVersion: base, expectedSupportRegisterVersion: base,
      schemaVersion: 1 as const,
      patch: [{ key: "support_enabled" as const, valueJsonText: text("false") }],
      sourceRef: "src:support"
    };
    const requestSha256 = computeSupportPublicationRequestSha256(input);
    const fixture = fakePool([{
      register_version: "5", base_register_version: "4", publication_id: id,
      publication_kind: "SUPPORT_CONFIGURATION", request_sha256: requestSha256,
      snapshot_sha256: "a".repeat(64), row_count: 18,
      recorded_at: new Date("2026-09-04T00:00:00.000Z"), previous_support_register_version: "4",
      support_snapshot_sha256: "b".repeat(64), changed_keys: ["support_enabled"]
    }]);
    const receipt = await createPostgresRegisterPublicationPort(fixture.pool).publishSupport(input);
    expect(receipt).toMatchObject({
      registerVersion: "5", previousSupportRegisterVersion: "4",
      requestSha256, supportSnapshotSha256: "b".repeat(64), changedKeys: ["support_enabled"]
    });
    expect(receipt.requestSha256).not.toBe(receipt.snapshotSha256);
    expect(receipt.snapshotSha256).not.toBe(receipt.supportSnapshotSha256);
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.publish_support_configuration"), "COMMIT", "RELEASE"
    ]);
  });

  it("publishes the exact complete schema-1 initializer through the public port", async () => {
    const input = {
      publicationId: id,
      baseRegisterVersion: base,
      expectedSupportRegisterVersion: null,
      schemaVersion: 1 as const,
      patch: completeSupportInitializationPatch(),
      sourceRef: "deployment:production-initial-off"
    };
    const requestSha256 = independentlyComputeInitialSupportRequestSha256(input);
    const fixture = fakePool([{
      register_version: "5", base_register_version: "4", publication_id: id,
      publication_kind: "SUPPORT_CONFIGURATION", request_sha256: requestSha256,
      snapshot_sha256: "a".repeat(64), row_count: 49,
      recorded_at: new Date("2026-09-04T00:00:00.000Z"), previous_support_register_version: null,
      support_snapshot_sha256: "b".repeat(64), changed_keys: [...SUPPORT_CONFIGURATION_KEYS].sort()
    }]);

    const outcome = await createPostgresRegisterPublicationPort(fixture.pool).publishSupport(input)
      .then((receipt) => ({ kind: "COMMITTED", changedKeys: receipt.changedKeys.length }))
      .catch((error: unknown) => ({
        kind: error instanceof Error ? error.message : String(error),
        changedKeys: 0
      }));

    expect({ outcome, connects: fixture.counts.connects }).toEqual({
      outcome: { kind: "COMMITTED", changedKeys: 16 },
      connects: 1
    });
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      expect.stringContaining("register.publish_support_configuration"),
      "COMMIT",
      "RELEASE"
    ]);
  });

  it("rejects incomplete, unknown, duplicate, later-combined, and malformed initial patches before checkout", async () => {
    const complete = completeSupportInitializationPatch();
    const cases = [
      {
        label: "15-key initializer",
        input: { patch: complete.filter(({ key }) => key !== "support_enabled") }
      },
      { label: "17th unknown key", input: { patch: [...complete, { key: "support_unknown", valueJsonText: text("false") }] } },
      { label: "duplicate key", input: { patch: [...complete, complete[0]!] } },
      {
        label: "later combined retention",
        input: { expectedSupportRegisterVersion: base, patch: complete }
      },
      { label: "malformed initial value", input: {
        patch: complete.map((row) => row.key === "support_relay_concurrency"
          ? { ...row, valueJsonText: text("0") }
          : row)
      } }
    ];

    for (const { label, input: change } of cases) {
      const fixture = fakePool([]);
      await expect(createPostgresRegisterPublicationPort(fixture.pool).publishSupport({
        publicationId: id,
        baseRegisterVersion: base,
        expectedSupportRegisterVersion: "expectedSupportRegisterVersion" in change
          ? change.expectedSupportRegisterVersion
          : null,
        schemaVersion: 1,
        patch: change.patch,
        sourceRef: "deployment:invalid-initializer",
      } as never), label).rejects.toThrow(/SUPPORT_CONFIG_PATCH_INVALID/u);
      expect(fixture.counts.connects, label).toBe(0);
      expect(fixture.events, label).toEqual([]);
    }
  });

  it.each([
    [{ rowKey: "supportActivation", valueJsonText: text("null"), sourceRef: "src" }],
    [{ rowKey: "a", valueJsonText: text("true"), sourceRef: "src" }, { rowKey: "a", valueJsonText: text("false"), sourceRef: "src" }],
    []
  ].map((rows) => [rows] as const))("rejects marker/duplicate/empty generic snapshots before checkout", async (badRows) => {
    const fixture = fakePool([]);
    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishGeneral({
      publicationId: id, baseRegisterVersion: base, rows: badRows, sourceRef: "src"
    })).rejects.toThrow(/REGISTER_PUBLICATION_INPUT_INVALID/u);
    expect(fixture.events).toEqual([]);
  });

  it.each(["supportActivation", "support_unknown"])("rejects unknown marker-capable patch key %s before checkout", async (key) => {
    const fixture = fakePool([]);
    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishSupport({
      publicationId: id, baseRegisterVersion: base, expectedSupportRegisterVersion: null,
      schemaVersion: 1, patch: [{ key, valueJsonText: text("false") }], sourceRef: "src"
    } as never)).rejects.toThrow(/SUPPORT_CONFIG_PATCH_INVALID/u);
    expect(fixture.events).toEqual([]);
  });

  it("rolls back every pre-commit failure and rejects a malformed receipt", async () => {
    const input = { publicationId: id, baseRegisterVersion: base, rows, sourceRef: "src:general" };
    const requestSha256 = computeGeneralPublicationRequestSha256(input);
    const fixture = fakePool([{
      register_version: "5", base_register_version: "4", publication_id: id,
      publication_kind: "GENERAL", request_sha256: requestSha256,
      snapshot_sha256: "0".repeat(64), row_count: 99,
      recorded_at: new Date("2026-09-04T00:00:00.000Z")
    }]);
    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishGeneral(input))
      .rejects.toThrow(/REGISTER_PUBLICATION_RECEIPT_INVALID/u);
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.publish_register_version"), "ROLLBACK", "RELEASE"
    ]);
  });

  it.each(MALFORMED_RESULT_KINDS)("rework B4 rejects %s historical-import results before commit", async (kind) => {
    const snapshotSha256 = computeRegisterSnapshotSha256(rows);
    const valid = {
      register_version: "4", row_count: 1, snapshot_sha256: snapshotSha256, outcome: "CREATED"
    };
    const fixture = fakePool([malformedResultRows(kind, valid, {
      missing: "snapshot_sha256", wrongType: "row_count", conflict: "outcome"
    })]);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).importHistorical({ registerVersion: base, rows }))
      .rejects.toThrow(/REGISTER_PUBLICATION_RECEIPT_INVALID/u);
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.import_historical_register_version"),
      "ROLLBACK", "RELEASE"
    ]);
  });

  it.each(MALFORMED_RESULT_KINDS)("rework B4 rejects %s GENERAL results before commit", async (kind) => {
    const input = { publicationId: id, baseRegisterVersion: base, rows, sourceRef: "src:general" };
    const valid = {
      register_version: "5", base_register_version: "4", publication_id: id,
      publication_kind: "GENERAL", request_sha256: computeGeneralPublicationRequestSha256(input),
      snapshot_sha256: computeRegisterSnapshotSha256(rows), row_count: 1,
      recorded_at: new Date("2026-09-04T00:00:00.000Z")
    };
    const fixture = fakePool([malformedResultRows(kind, valid, {
      missing: "recorded_at", wrongType: "row_count", conflict: "register_version"
    })]);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishGeneral(input))
      .rejects.toThrow(/REGISTER_PUBLICATION_RECEIPT_INVALID/u);
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.publish_register_version"),
      "ROLLBACK", "RELEASE"
    ]);
  });

  it.each(MALFORMED_RESULT_KINDS)("rework B4 rejects %s SUPPORT results before commit", async (kind) => {
    const input = {
      publicationId: id, baseRegisterVersion: base, expectedSupportRegisterVersion: null,
      schemaVersion: 1 as const,
      patch: completeSupportInitializationPatch(),
      sourceRef: "src:support"
    };
    const valid = {
      register_version: "5", base_register_version: "4", publication_id: id,
      publication_kind: "SUPPORT_CONFIGURATION", request_sha256: computeSupportPublicationRequestSha256(input),
      snapshot_sha256: "a".repeat(64), row_count: 18,
      recorded_at: new Date("2026-09-04T00:00:00.000Z"), previous_support_register_version: null,
      support_snapshot_sha256: "b".repeat(64), changed_keys: [...SUPPORT_CONFIGURATION_KEYS].sort()
    };
    const fixture = fakePool([malformedResultRows(kind, valid, {
      missing: "support_snapshot_sha256", wrongType: "row_count", conflict: "register_version"
    })]);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).publishSupport(input))
      .rejects.toThrow(/REGISTER_PUBLICATION_RECEIPT_INVALID/u);
    expect(fixture.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.publish_support_configuration"),
      "ROLLBACK", "RELEASE"
    ]);
  });

  it.each(MALFORMED_RESULT_KINDS)("rework B4 rejects %s status results and releases once", async (kind) => {
    const valid = {
      support_register_version: "5", schema_version: 1, base_register_version: "4", publication_id: id,
      request_sha256: "a".repeat(64), snapshot_sha256: "b".repeat(64),
      support_snapshot_sha256: "c".repeat(64), changed_keys: ["support_enabled"],
      source_ref: "src:support", recorded_at: new Date("2026-09-04T00:00:00.000Z"),
      configuration_text: "[]"
    };
    const fixture = fakePool([malformedResultRows(kind, valid, {
      missing: "configuration_text", wrongType: "schema_version", conflict: "support_register_version"
    })]);

    await expect(createPostgresRegisterPublicationPort(fixture.pool).readSupportStatus())
      .rejects.toThrow(/SUPPORT_CONFIG_SNAPSHOT_INVALID/u);
    expect(fixture.events.map((event) => event.sql)).toEqual([
      expect.stringContaining("register.read_support_configuration_status"), "RELEASE"
    ]);
  });

  it("does not roll back after an ambiguous COMMIT failure and always releases", async () => {
    const requestSha256 = computeGeneralPublicationRequestSha256({ publicationId: id, baseRegisterVersion: base, rows, sourceRef: "src:general" });
    const events: string[] = [];
    const client = {
      query: async (sql: string) => {
        events.push(sql);
        if (sql === "COMMIT") throw new Error("connection lost");
        if (sql.startsWith("SELECT")) return { rows: [{
          register_version: "5", base_register_version: "4", publication_id: id,
          publication_kind: "GENERAL", request_sha256: requestSha256,
          snapshot_sha256: computeRegisterSnapshotSha256(rows), row_count: 1,
          recorded_at: new Date("2026-09-04T00:00:00.000Z")
        }] };
        return { rows: [] };
      },
      release: () => events.push("RELEASE")
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as Pool;
    await expect(createPostgresRegisterPublicationPort(pool).publishGeneral({
      publicationId: id, baseRegisterVersion: base, rows, sourceRef: "src:general"
    })).rejects.toThrow("connection lost");
    expect(events).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.publish_register_version"), "COMMIT", "RELEASE"
    ]);
  });

  it("enforces the V retention reset as a separate one-key operation", async () => {
    const policy = {
      publicationId: id, baseRegisterVersion: base, expectedSupportRegisterVersion: base,
      schemaVersion: 1 as const,
      patch: [{ key: "support_retention_policy" as const, valueJsonText: text(`"shred-after-days:30"`) }],
      sourceRef: "src:policy"
    };
    const rejected = fakePool([new Error("SUPPORT_CONFIG_PATCH_INVALID: reset retention ratifier first")]);
    await expect(createPostgresRegisterPublicationPort(rejected.pool).publishSupport(policy))
      .rejects.toThrow(/reset retention ratifier first/u);
    expect(rejected.events.map((event) => event.sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED", expect.stringContaining("register.publish_support_configuration"), "ROLLBACK", "RELEASE"
    ]);

    const combined = fakePool([]);
    await expect(createPostgresRegisterPublicationPort(combined.pool).publishSupport({
      ...policy,
      patch: [
        { key: "support_retention_ratified_by", valueJsonText: text("null") },
        ...policy.patch
      ]
    })).rejects.toThrow(/SUPPORT_CONFIG_PATCH_INVALID/u);
    expect(combined.events).toEqual([]);
  });

  it("allows a later null reset and the following policy change as two public-port commits", async () => {
    const reset = {
      publicationId: id,
      baseRegisterVersion: base,
      expectedSupportRegisterVersion: base,
      schemaVersion: 1 as const,
      patch: [{
        key: "support_retention_ratified_by" as const,
        valueJsonText: text("null")
      }],
      sourceRef: "src:retention-reset"
    };
    const policyVersion = parseRegisterVersionText("5");
    const policy = {
      publicationId: "00000000-0000-4000-8000-000000000002",
      baseRegisterVersion: policyVersion,
      expectedSupportRegisterVersion: policyVersion,
      schemaVersion: 1 as const,
      patch: [{
        key: "support_retention_policy" as const,
        valueJsonText: text(`"shred-after-days:30"`)
      }],
      sourceRef: "src:retention-policy"
    };
    const fixture = fakePool([{
      register_version: "5", base_register_version: "4", publication_id: reset.publicationId,
      publication_kind: "SUPPORT_CONFIGURATION",
      request_sha256: computeSupportPublicationRequestSha256(reset),
      snapshot_sha256: "a".repeat(64), row_count: 49,
      recorded_at: new Date("2026-09-04T00:00:00.000Z"), previous_support_register_version: "4",
      support_snapshot_sha256: "b".repeat(64), changed_keys: ["support_retention_ratified_by"]
    }, {
      register_version: "6", base_register_version: "5", publication_id: policy.publicationId,
      publication_kind: "SUPPORT_CONFIGURATION",
      request_sha256: computeSupportPublicationRequestSha256(policy),
      snapshot_sha256: "c".repeat(64), row_count: 49,
      recorded_at: new Date("2026-09-04T00:00:01.000Z"), previous_support_register_version: "5",
      support_snapshot_sha256: "d".repeat(64), changed_keys: ["support_retention_policy"]
    }]);
    const port = createPostgresRegisterPublicationPort(fixture.pool);

    await expect(port.publishSupport(reset)).resolves.toMatchObject({
      registerVersion: "5",
      changedKeys: ["support_retention_ratified_by"]
    });
    await expect(port.publishSupport(policy)).resolves.toMatchObject({
      registerVersion: "6",
      changedKeys: ["support_retention_policy"]
    });
    expect(fixture.counts.connects).toBe(2);
    expect(fixture.events.filter(({ sql }) => sql === "COMMIT")).toHaveLength(2);
  });
});

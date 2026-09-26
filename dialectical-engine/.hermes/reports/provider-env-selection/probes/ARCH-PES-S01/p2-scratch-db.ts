// ARCH-PES-S01 probe p2 — executes what REQ-REV-p3 UNVERIFIED says no review executed (reviews/REQ-REV-p3.md:113-122):
// the embedded PostgreSQL of SPEC-v3 R1.12 started, migrated, seeded at register version 4 from the legacy fixture,
// the base rows read back by the command's own query, the hosted row built and published through the shipped
// publishGeneral with deployment "hosted", a republication from the new version, an identical replay, and stop().
// The lane's code runs (absolute imports). The only listener is the embedded server on the port the OS assigns.
// Prints the port, never the connection string.
import { connect } from "node:net";

const LANE = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine";
const { startTestDatabase } = await import(`${LANE}/tests/support/testDatabase.ts`);
const fixtures = await import(`${LANE}/tests/support/registerFixtures.ts`);
const db = await import(`${LANE}/packages/db/src/index.ts`);
const register = await import(`${LANE}/packages/register/src/index.ts`);

const out = (label: string, value: unknown) => console.log(`${label}\t${typeof value === "string" ? value : JSON.stringify(value)}`);
const NO_TOUCH = new Set([3000, 3001, 8790, 8791, 8792, 8793, 8795, 8796, 4310, 55432]);

const E = {
  providerRef: "vendor:a", adapterKind: "openai-compatible-http", maker: "Acme",
  vetting: { dataUseTermsReviewedOn: "2026-09-01", retentionTermsReviewedOn: "2026-09-01", namedInPrivacyNotice: true }
};
const SUFFIX = register.CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF as string;
const strip = (sourceRef: string) => sourceRef.endsWith(SUFFIX) ? sourceRef.slice(0, -SUFFIX.length) : sourceRef;

// the command's own query (SPEC-v3 R1.2 `rows`: "read by the command's own query")
async function readVersionRows(pool: any, version: string) {
  const result = await pool.query(
    "SELECT row_key,value_json::text AS value_json_text,source_ref FROM register.register_row WHERE register_version=$1 ORDER BY row_key",
    [version]
  );
  return result.rows.map((row: any) => ({
    rowKey: row.row_key,
    valueJsonText: register.parseCanonicalRegisterJson(Buffer.from(row.value_json_text, "utf8")),
    sourceRef: row.source_ref
  }));
}

async function publishFrom(port: any, pool: any, baseVersion: string, publicationId: string) {
  const baseRows = await readVersionRows(pool, baseVersion);
  const baseRow = baseRows.find((row: any) => row.rowKey === "configuredProviderSet");
  if (baseRow === undefined) throw new Error(`BASE_ROW_ABSENT:${baseVersion}`);
  const baseValue = JSON.parse(baseRow.valueJsonText);
  const built = register.buildConfiguredProviderSetDeploymentRow(
    { requiredDistinctMakers: baseValue.requiredDistinctMakers, providers: [E] }, strip(baseRow.sourceRef)
  );
  const rows = baseRows.map((row: any) => row.rowKey === "configuredProviderSet"
    ? { rowKey: built.rowKey, valueJsonText: register.parseCanonicalRegisterJson(Buffer.from(JSON.stringify(built.value), "utf8")), sourceRef: built.sourceRef }
    : row);
  const input = {
    publicationId,
    baseRegisterVersion: register.parseRegisterVersionText(baseVersion),
    rows,
    sourceRef: "provider-env-selection/S01#hosted-provider-set:published",
    deployment: "hosted" as const
  };
  return { input, snapshot: register.computeRegisterSnapshotSha256(rows), receipt: await port.publishGeneral(input) };
}

const database = await startTestDatabase();
const portNumber = Number(new URL(database.connectionString).port);
out("scratch.port", portNumber);
out("scratch.port.aboveFloor4400", portNumber > 4400);
out("scratch.port.notNoTouch", !NO_TOUCH.has(portNumber));
try {
  await db.migrate(database.pool);
  const seed = await fixtures.readLegacyDevelopmentV4Rows();
  const imported = await fixtures.importHistoricalRegisterFixture(database.pool, 4, seed);
  out("import.v4", { registerVersion: imported.registerVersion, rowCount: imported.rowCount, snapshotSha256: imported.snapshotSha256 });
  const v4 = await readVersionRows(database.pool, "4");
  out("readback.v4.count", v4.length);
  out("readback.v4.snapshotEqualsSeed", register.computeRegisterSnapshotSha256(v4) === register.computeRegisterSnapshotSha256(seed));
  out("readback.v4.byteEqualsSeed", JSON.stringify(v4) === JSON.stringify([...seed].sort((a: any, b: any) => a.rowKey < b.rowKey ? -1 : 1)));
  out("readback.999.count", (await readVersionRows(database.pool, "999")).length);

  const port = register.createPostgresRegisterPublicationPort(database.pool);
  const first = await publishFrom(port, database.pool, "4", "2a1ff6e9-7bfe-4bc8-b7d9-36e786ab80b4");
  out("publish.first.snapshot(computed before)", first.snapshot);
  out("publish.first.receipt", { registerVersion: first.receipt.registerVersion, rowCount: first.receipt.rowCount, snapshotSha256: first.receipt.snapshotSha256, baseRegisterVersion: first.receipt.baseRegisterVersion });
  const v5 = await readVersionRows(database.pool, first.receipt.registerVersion);
  out("new.count", v5.length);
  const carried = v5.filter((row: any) => row.rowKey !== "configuredProviderSet");
  const carriedBase = v4.filter((row: any) => row.rowKey !== "configuredProviderSet");
  out("new.carriedForwardByteEqual(31)", carried.length === 31 && JSON.stringify(carried) === JSON.stringify(carriedBase));
  const newRow = v5.find((row: any) => row.rowKey === "configuredProviderSet");
  out("new.configuredProviderSet.valueJsonText", newRow.valueJsonText);
  out("new.configuredProviderSet.sourceRef", newRow.sourceRef);

  // an identical re-run: same base, same rows, same publicationId, after the head has moved
  try {
    const replay = await port.publishGeneral(first.input);
    out("replay.identical", { registerVersion: replay.registerVersion, rowCount: replay.rowCount });
  } catch (error) {
    out("replay.identical", `THROW ${(error as Error).message} ${(error as any).code ?? ""}`);
  }
  // a stale base: base 4 again but a DIFFERENT publicationId (a second operator run with an old REGISTER_VERSION)
  try {
    const stale = await port.publishGeneral({ ...first.input, publicationId: "00000000-0000-4000-8000-0000000000aa" });
    out("stale.base4.newId", { registerVersion: stale.registerVersion });
  } catch (error) {
    out("stale.base4.newId", `THROW ${(error as Error).message} ${(error as any).code ?? ""}`);
  }
  // a republication from the new version: the suffix must appear exactly once
  const second = await publishFrom(port, database.pool, first.receipt.registerVersion, "00000000-0000-4000-8000-0000000000bb");
  const v6 = await readVersionRows(database.pool, second.receipt.registerVersion);
  const v6Row = v6.find((row: any) => row.rowKey === "configuredProviderSet");
  out("republish.receipt.registerVersion", second.receipt.registerVersion);
  out("republish.sourceRef.suffixCount", v6Row.sourceRef.split(SUFFIX).length - 1);
  out("republish.sourceRef", v6Row.sourceRef);
} catch (error) {
  out("probe.error", `${(error as Error).message} ${(error as any).code ?? ""}`);
} finally {
  await database.stop();
  out("scratch.stopped", true);
  const refused = await new Promise<string>((resolve) => {
    const socket = connect(portNumber, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); resolve("STILL-LISTENING"); });
    socket.once("error", (error: any) => resolve(error.code));
  });
  out("scratch.port.afterStop", refused);
}

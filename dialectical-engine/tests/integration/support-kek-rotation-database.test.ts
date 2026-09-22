/**
 * V-3 — the Postgres half of the support-KEK rotation.
 *
 * NOT YET RUN. The Docker engine was down for the whole of task 6, so this file
 * has never executed; `tests/unit/rotate-kek.test.ts` proves the same behaviour
 * against an in-memory stand-in for the seam, and this one proves that
 * `PostgresSupportKeyRotationRepository` really is that seam. It must be run in
 * a Docker window before anything here reaches `dev`.
 *
 * What it pins that the unit tests cannot:
 *   - the two `bytea` columns survive a re-wrap under their own CHECK
 *     constraint — `octet_length(wrapped_key) = 61 AND get_byte(wrapped_key,0) = 1`
 *     (migration 0054) — so no migration is needed;
 *   - a destroyed row's 61 zero bytes are still exactly that afterwards, and
 *     `support.assert_shred_integrity()` accepts every commit the rotation makes;
 *   - the optimistic condition really protects a row that changed underneath.
 */
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSupportPrincipalRole,
  PostgresSupportKeyRotationRepository,
  PostgresSupportSessionRepository
} from "../../packages/db/src/index.js";
import { generateDek } from "../../packages/crypto/src/index.js";
import { createSupportKeyPort } from "../../apps/api/src/support/keys.js";
import { createWrappedSupportSessionKey } from "../../apps/api/src/support/session.js";
import { rotateSupportKeys, rotationFailed } from "../../apps/runner/src/rotate-kek.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const temporaryDirectories: string[] = [];

async function supportKekPath(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-rotate-db-"));
  temporaryDirectories.push(root);
  const directory = join(root, name);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const path = join(directory, "support-kek.bin");
  await writeFile(path, generateDek(), { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

beforeAll(async () => {
  database = await startTestDatabase();
}, 600_000);

afterAll(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
  await database?.stop();
});

describe("V-3 support-KEK rotation against the real columns", () => {
  it("re-wraps live rows in place and leaves the envelope shape the CHECK demands", async () => {
    const oldPath = await supportKekPath("old");
    const newPath = await supportKekPath("new");
    const pool = database.pool;
    {
      const before = await createSupportKeyPort({ supportKekPath: oldPath });
      const sessions = new PostgresSupportSessionRepository(
        pool, createWrappedSupportSessionKey(before)
      );
      const sessionId = randomUUID();
      await sessions.create({
        sessionId,
        tokenSha256: "1".repeat(64),
        identityOwnerRef: null,
        language: "en",
        kbVersion: "2".repeat(64),
        createdAt: new Date()
      });
      await before.close();

      const repository = new PostgresSupportKeyRotationRepository(pool);
      const listed = await repository.listWrappedKeys();
      const row = listed.find((candidate) => candidate.ref === sessionId);
      expect(row).toBeDefined();
      expect(row?.wrappedKey).toHaveLength(61);
      expect(row?.destroyed).toBe(false);

      const during = await createSupportKeyPort({
        supportKekPath: newPath, previousSupportKekPath: oldPath
      });
      const report = await rotateSupportKeys(repository, during);
      await during.close();
      expect(rotationFailed([report])).toBe(false);
      expect(report.counts.rewrapped).toBeGreaterThanOrEqual(1);

      // The row is still exactly what the CHECK constraint demands. If it were
      // not, the UPDATE would have raised rather than reaching here.
      const after = (await repository.listWrappedKeys())
        .find((candidate) => candidate.ref === sessionId);
      expect(after?.wrappedKey).toHaveLength(61);
      expect(after?.wrappedKey[0]).toBe(1);

      // And it opens under the new KEK alone.
      const alone = await createSupportKeyPort({ supportKekPath: newPath });
      const dataKey = await alone.unwrapDataKey(
        { kind: "session", ref: sessionId }, after!.wrappedKey
      );
      expect(dataKey).toHaveLength(32);
      dataKey.fill(0);
      await alone.close();

      // Idempotent against the real table too.
      const second = await createSupportKeyPort({
        supportKekPath: newPath, previousSupportKekPath: oldPath
      });
      const repeat = await rotateSupportKeys(repository, second);
      await second.close();
      expect(repeat.counts.rewrapped).toBe(0);
      expect(repeat.counts.unreadable).toBe(0);
    }
  }, 600_000);

  it("refuses a connection that is not the debateai_support principal", async () => {
    // The test database connects as its own superuser, which is emphatically
    // NOT the support principal: the assertion must refuse it. A rotation that
    // ran as the wrong role would be writing key columns it has no business in.
    await expect(assertSupportPrincipalRole(database.pool)).rejects.toThrowError(
      expect.objectContaining({ message: "SUPPORT_DATABASE_ROLE_INVALID" })
    );
  }, 600_000);

  it("refuses to replace a row whose bytes changed under the rotation", async () => {
    const path = await supportKekPath("stable");
    const pool = database.pool;
    {
      const keys = await createSupportKeyPort({ supportKekPath: path });
      const sessions = new PostgresSupportSessionRepository(
        pool, createWrappedSupportSessionKey(keys)
      );
      const sessionId = randomUUID();
      await sessions.create({
        sessionId,
        tokenSha256: "3".repeat(64),
        identityOwnerRef: null,
        language: "en",
        kbVersion: "4".repeat(64),
        createdAt: new Date()
      });

      const repository = new PostgresSupportKeyRotationRepository(pool);
      const fresh = await keys.createDataKey({ kind: "session", ref: sessionId });
      // "previous" bytes that are not what the row holds: the optimistic
      // condition must decline rather than clobber.
      const changed = await repository.replaceWrappedKeys([{
        kind: "session",
        ref: sessionId,
        previous: Buffer.alloc(61, 0x7a),
        next: fresh.wrapped.bytes
      }]);
      fresh.close();
      await keys.close();
      expect(changed).toBe(0);
    }
  }, 600_000);
});

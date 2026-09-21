/**
 * V-19 — the opt-in custody group.
 *
 * Two OS principals (`debateai-api` read-write, `debateai-runner` read-only) must
 * both read the user-DEK store on the VPS. Today every key file must be mode
 * exactly 0600 owned by the calling uid inside a 0700 directory owned by the
 * same uid, so the runner cannot open a single private debate.
 *
 * `DEBATEAI_CUSTODY_GROUP` opts a deployment into a second accepted shape — a
 * 0640 file whose gid is that group's, inside a 0750 directory whose gid is that
 * group's — and NOTHING else relaxes. With the setting absent the contract is
 * byte-for-byte today's: the "group mode off" rows below are that proof.
 *
 * The matrix is driven against the pure decision function so that every refusal
 * is stated once and cannot drift; the real-file cases then prove the two live
 * loaders and the wrapped-key store are wired to it. Real files use a gid this
 * test process already belongs to (`process.getgroups()`) — a test can never
 * create a system group, and must never try.
 */
import { chmod, chown, link, mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CUSTODY_GROUP_VARIABLE,
  FilePublicationKeyStore,
  FileUserDekStore,
  custodyAccepts,
  generateDek,
  loadKek,
  loadSecretKey,
  parseGroupDatabaseGid,
  resolveCustodyGroupGid
} from "../../packages/crypto/src/index.js";
import type {
  CustodyFileFacts,
  CustodyParentFacts
} from "../../packages/crypto/src/index.js";
import {
  parseApiEnvironment,
  parseRunnerEnvironment
} from "../../packages/register/src/runtime-environment.js";
import {
  validApiEnvironmentFixture,
  validRunnerEnvironmentFixture
} from "../support/apiEnvironmentFixture.js";

const CALLER_UID = 501;
const OTHER_UID = 502;
const CUSTODY_GID = 4242;
const OTHER_GID = 4243;
const KEY_BYTES = 32;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

/** The groups this process already belongs to, other than its primary gid. */
function supplementaryGids(): readonly number[] {
  if (typeof process.getgroups !== "function" || typeof process.getgid !== "function") return [];
  const primary = process.getgid();
  return [...new Set(process.getgroups())].filter((gid) => gid !== primary);
}

const goodFile: CustodyFileFacts = Object.freeze({
  isFile: true, nlink: 1, mode: 0o600, uid: CALLER_UID, gid: CUSTODY_GID, size: KEY_BYTES
});
const goodParent: CustodyParentFacts = Object.freeze({
  isDirectory: true, mode: 0o700, uid: CALLER_UID, gid: CUSTODY_GID
});

type Row = Readonly<{
  name: string;
  group: boolean;
  file?: Partial<CustodyFileFacts> | undefined;
  parent?: Partial<CustodyParentFacts> | undefined;
  accepted: boolean;
}>;

function decide(row: Row): boolean {
  return custodyAccepts(
    { ...goodFile, ...row.file },
    { ...goodParent, ...row.parent },
    {
      callerUid: CALLER_UID,
      custodyGid: row.group ? CUSTODY_GID : undefined,
      expectedSize: KEY_BYTES
    }
  );
}

/**
 * Every row states one fact about the contract. `group: false` rows are the
 * regression fence: the setting absent must decide exactly as it does today.
 */
const MATRIX: readonly Row[] = Object.freeze([
  // --- the setting absent: today's contract, unchanged ----------------------
  { name: "off: 0600 owned by the caller in a 0700 directory", group: false, accepted: true },
  { name: "off: 0640 with the custody gid is NOT accepted", group: false, file: { mode: 0o640 }, accepted: false },
  { name: "off: a 0750 parent with the custody gid is NOT accepted", group: false, parent: { mode: 0o750 }, accepted: false },
  { name: "off: 0644", group: false, file: { mode: 0o644 }, accepted: false },
  { name: "off: a file owned by another uid", group: false, file: { uid: OTHER_UID }, accepted: false },
  { name: "off: a parent owned by another uid", group: false, parent: { uid: OTHER_UID }, accepted: false },

  // --- the setting present: the two accepted shapes -------------------------
  { name: "on: 0600 owned by the caller still loads", group: true, accepted: true },
  { name: "on: 0640 with the custody gid, owned by another uid", group: true, file: { mode: 0o640, uid: OTHER_UID }, accepted: true },
  { name: "on: 0640 file inside a 0750 parent, both owned by another uid", group: true, file: { mode: 0o640, uid: OTHER_UID }, parent: { mode: 0o750, uid: OTHER_UID }, accepted: true },
  { name: "on: 0600 file inside a 0750 custody parent", group: true, parent: { mode: 0o750, uid: OTHER_UID }, accepted: true },
  { name: "on: 0640 custody file inside a 0700 parent the caller owns", group: true, file: { mode: 0o640, uid: OTHER_UID }, accepted: true },

  // --- the setting present: every world bit refuses -------------------------
  { name: "on: 0644 (world readable)", group: true, file: { mode: 0o644 }, accepted: false },
  { name: "on: 0642 (world writable)", group: true, file: { mode: 0o642 }, accepted: false },
  { name: "on: 0641 (world executable)", group: true, file: { mode: 0o641 }, accepted: false },
  { name: "on: 0604 (world readable, no group)", group: true, file: { mode: 0o604 }, accepted: false },
  { name: "on: a 0755 parent", group: true, parent: { mode: 0o755 }, accepted: false },
  { name: "on: a 0751 parent", group: true, parent: { mode: 0o751 }, accepted: false },
  { name: "on: a 0701 parent", group: true, parent: { mode: 0o701 }, accepted: false },

  // --- the setting present: group-writable refuses --------------------------
  { name: "on: 0660 (group writable)", group: true, file: { mode: 0o660 }, accepted: false },
  { name: "on: 0620 (group write only)", group: true, file: { mode: 0o620 }, accepted: false },
  { name: "on: a 0770 parent (group writable)", group: true, parent: { mode: 0o770 }, accepted: false },

  // --- the setting present: only the named group ----------------------------
  { name: "on: 0640 with another gid", group: true, file: { mode: 0o640, gid: OTHER_GID }, accepted: false },
  { name: "on: a 0750 parent with another gid", group: true, parent: { mode: 0o750, gid: OTHER_GID }, accepted: false },
  { name: "on: 0600 owned by another uid (the gid never rescues 0600)", group: true, file: { uid: OTHER_UID }, accepted: false },
  { name: "on: a 0700 parent owned by another uid", group: true, parent: { uid: OTHER_UID }, accepted: false },

  // --- the setting present: neither accepted mode ---------------------------
  { name: "on: 0400", group: true, file: { mode: 0o400 }, accepted: false },
  { name: "on: 0650 (group executable)", group: true, file: { mode: 0o650 }, accepted: false },
  { name: "on: 0740 (owner executable)", group: true, file: { mode: 0o740 }, accepted: false },
  { name: "on: 0000", group: true, file: { mode: 0o000 }, accepted: false },
  { name: "on: a 0740 parent", group: true, parent: { mode: 0o740 }, accepted: false },

  // --- the setting present: everything else stays as strict as today --------
  { name: "on: a second hard link to the custody file", group: true, file: { mode: 0o640, nlink: 2 }, accepted: false },
  { name: "on: a second hard link to a 0600 file", group: true, file: { nlink: 2 }, accepted: false },
  { name: "on: a short custody file", group: true, file: { mode: 0o640, size: KEY_BYTES - 1 }, accepted: false },
  { name: "on: a long custody file", group: true, file: { mode: 0o640, size: KEY_BYTES + 1 }, accepted: false },
  { name: "on: not a regular file", group: true, file: { mode: 0o640, isFile: false }, accepted: false },
  { name: "on: a parent that is not a directory", group: true, parent: { mode: 0o750, isDirectory: false }, accepted: false }
]);

describe("V-19 custody contract: the refusal matrix", () => {
  for (const row of MATRIX) {
    it(`${row.accepted ? "accepts" : "refuses"} — ${row.name}`, () => {
      expect(decide(row)).toBe(row.accepted);
    });
  }

  it("skips the size rule for the wrapped-key records, which are JSON not keys", () => {
    const record = { ...goodFile, mode: 0o640, uid: OTHER_UID, size: 1_024 };
    const contract = { callerUid: CALLER_UID, custodyGid: CUSTODY_GID, expectedSize: undefined };
    expect(custodyAccepts(record, { ...goodParent, mode: 0o750 }, contract)).toBe(true);
    expect(custodyAccepts(record, goodParent, { ...contract, expectedSize: KEY_BYTES })).toBe(false);
  });

  it("keeps the uid rule off where the platform has no uid, exactly as today", () => {
    const contract = { callerUid: undefined, custodyGid: undefined, expectedSize: KEY_BYTES };
    expect(custodyAccepts({ ...goodFile, uid: OTHER_UID }, goodParent, contract)).toBe(true);
    expect(custodyAccepts({ ...goodFile, mode: 0o640 }, goodParent, contract)).toBe(false);
  });
});

describe("V-19 custody group: resolving the group name to a gid", () => {
  const database = [
    "# a POSIX group database",
    "root:x:0:",
    "",
    "debateai-custody:x:4242:debateai-api,debateai-runner",
    "malformed-line-without-fields",
    "bad-gid:x:not-a-number:",
    "trailing:x:998:"
  ].join("\n");

  it("reads a gid out of the group database by name", () => {
    expect(parseGroupDatabaseGid(database, "debateai-custody")).toBe(4242);
    expect(parseGroupDatabaseGid(database, "root")).toBe(0);
    expect(parseGroupDatabaseGid(database, "trailing")).toBe(998);
  });

  it("refuses an absent name, a malformed line and a non-numeric gid", () => {
    expect(parseGroupDatabaseGid(database, "absent")).toBeUndefined();
    expect(parseGroupDatabaseGid(database, "malformed-line-without-fields")).toBeUndefined();
    expect(parseGroupDatabaseGid(database, "bad-gid")).toBeUndefined();
    expect(parseGroupDatabaseGid(database, "")).toBeUndefined();
  });

  it("is off when the setting is absent or blank", () => {
    const refuse = (): string => { throw new Error("the group database must not be read"); };
    expect(resolveCustodyGroupGid(undefined, refuse)).toBeUndefined();
    expect(resolveCustodyGroupGid("", refuse)).toBeUndefined();
    expect(resolveCustodyGroupGid("   ", refuse)).toBeUndefined();
  });

  it("takes a numeric setting as the gid without reading any host file", () => {
    const refuse = (): string => { throw new Error("the group database must not be read"); };
    expect(resolveCustodyGroupGid("4242", refuse)).toBe(4242);
    expect(resolveCustodyGroupGid(" 0 ", refuse)).toBe(0);
  });

  it("resolves a name through the group database", () => {
    expect(resolveCustodyGroupGid("debateai-custody", () => database)).toBe(4242);
  });

  it("fails loudly rather than silently weakening or silently strengthening", () => {
    for (const value of ["absent-group", "bad-gid", "-1", "not a name", "9007199254740993"]) {
      expect(() => resolveCustodyGroupGid(value, () => database), value)
        .toThrowError(expect.objectContaining({ code: "CUSTODY_GROUP_UNRESOLVED" }));
    }
    expect(() => resolveCustodyGroupGid("debateai-custody", () => {
      throw new Error("ENOENT");
    })).toThrowError(expect.objectContaining({ code: "CUSTODY_GROUP_UNRESOLVED" }));
  });
});

describe("V-19 custody group: the deployment opts in through its environment", () => {
  it("carries the setting on both principals that read the user-DEK store", () => {
    const api = parseApiEnvironment({
      ...validApiEnvironmentFixture(),
      DEBATEAI_CUSTODY_GROUP: "debateai-custody"
    });
    expect(api.DEBATEAI_CUSTODY_GROUP).toBe("debateai-custody");
    const runner = parseRunnerEnvironment({
      ...validRunnerEnvironmentFixture(),
      DEBATEAI_CUSTODY_GROUP: "debateai-custody"
    });
    expect(runner.DEBATEAI_CUSTODY_GROUP).toBe("debateai-custody");
  });

  it("stays optional, so a deployment that never sets it is unchanged", () => {
    expect(parseApiEnvironment(validApiEnvironmentFixture()).DEBATEAI_CUSTODY_GROUP)
      .toBeUndefined();
    expect(parseRunnerEnvironment(validRunnerEnvironmentFixture()).DEBATEAI_CUSTODY_GROUP)
      .toBeUndefined();
  });

  it("refuses a blank setting rather than booting into an ambiguous contract", () => {
    expect(() => parseApiEnvironment({
      ...validApiEnvironmentFixture(),
      DEBATEAI_CUSTODY_GROUP: ""
    })).toThrow();
  });
});

describe("V-19 custody group: the live loaders on real files", () => {
  it("names the setting the deployment opts in with", () => {
    expect(CUSTODY_GROUP_VARIABLE).toBe("DEBATEAI_CUSTODY_GROUP");
  });

  it("opens a 0640 key file in a 0750 directory only while the group is configured", async () => {
    const gids = supplementaryGids();
    if (gids.length === 0) return;
    const custodyGid = gids[0]!;
    const directory = await temporaryDirectory("debateai-custody-group-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, process.getuid!(), custodyGid);
    await chmod(keyPath, 0o640);
    await chown(directory, process.getuid!(), custodyGid);
    await chmod(directory, 0o750);

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));
    expect(loadSecretKey(keyPath)).toHaveLength(KEY_BYTES);
    expect(loadKek(keyPath)).toBeDefined();

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, "");
    expect(() => loadKek(keyPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    expect(() => loadSecretKey(keyPath)).toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );
  });

  it("refuses a 0640 key file whose group is not the configured one", async () => {
    const gids = supplementaryGids();
    if (gids.length < 2) return;
    const [custodyGid, strangerGid] = gids as readonly [number, number];
    const directory = await temporaryDirectory("debateai-custody-stranger-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, process.getuid!(), strangerGid);
    await chmod(keyPath, 0o640);
    await chown(directory, process.getuid!(), custodyGid);
    await chmod(directory, 0o750);

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));
    expect(() => loadKek(keyPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
  });

  it("refuses a world bit, a group-write bit, a symlink, a hard link and a short file in group mode", async () => {
    const gids = supplementaryGids();
    if (gids.length === 0) return;
    const custodyGid = gids[0]!;
    const uid = process.getuid!();
    const directory = await temporaryDirectory("debateai-custody-refusals-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, uid, custodyGid);
    await chown(directory, uid, custodyGid);
    await chmod(directory, 0o750);
    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));

    for (const mode of [0o644, 0o660, 0o641, 0o604, 0o650]) {
      await chmod(keyPath, mode);
      expect(() => loadKek(keyPath), mode.toString(8)).toThrowError(
        expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
      );
    }
    await chmod(keyPath, 0o640);
    expect(loadKek(keyPath)).toBeDefined();

    const linkPath = join(directory, "kek.link.bin");
    await symlink(keyPath, linkPath);
    expect(() => loadKek(linkPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );

    const hardPath = join(directory, "kek.hard.bin");
    await link(keyPath, hardPath);
    expect(() => loadKek(hardPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    await rm(hardPath);

    const shortPath = join(directory, "short.bin");
    await writeFile(shortPath, Buffer.alloc(KEY_BYTES - 1), { mode: 0o600 });
    await chown(shortPath, uid, custodyGid);
    await chmod(shortPath, 0o640);
    expect(() => loadKek(shortPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
  });

  it("refuses a 0755 directory even when the key file itself is right", async () => {
    const gids = supplementaryGids();
    if (gids.length === 0) return;
    const custodyGid = gids[0]!;
    const directory = await temporaryDirectory("debateai-custody-parent-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, process.getuid!(), custodyGid);
    await chmod(keyPath, 0o640);
    await chown(directory, process.getuid!(), custodyGid);
    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));

    for (const mode of [0o755, 0o751, 0o770, 0o740]) {
      await chmod(directory, mode);
      expect(() => loadKek(keyPath), mode.toString(8)).toThrowError(
        expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
      );
    }
    await chmod(directory, 0o750);
    expect(loadKek(keyPath)).toBeDefined();
  });

  it("fails loudly at load time when the configured group cannot be resolved", async () => {
    const directory = await temporaryDirectory("debateai-custody-unresolved-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, "debateai-custody-that-does-not-exist-here");
    expect(() => loadKek(keyPath)).toThrowError(
      expect.objectContaining({ code: "CUSTODY_GROUP_UNRESOLVED" })
    );
  });

  /**
   * The read relaxation is inert unless the writer produces records the second
   * principal can read: the store creates its own directories and files, and it
   * used to impose 0700/0600 on every one of them — including the store root the
   * operator had just provisioned for the group. The store therefore follows the
   * ROOT it was pointed at: group modes only where the root already carries the
   * custody group, so the publication-key store (group `debateai-api`) keeps the
   * single-owner modes even while the setting is on.
   */
  it("writes group-readable records into a store root that carries the custody group", async () => {
    const gids = supplementaryGids();
    if (gids.length === 0) return;
    const custodyGid = gids[0]!;
    const uid = process.getuid!();
    const directory = await temporaryDirectory("debateai-custody-write-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o750 });
    await chown(root, uid, custodyGid);
    await chmod(root, 0o2750);

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));
    const store = new FileUserDekStore(root, loadKek(keyPath));
    const userId = "22222222-2222-4222-8222-222222222222";
    const dek = generateDek();
    await store.store(userId, dek);

    const rootFacts = await stat(root);
    expect(rootFacts.mode & 0o777).toBe(0o750);
    expect(rootFacts.gid).toBe(custodyGid);
    for (const part of [join(root, "users"), join(root, "users", userId)]) {
      const facts = await stat(part);
      expect(facts.mode & 0o777, part).toBe(0o750);
      // setgid, so a record created on Linux inherits the custody group rather
      // than the writing process's primary group.
      expect(facts.mode & 0o2000, part).toBe(0o2000);
      expect(facts.gid, part).toBe(custodyGid);
    }
    const record = await stat(join(root, "users", userId, "dek.v1.json"));
    expect(record.mode & 0o777).toBe(0o640);
    expect(record.gid).toBe(custodyGid);

    // And the record the store just wrote opens through the read contract.
    expect(await store.load(userId)).toEqual(dek);
  });

  it("keeps the single-owner modes for a store root that is not in the custody group", async () => {
    const gids = supplementaryGids();
    if (gids.length === 0) return;
    const custodyGid = gids[0]!;
    const directory = await temporaryDirectory("debateai-custody-private-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);
    const root = join(directory, "publication-keys");
    await mkdir(root, { mode: 0o700 });

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));
    const store = new FilePublicationKeyStore(root, loadKek(keyPath));
    const publicationRef = "33333333-3333-4333-8333-333333333333";
    await store.store(publicationRef, generateDek());

    for (const part of [root, join(root, "publications"), join(root, "publications", publicationRef)]) {
      const facts = await stat(part);
      expect(facts.mode & 0o777, part).toBe(0o700);
    }
    const record = await stat(
      join(root, "publications", publicationRef, "publication-key.v1.json")
    );
    expect(record.mode & 0o777).toBe(0o600);
  });

  it("lets the second principal read the wrapped user-DEK store, and only in group mode", async () => {
    const gids = supplementaryGids();
    if (gids.length === 0) return;
    const custodyGid = gids[0]!;
    const uid = process.getuid!();
    const directory = await temporaryDirectory("debateai-custody-store-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });

    const kek = loadKek(keyPath);
    const store = new FileUserDekStore(root, kek);
    const userId = "11111111-1111-4111-8111-111111111111";
    const dek = generateDek();
    await store.store(userId, dek);

    const userDirectory = join(root, "users", userId);
    const record = join(userDirectory, "dek.v1.json");
    await chown(record, uid, custodyGid);
    await chmod(record, 0o640);
    await chown(userDirectory, uid, custodyGid);
    await chmod(userDirectory, 0o750);

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));
    const loaded = await store.load(userId);
    expect(loaded).toEqual(dek);

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, "");
    await expect(store.load(userId)).rejects.toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );

    vi.stubEnv(CUSTODY_GROUP_VARIABLE, String(custodyGid));
    await chmod(record, 0o644);
    await expect(store.load(userId)).rejects.toThrowError(
      expect.objectContaining({ code: "KEK_UNRESOLVED" })
    );
  });
});

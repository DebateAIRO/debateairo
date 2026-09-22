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
  FilePublicationKeyStore,
  FileUserDekStore,
  configureCustodyGroup,
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
  configureCustodyGroup(undefined);
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

/**
 * A test process with no supplementary group — a container running as root, for
 * instance — cannot produce a real 0640-with-a-foreign-gid file, so these cases
 * cannot run. They must SKIP, never silently pass: an early `return` is a green
 * tick, so the whole wiring proof would evaporate while the run still printed
 * the same passing count. `skipIf` puts the absence in the output instead.
 */
const GIDS = supplementaryGids();
const NO_GROUP = GIDS.length === 0;
const FEWER_THAN_TWO_GROUPS = GIDS.length < 2;

/** Asserts the precondition rather than swallowing it, for the cases that run. */
function custodyGidPair(): readonly [number, number] {
  expect(GIDS.length, "this case needs two supplementary groups").toBeGreaterThanOrEqual(2);
  return [GIDS[0]!, GIDS[1]!];
}

function oneCustodyGid(): number {
  expect(GIDS.length, "this case needs a supplementary group").toBeGreaterThanOrEqual(1);
  return GIDS[0]!;
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
  // THE case V-19 exists for: the runner opens a 0640 record inside a 0750
  // directory, both owned by the API user and both in the custody group.
  { name: "on: 0640 in a 0750 parent, both owned by the other principal", group: true, file: { mode: 0o640, uid: OTHER_UID }, parent: { mode: 0o750, uid: OTHER_UID }, accepted: true },
  { name: "on: 0600 file the caller owns inside a 0750 parent the caller owns", group: true, parent: { mode: 0o750 }, accepted: true },

  // --- the setting present: the record and its directory share one owner ----
  // A directory owned by someone other than the file's owner is a second
  // principal that can replace the record, which is the thing custody is for.
  { name: "on: a 0750 custody parent owned by someone other than the file's owner", group: true, parent: { mode: 0o750, uid: OTHER_UID }, accepted: false },
  { name: "on: a 0640 custody file whose 0700 parent has a different owner", group: true, file: { mode: 0o640, uid: OTHER_UID }, accepted: false },
  { name: "on: a 0640 custody file whose 0750 custody parent has a different owner", group: true, file: { mode: 0o640, uid: OTHER_UID }, parent: { mode: 0o750 }, accepted: false },

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
    const parent = { ...goodParent, mode: 0o750, uid: OTHER_UID };
    const contract = { callerUid: CALLER_UID, custodyGid: CUSTODY_GID, expectedSize: undefined };
    expect(custodyAccepts(record, parent, contract)).toBe(true);
    expect(custodyAccepts(record, parent, { ...contract, expectedSize: KEY_BYTES })).toBe(false);
  });

  it("keeps the uid rule off where the platform has no uid, exactly as today", () => {
    const contract = { callerUid: undefined, custodyGid: undefined, expectedSize: KEY_BYTES };
    // A platform without uids reports the same uid for everything, so the
    // record and its directory still agree; what is off is the CALLER rule.
    const parent = { ...goodParent, uid: OTHER_UID };
    expect(custodyAccepts({ ...goodFile, uid: OTHER_UID }, parent, contract)).toBe(true);
    expect(custodyAccepts({ ...goodFile, mode: 0o640, uid: OTHER_UID }, parent, contract))
      .toBe(false);
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
  it.skipIf(NO_GROUP)("starts from the single-owner contract until a composition root says otherwise", async () => {
    const custodyGid = oneCustodyGid();
    const directory = await temporaryDirectory("debateai-custody-default-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, process.getuid!(), custodyGid);
    await chmod(keyPath, 0o640);
    await chown(directory, process.getuid!(), custodyGid);
    await chmod(directory, 0o750);

    // Nothing configured: the stricter rule, not the looser one.
    expect(() => loadKek(keyPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
  });

  it.skipIf(NO_GROUP)("opens a 0640 key file in a 0750 directory only while the group is configured", async () => {
    const custodyGid = oneCustodyGid();
    const directory = await temporaryDirectory("debateai-custody-group-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, process.getuid!(), custodyGid);
    await chmod(keyPath, 0o640);
    await chown(directory, process.getuid!(), custodyGid);
    await chmod(directory, 0o750);

    configureCustodyGroup(String(custodyGid));
    expect(loadSecretKey(keyPath)).toHaveLength(KEY_BYTES);
    expect(loadKek(keyPath)).toBeDefined();

    configureCustodyGroup(undefined);
    expect(() => loadKek(keyPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
    expect(() => loadSecretKey(keyPath)).toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );
  });

  it.skipIf(FEWER_THAN_TWO_GROUPS)("refuses a 0640 key file whose group is not the configured one", async () => {
    const [custodyGid, strangerGid] = custodyGidPair();
    const directory = await temporaryDirectory("debateai-custody-stranger-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, process.getuid!(), strangerGid);
    await chmod(keyPath, 0o640);
    await chown(directory, process.getuid!(), custodyGid);
    await chmod(directory, 0o750);

    configureCustodyGroup(String(custodyGid));
    expect(() => loadKek(keyPath)).toThrowError(
      expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
    );
  });

  it.skipIf(NO_GROUP)("refuses a world bit, a group-write bit, a symlink, a hard link and a short file in group mode", async () => {
    const custodyGid = oneCustodyGid();
    const uid = process.getuid!();
    const directory = await temporaryDirectory("debateai-custody-refusals-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, uid, custodyGid);
    await chown(directory, uid, custodyGid);
    await chmod(directory, 0o750);
    configureCustodyGroup(String(custodyGid));

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

  it.skipIf(NO_GROUP)("refuses a 0755 directory even when the key file itself is right", async () => {
    const custodyGid = oneCustodyGid();
    const directory = await temporaryDirectory("debateai-custody-parent-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chown(keyPath, process.getuid!(), custodyGid);
    await chmod(keyPath, 0o640);
    await chown(directory, process.getuid!(), custodyGid);
    configureCustodyGroup(String(custodyGid));

    for (const mode of [0o755, 0o751, 0o770, 0o740]) {
      await chmod(directory, mode);
      expect(() => loadKek(keyPath), mode.toString(8)).toThrowError(
        expect.objectContaining({ code: "KEK_CUSTODY_INVALID" })
      );
    }
    await chmod(directory, 0o750);
    expect(loadKek(keyPath)).toBeDefined();
  });

  it("fails loudly at configuration time when the group cannot be resolved", async () => {
    const directory = await temporaryDirectory("debateai-custody-unresolved-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);

    expect(() => configureCustodyGroup("debateai-custody-that-does-not-exist-here"))
      .toThrowError(expect.objectContaining({ code: "CUSTODY_GROUP_UNRESOLVED" }));
    // …and the contract is still the single-owner one, never a half-applied group.
    expect(loadKek(keyPath)).toBeDefined();
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
  it.skipIf(NO_GROUP)("writes group-readable records into a store root that carries the custody group", async () => {
    const custodyGid = oneCustodyGid();
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

    configureCustodyGroup(String(custodyGid));
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

  it.skipIf(NO_GROUP)("keeps the single-owner modes for a store root that is not in the custody group", async () => {
    const custodyGid = oneCustodyGid();
    const directory = await temporaryDirectory("debateai-custody-private-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);
    const root = join(directory, "publication-keys");
    await mkdir(root, { mode: 0o700 });

    configureCustodyGroup(String(custodyGid));
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

  it.skipIf(NO_GROUP)("lets the second principal read the wrapped user-DEK store, and only in group mode", async () => {
    const custodyGid = oneCustodyGid();
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

    configureCustodyGroup(String(custodyGid));
    const loaded = await store.load(userId);
    expect(loaded).toEqual(dek);

    configureCustodyGroup(undefined);
    await expect(store.load(userId)).rejects.toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );

    // A custody refusal keeps its OWN code. KEK_UNRESOLVED means "nothing is
    // provisioned at that path"; a record that exists but is not safe to trust
    // is a different fault, and on a first deploy it is the likelier one.
    configureCustodyGroup(String(custodyGid));
    await chmod(record, 0o644);
    await expect(store.load(userId)).rejects.toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );
  });

  /**
   * FIX WAVE A-I3 (final review A). The group write modes were decided from the
   * store ROOT's facts, but a new record's gid is inherited from the directory
   * it lands in — never checked — and nothing read back what it had written.
   * With the root group-owned and a leaf directory still in another group, the
   * store wrote a 0640 record the READ contract refuses: a registration that
   * "succeeded" whose user can never log in, or a rotation that rewrites
   * readable 0600 records into unreadable ones.
   *
   * The write now sets the custody group on the temporary where it may, and
   * always reads the written record's own facts back through `custodyAccepts`
   * before the rename — so a record that would not be accepted is never
   * published at all, and the refusal carries its typed code.
   */
  it.skipIf(FEWER_THAN_TWO_GROUPS)("refuses to publish a record the read contract would not accept", async () => {
    const [custodyGid, strangerGid] = custodyGidPair();
    const uid = process.getuid!();
    const directory = await temporaryDirectory("debateai-custody-readback-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o750 });
    await chown(root, uid, custodyGid);
    await chmod(root, 0o2750);
    // The half-applied recipe: the root carries the custody group, the
    // container the records land in does not.
    const users = join(root, "users");
    await mkdir(users, { mode: 0o750 });
    await chown(users, uid, strangerGid);
    await chmod(users, 0o2750);

    configureCustodyGroup(String(custodyGid));
    const store = new FileUserDekStore(root, loadKek(keyPath));
    const userId = "44444444-4444-4444-8444-444444444444";
    await expect(store.store(userId, generateDek())).rejects.toThrowError(
      expect.objectContaining({ code: "SECRET_CUSTODY_INVALID" })
    );
    // Nothing was published: no half-written record for the reader to refuse.
    await expect(stat(join(root, "users", userId, "dek.v1.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  /**
   * Item 3 of the 6a review. The store follows its root, and a root may only be
   * read as MORE permissive when it already is: a `chgrp -R` with no `chmod`
   * must not cause the next write to widen the tree on its own.
   */
  it.skipIf(NO_GROUP)("never widens a 0700 root just because its group matches", async () => {
    const custodyGid = oneCustodyGid();
    const uid = process.getuid!();
    const directory = await temporaryDirectory("debateai-custody-no-widen-");
    const keyPath = join(directory, "kek.bin");
    await writeFile(keyPath, generateDek(), { mode: 0o600 });
    await chmod(keyPath, 0o600);
    await chmod(directory, 0o700);
    const root = join(directory, "user-deks");
    await mkdir(root, { mode: 0o700 });
    // Exactly the half-done repair: the group is right, the mode is not.
    await chown(root, uid, custodyGid);

    configureCustodyGroup(String(custodyGid));
    const store = new FileUserDekStore(root, loadKek(keyPath));
    const userId = "55555555-5555-4555-8555-555555555555";
    await store.store(userId, generateDek());

    // The root is still 0700 — the write did not add a single permission bit.
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    for (const part of [join(root, "users"), join(root, "users", userId)]) {
      expect((await stat(part)).mode & 0o777, part).toBe(0o700);
    }
    expect((await stat(join(root, "users", userId, "dek.v1.json"))).mode & 0o777)
      .toBe(0o600);
    // And it still reads back, under the strict contract.
    expect(await store.load(userId)).toBeInstanceOf(Buffer);
  });
});

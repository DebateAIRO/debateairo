// NV-07: the restore fence's host half (apps/api/src/restore-fence.ts). No database: an in-memory repository plays the
// settle transaction (begin, read the host file, the settle SQL, write the host file, commit) and records its order.
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileRestoreFence, resolveRestoreFencePath, restoreFenceJournalLine } from "../../apps/api/src/restore-fence.js";
import type {
  PostgresRestoreFenceRepository,
  RestoreFenceHostToken,
  RestoreFenceOutcome,
  RestoreFenceSettlement
} from "../../packages/db/src/restore-fence.js";

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const KIT = Object.freeze({
  DEPLOYMENT_MODE: "hosted" as const,
  RESTORE_FENCE_PATH: "/var/lib/debateai/api/restore-fence/fence",
  USER_DEK_STORE_PATH: "/var/lib/debateai/api/user-deks",
  PUBLICATION_KEY_STORE_PATH: "/var/lib/debateai/api/publication-keys",
  AUDIT_KEY_STORE_PATH: "/var/lib/debateai/api/audit-keys",
  DATA_EXPORT_STORE_PATH: "/var/lib/debateai/data-exports",
  BILLING_NOTICE_SPOOL_PATH: "/var/lib/debateai/api/billing-notice-spool",
  KEK_PATH: "/etc/debateai/api/kek.bin",
  BLIND_INDEX_KEY_PATH: "/etc/debateai/api/blind-index-key.bin",
  AUDIT_SOURCE_IP_SALT_PATH: "/etc/debateai/api/audit-source-ip-salt.bin",
  SUPPORT_KEK_PATH: "/etc/debateai/api/support-kek.bin",
  RECORDS_KEY_PATH: "/etc/debateai/api/records-key.bin",
  CORPUS_KEK_PATH: "/etc/debateai/api/corpus-kek.bin"
});
const BILLING = Object.freeze(["/etc/debateai/api/billing/quaderno-api-key", "/etc/debateai/api/billing/smartbill-credentials"]);

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fenceFolder(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "nv07-fence-"));
  roots.push(root);
  const dir = join(root, "restore-fence");
  await mkdir(dir, { mode: 0o700 });
  await chmod(dir, 0o700);
  return dir;
}

type Step = "begin" | "readHostToken" | "settleSql" | "commitHostToken" | "commit";
/**
 * The settle transaction in memory: the row's token, the hold, and the decision table of
 * identity.restore_fence_settle_v1. `between` runs after begin and before the host file is read; `beforeCommit` runs
 * after the settle SQL and before the host file is written.
 */
function memoryRepository(options: Readonly<{
  between?: () => Promise<void>;
  beforeCommit?: () => Promise<void>;
}> = {}) {
  const state = { row: null as string | null, hold: false, steps: [] as Step[], hosts: [] as RestoreFenceHostToken[] };
  const repository: Pick<PostgresRestoreFenceRepository, "settle"> = {
    async settle(input) {
      state.steps.push("begin");
      await options.between?.();
      const host = await input.readHostToken();
      state.steps.push("readHostToken");
      state.hosts.push(host);
      state.steps.push("settleSql");
      let outcome: RestoreFenceOutcome;
      if (state.row === null && host === null) outcome = "INITIALISED";
      else if (state.row !== null && state.row === host) outcome = "ADVANCED";
      else outcome = "RESTORE_REVOKED";
      if (outcome === "RESTORE_REVOKED") state.hold = true;
      await options.beforeCommit?.();
      state.steps.push("commitHostToken");
      await input.commitHostToken(input.nextToken);
      state.steps.push("commit");
      state.row = input.nextToken;
      return Object.freeze({ outcome, publicHold: state.hold, revoked: Object.freeze(outcome === "RESTORE_REVOKED" ? { sessions: 2 } : {}) });
    }
  };
  return { repository, state };
}

describe("NV-07 resolveRestoreFencePath", () => {
  it("is required in hosted mode and off in local mode", () => {
    const { RESTORE_FENCE_PATH: _unset, ...hosted } = KIT;
    expect(() => resolveRestoreFencePath(hosted, BILLING)).toThrow(/^RESTORE_FENCE_PATH_REQUIRED$/u);
    expect(() => resolveRestoreFencePath(hosted, BILLING)).toThrow(TypeError);
    expect(resolveRestoreFencePath({ ...hosted, DEPLOYMENT_MODE: "local" }, [])).toBeNull();
  });

  it("accepts the kit's path beside the kit's stores and secret files", () => {
    expect(resolveRestoreFencePath(KIT, BILLING)).toBe("/var/lib/debateai/api/restore-fence/fence");
    expect(resolveRestoreFencePath({ ...KIT, DEPLOYMENT_MODE: "local" }, BILLING)).toBe("/var/lib/debateai/api/restore-fence/fence");
  });

  it("refuses a relative path, a path with .., a path that is not normalised and an empty file name", () => {
    for (const path of ["restore-fence/fence", "./fence", "/var/lib/debateai/api/../api/restore-fence/fence",
      "/var/lib/debateai/api//restore-fence/fence", "/var/lib/debateai/api/restore-fence/", "/"]) {
      expect(() => resolveRestoreFencePath({ ...KIT, RESTORE_FENCE_PATH: path }, BILLING), path).toThrow(/^RESTORE_FENCE_PATH_INVALID$/u);
    }
  });

  it("refuses a fence folder equal to, inside or a parent of any store", () => {
    for (const store of [KIT.USER_DEK_STORE_PATH, KIT.PUBLICATION_KEY_STORE_PATH, KIT.AUDIT_KEY_STORE_PATH,
      KIT.DATA_EXPORT_STORE_PATH, KIT.BILLING_NOTICE_SPOOL_PATH]) {
      for (const path of [`${store}/fence`, `${store}/inner/fence`, `${store.slice(0, store.lastIndexOf("/"))}/fence`]) {
        expect(() => resolveRestoreFencePath({ ...KIT, RESTORE_FENCE_PATH: path }, BILLING), path)
          .toThrow(/^RESTORE_FENCE_PATH_INSIDE_CUSTODY$/u);
      }
    }
    // A store that is unset is not compared.
    const { PUBLICATION_KEY_STORE_PATH: _p, DATA_EXPORT_STORE_PATH: _d, BILLING_NOTICE_SPOOL_PATH: _b, ...fewer } = KIT;
    expect(resolveRestoreFencePath({ ...fewer, RESTORE_FENCE_PATH: "/var/lib/debateai/data-exports/fence" }, [])).toBe("/var/lib/debateai/data-exports/fence");
  });

  it("refuses a fence folder that is, contains or sits inside the folder of a secret file", () => {
    for (const path of ["/etc/debateai/api/fence", "/etc/debateai/fence", "/etc/fence", "/etc/debateai/api/inner/fence"]) {
      expect(() => resolveRestoreFencePath({ ...KIT, RESTORE_FENCE_PATH: path }, BILLING), path).toThrow(/^RESTORE_FENCE_PATH_INSIDE_CUSTODY$/u);
    }
    const elsewhere = Object.freeze({
      ...KIT, KEK_PATH: "/srv/k/kek.bin", BLIND_INDEX_KEY_PATH: "/srv/k/b.bin", AUDIT_SOURCE_IP_SALT_PATH: "/srv/k/s.bin",
      SUPPORT_KEK_PATH: "/srv/k/sk.bin", RECORDS_KEY_PATH: "/srv/k/r.bin", CORPUS_KEK_PATH: "/srv/k/c.bin"
    });
    expect(resolveRestoreFencePath({ ...elsewhere, RESTORE_FENCE_PATH: "/etc/debateai/api/fence" }, [])).toBe("/etc/debateai/api/fence");
    // Each optional secret file, when set, and each billing custody file count too.
    for (const extra of [{ KEK_PREVIOUS_PATH: "/opt/prev/kek.bin" }, { CORPUS_KEK_PREVIOUS_PATH: "/opt/prev/c.bin" },
      { SUPPORT_KEK_PREVIOUS_PATH: "/opt/prev/s.bin" }, { CONTENT_BLIND_INDEX_KEY_PATH: "/opt/prev/cb.bin" }]) {
      expect(() => resolveRestoreFencePath({ ...elsewhere, ...extra, RESTORE_FENCE_PATH: "/opt/prev/inner/fence" }, []), JSON.stringify(extra))
        .toThrow(/^RESTORE_FENCE_PATH_INSIDE_CUSTODY$/u);
    }
    expect(() => resolveRestoreFencePath({ ...elsewhere, RESTORE_FENCE_PATH: "/opt/billing/fence" }, ["/opt/billing/netopia-api-key"]))
      .toThrow(/^RESTORE_FENCE_PATH_INSIDE_CUSTODY$/u);
  });

  it("with every optional path unset and no billing files, accepts a valid path without touching undefined", () => {
    const minimal = {
      DEPLOYMENT_MODE: "hosted" as const, RESTORE_FENCE_PATH: "/var/lib/debateai/api/restore-fence/fence",
      USER_DEK_STORE_PATH: KIT.USER_DEK_STORE_PATH, AUDIT_KEY_STORE_PATH: KIT.AUDIT_KEY_STORE_PATH,
      KEK_PATH: KIT.KEK_PATH, BLIND_INDEX_KEY_PATH: KIT.BLIND_INDEX_KEY_PATH, AUDIT_SOURCE_IP_SALT_PATH: KIT.AUDIT_SOURCE_IP_SALT_PATH,
      SUPPORT_KEK_PATH: KIT.SUPPORT_KEK_PATH, RECORDS_KEY_PATH: KIT.RECORDS_KEY_PATH,
      CORPUS_KEK_PATH: undefined, CONTENT_BLIND_INDEX_KEY_PATH: undefined, KEK_PREVIOUS_PATH: undefined,
      CORPUS_KEK_PREVIOUS_PATH: undefined, SUPPORT_KEK_PREVIOUS_PATH: undefined, PUBLICATION_KEY_STORE_PATH: undefined
    };
    expect(resolveRestoreFencePath(minimal, [])).toBe("/var/lib/debateai/api/restore-fence/fence");
  });
});

describe("NV-07 FileRestoreFence", () => {
  it("reads the host file only after begin (under the row lock) and before the settle SQL", async () => {
    const dir = await fenceFolder();
    const path = join(dir, "fence");
    const tokens = ["a".repeat(43), "b".repeat(43), "c".repeat(43)];
    let next = 0, settles = 0;
    // Between begin and the read, another release advances the file: a read taken before begin would miss it.
    const { repository, state } = memoryRepository({ between: async () => {
      if (settles++ === 1) await writeFile(path, `${"z".repeat(43)}\n`, { mode: 0o600 });
    } });
    const fence = new FileRestoreFence({ path, repository, token: () => tokens[next++]! });
    await fence.settle();
    expect(state.steps).toEqual(["begin", "readHostToken", "settleSql", "commitHostToken", "commit"]);
    expect(state.hosts).toEqual([null]);
    await fence.settle();
    expect(state.hosts).toEqual([null, "z".repeat(43)]);
  });

  it("holds public reads until the first settle, then follows each settlement", async () => {
    const dir = await fenceFolder();
    const path = join(dir, "fence");
    const { repository } = memoryRepository();
    const fence = new FileRestoreFence({ path, repository });
    expect(fence.publicReadsHeld()).toBe(true);
    await expect(fence.settle()).resolves.toMatchObject({ outcome: "INITIALISED", publicHold: false });
    expect(fence.publicReadsHeld()).toBe(false);
    await expect(fence.settle()).resolves.toMatchObject({ outcome: "ADVANCED", publicHold: false });
    await writeFile(path, "", { mode: 0o600 });
    await expect(fence.settle()).resolves.toMatchObject({ outcome: "RESTORE_REVOKED", publicHold: true });
    expect(fence.publicReadsHeld()).toBe(true);
  });

  it("writes the next token atomically: 0600, the token and a newline, no tmp file left", async () => {
    const dir = await fenceFolder();
    const path = join(dir, "fence");
    const { repository, state } = memoryRepository();
    const fence = new FileRestoreFence({ path, repository });
    await fence.settle();
    const text = await readFile(path, "utf8");
    expect(text).toMatch(/^[A-Za-z0-9_-]{43}\n$/u);
    expect(text.slice(0, -1)).toBe(state.row);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readdir(dir)).toEqual(["fence"]);
    expect(state.row).toMatch(TOKEN);
  });

  it("reads an operator's marker, an empty file and an oversized file as MARKER", async () => {
    for (const content of ["restored\n", "", "x".repeat(300), `${"a".repeat(43)}\n\n`, `${"a".repeat(42)}!`]) {
      const dir = await fenceFolder();
      const path = join(dir, "fence");
      await writeFile(path, content, { mode: 0o600 });
      await chmod(path, 0o600);
      const { repository, state } = memoryRepository();
      await new FileRestoreFence({ path, repository }).settle();
      expect(state.hosts, JSON.stringify(content)).toEqual(["MARKER"]);
    }
    const dir = await fenceFolder();
    await writeFile(join(dir, "fence"), `${"a".repeat(43)}\n`, { mode: 0o600 });
    const { repository, state } = memoryRepository();
    await new FileRestoreFence({ path: join(dir, "fence"), repository }).settle();
    expect(state.hosts).toEqual(["a".repeat(43)]);
  });

  it("refuses a link as the file, a shared file, a shared or foreign folder and a missing folder", async () => {
    const linked = await fenceFolder();
    await writeFile(join(linked, "target"), `${"a".repeat(43)}\n`, { mode: 0o600 });
    await symlink(join(linked, "target"), join(linked, "fence"));
    await expect(new FileRestoreFence({ path: join(linked, "fence"), repository: memoryRepository().repository }).settle())
      .rejects.toThrow(/^RESTORE_FENCE_FILE_INSECURE$/u);
    const shared = await fenceFolder();
    await writeFile(join(shared, "fence"), `${"a".repeat(43)}\n`, { mode: 0o600 });
    await chmod(join(shared, "fence"), 0o644);
    await expect(new FileRestoreFence({ path: join(shared, "fence"), repository: memoryRepository().repository }).settle())
      .rejects.toThrow(/^RESTORE_FENCE_FILE_INSECURE$/u);
    const open = await fenceFolder();
    await chmod(open, 0o755);
    await expect(new FileRestoreFence({ path: join(open, "fence"), repository: memoryRepository().repository }).settle())
      .rejects.toThrow(/^RESTORE_FENCE_DIRECTORY_INSECURE$/u);
    const foreign = await fenceFolder();
    await expect(new FileRestoreFence({ path: join(foreign, "fence"), repository: memoryRepository().repository, uid: (process.getuid?.() ?? 0) + 1 }).settle())
      .rejects.toThrow(/^RESTORE_FENCE_DIRECTORY_INSECURE$/u);
    const missing = await fenceFolder();
    const refusal = new FileRestoreFence({ path: join(missing, "absent", "fence"), repository: memoryRepository().repository }).settle();
    await expect(refusal).rejects.toThrow(/^RESTORE_FENCE_DIRECTORY_MISSING$/u);
    await expect(refusal).rejects.toThrow(TypeError);
  });

  it("propagates a failed host write and leaves no tmp file", async () => {
    const dir = await fenceFolder();
    const path = join(dir, "fence");
    // After the read, something takes the file's name: the rename over a folder fails.
    const { repository, state } = memoryRepository({ beforeCommit: async () => { await mkdir(path); } });
    await expect(new FileRestoreFence({ path, repository }).settle()).rejects.toBeDefined();
    expect(state.steps).toEqual(["begin", "readHostToken", "settleSql", "commitHostToken"]);
    expect(await readdir(dir)).toEqual(["fence"]);
    expect((await stat(path)).isDirectory()).toBe(true);
  });
});

describe("NV-07 restoreFenceJournalLine", () => {
  const settlement = (outcome: RestoreFenceOutcome, publicHold: boolean, revoked: Record<string, number> = {}): RestoreFenceSettlement =>
    Object.freeze({ outcome, publicHold, revoked: Object.freeze(revoked) });

  it("writes no line for an advance and one content-free line otherwise", () => {
    expect(restoreFenceJournalLine(settlement("ADVANCED", false))).toBeNull();
    expect(restoreFenceJournalLine(settlement("ADVANCED", true))).toBeNull();
    const initialised = restoreFenceJournalLine(settlement("INITIALISED", false));
    expect(JSON.parse(initialised!)).toEqual({ event: "api.restore_fence", outcome: "INITIALISED", publicHold: false, revoked: {} });
    const revoked = restoreFenceJournalLine(settlement("RESTORE_REVOKED", true, { sessions: 3, loginChallenges: 1 }));
    expect(JSON.parse(revoked!)).toEqual({ event: "api.restore_fence", outcome: "RESTORE_REVOKED", publicHold: true, revoked: { sessions: 3, loginChallenges: 1 } });
    for (const line of [initialised!, revoked!]) {
      expect(line).not.toMatch(/[A-Za-z0-9_-]{43}/u);
      expect(line).not.toContain("/");
    }
  });
});

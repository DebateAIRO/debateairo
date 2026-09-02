import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV_CUSTODY_ROOT_ENV } from "../../deploy/dev-auth/custody-root.mjs";
import {
  DEVELOPMENT_SECRET_FILES,
  DEVELOPMENT_SECRET_STORES,
  generateDevelopmentSecretFiles
} from "../../apps/runner/src/dev-secret-files.js";

const temporaryRoots: string[] = [];

async function makeRepositoryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-dev-secrets-"));
  temporaryRoots.push(root);
  return root;
}

async function runCli(repositoryRoot: string): Promise<Readonly<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>> {
  const sourceRoot = process.cwd();
  const childEnvironment = { ...process.env };
  delete childEnvironment.FORCE_COLOR;
  delete childEnvironment.NO_COLOR;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        createRequire(import.meta.url).resolve("tsx"),
        join(sourceRoot, "apps", "runner", "src", "dev-secret-files-cli.ts")
      ],
      { cwd: repositoryRoot, env: childEnvironment, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("DEV-04 persistent development secret custody", () => {
  it("creates the exact distinct secrets and stores once, then preserves every byte and inode", async () => {
    const repositoryRoot = await makeRepositoryRoot();
    const first = await generateDevelopmentSecretFiles({ repositoryRoot });
    expect(first).toEqual({
      custodyRoot: join(repositoryRoot, ".local", "dev-auth"),
      generatedSecretCount: 4,
      secretFileCount: 4,
      secretStoreCount: 3
    });

    const directoryPaths = [
      first.custodyRoot,
      join(first.custodyRoot, "secrets"),
      ...DEVELOPMENT_SECRET_STORES.map(({ relativePath }) =>
        join(first.custodyRoot, relativePath)
      )
    ];
    for (const directoryPath of directoryPaths) {
      const metadata = await lstat(directoryPath);
      expect(metadata.isDirectory()).toBe(true);
      expect(metadata.isSymbolicLink()).toBe(false);
      expect(metadata.mode & 0o777).toBe(0o700);
    }

    const before = await Promise.all(DEVELOPMENT_SECRET_FILES.map(async ({ relativePath }) => {
      const path = join(first.custodyRoot, relativePath);
      const [material, metadata] = await Promise.all([readFile(path), lstat(path)]);
      expect(material).toHaveLength(32);
      expect(metadata.isFile()).toBe(true);
      expect(metadata.isSymbolicLink()).toBe(false);
      expect(metadata.mode & 0o777).toBe(0o600);
      return { path, material, dev: metadata.dev, ino: metadata.ino };
    }));
    expect(new Set(before.map(({ material }) => material.toString("base64"))).size).toBe(4);
    expect(new Set(before.map(({ dev, ino }) => `${dev}:${ino}`)).size).toBe(4);

    await expect(generateDevelopmentSecretFiles({ repositoryRoot })).resolves.toEqual({
      custodyRoot: first.custodyRoot,
      generatedSecretCount: 0,
      secretFileCount: 4,
      secretStoreCount: 3
    });
    for (const preserved of before) {
      const [material, metadata] = await Promise.all([
        readFile(preserved.path), lstat(preserved.path)
      ]);
      expect(material).toEqual(preserved.material);
      expect(metadata.dev).toBe(preserved.dev);
      expect(metadata.ino).toBe(preserved.ino);
    }
  });

  it("fails closed on permissive, malformed, duplicated, or symlinked existing custody", async () => {
    const repositoryRoot = await makeRepositoryRoot();
    const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
    const secretsRoot = join(custodyRoot, "secrets");
    await mkdir(secretsRoot, { recursive: true, mode: 0o700 });
    await chmod(custodyRoot, 0o700);
    await chmod(secretsRoot, 0o700);
    const kekPath = join(secretsRoot, "kek.bin");
    await writeFile(kekPath, Buffer.alloc(31, 0x41), { mode: 0o600 });
    await expect(generateDevelopmentSecretFiles({ repositoryRoot }))
      .rejects.toThrow("DEV_AUTH_SECRET_FILE_INVALID");
    expect(await readFile(kekPath)).toEqual(Buffer.alloc(31, 0x41));

    await rm(kekPath);
    await writeFile(kekPath, Buffer.alloc(32, 0x42), { mode: 0o600 });
    await chmod(kekPath, 0o644);
    await expect(generateDevelopmentSecretFiles({ repositoryRoot }))
      .rejects.toThrow("DEV_AUTH_SECRET_FILE_INVALID");
    expect((await lstat(kekPath)).mode & 0o777).toBe(0o644);
    expect(await readFile(kekPath)).toEqual(Buffer.alloc(32, 0x42));

    await chmod(kekPath, 0o600);
    const blindIndexPath = join(secretsRoot, "blind-index-key.bin");
    await writeFile(blindIndexPath, Buffer.alloc(32, 0x42), { mode: 0o600 });
    const saltPath = join(secretsRoot, "audit-source-ip-salt.bin");
    await writeFile(saltPath, Buffer.alloc(32, 0x43), { mode: 0o600 });
    await expect(generateDevelopmentSecretFiles({ repositoryRoot }))
      .rejects.toThrow("DEV_AUTH_SECRET_DOMAIN_INVALID");

    await rm(blindIndexPath);
    const external = join(repositoryRoot, "external-secret");
    await writeFile(external, Buffer.alloc(32, 0x44), { mode: 0o600 });
    await link(external, blindIndexPath);
    await expect(generateDevelopmentSecretFiles({ repositoryRoot }))
      .rejects.toThrow("DEV_AUTH_SECRET_FILE_INVALID");
    expect(await readFile(external)).toEqual(Buffer.alloc(32, 0x44));

    await rm(blindIndexPath);
    await symlink(external, blindIndexPath);
    await expect(generateDevelopmentSecretFiles({ repositoryRoot }))
      .rejects.toThrow("DEV_AUTH_SECRET_FILE_INVALID");
    expect(await readFile(external)).toEqual(Buffer.alloc(32, 0x44));

    await rm(blindIndexPath);
    await writeFile(blindIndexPath, Buffer.alloc(32, 0x45), { mode: 0o600 });
    const auditStore = join(custodyRoot, "audit-keys");
    await chmod(auditStore, 0o755);
    await expect(generateDevelopmentSecretFiles({ repositoryRoot }))
      .rejects.toThrow("DEV_AUTH_SECRET_STORE_INVALID");
    expect((await lstat(auditStore)).mode & 0o777).toBe(0o755);

    const symlinkedRepositoryRoot = await makeRepositoryRoot();
    const escapedLocalRoot = await makeRepositoryRoot();
    await symlink(escapedLocalRoot, join(symlinkedRepositoryRoot, ".local"));
    await expect(generateDevelopmentSecretFiles({ repositoryRoot: symlinkedRepositoryRoot }))
      .rejects.toThrow("DEV_AUTH_CUSTODY_ROOT_INVALID");
    expect(await readdir(escapedLocalRoot)).toEqual([]);
  });

  it("publishes complete files under concurrent first invocation without temporary residue", async () => {
    const repositoryRoot = await makeRepositoryRoot();
    const receipts = await Promise.all(Array.from({ length: 16 }, () =>
      generateDevelopmentSecretFiles({ repositoryRoot })
    ));
    expect(receipts.reduce((sum, receipt) => sum + receipt.generatedSecretCount, 0)).toBe(4);
    const secretsRoot = join(repositoryRoot, ".local", "dev-auth", "secrets");
    expect((await readdir(secretsRoot)).sort()).toEqual(
      DEVELOPMENT_SECRET_FILES.map(({ relativePath }) => relativePath.split("/").at(-1)!).sort()
    );
    const materials = await Promise.all(DEVELOPMENT_SECRET_FILES.map(({ relativePath }) =>
      readFile(join(repositoryRoot, ".local", "dev-auth", relativePath))
    ));
    expect(materials.every((material) => material.byteLength === 32)).toBe(true);
    expect(new Set(materials.map((material) => material.toString("base64"))).size).toBe(4);
  });

  it("runs the fixed-path CLI without printing or rotating secret material", async () => {
    const repositoryRoot = await makeRepositoryRoot();
    const first = await runCli(repositoryRoot);
    expect(first).toEqual({
      exitCode: 0,
      stdout: "DEV_AUTH_SECRETS_READY=4:3\n",
      stderr: ""
    });
    const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
    const materials = await Promise.all(DEVELOPMENT_SECRET_FILES.map(({ relativePath }) =>
      readFile(join(custodyRoot, relativePath))
    ));
    for (const material of materials) {
      expect(first.stdout).not.toContain(material.toString("base64"));
      expect(first.stderr).not.toContain(material.toString("base64"));
    }
    await expect(runCli(repositoryRoot)).resolves.toEqual(first);
    const after = await Promise.all(DEVELOPMENT_SECRET_FILES.map(({ relativePath }) =>
      readFile(join(custodyRoot, relativePath))
    ));
    expect(after).toEqual(materials);
  });

  it("requires the custody parent to be exactly 0700, refusing rather than repairing it (B4 item 6)", async () => {
    const repositoryRoot = await makeRepositoryRoot();
    const localRoot = join(repositoryRoot, ".local");
    await mkdir(localRoot, { mode: 0o755 });
    await expect(generateDevelopmentSecretFiles({ repositoryRoot }))
      .rejects.toThrow("DEV_AUTH_CUSTODY_ROOT_INVALID");
    expect((await lstat(localRoot)).mode & 0o777).toBe(0o755);
    expect(await readdir(localRoot)).toEqual([]);
  });

  it("publishes custody under DEBATEAI_DEV_CUSTODY_ROOT and writes nothing under the repository", async () => {
    const repositoryRoot = await makeRepositoryRoot();
    const custodyParent = join(await makeRepositoryRoot(), "keys");
    const custodyRoot = join(custodyParent, "dev-auth");
    vi.stubEnv(DEV_CUSTODY_ROOT_ENV, custodyRoot);
    try {
      const receipt = await generateDevelopmentSecretFiles({ repositoryRoot });
      expect(receipt.custodyRoot).toBe(custodyRoot);
      expect((await lstat(custodyParent)).mode & 0o777).toBe(0o700);
      expect((await lstat(custodyRoot)).mode & 0o777).toBe(0o700);
      expect(await readdir(repositoryRoot)).toEqual([]);
      for (const { relativePath } of DEVELOPMENT_SECRET_FILES) {
        expect((await lstat(join(custodyRoot, relativePath))).mode & 0o777).toBe(0o600);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

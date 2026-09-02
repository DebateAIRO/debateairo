import { chmod, lstat, mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevCustodyDirectory,
  assertDevCustodyRootCustody,
  DEV_CUSTODY_ROOT_ENV,
  DevCustodyRootError,
  resolveDevCustodyRoot
} from "../../deploy/dev-auth/custody-root.mjs";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");
const CLOUD_SYNCED_CODE = "DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED";
const RELATIVE_CODE = "DEV_AUTH_CUSTODY_ROOT_RELATIVE";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debateai-custody-root-"));
  temporaryRoots.push(root);
  return root;
}

function capture(run: () => unknown): DevCustodyRootError {
  try {
    run();
  } catch (error) {
    if (error instanceof DevCustodyRootError) return error;
    throw new Error(`expected DevCustodyRootError, got ${String(error)}`);
  }
  throw new Error("expected resolveDevCustodyRoot to throw");
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("dev custody root (F-05, L2-F1, L2-F2)", () => {
  it("defaults to <repo>/.local/dev-auth outside cloud-synced folders", () => {
    expect(resolveDevCustodyRoot("/Users/v/src/engine", {}))
      .toBe("/Users/v/src/engine/.local/dev-auth");
  });

  it("honours an absolute override and treats a blank override as absent", () => {
    expect(resolveDevCustodyRoot("/Users/v/src/engine", {
      [DEV_CUSTODY_ROOT_ENV]: "/Users/v/.debateai/dev-auth"
    })).toBe("/Users/v/.debateai/dev-auth");
    expect(resolveDevCustodyRoot("/Users/v/src/engine", { [DEV_CUSTODY_ROOT_ENV]: "   " }))
      .toBe("/Users/v/src/engine/.local/dev-auth");
  });

  it("refuses a relative override with a typed code that names the variable", () => {
    const error = capture(() => resolveDevCustodyRoot("/Users/v/src/engine", {
      [DEV_CUSTODY_ROOT_ENV]: ".custody"
    }));
    expect(error).toBeInstanceOf(TypeError);
    expect(error.name).toBe("DevCustodyRootError");
    expect(error.code).toBe(RELATIVE_CODE);
    expect(error.message).toContain(RELATIVE_CODE);
    expect(error.message).toContain(DEV_CUSTODY_ROOT_ENV);
  });

  it("refuses custody under a cloud-synced folder by case-insensitive segment prefix", () => {
    const refused: ReadonlyArray<readonly [root: string, segment: string]> = [
      ["/Users/v/OneDrive-adessoGroup/Debate/engine", "OneDrive-adessoGroup"],
      ["/Users/v/OneDrive - adesso/Debate/engine", "OneDrive - adesso"],
      ["/Users/v/onedrive/engine", "onedrive"],
      ["/Users/v/Nextcloud/engine", "Nextcloud"],
      ["/Users/v/Proton Drive/v/engine", "Proton Drive"],
      ["/Users/v/pCloud Drive/engine", "pCloud Drive"],
      ["/Users/v/MEGAsync/engine", "MEGAsync"],
      ["/Users/v/MEGA/engine", "MEGA"],
      ["/Users/v/Box Sync/engine", "Box Sync"],
      ["/Users/v/Google Drive/My Drive/engine", "Google Drive"],
      ["/Users/v/Box/engine", "Box"],
      ["/Users/v/Dropbox/engine", "Dropbox"],
      ["/Users/v/iCloud Drive/engine", "iCloud Drive"],
      ["/Users/v/Library/CloudStorage/OneDrive-Corp/engine", "Library/CloudStorage"],
      ["/Users/v/Library/Mobile Documents/com~apple~CloudDocs/engine", "Library/Mobile Documents"]
    ];
    for (const [root, segment] of refused) {
      const error = capture(() => resolveDevCustodyRoot(root, {}));
      expect(error.code, root).toBe(CLOUD_SYNCED_CODE);
      expect(error.message, root).toContain(`(${segment})`);
    }
    for (const root of ["/Users/v/src/engine", "/Users/v/megan/engine", "/Users/v/boxes/engine"]) {
      expect(resolveDevCustodyRoot(root, {}), root).toBe(`${root}/.local/dev-auth`);
    }
  });

  it("refuses a cloud-synced override even when the repository is private", () => {
    const error = capture(() => resolveDevCustodyRoot("/Users/v/src/engine", {
      [DEV_CUSTODY_ROOT_ENV]: "/Users/v/Dropbox/keys"
    }));
    expect(error.code).toBe(CLOUD_SYNCED_CODE);
  });

  it("names the variable and a suggestion under the real home directory in the exact refusal message", () => {
    const error = capture(() => resolveDevCustodyRoot("/Users/v/OneDrive-adessoGroup/Debate/engine", {}));
    expect(error.message).toBe(
      "DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED: dev key custody must not live in a cloud-synced folder "
      + "(OneDrive-adessoGroup). Set DEBATEAI_DEV_CUSTODY_ROOT to a private absolute path, "
      + `e.g. ${homedir()}/.debateai/dev-auth; the repository itself may stay synced.`
    );
  });

  it("canonicalises through symlinks before matching, even when the leaf does not exist yet", async () => {
    const root = await temporaryRoot();
    const synced = join(root, "Library", "CloudStorage", "OneDrive-Test");
    await mkdir(join(synced, "engine"), { recursive: true });
    await symlink(synced, join(root, "link"));
    const linkedRepository = join(root, "link", "engine");
    expect(capture(() => resolveDevCustodyRoot(linkedRepository, {})).code).toBe(CLOUD_SYNCED_CODE);
    expect(capture(() => resolveDevCustodyRoot(join(root, "plain"), {
      [DEV_CUSTODY_ROOT_ENV]: join(root, "link", "custody")
    })).code).toBe(CLOUD_SYNCED_CODE);
  });

  it("returns the caller's path, not its realpath, so symlink refusals downstream keep working", async () => {
    const root = await temporaryRoot();
    expect(resolveDevCustodyRoot(join(root, "engine"), {}))
      .toBe(join(root, "engine", ".local", "dev-auth"));
  });

  it("is the only place that spells the custody path", async () => {
    const sources = [
      "apps/runner/src/dev-secret-files.ts",
      "apps/runner/src/dev-hatchet-token.ts",
      "apps/runner/src/dev-api-environment.ts",
      "apps/runner/src/dev-api-process.ts",
      "apps/runner/src/dev-auth-data-plane.ts",
      "apps/runner/src/dev-database-principals-cli.ts",
      "deploy/dev-auth/tls-front-door.mjs",
      "deploy/dev-auth/create-local-certificate.mjs"
    ];
    const spellsThePath = /["'`]\.local["'`/]|\.local\/dev-auth|["'`]dev-auth["'`]\s*\)/;
    const importsTheResolver =
      /import\s*\{[^}]*\bresolveDevCustodyRoot\b[^}]*\}\s*from\s*"[^"]*custody-root\.mjs"/;
    const violations: string[] = [];
    for (const source of sources) {
      const text = await readFile(join(REPOSITORY_ROOT, source), "utf8");
      if (spellsThePath.test(text)) violations.push(`${source}: spells the custody path`);
      if (!importsTheResolver.test(text)) violations.push(`${source}: does not import resolveDevCustodyRoot`);
    }
    expect(violations).toEqual([]);
  });

  it("owns the exact-0700 parent-directory custody policy and never repairs it (L7-F10)", async () => {
    const root = await temporaryRoot();
    const localRoot = join(root, ".local");
    const custodyRoot = join(localRoot, "dev-auth");
    await mkdir(custodyRoot, { recursive: true, mode: 0o700 });
    await chmod(localRoot, 0o700);
    await chmod(custodyRoot, 0o700);
    await expect(assertDevCustodyRootCustody(custodyRoot)).resolves.toBeUndefined();

    // A permissive parent used to pass generate-secrets and fail much later.
    await chmod(localRoot, 0o755);
    await expect(assertDevCustodyRootCustody(custodyRoot)).rejects.toMatchObject({
      name: "DevCustodyRootError",
      code: "DEV_AUTH_CUSTODY_ROOT_INVALID"
    });
    expect((await lstat(localRoot)).mode & 0o777).toBe(0o755);

    await chmod(localRoot, 0o700);
    await chmod(custodyRoot, 0o750);
    await expect(assertDevCustodyRootCustody(custodyRoot)).rejects.toMatchObject({
      code: "DEV_AUTH_CUSTODY_ROOT_INVALID"
    });
    // The drift is an exposure event, so it must still be observable.
    expect((await lstat(custodyRoot)).mode & 0o777).toBe(0o750);

    // The single-directory arm carries the same no-repair policy for callers
    // that are handed a path rather than the custody root.
    await expect(assertDevCustodyDirectory(custodyRoot)).rejects.toMatchObject({
      code: "DEV_AUTH_CUSTODY_ROOT_INVALID"
    });
    await chmod(custodyRoot, 0o700);
    await expect(assertDevCustodyDirectory(custodyRoot)).resolves.toBeUndefined();
  });

  it("is the single custody-mode authority: no command repairs a drifted mode (L7-F10)", async () => {
    // The token command owns a real custody root, so it asserts the root and its
    // parent. The principals command is handed an arbitrary credential path, so
    // it asserts that one directory. Neither spells the policy itself any more.
    const sources: ReadonlyArray<readonly [file: string, helper: string]> = [
      ["apps/runner/src/dev-database-principals.ts", "assertDevCustodyDirectory"],
      ["apps/runner/src/dev-hatchet-token.ts", "assertDevCustodyRootCustody"]
    ];
    for (const [source, helper] of sources) {
      const text = await readFile(join(REPOSITORY_ROOT, source), "utf8");
      expect(text, source).toContain(helper);
      expect(text, source).not.toMatch(/\bchmod\(\s*(?:credentialRoot|resolvedPath)/u);
    }
  });

  it("forwards the override to every child through the allow-listed command environment", async () => {
    vi.stubEnv(DEV_CUSTODY_ROOT_ENV, "/Users/v/.debateai/dev-auth");
    expect(loadDevelopmentCommandEnvironment()[DEV_CUSTODY_ROOT_ENV]).toBe("/Users/v/.debateai/dev-auth");
    vi.stubEnv(DEV_CUSTODY_ROOT_ENV, "");
    expect(() => loadDevelopmentCommandEnvironment()).toThrow(/DEBATEAI_DEV_CUSTODY_ROOT/);
    const launchers: ReadonlyArray<readonly [file: string, spread: string]> = [
      ["apps/runner/src/dev-api-process.ts", "...input.commandEnvironment"],
      ["apps/runner/src/dev-ui-process.ts", "...input.commandEnvironment"],
      ["apps/runner/src/dev-runner-process.ts", "...commandEnvironment"],
      ["apps/runner/src/dev-auth-data-plane.ts", "...input.baseEnvironment"]
    ];
    for (const [file, spread] of launchers) {
      expect(await readFile(join(REPOSITORY_ROOT, file), "utf8"), file).toContain(spread);
    }
  });
});

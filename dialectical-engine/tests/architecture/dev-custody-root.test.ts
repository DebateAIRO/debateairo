import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadDevelopmentCommandEnvironment } from "@debateai/register";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevCustodyDirectory,
  assertDevCustodyRootCustody,
  DEV_CUSTODY_ROOT_ENV,
  DevCustodyRootError,
  ensureDevCustodyDirectory,
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

  // DEV-SYNC 2026-09-18 (DL7-F4): this row used to walk a FIXED list of eight files, which is
  // exactly why fourteen sites written after the 2026-09-02 audit — the support CLIs, the
  // observation agent, the deployment-register receipt path — spelled the custody path again
  // without anyone noticing. It now DISCOVERS every shipped source under apps/, deploy/ and
  // packages/: whoever spells the path must be the resolver, and everyone else must ask it.
  it("is the only place that spells the custody path (discovered, not listed)", async () => {
    // The custody TREE specifically — `.local/dev-auth` however it is spelled, including the
    // join(…, ".local", "dev-auth") form. Deliberately NOT a bare `.local`: ~/.local/bin and
    // ~/.local/state are ordinary XDG locations and a different finding (DL6-F4, DL7-F5).
    const spellsThePath = /\.local["'`]?\s*[,/]\s*["'`]?\s*dev-auth/;
    const importsTheResolver = /\bresolveDevCustodyRoot\b/;
    const roots = ["apps", "deploy", "packages"];
    const skip = new Set(["node_modules", ".next", "dist", "coverage", "generated"]);
    const sources: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(join(REPOSITORY_ROOT, directory), { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const relative = `${directory}/${entry.name}`;
        if (entry.isDirectory()) { await walk(relative); continue; }
        if (/\.(ts|tsx|mjs|js|sh)$/.test(entry.name) && !/\.test\.|\.source-test\./.test(entry.name)) {
          sources.push(relative);
        }
      }
    };
    for (const root of roots) await walk(root);
    expect(sources.length).toBeGreaterThan(200);

    // A file may NAME the custody location only if it also HONOURS the override — a
    // configured-contract value compared literally, or a shell default, is fine as long as
    // the same file asks. What this row forbids is the class that produced fourteen sites:
    // building a custody path out of the literal and never consulting the resolver at all.
    // A shell script cannot import a JavaScript resolver, so it honours the variable itself.
    const honoursTheOverride = /\bresolveDevCustodyRoot\b|\bDEBATEAI_DEV_CUSTODY_ROOT\b/;
    const violations: string[] = [];
    for (const source of sources) {
      if (source.endsWith("deploy/dev-auth/custody-root.mjs")) continue;
      const text = await readFile(join(REPOSITORY_ROOT, source), "utf8");
      if (!spellsThePath.test(text)) continue;
      if (honoursTheOverride.test(text)) continue;
      violations.push(`${source}: spells the custody path and never asks resolveDevCustodyRoot`);
    }
    expect(violations).toEqual([]);

    // The eight launchers the 2026-09-02 audit named must still ASK the resolver, not merely
    // avoid the literal: a launcher that stopped calling it would place custody somewhere else.
    for (const source of [
      "apps/runner/src/dev-secret-files.ts",
      "apps/runner/src/dev-hatchet-token.ts",
      "apps/runner/src/dev-api-environment.ts",
      "apps/runner/src/dev-api-process.ts",
      "apps/runner/src/dev-auth-data-plane.ts",
      "apps/runner/src/dev-database-principals-cli.ts",
      "deploy/dev-auth/tls-front-door.mjs",
      "deploy/dev-auth/create-local-certificate.mjs"
    ]) {
      expect(importsTheResolver.test(await readFile(join(REPOSITORY_ROOT, source), "utf8")), source).toBe(true);
    }
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

  // V-21(c), 2026-09-22: the token and principals commands already delegated, but three dev
  // launchers still spelled "a real directory you own, at exactly 0700" for themselves —
  // kept under the single-line edit rule when L7-F10 landed. Three copies of one refusal are
  // three chances to drift apart, and the drift would be invisible: each copy has its own
  // typed code, so a weakened copy still refuses convincingly. The rule now lives in one
  // place; a launcher keeps only the code it reports.
  it("leaves no second copy of the directory-custody rule in the dev launchers (V-21c)", async () => {
    // The 0600 FILE rule is a different policy (size, link count, per-file bounds) and
    // deliberately stays with the command that owns the file; only the DIRECTORY rule moves.
    const spellsTheDirectoryRule = /PRIVATE_DIRECTORY_MODE|0o700|isDirectory\(\)/u;
    const delegates = /\bassert(?:DevCustodyDirectory|DevCustodyRootCustody)\b|\bensureDevCustodyDirectory\b/u;
    for (const source of [
      "apps/runner/src/dev-api-environment.ts",
      "apps/runner/src/dev-api-process.ts",
      "apps/runner/src/dev-secret-files.ts"
    ]) {
      const text = await readFile(join(REPOSITORY_ROOT, source), "utf8");
      expect(text, `${source} must ask the shared custody helper`).toMatch(delegates);
      expect(text, `${source} must not spell the 0700 directory rule again`)
        .not.toMatch(spellsTheDirectoryRule);
    }
  });

  // The secret generator creates the custody tree before it checks it, so the create arm
  // belongs to the same authority: one mkdir mode, one refusal, and still no repair.
  it("creates a missing custody directory at 0700 and refuses a drifted or symlinked one (V-21c)", async () => {
    const root = await temporaryRoot();
    const created = join(root, "custody");
    await ensureDevCustodyDirectory(created);
    expect((await lstat(created)).mode & 0o777).toBe(0o700);

    // Idempotent: a second call accepts the directory it made.
    await expect(ensureDevCustodyDirectory(created)).resolves.toBeUndefined();

    await chmod(created, 0o750);
    await expect(ensureDevCustodyDirectory(created)).rejects.toMatchObject({
      name: "DevCustodyRootError",
      code: "DEV_AUTH_CUSTODY_ROOT_INVALID"
    });
    expect((await lstat(created)).mode & 0o777).toBe(0o750);

    const escape = join(root, "escape");
    await mkdir(escape, { mode: 0o700 });
    const linked = join(root, "linked");
    await symlink(escape, linked);
    await expect(ensureDevCustodyDirectory(linked)).rejects.toMatchObject({
      code: "DEV_AUTH_CUSTODY_ROOT_INVALID"
    });
    expect(await readdir(escape)).toEqual([]);
  });

  // V-21c review (minor 3): the arm this replaced re-threw the filesystem error itself, so a
  // permission problem was distinguishable from a mode problem. A typed refusal that discards
  // the errno turns "you cannot write here" into the same sentence as "the mode drifted".
  it("keeps the errno of a failed create as the refusal's cause (V-21c)", async () => {
    const root = await temporaryRoot();
    const locked = join(root, "locked");
    await mkdir(locked, { mode: 0o500 });
    try {
      const error: unknown = await ensureDevCustodyDirectory(join(locked, "child"))
        .then(() => undefined, (reason: unknown) => reason);
      expect(error).toMatchObject({
        name: "DevCustodyRootError",
        code: "DEV_AUTH_CUSTODY_ROOT_INVALID"
      });
      expect((error as { cause?: NodeJS.ErrnoException }).cause?.code).toBe("EACCES");
    } finally {
      await chmod(locked, 0o700);
    }
  });

  // V-21a review (Important 1): the compose project owns the volume (`name: debateai-v3`,
  // `volumes: postgres-data`), so moving the custody root does NOT move the database. A new
  // root generates a new superuser password while the volume keeps the old one — and
  // POSTGRES_PASSWORD is honoured at first initdb only, so the stack starts and then migrate
  // fails with a bare DEV_AUTH_DATA_PLANE_MIGRATION_FAILED: the data plane counts the child's
  // stderr but never retains it, so "password authentication failed" is never printed. The
  // README must say so where both halves of the trap are read.
  it("warns that changing the custody root while a volume exists needs a rebuild (V-21a)", async () => {
    const readme = await readFile(join(REPOSITORY_ROOT, "deploy/dev-auth/README.md"), "utf8");
    const section = (heading: string): string => {
      const start = readme.indexOf(`\n## ${heading}\n`);
      expect(start, heading).toBeGreaterThan(-1);
      const rest = readme.slice(start + 1);
      const end = rest.indexOf("\n## ", 1);
      return end === -1 ? rest : rest.slice(0, end);
    };
    const upgrade = section("Upgrading an existing dev stack");
    // Not merely "the variable appears" — the compose commands in that section already spell
    // it. The REASON must be there: changing the root is itself a cause of the rebuild.
    expect(upgrade, "states changing the root as a reason, not just as a shell default")
      .toMatch(new RegExp(`[Cc]hanging \`?${DEV_CUSTODY_ROOT_ENV}\`?`, "u"));
    expect(upgrade, "gives the rebuild remedy").toContain("down -v");
    expect(upgrade, "names the bare failure the owner will actually see")
      .toContain("DEV_AUTH_DATA_PLANE_MIGRATION_FAILED");
    expect(section("Moving to a new machine"), "cross-references the rebuild")
      .toContain("Upgrading an existing dev stack");
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

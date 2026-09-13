/**
 * REV-S03-p1-security-data-safety — probes G and H: key custody, and the restart check's blast radius.
 * Scratch mkdtemp roots, this seat's own fake key values only. The repository's .local/** is never read.
 * Temporary: deleted before the seat's handoff.
 */
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, chmod, symlink, link, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { readProviderKeys } from "../../apps/runner/src/dev-provider-keys.js";
import { startDevelopmentAuthStack } from "../../apps/runner/src/dev-auth-stack.js";

const FAKE_VALUE = "sk-FAKE-rev-s03-p1-security-DO-NOT-USE";

async function custodyRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rev-s03-p1-custody-"));
  await mkdir(join(root, ".local"), { mode: 0o700 });
  await chmod(join(root, ".local"), 0o700);
  await mkdir(join(root, ".local", "dev-auth"), { mode: 0o700 });
  await chmod(join(root, ".local", "dev-auth"), 0o700);
  return root;
}

async function writeKeys(root: string, body: string, mode: number): Promise<string> {
  const path = join(root, ".local", "dev-auth", "provider-keys.env");
  await writeFile(path, body, { mode });
  await chmod(path, mode);
  return path;
}

async function attempt(root: string): Promise<string> {
  try {
    const keys = await readProviderKeys(root);
    return `OK ${JSON.stringify([...keys.entries()])}`;
  } catch (error) {
    return `THROW ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("PROBE G — provider-key custody matrix", () => {
  it("records what each file and directory mode does", async () => {
    const body = `OPENAI_API_KEY=${FAKE_VALUE}\n`;
    const results: Record<string, string> = {};

    for (const mode of [0o600, 0o400, 0o640, 0o644, 0o666, 0o700]) {
      const root = await custodyRoot();
      await writeKeys(root, body, mode);
      results[`file mode ${mode.toString(8)}`] = await attempt(root);
    }

    for (const mode of [0o700, 0o750, 0o755, 0o770]) {
      const root = await custodyRoot();
      await chmod(join(root, ".local", "dev-auth"), mode);
      await writeKeys(root, body, 0o600);
      results[`dir mode ${mode.toString(8)}`] = await attempt(root);
    }

    // Missing custody root.
    const bare = await mkdtemp(join(tmpdir(), "rev-s03-p1-custody-bare-"));
    results["custody root absent"] = await attempt(bare);

    // Symlinked leaf: the key file is a link to a file outside custody.
    const symRoot = await custodyRoot();
    const outside = join(symRoot, "outside.env");
    await writeFile(outside, body, { mode: 0o600 });
    await symlink(outside, join(symRoot, ".local", "dev-auth", "provider-keys.env"));
    results["leaf is a symlink"] = await attempt(symRoot);

    // Hard link: a second name for the same inode.
    const linkRoot = await custodyRoot();
    const real = join(linkRoot, ".local", "dev-auth", "provider-keys.env");
    await writeKeys(linkRoot, body, 0o600);
    await link(real, join(linkRoot, "second-name.env"));
    results["leaf has two links"] = await attempt(linkRoot);

    // ATTACK: the PARENT .local is a symlink; only the leaf directory is lstat'ed.
    const parentRoot = await mkdtemp(join(tmpdir(), "rev-s03-p1-custody-parent-"));
    const elsewhere = await mkdtemp(join(tmpdir(), "rev-s03-p1-elsewhere-"));
    await mkdir(join(elsewhere, "dev-auth"), { mode: 0o700 });
    await chmod(join(elsewhere, "dev-auth"), 0o700);
    await writeFile(join(elsewhere, "dev-auth", "provider-keys.env"), body, { mode: 0o600 });
    await chmod(join(elsewhere, "dev-auth", "provider-keys.env"), 0o600);
    await symlink(elsewhere, join(parentRoot, ".local"));
    results["parent .local is a symlink"] = await attempt(parentRoot);

    // eslint-disable-next-line no-console
    console.log(`CUSTODY_MATRIX=${JSON.stringify(results, null, 1)}`);
    expect(Object.keys(results).length).toBe(14);
  }, 60_000);

  it("records how a value is carried, verbatim", async () => {
    const root = await custodyRoot();
    await writeKeys(
      root,
      [
        `QUOTED_KEY="${FAKE_VALUE}"`,
        `SPACED_KEY=  ${FAKE_VALUE}  `,
        `EQUALS_KEY=${FAKE_VALUE}=extra=parts`,
        "# a comment",
        "",
        `EMPTY_KEY=`
      ].join("\n") + "\n",
      0o600
    );
    const outcome = await attempt(root);
    // eslint-disable-next-line no-console
    console.log(`VALUE_CARRIAGE=${outcome}`);
    expect(outcome.startsWith("OK")).toBe(true);
  });

  it("never puts a key value in the error it throws", async () => {
    const root = await custodyRoot();
    await writeKeys(root, `not-an-env-line ${FAKE_VALUE}\n`, 0o600);
    const outcome = await attempt(root);
    // eslint-disable-next-line no-console
    console.log(`MALFORMED_LINE=${outcome}`);
    expect(outcome).not.toContain(FAKE_VALUE);
  });
});

describe("PROBE H — a refused restart check touches nothing", () => {
  it("leaves api.env's digest unchanged and opens no later stage", async () => {
    const root = await custodyRoot();
    const apiEnvPath = join(root, ".local", "dev-auth", "api.env");
    await writeFile(apiEnvPath, "REGISTER_VERSION=5\n", { mode: 0o600 });
    await chmod(apiEnvPath, 0o600);
    const digest = async (): Promise<string> =>
      createHash("sha256").update(await readFile(apiEnvPath)).digest("hex");
    const before = await digest();

    const touched: string[] = [];
    const stage = (name: string) => async (): Promise<never> => {
      touched.push(name);
      throw new Error(`STAGE_${name}_MUST_NOT_RUN`);
    };
    let code = "NO_THROW";
    try {
      await startDevelopmentAuthStack({
        checkModelConfig: async () => {
          throw new TypeError("MODEL_CONFIG_BASE_URL_INVALID: base_url must be an HTTPS URL");
        },
        isPublicPortOccupied: stage("isPublicPortOccupied") as never,
        startProviderPanel: stage("startProviderPanel") as never,
        startSupportModelRelay: stage("startSupportModelRelay") as never,
        startDataPlane: stage("startDataPlane") as never,
        provisionHatchetToken: stage("provisionHatchetToken") as never,
        assembleApiEnvironment: stage("assembleApiEnvironment") as never,
        startApi: stage("startApi") as never,
        startRunner: stage("startRunner") as never,
        startUi: stage("startUi") as never,
        startTls: stage("startTls") as never
      });
    } catch (error) {
      code = error instanceof Error ? error.message : String(error);
    }
    const after = await digest();
    // eslint-disable-next-line no-console
    console.log(`RESTART_REFUSAL code=${code} touched=${JSON.stringify(touched)} digestBefore=${before} digestAfter=${after} same=${String(before === after)}`);
    expect(touched).toEqual([]);
    expect(before).toBe(after);
    await rm(root, { recursive: true, force: true });
  });
});

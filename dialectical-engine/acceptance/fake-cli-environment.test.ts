import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

/**
 * W6 (SECURITY). Six acceptance fixtures echo their child environment back as
 * model content or to a file on disk, and that content is persisted to
 * `ledger.raw_artifact`. Each must project the environment through an EXPLICIT
 * allow-list: a variable the product admits and an assertion names IS echoed;
 * anything unnamed is NOT.
 *
 * This file is the only guard that can see the defect. The emitted content is
 * opaque to every other gate in the tree — typecheck, lint and the relay suites
 * all pass over a fixture that serialises `process.env` in full — so only an
 * assertion about what the fixture EMITS can catch an unnamed variable.
 *
 * Every case pairs the D71 boundary assertions in ONE emitted payload:
 *   admitted — a named variable is echoed with its exact value;
 *   rejected — the canary, which no allow-list names, is absent.
 * The admitted half is also the vacuous-green guard: a probe that spawned the
 * wrong script, or extracted nothing, cannot satisfy it.
 */
const CANARY_KEY = "W6_CANARY_SECRET";
const CANARY_VALUE = "canary-9c1e";

/**
 * FIX ROUND 1, F3. Projecting over an allow-list cost the consumers' exact-set
 * assertions the ability to see a key `buildCliChildEnvironment` wrongly admits:
 * they can now only catch keys the fixture NAMES. Every member therefore also
 * emits the full sorted list of its environment's key NAMES. A key name is not a
 * credential; a key value is. So the reach comes back at zero risk — a wrongly
 * admitted key is caught by NAME while its VALUE is still never echoed unless
 * the allow-list carries it.
 *
 * This canary's name is deliberately NOT credential-shaped, so it exercises the
 * names list independently of the digest rule below.
 */
const UNLISTED_KEY = "W6_UNLISTED_CANARY";
const UNLISTED_VALUE = "canary-b7d3";

const execFileAsync = promisify(execFile);

const acceptanceFile = (name: string): string =>
  fileURLToPath(new URL(`./${name}`, import.meta.url));
const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./test-fixtures/${name}`, import.meta.url));

const scratchDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    scratchDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

async function scratchDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  scratchDirectories.push(directory);
  return directory;
}

/**
 * Spawn a fixture under an environment this test OWNS outright. `execFile`'s
 * `env` REPLACES the parent environment rather than extending it, so no ambient
 * variable — and therefore no real credential — can reach the child or appear in
 * a failure frame. The canaries are the only secret-shaped strings in this file.
 */
async function emit(
  binaryArguments: readonly string[],
  environment: Readonly<Record<string, string>>,
  cwd: string = tmpdir()
): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [...binaryArguments], {
    cwd,
    env: { ...environment, [CANARY_KEY]: CANARY_VALUE, [UNLISTED_KEY]: UNLISTED_VALUE }
  });
  return stdout;
}

/**
 * The F3 boundary, asserted on every member: an unnamed key is visible by NAME
 * and invisible by VALUE. `emitted` is the raw text the member produced — stdout
 * for five members, the written file for `relay-core`.
 */
function expectUnlistedKeyVisibleByNameOnly(echo: Echo, emitted: string): void {
  // Labelled so the RED frame names the owed emission. Without it the first
  // failure is `toContain` complaining that it was handed `undefined` — a
  // MISSING-SYMBOL red that describes the assertion's plumbing rather than the
  // defect (TOOLING-TRAPS `:5161`).
  expect(echo.environmentKeyNames, "member must emit environmentKeyNames (F3)").toBeInstanceOf(Array);
  expect(echo.environmentKeyNames).toContain(UNLISTED_KEY);
  expect(echo.environment[UNLISTED_KEY]).toBeUndefined();
  expect(emitted).not.toContain(UNLISTED_VALUE);
}

/**
 * Three of the six members are generated INSIDE a test file as an array of
 * string pieces and are not importable, so each is read out of its own file's
 * source and run — the product's own script, never a copy of it (`:2051`).
 *
 * The region is evaluated rather than pattern-matched because the three differ
 * in shape: double-quoted literals (`adversarial-corpus`), single-quoted
 * literals containing double quotes (`model-shim`), and a TEMPLATE LITERAL with
 * an interpolation (`relay-core`). A quote-aware regex handles the first two and
 * cannot handle the third at all; evaluating the array expression with its free
 * identifiers bound handles all three identically. The input is a file in this
 * repository, read from disk, in a test.
 *
 * A region that moved or was renamed throws here instead of silently probing
 * nothing, and every caller additionally asserts an admitted key came back — a
 * mis-sliced region cannot produce that.
 */
function inlineScript(
  filePath: string,
  constantName: string,
  bindings: Readonly<Record<string, string>> = {}
): string {
  const source = readFileSync(filePath, "utf8");
  const opening = `const ${constantName} = [`;
  const start = source.indexOf(opening);
  if (start < 0) throw new Error(`W6_INLINE_REGION_MISSING:${constantName}`);
  const end = source.indexOf("].join(", start);
  if (end < 0) throw new Error(`W6_INLINE_REGION_UNTERMINATED:${constantName}`);
  const names = Object.keys(bindings);
  const build = new Function(
    ...names,
    `return [${source.slice(start + opening.length, end)}].join("");`
  ) as (...values: string[]) => string;
  const script = build(...names.map((name) => bindings[name]!));
  if (script.length === 0) throw new Error(`W6_INLINE_REGION_EMPTY:${constantName}`);
  return script;
}

interface Echo {
  readonly environment: Readonly<Record<string, string>>;
  readonly environmentKeyNames: readonly string[];
}

describe("W6 fake-CLI fixtures echo allow-listed variables only", () => {
  it("fake-claude-cli.mjs echoes the admitted maker locator and not the unnamed canary", async () => {
    const stdout = await emit([fixturePath("fake-claude-cli.mjs"), "-p", "W6 allow-list probe"], {
      ANTHROPIC_API_KEY: "w6-admitted-anthropic-locator",
      HOME: "/tmp/w6-claude-home",
      PATH: "/usr/bin:/bin"
    });
    const envelope = JSON.parse(stdout) as { readonly result: string };
    const echo = JSON.parse(envelope.result) as Echo;

    expect(echo.environment.ANTHROPIC_API_KEY).toBe("w6-admitted-anthropic-locator");
    expect(echo.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
    expectUnlistedKeyVisibleByNameOnly(echo, stdout);
  });

  it("fake-grok-cli.mjs echoes the admitted maker locator and not the unnamed canary", async () => {
    const stdout = await emit([fixturePath("fake-grok-cli.mjs"), "--single", "W6 allow-list probe"], {
      HOME: "/tmp/w6-grok-home",
      PATH: "/usr/bin:/bin",
      XAI_API_KEY: "w6-admitted-xai-locator"
    });
    const envelope = JSON.parse(stdout) as { readonly text: string };
    const echo = JSON.parse(envelope.text) as Echo;

    expect(echo.environment.XAI_API_KEY).toBe("w6-admitted-xai-locator");
    expect(echo.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
    expectUnlistedKeyVisibleByNameOnly(echo, stdout);
  });

  it("fake-hermes-cli.mjs echoes the admitted maker locator and not the unnamed canary", async () => {
    const hermesHome = await scratchDirectory("w6-hermes-home-");
    const stdout = await emit([fixturePath("fake-hermes-cli.mjs"), "-z", "W6 allow-list probe"], {
      GLM_API_KEY: "w6-admitted-glm-locator",
      HERMES_HOME: hermesHome,
      HOME: hermesHome,
      PATH: "/usr/bin:/bin"
    });
    const echo = JSON.parse(stdout) as Echo;

    expect(echo.environment.GLM_API_KEY).toBe("w6-admitted-glm-locator");
    expect(echo.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
    expectUnlistedKeyVisibleByNameOnly(echo, stdout);
  });

  it("the adversarial-corpus inline fixture echoes the admitted maker locator and not the unnamed canary", async () => {
    const stdout = await emit(
      ["-e", inlineScript(acceptanceFile("adversarial-corpus.test.ts"), "fixtureScript"), "--", "W6 allow-list probe"],
      {
        HOME: "/tmp/w6-corpus-home",
        P4_ALLOWED_MAKER_KEY: "w6-admitted-maker-locator",
        PATH: "/usr/bin:/bin"
      }
    );
    const observation = JSON.parse(stdout) as Echo;

    expect(observation.environment.P4_ALLOWED_MAKER_KEY).toBe("w6-admitted-maker-locator");
    expect(observation.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
    expectUnlistedKeyVisibleByNameOnly(observation, stdout);
  });

  // FIX ROUND 1, F1: the fifth member of the class. Its payload becomes the model
  // shim's reply content, the same persistence path as the four above.
  it("the model-shim inline probe echoes the admitted locator and not the unnamed canary", async () => {
    const cwd = await scratchDirectory("w6-model-shim-cwd-");
    const stdout = await emit(
      ["-e", inlineScript(acceptanceFile("model-shim.test.ts"), "probeScript"), "--"],
      {
        CODEX_HOME: "/tmp/w6-admitted-codex-home",
        HOME: "/tmp/w6-shim-home",
        PATH: "/usr/bin:/bin"
      },
      cwd
    );
    const lines = stdout.trim().split("\n");
    const completed = JSON.parse(lines[lines.length - 1]!) as {
      readonly item: { readonly text: string };
    };
    const probe = JSON.parse(completed.item.text) as Echo;

    expect(probe.environment.CODEX_HOME).toBe("/tmp/w6-admitted-codex-home");
    expect(probe.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
    expectUnlistedKeyVisibleByNameOnly(probe, stdout);
  });

  // FIX ROUND 1, F2: the sixth member. It writes its observation to a FILE under
  // mkdtemp rather than into model content, so the probe reads the file back —
  // real values on disk are the same class of leak.
  it("the relay-core inline fixture writes an allow-listed environment to its file, not the canary", async () => {
    const directory = await scratchDirectory("w6-relay-core-");
    const childObservation = join(directory, "child.json");
    const stdout = await emit(
      [
        "-e",
        inlineScript(acceptanceFile("relay-core.test.ts"), "script", { childObservation })
      ],
      { HOME: "/tmp/w6-admitted-relay-home", PATH: "/usr/bin:/bin" }
    );
    const written = await readFile(childObservation, "utf8");
    const observation = JSON.parse(written) as Echo;

    expect(stdout).toBe("OK");
    expect(observation.environment.HOME).toBe("/tmp/w6-admitted-relay-home");
    expect(observation.environment[CANARY_KEY]).toBeUndefined();
    expect(written).not.toContain(CANARY_VALUE);
    expectUnlistedKeyVisibleByNameOnly(observation, written);
  });
});

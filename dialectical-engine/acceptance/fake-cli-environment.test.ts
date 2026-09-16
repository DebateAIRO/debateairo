import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

/**
 * W6 (SECURITY). Four acceptance fixtures echo their child environment back as
 * model content, and that content is persisted to `ledger.raw_artifact`. Each
 * must project the environment through an EXPLICIT allow-list: a variable the
 * product admits and an assertion names IS echoed; anything unnamed is NOT.
 *
 * This file is the only guard that can see the defect. The emitted content is
 * opaque to every other gate in the tree — typecheck, lint and the relay suites
 * all pass over a fixture that serialises `process.env` in full — so only an
 * assertion about what the fixture EMITS can catch an unnamed variable.
 *
 * Every case pairs the two D71 boundary assertions in ONE emitted payload:
 *   admitted — a named variable is echoed with its exact value;
 *   rejected — the canary, which no allow-list names, is absent.
 * The admitted half is also the vacuous-green guard: a probe that spawned the
 * wrong script, or extracted nothing, cannot satisfy it.
 */
const CANARY_KEY = "W6_CANARY_SECRET";
const CANARY_VALUE = "canary-9c1e";

const execFileAsync = promisify(execFile);

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./test-fixtures/${name}`, import.meta.url));
const adversarialCorpusTestPath = fileURLToPath(
  new URL("./adversarial-corpus.test.ts", import.meta.url)
);

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
 * a failure frame. The canary is the only secret-shaped string in this file.
 */
async function emit(
  binaryArguments: readonly string[],
  environment: Readonly<Record<string, string>>
): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [...binaryArguments], {
    cwd: tmpdir(),
    env: { ...environment, [CANARY_KEY]: CANARY_VALUE }
  });
  return stdout;
}

/**
 * The fourth member of the class is generated INSIDE `adversarial-corpus.test.ts`
 * and is not importable, so it is read out of that file's source and run — the
 * product's own script, never a copy of it. A region that moved or was renamed
 * throws here instead of silently probing nothing.
 */
function inlineCorpusFixtureScript(): string {
  const source = readFileSync(adversarialCorpusTestPath, "utf8");
  const opening = "const fixtureScript = [";
  const start = source.indexOf(opening);
  if (start < 0) throw new Error("W6_INLINE_FIXTURE_REGION_MISSING");
  const end = source.indexOf("].join(", start);
  if (end < 0) throw new Error("W6_INLINE_FIXTURE_REGION_UNTERMINATED");
  const literals = source.slice(start + opening.length, end).match(/"(?:[^"\\]|\\.)*"/gu) ?? [];
  if (literals.length === 0) throw new Error("W6_INLINE_FIXTURE_REGION_EMPTY");
  return literals.map((literal) => JSON.parse(literal) as string).join("");
}

describe("W6 fake-CLI fixtures echo allow-listed variables only", () => {
  it("fake-claude-cli.mjs echoes the admitted maker locator and not the unnamed canary", async () => {
    const stdout = await emit([fixturePath("fake-claude-cli.mjs"), "-p", "W6 allow-list probe"], {
      ANTHROPIC_API_KEY: "w6-admitted-anthropic-locator",
      HOME: "/tmp/w6-claude-home",
      PATH: "/usr/bin:/bin"
    });
    const envelope = JSON.parse(stdout) as { readonly result: string };
    const echo = JSON.parse(envelope.result) as {
      readonly environment: Readonly<Record<string, string>>;
    };

    expect(echo.environment.ANTHROPIC_API_KEY).toBe("w6-admitted-anthropic-locator");
    expect(echo.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
  });

  it("fake-grok-cli.mjs echoes the admitted maker locator and not the unnamed canary", async () => {
    const stdout = await emit([fixturePath("fake-grok-cli.mjs"), "--single", "W6 allow-list probe"], {
      HOME: "/tmp/w6-grok-home",
      PATH: "/usr/bin:/bin",
      XAI_API_KEY: "w6-admitted-xai-locator"
    });
    const envelope = JSON.parse(stdout) as { readonly text: string };
    const echo = JSON.parse(envelope.text) as {
      readonly environment: Readonly<Record<string, string>>;
    };

    expect(echo.environment.XAI_API_KEY).toBe("w6-admitted-xai-locator");
    expect(echo.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
  });

  it("fake-hermes-cli.mjs echoes the admitted maker locator and not the unnamed canary", async () => {
    const hermesHome = await scratchDirectory("w6-hermes-home-");
    const stdout = await emit([fixturePath("fake-hermes-cli.mjs"), "-z", "W6 allow-list probe"], {
      GLM_API_KEY: "w6-admitted-glm-locator",
      HERMES_HOME: hermesHome,
      HOME: hermesHome,
      PATH: "/usr/bin:/bin"
    });
    const echo = JSON.parse(stdout) as {
      readonly environment: Readonly<Record<string, string>>;
    };

    expect(echo.environment.GLM_API_KEY).toBe("w6-admitted-glm-locator");
    expect(echo.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
  });

  it("the adversarial-corpus inline fixture echoes the admitted maker locator and not the unnamed canary", async () => {
    const stdout = await emit(["-e", inlineCorpusFixtureScript(), "--", "W6 allow-list probe"], {
      HOME: "/tmp/w6-corpus-home",
      P4_ALLOWED_MAKER_KEY: "w6-admitted-maker-locator",
      PATH: "/usr/bin:/bin"
    });
    const observation = JSON.parse(stdout) as {
      readonly environment: Readonly<Record<string, string>>;
    };

    expect(observation.environment.P4_ALLOWED_MAKER_KEY).toBe("w6-admitted-maker-locator");
    expect(observation.environment[CANARY_KEY]).toBeUndefined();
    expect(stdout).not.toContain(CANARY_VALUE);
  });
});

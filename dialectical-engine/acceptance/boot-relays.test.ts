import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startBootRelays } from "./main.js";
import { ACCEPTANCE_CONFIGURED_PROVIDERS } from "./seed-register.js";

/**
 * F-GROK-SANDBOX-PROFILE fix round 1 / F1. `main.ts`'s standalone API boot is a
 * SECOND entry path that starts the relays, and before this round it did what
 * the ceremony did before the first round — worse, in fact: a rejected start
 * became `null` with no provider probe and no line on stdout, so the maker
 * simply vanished from `makerRelays` and the API served without it.
 *
 * The boot starts TWO relays, [claude, grok], while the configured provider set
 * is THREE, [codex, claude, grok]. That is why the announcer is keyed by
 * providerRef and not by array position: a positional announcer here would have
 * printed `MAKER ABSENT OpenAI CLAUDE_CLI_FAILED`, which is worse than silence.
 */
const temporaryDirectories: string[] = [];

/** A CLI double that exits nonzero however it is invoked, for both makers. */
async function failingCli(code: string): Promise<{ readonly binary: string; readonly prefixArguments: readonly string[] }> {
  const directory = await mkdtemp(join(tmpdir(), "boot-relay-double-"));
  temporaryDirectories.push(directory);
  const script = join(directory, "fail.mjs");
  await writeFile(script, `process.stderr.write(${JSON.stringify(`${code}\n`)});\nprocess.exit(1);\n`);
  return { binary: process.execPath, prefixArguments: [script] };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("FAIR-01 the standalone boot announces an absent maker before it serves", () => {
  it("prints one MAKER ABSENT line per rejected relay start, with the RIGHT maker", async () => {
    expect(
      typeof startBootRelays,
      "the standalone boot must announce a rejected relay start on stdout before the API serves (F-GROK-SANDBOX-PROFILE F1)"
    ).toBe("function");

    const emitted: string[] = [];
    const booted = await startBootRelays(ACCEPTANCE_CONFIGURED_PROVIDERS, {
      grokRelayPort: 0,
      timeoutMs: 2_000,
      testOnlyClaudeCommand: await failingCli("claude is not installed"),
      testOnlyGrokCommand: await failingCli("grok is not installed"),
      emit: (line) => { emitted.push(line); }
    });

    expect(booted.claudeRelay).toBeNull();
    expect(booted.grokRelay).toBeNull();
    // Anthropic and xAI — NOT OpenAI, which is `providers[0]` and would be the
    // answer for any implementation that indexes the provider list positionally.
    expect(emitted).toEqual([
      "MAKER ABSENT Anthropic CLAUDE_CLI_FAILED",
      "MAKER ABSENT xAI GROK_CLI_FAILED"
    ]);
    expect(booted.absent.map((entry) => entry.providerRef))
      .toEqual(["acceptance:claude-cli", "acceptance:grok-cli"]);
  });

  it("writes the boot's announcement to the process's real stdout when no sink is supplied", async () => {
    const original = process.stdout.write;
    const written: string[] = [];
    process.stdout.write = function patched(chunk: unknown, ...rest: readonly unknown[]): boolean {
      written.push(typeof chunk === "string" ? chunk : String(chunk));
      return (original as (...args: readonly unknown[]) => boolean).call(process.stdout, chunk, ...rest);
    } as typeof process.stdout.write;
    try {
      await startBootRelays(ACCEPTANCE_CONFIGURED_PROVIDERS, {
        grokRelayPort: 0,
        timeoutMs: 2_000,
        testOnlyClaudeCommand: await failingCli("claude is not installed"),
        testOnlyGrokCommand: await failingCli("grok is not installed")
      });
    } finally {
      process.stdout.write = original;
    }

    expect(written.join("")).toContain("MAKER ABSENT Anthropic CLAUDE_CLI_FAILED\n");
    expect(written.join("")).toContain("MAKER ABSENT xAI GROK_CLI_FAILED\n");
  });

  it("uses the ONE announcer in the tree, not a second copy of the line", async () => {
    // The boot and the ceremony must not drift into two shapes of the same
    // sentence. Both import the same module; neither owns a private literal.
    const [bootSource, ceremonySource] = await Promise.all([
      (await import("node:fs/promises")).readFile(new URL("./main.ts", import.meta.url), "utf8"),
      (await import("node:fs/promises")).readFile(new URL("./run-acceptance.ts", import.meta.url), "utf8")
    ]);

    expect(bootSource).toContain("announceAbsentMakers");
    expect(ceremonySource).toContain("announceAbsentMakers");
    expect(bootSource).not.toContain("MAKER ABSENT");
    expect(ceremonySource).not.toContain("MAKER ABSENT");
  });
});

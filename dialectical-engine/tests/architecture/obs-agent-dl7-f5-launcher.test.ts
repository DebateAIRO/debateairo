import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const LAUNCHER = "apps/observation-agent/bin/launch.sh";

/**
 * DL7-F5. The launchd launcher runs under KeepAlive with a 10 s throttle and
 * used to `exec node` by PATH lookup with `$HOME/.local/bin` first, from a zsh
 * shell. That is the exact shape of the 2026-09-17 incident on this Mac: a
 * shell that cannot EXECUTE a file reads it as a script instead, and a
 * launcher whose contents had been overwritten with plain text re-ran itself
 * until the process table was full. The discipline is the one already proven in
 * `.hermes/.../tools/closing-run.sh` (`is_program`) and recorded in
 * `docs/superpowers/plans/2026-09-17-relay-binaries-deduced.md`: deduce the
 * binary by NAME, then prove the resolved file is a program before exec, and
 * never hand a candidate to a shell to find out what it is.
 *
 * This is a source pin, not a run: nothing here executes the launcher.
 */
describe("DL7-F5 observation-agent launcher", () => {
  it("proves every candidate is a program before exec, by deduced name", async () => {
    const source = await readFile(LAUNCHER, "utf8");

    // Deduced by name through `command -v`, never a path written into the file.
    expect(source).toMatch(/\bcommand -v\b/u);
    expect(source).toMatch(/require_program node\b|command -v[^\n]*\bnode\b/u);
    expect(source).not.toMatch(/\/(?:bin|usr\/bin|usr\/local\/bin|opt\/homebrew\/bin)\/node\b/u);

    // The four-byte program header, read without executing the candidate.
    expect(source).toMatch(/head -c 4/u);
    for (const magic of ["2321", "cffaedfe", "feedfacf", "cafebabe", "7f454c46"]) {
      expect(source, magic).toContain(magic);
    }

    // Non-empty, a real file, executable — checked before the header read.
    expect(source).toMatch(/-s "/u);
    expect(source).toMatch(/-x "/u);

    // Loud typed refusals, never a silent fallback to something else.
    expect(source).toContain("OBSERVATION_RUNTIME_PATH_INVALID");
    expect(source).toContain("OBSERVATION_RUNTIME_NOT_A_PROGRAM");

    // The daemon execs `docker` by name off the PATH this launcher exports, so
    // that candidate is proven here too.
    expect(source).toMatch(/\bdocker\b/u);
  });

  it("execs the verified path and never through a shell fallback", async () => {
    const source = await readFile(LAUNCHER, "utf8");
    const execLines = source.split("\n").filter((line) => /^\s*exec\s/u.test(line));
    expect(execLines).toHaveLength(1);
    // The exec target is the variable holding the proven path, not a bare name
    // that the shell would look up (and, on ENOEXEC, re-run as a script).
    expect(execLines[0]).toMatch(/^\s*exec\s+"\$[A-Za-z_][A-Za-z0-9_]*"/u);
    expect(execLines[0]).not.toMatch(/^\s*exec\s+(?:node|docker|[a-z]+\b)/u);
    for (const fallback of ["sh -c", "bash -c", "zsh -c", "eval "]) {
      expect(source, fallback).not.toContain(fallback);
    }

    // The proof happens before the exec, not after it.
    const proof = source.lastIndexOf("is_program");
    expect(proof).toBeGreaterThan(-1);
    expect(proof).toBeLessThan(source.indexOf("\nexec "));
  });

  it("carries no one-machine absolute path and deduces the repository root", async () => {
    const source = await readFile(LAUNCHER, "utf8");
    expect(source).not.toMatch(/\/(?:Users|home)\/[A-Za-z0-9._-]+/u);
    expect(source).toMatch(/dirname "\$0"/u);
    expect(source).toMatch(/pwd -P/u);
  });
});

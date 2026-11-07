import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const runnerPath = "apps/runner/src/index.ts";
const basePath = `dialectical-engine/${runnerPath}`;

function callBody(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`RUNNER_CALL_BOUNDARY_MISSING: ${start}`);
  return source.slice(from, to);
}

function afterLease(source: string): string {
  return callBody(source,
    "    } finally {\n      replayBookInLease.close();\n    }",
    "          await storyWriter.writeAfterSettle(");
}

/**
 * W3-5 (dig-model revision 2026-10-30): the one addition after the lease is the dig's path rewrite in the story's place
 * (apps/runner/src/path-rewrite.ts). It is folded back here, exactly as written, so everything else after the lease is
 * still compared with the base byte for byte.
 */
function withoutPathRewrite(source: string): string {
  const added = /          \/\/ Dig-model revision W3-5 \(owner Q-D13\)[^\n]*\n          \/\/[^\n]*\n          \/\/[^\n]*\n          if \(!\(await runDigPathRewrite\(settings\.pathRewrite, settled\.input\)\)\) \{\n((?:            [^\n]*\n){3})          \}\n/u;
  const match = added.exec(source);
  if (match === null) return source;
  return source.replace(match[0], match[1]!.split("\n").map((line) => line.slice(2)).join("\n"));
}

describe("synthesis check request runner wiring", () => {
  it("the runner passes synthesisCheckRequest: true at exactly its two persist calls and adds nothing after the content lease", async () => {
    const source = await readFile(runnerPath, "utf8");
    const settlement = callBody(source, "const persisted = await runnerStage(\"ANSWER_PERSIST_FAILED\", () => this.#serve.persist({", "    // Task M3");
    const catchUp = callBody(source, "persist: async () => serve.persist({", "          supersedes: { answerId }");
    expect(settlement).toMatch(/\bsynthesisCheckRequest:\s*true\b/u);
    expect(catchUp).toMatch(/\bsynthesisCheckRequest:\s*true\b/u);
    expect(source.match(/\bsynthesisCheckRequest:\s*true\b/gu)).toHaveLength(2);

    // The base is the origin/dev the integration merged last (d78d58b4f, 2026-10-26): nothing of ours after the lease.
    const base = execFileSync("git", ["show", `d78d58b4f:${basePath}`], {
      cwd: process.cwd(), encoding: "utf8"
    });
    expect(withoutPathRewrite(source)).not.toBe(source);
    expect(afterLease(withoutPathRewrite(source))).toBe(afterLease(base));
  });

  it("persists the check request and wins settlement before awaiting the optional story", async () => {
    const source = await readFile(runnerPath, "utf8");
    const persist = source.indexOf('const persisted = await runnerStage("ANSWER_PERSIST_FAILED"');
    const request = source.indexOf("synthesisCheckRequest: true", persist);
    const settle = source.indexOf("const wonSettlement = await this.#work.settle(", request);
    const story = source.indexOf("await storyWriter.writeAfterSettle(", settle);
    expect(persist).toBeGreaterThanOrEqual(0);
    expect(request).toBeGreaterThan(persist);
    expect(settle).toBeGreaterThan(request);
    expect(story).toBeGreaterThan(settle);
  });
});

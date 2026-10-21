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

describe("synthesis check request runner wiring", () => {
  it("the runner passes synthesisCheckRequest: true at exactly its two persist calls and adds nothing after the content lease", async () => {
    const source = await readFile(runnerPath, "utf8");
    const settlement = callBody(source, "const persisted = await runnerStage(\"ANSWER_PERSIST_FAILED\", () => this.#serve.persist({", "    // Task M3");
    const catchUp = callBody(source, "persist: async () => serve.persist({", "          supersedes: { answerId }");
    expect(settlement).toMatch(/\bsynthesisCheckRequest:\s*true\b/u);
    expect(catchUp).toMatch(/\bsynthesisCheckRequest:\s*true\b/u);
    expect(source.match(/\bsynthesisCheckRequest:\s*true\b/gu)).toHaveLength(2);

    const base = execFileSync("git", ["show", `27e21e5e1:${basePath}`], {
      cwd: process.cwd(), encoding: "utf8"
    });
    expect(afterLease(source)).toBe(afterLease(base));
  });

  it("persists the check request and wins settlement before awaiting the optional story", async () => {
    const source = await readFile(runnerPath, "utf8");
    const persist = source.indexOf('const persisted = await runnerStage("ANSWER_PERSIST_FAILED"');
    const request = source.indexOf("synthesisCheckRequest: true", persist);
    const settle = source.indexOf("const wonSettlement = await this.#work.settle(", request);
    const story = source.indexOf("await storyWriter.writeAfterSettle(settled.input)", settle);
    expect(persist).toBeGreaterThanOrEqual(0);
    expect(request).toBeGreaterThan(persist);
    expect(settle).toBeGreaterThan(request);
    expect(story).toBeGreaterThan(settle);
  });
});

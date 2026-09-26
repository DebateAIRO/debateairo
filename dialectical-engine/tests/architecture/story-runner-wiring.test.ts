import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * Verdict story, Task 9 — the F33 class, pinned by name: the writer is built in
 * the shipped runner root, handed to the runner, and called only after the work
 * item is settled; acceptance stays story-free.
 */
describe("verdict story — wired into the shipped runner, after settle, never inside the debate", () => {
  it("writes the story only after the work item is settled, and only when the answer carries a label", async () => {
    const runner = await read("apps/runner/src/index.ts");
    // Inside the run's content lease: the hook sits between the lease's opening
    // and the settle's COMPLETED return, which the lease callback returns.
    const lease = runner.indexOf("return await this.#memory.withDisclosureContentLease([claimedRunId],async () => {");
    expect(lease).toBeGreaterThan(-1);
    expect(runner.indexOf("await storyWriter.writeAfterSettle(")).toBeGreaterThan(lease);
    const settle = runner.indexOf("const wonSettlement = await this.#work.settle(");
    const write = runner.indexOf("await storyWriter.writeAfterSettle(");
    const completed = runner.indexOf('return { kind: "COMPLETED", answerId: persisted.answerId };');
    expect(settle).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(settle);
    expect(completed).toBeGreaterThan(write);
    expect(runner.split("await storyWriter.writeAfterSettle(")).toHaveLength(2);
    expect(runner.slice(settle, completed)).toContain("storyWriter !== undefined && answerCarriesLabel");
    // Never the gated-family shape: `story` stays optional for every other root.
    expect(runner).not.toMatch(/this\.settings\.story === undefined/u);
  });

  it("keeps the runner's framed-prompt builders at two: the story builds its prompts in packages/story", async () => {
    const runner = await read("apps/runner/src/index.ts");
    expect(runner.split(/\bbuildFramedPrompt\(/u).length - 1).toBe(2);
  });

  it("loads the pack and the optional policy at boot and hands the writer to the runner", async () => {
    const main = await read("apps/runner/src/main.ts");
    expect(main).toContain("resolveStoryPackDir({");
    expect(main).toContain("[STORY_SHAPES_DIR_ENV_KEY]: environment.DEBATEAI_STORY_SHAPES_DIR");
    expect(main).toContain("moduleUrl: import.meta.url");
    expect(main).toContain("readStoryPolicyFromRegister(pool, environment.REGISTER_VERSION)");
    expect(main).toContain("new StoryWriter({");
    expect(main).toContain("story: storyWriter");
    // The writer reads and writes on the RUNNER'S OWN pool: the content lease is
    // borrowed by pool identity, and a second pool would take a second shared
    // lock that livelocks against a waiting erasure.
    expect(main).toMatch(/new StoryWriter\(\{\s*pool,/u);
    expect(main).toContain("new WalkingSkeletonRunner(pool, ");
    expect(main.match(/createPool\(/gu)).toHaveLength(1);
    expect(main).toContain("buildStoryCostEnvelopeSeam: (runId: string) => costEnvelopeGuard.storySeam({");
    expect(main).not.toContain(["process", "env"].join("."));
    // Any boot failure to load the pack — a broken rule, an unresolvable
    // directory, a raw file-system or URL error — becomes a refusal value, never
    // a thrown boot error: the story can never stop the runner from starting.
    const load = main.slice(main.indexOf("let storyPack:"), main.indexOf("const deploymentMakers"));
    expect(load).toMatch(/try \{\s*storyPack = loadStoryPack\(resolveStoryPackDir\(\{/u);
    expect(load).toContain("} catch (error) {");
    expect(load).not.toMatch(/\bthrow\b/u);
    expect(load).toContain('storyLog("STORY_PACK_INVALID", { reason: storyPack.error });');
  });

  it("declares the pack-directory override in the runner's environment shape", async () => {
    const environment = await read("packages/register/src/runtime-environment.ts");
    expect(environment).toContain("DEBATEAI_STORY_SHAPES_DIR: z.string().min(1).optional()");
  });

  it("never lets the acceptance root write a story", async () => {
    expect(await read("acceptance/main.ts")).not.toContain("StoryWriter");
  });
});

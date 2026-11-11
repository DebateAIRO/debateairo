// tests/unit/dig-no-story.test.ts
// W3-5 (dig-model revision 2026-10-30; owner Q-D13): a dig keeps its points AND its AI-written answer text, and only its
// story is dropped: when the dig settles, the runner rewrites the path it was dug from in the story's place. A first
// debate still gets its story, as does every run when whether it is a dig cannot be read. The after-settle branch is
// pinned in the runner's source; the decision itself runs here over the made-up world.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StoryWriteInput } from "@debateai/story";
import { runDigPathRewrite, type PathRewriteRunnerSettings } from "../../apps/runner/src/path-rewrite.js";
import { DIG_A, dig, digSnapshot, memoryStore, membersOf, settingsOver, team, type Logged } from "../support/path-rewrite-world.js";

const RUNNER = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");

/** The after-settle branch as index.ts runs it: the rewrite for a dig, the story otherwise. */
async function afterSettle(settings: PathRewriteRunnerSettings | undefined, input: StoryWriteInput, stories: StoryWriteInput[]): Promise<void> {
  if (!(await runDigPathRewrite(settings, input))) stories.push(input);
}

describe("W3-5 a dig settles with its points and answer text and no story", () => {
  it("a dig: the rewrite runs and no story is written", async () => {
    const store = memoryStore();
    const stories: StoryWriteInput[] = [];
    const vendors = team();
    await afterSettle(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }), digSnapshot(DIG_A, membersOf(vendors)), stories);
    expect(stories).toHaveLength(0);
    expect(store.rewrites.map((row) => row.outcome)).toEqual(["READY"]);
    // Only the rewrite's two call sites: no story call of any kind (no STORY: site, no chart call).
    expect([...vendors.haiku.requests, ...vendors.glm.requests].map((request) => request.callSiteKey))
      .toEqual(["PATH_REWRITE:WRITER:1", "PATH_REWRITE:CHECKER:1"]);
  });

  it("a dig whose rewrite fails still writes no story: the row is FAILED and the dig keeps what it settled with", async () => {
    const store = memoryStore();
    const stories: StoryWriteInput[] = [];
    await afterSettle(settingsOver({ store, digs: new Map([[DIG_A, dig()]]) }),
      digSnapshot(DIG_A, { resolve: () => null, backups: [] }), stories);
    expect(stories).toHaveLength(0);
    expect(store.rewrites.map((row) => [row.outcome, row.failureCode])).toEqual([["FAILED", "PATH_REWRITE_ROLE_UNAVAILABLE"]]);
  });

  it("a first debate gets its story as today; so does every run on a runner without the rewrite's settings", async () => {
    const stories: StoryWriteInput[] = [];
    const input = digSnapshot(DIG_A, membersOf(team()));
    await afterSettle(settingsOver({ store: memoryStore(), digs: new Map() }), input, stories);
    await afterSettle(undefined, input, stories);
    expect(stories).toEqual([input, input]);
  });

  it("whether the run is a dig cannot be read: its story is written, as today, and the reason is logged by code", async () => {
    const stories: StoryWriteInput[] = [];
    const logged: Logged = [];
    const settings = settingsOver({ store: memoryStore(), digs: new Map(), logged });
    const unreadable = { ...settings, sources: { ...settings.sources, digOf: async () => { throw Object.assign(new Error("boom"), { code: "57014" }); } } };
    await afterSettle(unreadable, digSnapshot(DIG_A, membersOf(team())), stories);
    expect(stories).toHaveLength(1);
    expect(logged).toEqual([{ event: "PATH_REWRITE_DIG_UNREAD", detail: { runId: DIG_A, code: "DATABASE:57014" } }]);
  });

  it("the runner: the answer, its points and its text are stored and settled before the branch, which picks the rewrite or the story", () => {
    const settle = RUNNER.indexOf("const wonSettlement = await this.#work.settle(");
    const leaseClosed = RUNNER.indexOf('"The runner failed inside its private-content disclosure lease"');
    const rewrite = RUNNER.indexOf("if (!(await runDigPathRewrite(settings.pathRewrite, settled.input))) {");
    const story = RUNNER.indexOf("await storyWriter.writeAfterSettle(");
    expect(settle).toBeGreaterThan(-1);
    expect(leaseClosed).toBeGreaterThan(settle);
    expect(rewrite).toBeGreaterThan(leaseClosed);
    expect(story).toBeGreaterThan(rewrite);
    expect(RUNNER.split("runDigPathRewrite(")).toHaveLength(2);
    // Nothing before the branch knows about digs: a dig's answer (its points and its AI-written text) is persisted and
    // served exactly as a first debate's.
    const lease = RUNNER.indexOf("executed = await this.#memory.withDisclosureContentLease([claimedRunId],async () => {");
    expect(lease).toBeGreaterThan(-1);
    expect(RUNNER.slice(lease, leaseClosed)).not.toMatch(/pathRewrite|PathRewrite/u);
    // The story's snapshot is still built once, after settle; a dig's rewrite reads that same snapshot.
    expect(RUNNER.split("buildStoryRunSnapshot({")).toHaveLength(2);
  });
});

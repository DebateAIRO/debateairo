import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * Verdict story, Task 9 — the F33 class, pinned by name: the writer is built in
 * the shipped runner root, handed to the runner, and called only after the work
 * item is settled; acceptance stays story-free.
 */
describe("verdict story — wired into the shipped runner, after settle, never inside the debate", () => {
  it("builds the snapshot inside the run's lease, after settle, and only when the answer carries a label or a floor", async () => {
    const runner = await read("apps/runner/src/index.ts");
    const lease = runner.indexOf(
      "executed = await this.#memory.withDisclosureContentLease([claimedRunId],async () => {"
    );
    const leaseClosed = runner.indexOf('"The runner failed inside its private-content disclosure lease"');
    const settle = runner.indexOf("const wonSettlement = await this.#work.settle(");
    const snapshot = runner.indexOf("input: buildStoryRunSnapshot({");
    const completed = runner.indexOf('return { kind: "COMPLETED", answerId: persisted.answerId };');
    expect(lease).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(lease);
    expect(snapshot).toBeGreaterThan(settle);
    expect(completed).toBeGreaterThan(snapshot);
    expect(leaseClosed).toBeGreaterThan(completed);
    expect(runner.split("buildStoryRunSnapshot({")).toHaveLength(2);
    // Task M5 (spec §14.4.4): a floor answer carries a label too — and, since
    // the final review (Minor 2), only once the floor's row was written, since
    // the pages learn the floor from that row alone.
    const rowWritten = runner.indexOf("const disclosureRecorded = await this.#recordServeDisclosure(");
    expect(rowWritten).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(rowWritten);
    expect(runner.slice(settle, completed)).toContain("const floorRecorded = floor !== null && disclosureRecorded;");
    expect(runner.slice(settle, completed)).toContain("storyWriter !== undefined && (answerCarriesLabel || floorRecorded)");
    // Never the gated-family shape: `story` stays optional for every other root.
    expect(runner).not.toMatch(/this\.settings\.story === undefined/u);
  });

  it("runs the story only AFTER the run's lease is released, one short disclosure lease per step, and never throws", async () => {
    const runner = await read("apps/runner/src/index.ts");
    const leaseClosed = runner.indexOf('"The runner failed inside its private-content disclosure lease"');
    const write = runner.indexOf("await storyWriter.writeAfterSettle(");
    const reported = runner.indexOf("storyWriter.reportSnapshotFailure(");
    const returned = runner.indexOf("return executed;");
    expect(runner.split("await storyWriter.writeAfterSettle(")).toHaveLength(2);
    expect(write).toBeGreaterThan(leaseClosed);
    expect(reported).toBeGreaterThan(leaseClosed);
    expect(returned).toBeGreaterThan(write);
    // Its own try/catch, which swallows: the story can never cost the verdict.
    const after = runner.slice(leaseClosed, returned);
    // Side-by-side spec §13 (S6, ruling R36): the one write carries the debate's own version's story policy.
    expect(after).toMatch(/try \{[\s\S]*await storyWriter\.writeAfterSettle\(settings\.storyPolicy === undefined \? settled\.input : Object\.freeze\(\{ \.\.\.settled\.input, policy: settings\.storyPolicy \}\)\);[\s\S]*\} catch \{/u);
    expect(after).not.toMatch(/\bthrow\b/u);
    // Each step re-takes the DISCLOSURE lease (the run and its memory-linked
    // prior run, exactly as the debate held them), never a bare run lease.
    expect(runner).toContain("stepLease: (use) => this.#memory.withDisclosureContentLease([run.runId], use)");
  });

  /**
   * Part 4, P4-D (P3-N1; controller C3): the runner-level rows live in
   * tests/integration/database.test.ts, which CI does not run, so the wiring is
   * also pinned here by name.
   */
  it("hands an assigned run's story its SCORECARD answer seats' members, and only such a run (P4-D)", async () => {
    const runner = await read("apps/runner/src/index.ts");
    const snapshot = runner.slice(runner.indexOf("input: buildStoryRunSnapshot({"),
      runner.indexOf('return { kind: "COMPLETED", answerId: persisted.answerId };'));
    expect(snapshot).toContain(
      "roleMakers: seatBook.assigned && (seatBook.answerWriter !== null || seatBook.answerChecker !== null)"
    );
    expect(snapshot).toContain("storyteller: storySeatRoleMaker(seatBook.answerWriter,");
    expect(snapshot).toContain("answeredRound === undefined ? undefined : writerPlannedByRound.get(answeredRound.round)),");
    expect(snapshot).toContain("checker: storySeatRoleMaker(seatBook.answerChecker,");
    expect(snapshot).toContain("answeredRound === undefined ? undefined : checkerPlannedByRound.get(answeredRound.round))");
    // The cost fallback is unchanged: the planned maker first, then the run's own debaters. Run resilience (spec
    // 2026-10-12, fix (a)): on the preview it also moves on from a member that sits out (the run's sit-out book,
    // null and so absent off the preview).
    expect(snapshot).toContain("costFallback: storyCostFallback(synthesisMakers, servePrices, sitOut ?? undefined)");
    const passThrough = await read("apps/runner/src/story-snapshot.ts");
    expect(passThrough).toContain("...(source.roleMakers === undefined ? {} : { roleMakers: source.roleMakers })");
    const writer = await read("packages/story/src/writer.ts");
    expect(writer).toContain("const storyteller = input.roleMakers?.storyteller ?? resolve(policy.storytellerRoleRef);");
    expect(writer).toContain("const checker = input.roleMakers?.checker ?? resolve(policy.storyCheckerRoleRef);");
  });

  /**
   * Role rotation (spec 2026-10-11 Part 6): a rotated run (never an assigned one;
   * the claim refuses both pins) hands its story the pinned storyteller and story
   * checker, looked up among the run's claim-eligible members. Task 12 ("always an
   * answer"): a pinned member that is not claim-eligible hands its role to another
   * claim-eligible member of the run's stored panel, in panel order
   * (`storyRotationRoleMakers`); none, null, and the register's story ref serves only
   * when it is a panel ref (the rotated run's resolver refuses any other ref).
   */
  it("hands a rotated run's story its pinned pair, or a panel stand-in, among the run's claim-eligible members (role rotation)", async () => {
    const runner = await read("apps/runner/src/index.ts");
    const snapshot = runner.slice(runner.indexOf("input: buildStoryRunSnapshot({"),
      runner.indexOf('return { kind: "COMPLETED", answerId: persisted.answerId };'));
    expect(snapshot).toMatch(/: rotationPin === null\s+\? undefined\s+: storyRotationRoleMakers\(\{\s+panelRefs: run\.discoveredPanel\.map\(\(member\) => member\.provider_ref\),\s+claimEligible: synthesisMakers,\s+storytellerRef: rotationPin\.storyteller\.providerRef,\s+storyCheckerRef: rotationPin\.storyChecker\.providerRef\s+\}\)/u);
    expect(snapshot).toContain("if (rotationPin !== null && !panelRefs.has(roleRef)) return null;");
    expect(runner).not.toContain("const storyRotationRoleMaker = ");
    const helper = await read("apps/runner/src/story-snapshot.ts");
    expect(helper).toContain("export function storyRotationRoleMakers(");
  });

  it("hands the comparing judges' question kinds to the story under engine 2 only (R2 B9)", async () => {
    const runner = await read("apps/runner/src/index.ts");
    const snapshot = runner.indexOf("input: buildStoryRunSnapshot({");
    const call = runner.slice(snapshot, runner.indexOf("}),", runner.indexOf("roleMakers:", snapshot)));
    expect(call).toContain("...(engine.engine === 2 && comparingJudges !== null ? { questionKinds: comparingJudges.verdict.questionKinds } : {}),");
  });

  it("keeps the runner's framed-prompt builders at one: the story builds its prompts in packages/story", async () => {
    const runner = await read("apps/runner/src/index.ts");
    // Paid plans S1a: dev's two synthesis framings became the scorecard's ONE
    // builder, `buildSynthesisRolePrompt` (A17), which both roles and moment:replay use.
    expect(runner.split(/\bbuildFramedPrompt\(/u).length - 1).toBe(1);
  });

  it("loads the pack and the optional policy at boot and hands the writer to the runner", async () => {
    const main = await read("apps/runner/src/main.ts");
    expect(main).toContain("resolveStoryPackDir({");
    expect(main).toContain("[STORY_SHAPES_DIR_ENV_KEY]: environment.DEBATEAI_STORY_SHAPES_DIR");
    expect(main).toContain("moduleUrl: import.meta.url");
    // Side-by-side spec §13: the optional story rows are read by the one per-version loader, for its version; main.ts
    // loads its site version through it and never reads the story policy itself.
    const loader = await read("apps/runner/src/run-settings.ts");
    expect(loader).toContain("readStoryPolicyFromRegister(pool, version)");
    expect(main).not.toContain("readStoryPolicyFromRegister(");
    // Side-by-side spec §13 (ruling R36): the writer has no boot policy; each write carries its debate's version's.
    expect(main).not.toContain("const { storyPolicy } = siteVersionSettings;");
    expect(main).toContain("new StoryWriter({");
    expect(main.slice(main.indexOf("new StoryWriter({"), main.indexOf("resolveProvider:", main.indexOf("new StoryWriter({"))))
      .not.toMatch(/\bpolicy:/u);
    // A detail key can never overwrite the line's kind or event.
    expect(main).toContain('console.warn(JSON.stringify({ ...detail, kind: "DEBATEAI_STORY", event }));');
    expect(main).toContain("story: storyWriter");
    // The writer reads and writes on the RUNNER'S OWN pool: the content lease is
    // borrowed by pool identity, and a second pool would take a second shared
    // lock that livelocks against a waiting erasure.
    expect(main).toMatch(/new StoryWriter\(\{\s*pool,/u);
    expect(main).toContain("new WalkingSkeletonRunner(pool, ");
    // Parallel AI calls (spec 2026-10-12 §3.6): the one other pool serves only claim renewals, never the story.
    expect(main.match(/createPool\(/gu)).toHaveLength(2);
    expect(main).toContain("const keepAlivePool = createPool(environment.DATABASE_URL, RUNNER_DATABASE_POOLS.keepAlive);");
    // R4 (final review): its third and last mention ends it, with the runtime pool, once a retired worker has stopped.
    expect(main.match(/\bkeepAlivePool\b/gu)).toHaveLength(3);
    expect(main).toContain("await Promise.allSettled([pool.end(), keepAlivePool.end()]);");
    // Side-by-side spec §3 (B6): the renewals are fenced by this release and worker, like every work repository.
    expect(main).toContain("renewals: new WorkItemRepository(keepAlivePool, workFence),");
    // Side-by-side spec §13 (S6): the story's money seam is its own run's version's guard.
    expect(main).toContain("buildStoryCostEnvelopeSeam: (runId: string) => runCostEnvelopeGuard(runId).storySeam({");
    expect(main).not.toContain(["process", "env"].join("."));
    // Any boot failure to load the pack — a broken rule, an unresolvable
    // directory, a raw file-system or URL error — becomes a refusal value, never
    // a thrown boot error: the story can never stop the runner from starting.
    // Side-by-side spec §13 (S14): the pack's block is followed by the two in-flight counters (the site reads moved out).
    const load = main.slice(main.indexOf("let storyPack:"), main.indexOf("const gatewayInFlight = createRunInFlight();"));
    expect(load.length).toBeGreaterThan(0);
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

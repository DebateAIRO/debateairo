import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, PanelMemberFailure } from "@debateai/judgement";
import { TypedDomainError, type DebateRole } from "@debateai/kernel";
import {
  ProviderCallFailedError,
  ProviderContentUnacceptedError,
  buildFramedRepairPrompt,
  promptContractFingerprintText,
  readPromptFrame
} from "@debateai/providers";
import { EVALUATOR_PROMPT_CONTRACT, buildSynthesisRolePrompt } from "@debateai/runner";
import { canonicalPromptFingerprint, type MomentBuilder } from "@debateai/scorecard";
import {
  SYNTHESIZER_PROMPT_CONTRACT,
  buildSynthesisDigest,
  buildSynthesizerRequest,
  type SynthesisDigest
} from "@debateai/serve";
import {
  assertMomentOutputPathUntracked,
  assertMomentToolRuntime,
  builderFromRecordedPacket,
  captureMomentPacket,
  currentContractHash,
  graderContextOf,
  momentFamilyOf,
  parseMomentBuilder,
  replayOutcomeOf,
  replyContentOf,
  type TypedMomentBuilder
} from "../../acceptance/moment-tools.js";
import { absolutePathOf } from "../../acceptance/untracked-path.js";

/**
 * Model scorecard A18 — the SAME-PROMPT property, offline. For every debate
 * role a packet is built by the LIVE builders, read back into builder inputs the
 * way export-moment reads a recorded prompt, rebuilt by the live builders, and
 * compared by the canonical fingerprint: equal, although the two packets' fence
 * and canary differ.
 */
const QUESTION = "Should the city build the new bridge?";
const NODE = "0f4d7c1e-2b8a-4c3d-9e5f-a1b2c3d4e5f6";

function digest(): SynthesisDigest {
  const outcome = buildSynthesisDigest({
    nodes: [{
      nodeId: "position:a", statement: "Build it: the old bridge fails inspection.", finalStrength: 0.64,
      wayOfKnowing: "REASONING", marks: [], polarityRelations: [], isPosition: true, isSurvivingObjection: false
    }],
    servedRootNodeId: "position:a",
    budgetBound: 8_192
  });
  if (outcome.kind !== "DIGEST") throw new Error("the A18 digest fixture must exist");
  return outcome.digest;
}
const CODE_LABEL = { verdictLabel: "CONTESTED", servedNodeId: "position:a", servedStrength: 0.64, margin: 0.08 };

const CASES: readonly (readonly [DebateRole, string, MomentBuilder])[] = [
  ["POSITION", "JUDGE", { family: "JUDGE_JUDGE", inputs: { questionLine: QUESTION, leg: { kind: "primary-root" } } }],
  ["POSITION", "JUDGE:root:secondary:seat:main", { family: "JUDGE_JUDGE", inputs: { questionLine: QUESTION, leg: { kind: "independent-root" } } }],
  ["SUPPORT_ATTACK", "JUDGE:defender:root0:r1:p0", {
    family: "JUDGE_JUDGE", inputs: { questionLine: QUESTION, leg: { kind: "support", positionUnderDebate: "Build it." } }
  }],
  ["SUPPORT_ATTACK", "JUDGE:critic:root1:r1:p3:seat:runnerUp", {
    family: "JUDGE_JUDGE", inputs: { questionLine: QUESTION, leg: { kind: "attack", positionUnderDebate: "Do not build it." } }
  }],
  ["CROSS_EXCHANGE", "JUDGE:cross-root:0->1", {
    family: "JUDGE_JUDGE",
    inputs: { questionLine: QUESTION, leg: { kind: "cross-root", ownPosition: "Build it.", otherMakersPosition: "Repair the old one." } }
  }],
  ["JUDGE", "PANEL:root:provider:a:seat:main", { family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement: "Build it." } }],
  ["REVIEWER", `JUDGE:review:${NODE}`, {
    family: "JUDGE_REVIEW",
    inputs: {
      questionLine: QUESTION, statement: "The repair costs more over thirty years.",
      edges: [
        { targetStatement: "Build it.", polarity: "support" },
        { targetStatement: "Repair the old one.", polarity: "attack" }
      ]
    }
  }],
  ["ANSWER_WRITER", "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main", {
    family: "SYNTHESIS_WRITER", inputs: { round: 1, digest: digest(), codeLabel: CODE_LABEL, priorObjection: null }
  }],
  ["ANSWER_WRITER", "COMPOSER:SYNTHESIZER:RETRY:2", {
    family: "SYNTHESIS_WRITER",
    inputs: { round: 2, digest: digest(), codeLabel: CODE_LABEL, priorObjection: "Round 1 overstates the inspection report." }
  }],
  ["ANSWER_CHECKER", "POST_COMPOSE_R9:EVALUATOR:1", {
    family: "SYNTHESIS_CHECKER",
    inputs: { round: 1, digest: digest(), codeLabel: CODE_LABEL, candidateStatement: "Build it, with the cost caveat." }
  }]
];

describe("A18 · the same prompt, rebuilt from recorded material, for every debate role", () => {
  it("covers every debate role", () => {
    expect(new Set(CASES.map(([role]) => role)).size).toBe(7);
  });

  it.each(CASES)("%s at %s: recorded packet -> inputs -> rebuilt packet, same fingerprint", async (role, key, builder) => {
    const typed = parseMomentBuilder(builder);
    expect(momentFamilyOf(role)).toBe(typed.family);
    // A18 carry 3: the moment's own role is accepted with its own builder.
    expect(parseMomentBuilder(builder, role)).toEqual(typed);
    const recorded = await captureMomentPacket(typed);
    const inputs = builderFromRecordedPacket(role, key, recorded);
    expect(inputs).toEqual(typed);
    const rebuilt = await captureMomentPacket(inputs);
    expect(readPromptFrame(rebuilt).fence).not.toBe(readPromptFrame(recorded).fence);
    expect(canonicalPromptFingerprint(rebuilt.messages)).toBe(canonicalPromptFingerprint(recorded.messages));
  });

  it("refuses a repair packet, a leg under the wrong role and a contract the role never uses", async () => {
    const primary = await captureMomentPacket(parseMomentBuilder(CASES[0]![2]));
    const framed = buildSynthesisRolePrompt(buildSynthesizerRequest({
      controls: { synthesizerRoleRef: "x", evaluatorRoleRef: "y", evaluatorLoopMaxRounds: 1 },
      round: 1, digest: digest(), codeLabel: { ...CODE_LABEL, registerVersion: 0 }, prior: null
    }), "the same language as the question");
    const repair = buildFramedRepairPrompt(framed, { code: "SCHEMA_FAILED", path: "segments" });
    expect(() => builderFromRecordedPacket("ANSWER_WRITER", "COMPOSER:SYNTHESIZER:INITIAL:1", repair))
      .toThrowError(expect.objectContaining({ code: "MOMENT_INITIAL_PROMPT_UNRECORDED" }));
    expect(() => builderFromRecordedPacket("SUPPORT_ATTACK", "JUDGE:defender:root0:r1:p0", primary))
      .toThrowError(expect.objectContaining({ code: "MOMENT_CONTRACT_MISMATCH" }));
    expect(() => builderFromRecordedPacket("REVIEWER", `JUDGE:review:${NODE}`, primary))
      .toThrowError(expect.objectContaining({ code: "MOMENT_CONTRACT_MISMATCH" }));
    expect(() => parseMomentBuilder({ family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION } }))
      .toThrowError(expect.objectContaining({ code: "MOMENT_BUILDER_INVALID" }));
  });

  it("refuses a moment whose role and builder disagree, so a writer never reaches the checker's contract (carry 3)", () => {
    const invalid = expect.objectContaining({ code: "MOMENT_FILE_INVALID" });
    const builderAt = (index: number): MomentBuilder => CASES[index]![2];
    // The family disagrees with the role.
    expect(() => parseMomentBuilder(builderAt(7), "ANSWER_CHECKER")).toThrowError(invalid);
    expect(() => parseMomentBuilder(builderAt(9), "ANSWER_WRITER")).toThrowError(invalid);
    expect(() => parseMomentBuilder(builderAt(5), "REVIEWER")).toThrowError(invalid);
    expect(() => parseMomentBuilder(builderAt(6), "JUDGE")).toThrowError(invalid);
    expect(() => parseMomentBuilder(builderAt(0), "ANSWER_WRITER")).toThrowError(invalid);
    // JUDGE_JUDGE: the family agrees, but the leg does another debate job.
    expect(() => parseMomentBuilder(builderAt(0), "SUPPORT_ATTACK")).toThrowError(invalid);
    expect(() => parseMomentBuilder(builderAt(2), "POSITION")).toThrowError(invalid);
    expect(() => parseMomentBuilder(builderAt(4), "SUPPORT_ATTACK")).toThrowError(invalid);
    expect(() => parseMomentBuilder(builderAt(3), "CROSS_EXCHANGE")).toThrowError(invalid);
  });

  it("names the live builder's own refusal when no packet could be captured (fix round 1, Minor 3)", async () => {
    // Both bypass parseMomentBuilder on purpose: the builder refuses before the gateway is reached.
    const malformed = { family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement: 42 } } as unknown as TypedMomentBuilder;
    await expect(captureMomentPacket(malformed)).rejects.toThrowError(expect.objectContaining({
      code: "MOMENT_PACKET_UNCAPTURED",
      message: expect.stringContaining("PROMPT_FRAME_MATERIAL_MALFORMED")
    }));
    const unknownFamily = { family: "JUDGE_UNKNOWN", inputs: {} } as unknown as TypedMomentBuilder;
    await expect(captureMomentPacket(unknownFamily)).rejects.toThrowError(expect.objectContaining({
      code: "MOMENT_PACKET_UNCAPTURED",
      message: expect.stringContaining("Unknown closed-vocabulary member")
    }));
  });
});

describe("A18 · contract hashes, grader context, outcomes and runtime", () => {
  it("recomputes each family's contract hash the way the seeders seal it", () => {
    const sha = (text: string) => createHash("sha256").update(text).digest("hex");
    expect(currentContractHash("JUDGE_JUDGE")).toBe(sha(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT));
    expect(currentContractHash("JUDGE_REVIEW")).toBe(sha(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT));
    expect(currentContractHash("JUDGE_ASSESS")).toBe(sha(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT));
    expect(currentContractHash("SYNTHESIS_WRITER")).toBe(sha(promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT)));
    expect(currentContractHash("SYNTHESIS_CHECKER")).toBe(sha(promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT)));
  });

  it("hands the grader the question and the material the model saw, never routing", () => {
    expect(graderContextOf(QUESTION, parseMomentBuilder(CASES[4]![2]))).toEqual({
      question: QUESTION,
      excerpts: [
        { label: "own_position", text: "Build it." },
        { label: "other_makers_position", text: "Repair the old one." }
      ]
    });
    expect(graderContextOf(QUESTION, parseMomentBuilder(CASES[6]![2])).excerpts).toEqual([
      { label: "statement", text: "The repair costs more over thirty years." },
      { label: "edge_0_support_target", text: "Build it." },
      { label: "edge_1_attack_target", text: "Repair the old one." }
    ]);
    expect(graderContextOf(QUESTION, parseMomentBuilder(CASES[9]![2])).excerpts).toEqual([
      { label: "digest_node_position:a", text: "Build it: the old bridge fails inspection." },
      { label: "candidate_statement", text: "Build it, with the cost caveat." }
    ]);
  });

  it("classifies a failed replay the way R4 classifies a failed seat call", () => {
    const cap = () => new TypedDomainError("PROVIDER_USAGE_CAP", "subscription usage cap reached");
    const exhausted = (outcome: "TIMED_OUT" | "FAILED", cause: unknown = new Error("socket")) =>
      new ProviderCallFailedError(cause, 3, outcome, "ledger:1");
    expect(replayOutcomeOf(exhausted("TIMED_OUT"))).toBe("TIMED_OUT");
    expect(replayOutcomeOf(exhausted("FAILED"))).toBe("FAILED");
    expect(replayOutcomeOf(cap())).toBe("USAGE_CAP");
    expect(replayOutcomeOf(exhausted("FAILED", cap()))).toBe("USAGE_CAP");
    expect(replayOutcomeOf(new PanelMemberFailure("PROVIDER_ERROR", "cap", { cause: cap() }))).toBe("USAGE_CAP");
    expect(replayOutcomeOf(new TypedDomainError("PROVIDER_CONTEXT_WINDOW_EXCEEDED", "window"))).toBe("CONTEXT_TOO_LARGE");
    expect(replayOutcomeOf(new ProviderContentUnacceptedError(2, "SCHEMA_FAILED", "bad", "artifact:1", "ledger:1"))).toBe("REFUSED");
    expect(replayOutcomeOf(new TypedDomainError("JUDGE_SCHEMA_FAILURE", "bad"))).toBe("REFUSED");
    expect(replayOutcomeOf(new TypedDomainError("NODE_REVIEW_PARSE_FAILURE", "prose"))).toBe("REFUSED");
    expect(replayOutcomeOf(new PanelMemberFailure("PARSE_FAILURE", "prose"))).toBe("REFUSED");
    expect(replayOutcomeOf(new PanelMemberFailure("TIMEOUT", "PROVIDER_CALL_FAILED:TIMED_OUT"))).toBe("TIMED_OUT");
    expect(replayOutcomeOf(new TypedDomainError("PROVIDER_THINKING_LEVEL_UNSUPPORTED", "level"))).toBe("FAILED");
    expect(replayOutcomeOf(new Error("boom"))).toBe("FAILED");
  });

  it("reads the answer inside a completion body, and keeps any other text as it is (pre-flight fix F4)", () => {
    const completion = JSON.stringify({
      id: "chatcmpl-1", model: "m", choices: [{ index: 0, message: { role: "assistant", content: "the answer" }, finish_reason: "stop" }]
    });
    expect(replyContentOf(completion)).toBe("the answer");
    expect(replyContentOf("a plain-text answer")).toBe("a plain-text answer");
    for (const other of [JSON.stringify({ error: "refused" }), JSON.stringify({ choices: [] }), "[]"]) {
      expect(replyContentOf(other)).toBe(other);
    }
  });

  it("refuses a hosted deployment, and a production process that did not say which it is", () => {
    expect(() => assertMomentToolRuntime({ DEBATEAI_DEPLOYMENT_MODE: "hosted" }))
      .toThrowError(expect.objectContaining({ code: "MOMENT_TOOL_REFUSED_IN_HOSTED" }));
    expect(() => assertMomentToolRuntime({ DEBATEAI_DEPLOYMENT_MODE: "hosted", NODE_ENV: "development" }))
      .toThrowError(expect.objectContaining({ code: "MOMENT_TOOL_REFUSED_IN_HOSTED" }));
    expect(() => assertMomentToolRuntime({ NODE_ENV: "production" }))
      .toThrowError(expect.objectContaining({ code: "DEPLOYMENT_MODE_UNRESOLVED" }));
    expect(() => assertMomentToolRuntime({ DEBATEAI_DEPLOYMENT_MODE: "local", NODE_ENV: "production" })).not.toThrow();
    expect(() => assertMomentToolRuntime({})).not.toThrow();
  });
});

/**
 * A18 carry 4 (pre-flight R6): a moment or a replay result carries DECRYPTED
 * debate text, and `pnpm run` resolves a relative `--out` from the engine root.
 * Inside the repository an output path must sit under a git-ignored `.local/`
 * folder; outside it, anywhere. relay-host's endpoints rule, restated.
 */
describe("A18 · output paths never land in the tracked tree (carry 4)", () => {
  /** This engine's root, from this file's own address — never a spelled-out path. */
  const ENGINE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const refused = expect.objectContaining({ code: "MOMENT_OUTPUT_PATH_REFUSED" });
  const workspaces: string[] = [];
  const workspace = async (): Promise<string> => {
    const created = await mkdtemp(join(tmpdir(), "a18-moment-out-"));
    workspaces.push(created);
    return created;
  };
  /** A throwaway work tree: `.git` at its top, the engine one folder down. */
  const workTree = async (): Promise<{ tree: string; engine: string }> => {
    const tree = join(await workspace(), "tree");
    const engine = join(tree, "engine");
    await mkdir(join(tree, ".git"), { recursive: true });
    await mkdir(engine);
    return { tree, engine };
  };

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("refuses a file or a folder inside the work tree that is not under a .local/ folder", async () => {
    const { tree, engine } = await workTree();
    const outsideLink = join(await workspace(), "into-the-tree");
    await symlink(tree, outsideLink);
    for (const path of [
      join(engine, "m.json"),
      join(engine, "moments", "m.json"),
      // The boundary is the WORK TREE (it holds .git), not only the engine folder.
      join(tree, "results.jsonl"),
      // A FILE named .local sits in the tracked folder above it.
      join(engine, ".local"),
      // Links are resolved first: a link outside the tree cannot reach into it.
      join(outsideLink, "engine", "m.json")
    ]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).toThrowError(refused);
    }
    for (const path of [engine, tree, join(engine, "moments"), join(outsideLink, "engine", "moments")]) {
      expect(() => assertMomentOutputPathUntracked(path, "directory", engine), path).toThrowError(refused);
    }
    // The check creates nothing on the way.
    expect(existsSync(join(engine, "moments"))).toBe(false);
  });

  it("admits a path under a .local/ folder inside the work tree, and any path outside it", async () => {
    const { tree, engine } = await workTree();
    const outside = await workspace();
    for (const path of [
      join(engine, ".local", "m.json"),
      join(tree, "deep", ".local", "moments", "m.json"),
      join(outside, "m.json"),
      join(outside, "nested", "results.jsonl")
    ]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).not.toThrow();
    }
    for (const path of [join(engine, ".local"), join(engine, ".local", "moments"), outside, join(outside, "moments")]) {
      expect(() => assertMomentOutputPathUntracked(path, "directory", engine), path).not.toThrow();
    }
  });

  /** Joined as a STRING, so `..` stays for the kernel: `join` would fold it away before any link is read. */
  const unresolved = (...segments: string[]): string => segments.join(sep);

  it("reads `..` the way the kernel does, after a link is followed (fix round 1, Important 1)", async () => {
    const { engine } = await workTree();
    const outside = await workspace();
    const engineLink = join(outside, "engine-link");
    await symlink(engine, engineLink);
    // engine-link/.. is the TREE, not the folder the link sits in.
    for (const path of [
      unresolved(engineLink, "..", "m.json"),
      unresolved(engineLink, "..", "moments", "m.json"),
      // `.local/..` leaves the ignored folder.
      unresolved(engine, ".local", "..", "m.json")
    ]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).toThrowError(refused);
    }
    for (const path of [unresolved(engineLink, ".."), unresolved(engine, ".local", "..", "moments")]) {
      expect(() => assertMomentOutputPathUntracked(path, "directory", engine), path).toThrowError(refused);
    }
    // The same reading admits what the kernel puts under .local/ or outside the tree.
    for (const path of [
      unresolved(engine, ".local", "moments", "..", "m.json"),
      unresolved(engineLink, ".local", "m.json"),
      unresolved(engineLink, "..", "..", "m.json")
    ]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).not.toThrow();
    }
  });

  it("refuses a file path whose last segment is a link, and any dangling link on the way (fix round 1, Important 2)", async () => {
    const { tree, engine } = await workTree();
    const outside = await workspace();
    await mkdir(join(engine, ".local"));
    const privateFile = join(outside, "private.json");
    await writeFile(privateFile, "{}\n");
    // A careful operator's link to a private file: an atomic rename replaces the LINK, inside the tree.
    await symlink(privateFile, join(engine, "moment.json"));
    // A dangling link under .local/: an append would create its target, inside the tree.
    await symlink(join(tree, "results.jsonl"), join(engine, ".local", "results.jsonl"));
    // Outside the tree too: the check never guesses whether a writer follows the link or replaces it.
    await symlink(privateFile, join(outside, "alias.json"));
    for (const path of [join(engine, "moment.json"), join(engine, ".local", "results.jsonl"), join(outside, "alias.json")]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).toThrowError(refused);
    }
    // A dangling link on the way cannot be judged: where it leads does not exist yet.
    await symlink(join(tree, "absent-folder"), join(engine, ".local", "gone"));
    expect(() => assertMomentOutputPathUntracked(join(engine, ".local", "gone", "m.json"), "file", engine)).toThrowError(refused);
    expect(() => assertMomentOutputPathUntracked(join(engine, ".local", "gone"), "directory", engine)).toThrowError(refused);
    // A folder link is followed, as a writer follows it: judged where the files land.
    await symlink(outside, join(engine, "moments-elsewhere"));
    await symlink(tree, join(outside, "back-into-the-tree"));
    expect(() => assertMomentOutputPathUntracked(join(engine, "moments-elsewhere"), "directory", engine)).not.toThrow();
    expect(() => assertMomentOutputPathUntracked(join(outside, "back-into-the-tree"), "directory", engine)).toThrowError(refused);
  });

  it("refuses a path inside ANY enclosing checkout, not only the nearest (fix round 1, Minor 2)", async () => {
    // A worktree nests inside its main checkout, and both are tracked trees.
    const outer = join(await workspace(), "main");
    const worktree = join(outer, "worktrees", "wt");
    const engine = join(worktree, "engine");
    await mkdir(join(outer, ".git"), { recursive: true });
    await mkdir(engine, { recursive: true });
    await writeFile(join(worktree, ".git"), "gitdir: elsewhere\n");
    for (const path of [
      join(outer, "apps", "x.json"),
      unresolved(engine, "..", "..", "..", "apps", "x.json"),
      join(worktree, "x.json"),
      join(engine, "x.json")
    ]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).toThrowError(refused);
    }
    expect(() => assertMomentOutputPathUntracked(join(outer, "apps"), "directory", engine)).toThrowError(refused);
    for (const path of [join(outer, ".local", "x.json"), join(engine, ".local", "x.json")]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).not.toThrow();
    }
    // A checkout that sits under an outer .local/ folder is still a tracked tree of its own.
    const ignoredCheckout = join(outer, ".local", "scratch-checkout");
    const ignoredEngine = join(ignoredCheckout, "engine");
    await mkdir(join(ignoredCheckout, ".git"), { recursive: true });
    await mkdir(ignoredEngine);
    expect(() => assertMomentOutputPathUntracked(join(ignoredEngine, "x.json"), "file", ignoredEngine)).toThrowError(refused);
    expect(() => assertMomentOutputPathUntracked(join(ignoredEngine, ".local", "x.json"), "file", ignoredEngine)).not.toThrow();
  });

  it("reads a trailing or doubled slash without hiding a dangling link (fix round 2, N1)", async () => {
    const { engine } = await workTree();
    const outside = await workspace();
    // Both point at folders the tree does not have yet: `mkdir("<link>/")` creates a dangling link's target.
    const danglingLink = join(outside, "dlink");
    await symlink(join(engine, "newdir"), danglingLink);
    await symlink(join(engine, "src-new"), join(engine, ".local"));
    expect(() => assertMomentOutputPathUntracked(`${danglingLink}${sep}`, "directory", engine)).toThrowError(refused);
    expect(() => assertMomentOutputPathUntracked(`${danglingLink}${sep}${sep}m.json`, "file", engine)).toThrowError(refused);
    expect(() => assertMomentOutputPathUntracked(`${join(engine, ".local")}${sep}`, "directory", engine)).toThrowError(refused);
    expect(() => assertMomentOutputPathUntracked(`${join(engine, ".local")}${sep}${sep}m.json`, "file", engine)).toThrowError(refused);
    // Spelled without the extra slashes, each was already refused.
    expect(() => assertMomentOutputPathUntracked(danglingLink, "directory", engine)).toThrowError(refused);
    expect(existsSync(join(engine, "newdir"))).toBe(false);
    expect(existsSync(join(engine, "src-new"))).toBe(false);
  });

  it("makes a path absolute by collapsing slashes only: `.` and `..` stay for the kernel (fix round 2, N1)", () => {
    expect(absolutePathOf(`${sep}a${sep}${sep}b${sep}`)).toBe(`${sep}a${sep}b`);
    expect(absolutePathOf(`${sep}a${sep}.${sep}b${sep}..${sep}${sep}c`)).toBe(`${sep}a${sep}.${sep}b${sep}..${sep}c`);
    expect(absolutePathOf(sep)).toBe(sep);
    expect(absolutePathOf(`x${sep}${sep}y${sep}`)).toBe(`${process.cwd()}${sep}x${sep}y`);
  });

  it("refuses a tracked path spelled in another letter case, on a case-insensitive volume", async (context) => {
    // relay-host fix round 2: a folder spelled in another case must not compare as "outside" the tree.
    const outer = join(await workspace(), "CaseFold");
    const tree = join(outer, "Tree");
    const engine = join(tree, "engine");
    await mkdir(join(tree, ".git"), { recursive: true });
    await mkdir(engine);
    const flippedOuter = join(dirname(outer), "cASEfOLD");
    // The probe: on a case-sensitive volume the flipped spelling names no folder at all.
    if (!existsSync(flippedOuter)) {
      context.skip("the temporary volume is case-sensitive: there a flipped-case path is a different path");
    }
    for (const path of [
      join(flippedOuter, "Tree", "engine", "m.json"),
      join(outer, "tREE", "engine", "m.json"),
      join(outer, "Tree", "ENGINE", "m.json")
    ]) {
      expect(() => assertMomentOutputPathUntracked(path, "file", engine), path).toThrowError(refused);
    }
  });

  it("decides from this module's own engine root when no root is given, as the tools call it", () => {
    // A relative path resolves from the cwd, which `pnpm run` makes the engine root.
    const intoTheEngine = relative(process.cwd(), join(ENGINE_ROOT, "moments", "m.json"));
    expect(() => assertMomentOutputPathUntracked(intoTheEngine, "file")).toThrowError(refused);
    expect(() => assertMomentOutputPathUntracked(ENGINE_ROOT, "directory")).toThrowError(refused);
    expect(() => assertMomentOutputPathUntracked(join(ENGINE_ROOT, ".local", "moments"), "directory")).not.toThrow();
  });

  it("refuses the repository-root seam outside NODE_ENV=test", async () => {
    const { engine } = await workTree();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      expect(() => assertMomentOutputPathUntracked(join(engine, ".local", "m.json"), "file", engine))
        .toThrowError(expect.objectContaining({ code: "MOMENT_TOOLS_TEST_ONLY_REPOSITORY_ROOT_FORBIDDEN" }));
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});

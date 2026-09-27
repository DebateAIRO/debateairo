import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import type { DebateRole } from "@debateai/kernel";
import { appendFramedRejection, type PromptPacket } from "@debateai/providers";
import { MomentFileSchema, canonicalPromptFingerprint, momentIdFor, type MomentBuilder } from "@debateai/scorecard";
import { buildSynthesisDigest, type SynthesisDigest } from "@debateai/serve";
import {
  configureMomentContentAccess,
  exportMoment,
  exportRunMoments,
  main,
  momentFileNameFor,
  parseExportArguments,
  type MomentCallRow,
  type MomentSource
} from "../../acceptance/export-moment.js";
import {
  assertMomentOutputPathUntracked,
  captureMomentPacket,
  parseMomentBuilder,
  writePrivateJsonFile
} from "../../acceptance/moment-tools.js";
import { absolutePathOf } from "../../acceptance/untracked-path.js";

/**
 * Model scorecard A18 — export-moment over an in-memory source. The Postgres
 * source is exercised end to end by A18d, over a real run.
 */
const RUN = "11111111-1111-4111-8111-111111111111";
const QUESTION = "Should the city build the new bridge?";
const HASH = "c".repeat(64);
const EXPORTED_AT = "2026-09-26T12:00:00.000Z";

interface RecordedCall {
  readonly key: string;
  readonly modelRole: DebateRole | null;
  readonly packet: PromptPacket | null;
  readonly outcomes: readonly ("OK" | "FAILED" | "TIMED_OUT")[];
  readonly storedFingerprint?: string;
}

function row(key: string, index: number, outcome: string, modelRole: string | null): MomentCallRow {
  return {
    attemptId: `attempt:${key}:${String(index)}`,
    outcome,
    contractHash: HASH,
    modelRole,
    thinkingLevel: "low",
    rawArtifactId: `artifact:${key}:${String(index)}`,
    providerRef: "provider:a",
    maker: "Maker A",
    modelId: "model-a"
  };
}

function memorySource(calls: readonly RecordedCall[]): MomentSource {
  const byKey = new Map<string, RecordedCall>(calls.map((call) => [call.key, call]));
  return {
    readQuestion: async () => QUESTION,
    listCallSiteKeys: async () => calls.map((call) => call.key),
    readCallRows: async (_runId, key) => {
      const call = byKey.get(key);
      return call === undefined ? [] : call.outcomes.map((outcome, index) => row(key, index, outcome, call.modelRole));
    },
    readCallPrompt: async (attemptId) => {
      const call = calls.find((candidate) => attemptId === `attempt:${candidate.key}:0`);
      if (call === undefined || call.packet === null) return null;
      return {
        promptText: JSON.stringify(call.packet.messages),
        promptFingerprint: call.storedFingerprint ?? canonicalPromptFingerprint(call.packet.messages)
      };
    },
    readReply: async (_runId, rawArtifactId) => `reply of ${rawArtifactId}`
  };
}

const ASSESS: MomentBuilder = { family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement: "Build it." } };
const SUPPORT: MomentBuilder = {
  family: "JUDGE_JUDGE", inputs: { questionLine: QUESTION, leg: { kind: "support", positionUnderDebate: "Build it." } }
};
const packetOf = (builder: MomentBuilder) => captureMomentPacket(parseMomentBuilder(builder));
const exportOne = (source: MomentSource, callSiteKey: string) =>
  exportMoment(source, { runId: RUN, callSiteKey, exportedAt: EXPORTED_AT, engineCommit: null });

describe("A18 · exportMoment", () => {
  it("writes a valid moment: live inputs, the accepted reply after a failed attempt, the scorecard's id", async () => {
    const source = memorySource([
      { key: "PANEL:root:provider:a:seat:main", modelRole: "JUDGE", packet: await packetOf(ASSESS), outcomes: ["FAILED", "OK"] }
    ]);
    const moment = await exportOne(source, "PANEL:root:provider:a:seat:main");
    expect(MomentFileSchema.parse(moment)).toEqual(moment);
    expect(moment).toMatchObject({
      kind: "DEBATEAI_MOMENT",
      role: "JUDGE",
      language: null,
      contractHash: HASH,
      builder: ASSESS,
      graderContext: { question: QUESTION, excerpts: [{ label: "statement", text: "Build it." }] },
      recorded: {
        providerRef: "provider:a", maker: "Maker A", modelId: "model-a", thinkingLevel: "low",
        replyText: "reply of artifact:PANEL:root:provider:a:seat:main:1"
      },
      source: { runId: RUN, callSiteKey: "PANEL:root:provider:a:seat:main", exportedAt: EXPORTED_AT, engineCommit: null }
    });
    expect(moment.momentId).toBe(momentIdFor({ role: "JUDGE", contractHash: HASH, builder: ASSESS }));
    expect(moment.recorded?.promptFingerprint).toBe(canonicalPromptFingerprint((await packetOf(ASSESS)).messages));
  });

  it("takes the role from the recorded column first, from the key otherwise", async () => {
    const packet = await packetOf(SUPPORT);
    const fromColumn = await exportOne(memorySource([
      { key: "custom:site", modelRole: "SUPPORT_ATTACK", packet, outcomes: ["OK"] }
    ]), "custom:site");
    expect(fromColumn.role).toBe("SUPPORT_ATTACK");
    const fromKey = await exportOne(memorySource([
      { key: "JUDGE:defender:root0:r1:p0", modelRole: null, packet, outcomes: ["OK"] }
    ]), "JUDGE:defender:root0:r1:p0");
    expect(fromKey.role).toBe("SUPPORT_ATTACK");
    await expect(exportOne(memorySource([
      { key: "custom:site", modelRole: null, packet, outcomes: ["OK"] }
    ]), "custom:site")).rejects.toMatchObject({ code: "MOMENT_ROLE_UNRESOLVED" });
  });

  it("records no reply for a call that never succeeded", async () => {
    const moment = await exportOne(memorySource([
      { key: "JUDGE:defender:root0:r1:p0", modelRole: "SUPPORT_ATTACK", packet: await packetOf(SUPPORT), outcomes: ["TIMED_OUT", "FAILED"] }
    ]), "JUDGE:defender:root0:r1:p0");
    expect(moment.recorded).toBeNull();
  });

  it("refuses a key with no call, a call with no prompt record and a record that is not its fingerprint", async () => {
    const packet = await packetOf(ASSESS);
    await expect(exportOne(memorySource([]), "PANEL:root:provider:a"))
      .rejects.toMatchObject({ code: "MOMENT_CALL_NOT_FOUND" });
    await expect(exportOne(memorySource([{ key: "PANEL:root:provider:a", modelRole: "JUDGE", packet: null, outcomes: ["OK"] }]), "PANEL:root:provider:a"))
      .rejects.toMatchObject({ code: "MOMENT_INPUTS_NOT_RECORDED" });
    await expect(exportOne(memorySource([
      { key: "PANEL:root:provider:a", modelRole: "JUDGE", packet, outcomes: ["OK"], storedFingerprint: "f".repeat(64) }
    ]), "PANEL:root:provider:a")).rejects.toMatchObject({ code: "MOMENT_FINGERPRINT_INCONSISTENT" });
  });

  it("exports a run key by key, skipping only calls that cannot be moments", async () => {
    const source = memorySource([
      { key: "PANEL:root:provider:a", modelRole: "JUDGE", packet: await packetOf(ASSESS), outcomes: ["OK"] },
      { key: "JUDGE:defender:root0:r1:p0", modelRole: null, packet: null, outcomes: ["OK"] },
      { key: "custom:site", modelRole: null, packet: await packetOf(ASSESS), outcomes: ["OK"] }
    ]);
    const exported = await exportRunMoments(source, { runId: RUN, exportedAt: EXPORTED_AT, engineCommit: null });
    expect(exported.moments.map((moment) => moment.source.callSiteKey)).toEqual(["PANEL:root:provider:a"]);
    expect(exported.skipped).toEqual([
      { callSiteKey: "JUDGE:defender:root0:r1:p0", code: "MOMENT_INPUTS_NOT_RECORDED" },
      { callSiteKey: "custom:site", code: "MOMENT_ROLE_UNRESOLVED" }
    ]);
    await expect(exportRunMoments(memorySource([
      { key: "PANEL:root:provider:a", modelRole: "JUDGE", packet: await packetOf(ASSESS), outcomes: ["OK"], storedFingerprint: "f".repeat(64) }
    ]), { runId: RUN, exportedAt: EXPORTED_AT, engineCommit: null })).rejects.toMatchObject({ code: "MOMENT_FINGERPRINT_INCONSISTENT" });
  });
});

describe("A18 · the moment:export command line", () => {
  let scratch: string | null = null;
  afterEach(async () => {
    if (scratch !== null) await rm(scratch, { recursive: true, force: true });
    scratch = null;
  });

  it("reads one key or a whole run, and nothing else", () => {
    expect(parseExportArguments(["--", "--run", RUN, "--call-site-key", "JUDGE", "--out", "m.json"])).toEqual({
      runId: RUN, target: { kind: "ONE", callSiteKey: "JUDGE", outPath: "m.json" }, engineCommit: null
    });
    expect(parseExportArguments(["--run", RUN, "--all", "--out-dir", "moments", "--engine-commit", "19551cd8"])).toEqual({
      runId: RUN, target: { kind: "ALL", outDir: "moments" }, engineCommit: "19551cd8"
    });
    for (const argv of [
      ["--run", RUN],
      ["--run", RUN, "--all", "--out", "m.json"],
      ["--run", RUN, "--call-site-key", "JUDGE", "--out-dir", "moments"],
      ["--run", RUN, "--all", "--out-dir", "moments", "--engine-commit", "not-hex"],
      ["--run", RUN, "--all", "--out-dir", "moments", "--run", RUN]
    ]) {
      expect(() => parseExportArguments(argv)).toThrowError(expect.objectContaining({ code: "MOMENT_USAGE" }));
    }
  });

  it("refuses a hosted deployment before it looks for a database", async () => {
    await expect(main(["--run", RUN, "--all", "--out-dir", "moments"], { DEBATEAI_DEPLOYMENT_MODE: "hosted" }))
      .rejects.toMatchObject({ code: "MOMENT_TOOL_REFUSED_IN_HOSTED" });
    await expect(main(["--run", RUN, "--all", "--out-dir", "moments"], {}))
      .rejects.toMatchObject({ code: "MOMENT_DATABASE_URL_REQUIRED" });
  });

  it("names --all files by moment AND call site, so identical prompts at two sites never overwrite each other (F26)", () => {
    const momentId = "a".repeat(64);
    const siteTag = (key: string) => createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12);
    const at = (callSiteKey: string) => momentFileNameFor({ momentId, source: { callSiteKey } });
    expect(at("JUDGE:seat:main")).toBe(`${momentId}.${siteTag("JUDGE:seat:main")}.moment.json`);
    expect(at("JUDGE:review:n1:seat:main")).not.toBe(at("JUDGE:seat:main"));
    expect(at("JUDGE:seat:main")).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{12}\.moment\.json$/u);
  });

  it("writes moment files owner-only", async () => {
    scratch = await mkdtemp(join(tmpdir(), "a18-export-"));
    const path = join(scratch, "one.moment.json");
    await writePrivateJsonFile(path, { kind: "DEBATEAI_MOMENT" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ kind: "DEBATEAI_MOMENT" });
  });

  it("reads an encrypted run only with both key paths, and configures nothing for a clear one", () => {
    // Never queried: the refusal comes before any key is loaded or any cipher is configured.
    const pool = {} as Pool;
    for (const environment of [
      { CONTENT_ENCRYPTION_ENABLED: "true" },
      { CONTENT_ENCRYPTION_ENABLED: "true", KEK_PATH: "", USER_DEK_STORE_PATH: "store" },
      { CONTENT_ENCRYPTION_ENABLED: "true", KEK_PATH: "kek" }
    ]) {
      expect(() => configureMomentContentAccess(pool, environment))
        .toThrowError(expect.objectContaining({ code: "MOMENT_CONTENT_KEYS_UNRESOLVED" }));
    }
    expect(() => configureMomentContentAccess(pool, {})).not.toThrow();
  });
});

/**
 * A18 carry 1 (pre-flight E4), as the controller ruled it in fix round 1 — THE
 * MOMENT IS THE FIRST ANSWER THAT BELONGS TO A RECORDED SEQUENCE. A resumed pass
 * re-authors every site, so one call-site key can carry different initial
 * packets. A record of exactly 2 messages starts a sequence; a later attempt
 * with no record, or a repair (more than 2 messages), belongs to the sequence
 * before it. An OK attempt with no recorded start at or before it (a pass
 * before migration 0072) belongs to none and is passed over. With no answer in
 * any recorded sequence, the moment is the key's first sequence with
 * `recorded: null`.
 */
interface RecordedAttempt {
  readonly outcome: "OK" | "FAILED" | "TIMED_OUT";
  readonly prompt: PromptPacket | null;
  readonly storedFingerprint?: string;
}

/** One key whose attempts each carry their OWN prompt record (or none). */
function attemptSource(key: string, modelRole: DebateRole | null, attempts: readonly RecordedAttempt[]): MomentSource {
  const attemptIdOf = (index: number): string => `attempt:${key}:${String(index)}`;
  return {
    readQuestion: async () => QUESTION,
    listCallSiteKeys: async () => [key],
    readCallRows: async (_runId, asked) =>
      asked === key ? attempts.map((attempt, index) => row(key, index, attempt.outcome, modelRole)) : [],
    readCallPrompt: async (attemptId) => {
      const attempt = attempts.find((_, index) => attemptIdOf(index) === attemptId);
      if (attempt === undefined || attempt.prompt === null) return null;
      return {
        promptText: JSON.stringify(attempt.prompt.messages),
        promptFingerprint: attempt.storedFingerprint ?? canonicalPromptFingerprint(attempt.prompt.messages)
      };
    },
    readReply: async (_runId, rawArtifactId) => `reply of ${rawArtifactId}`
  };
}

/**
 * A record that is its OWN fingerprint (self-check 1 passes on it) but that the
 * live builder no longer sends: one sentence appended to the frame's opening
 * message, as if the instruction had drifted since the run.
 */
function drifted(packet: PromptPacket): PromptPacket {
  const [opening, ...rest] = packet.messages;
  return Object.freeze({
    messages: [{ ...opening!, content: `${opening!.content}\nOne more sentence the live builder never writes.` }, ...rest]
  });
}

describe("A18 · the moment comes from the sequence that answered (carry 1)", () => {
  const KEY = "PANEL:root:provider:a:seat:main";
  /** The same site after a resume: the material was rewritten. */
  const REWRITTEN: MomentBuilder = {
    family: "JUDGE_ASSESS", inputs: { questionLine: QUESTION, statement: "Repair the old bridge instead." }
  };
  /** The gateway's own repair packet: the initial packet plus one fenced rejection. */
  const repairOf = (packet: PromptPacket): PromptPacket =>
    appendFramedRejection(packet, { code: "SCHEMA_FAILED", path: "assessment" });
  const fingerprintOf = (packet: PromptPacket): string => canonicalPromptFingerprint(packet.messages);
  const sequenceMoment = (attempts: readonly RecordedAttempt[]) => exportOne(attemptSource(KEY, "JUDGE", attempts), KEY);

  it("[FAILED (prompt A), OK (prompt B, different material)] → builder and fingerprint from B", async () => {
    const [a, b] = [await packetOf(ASSESS), await packetOf(REWRITTEN)];
    const moment = await sequenceMoment([{ outcome: "FAILED", prompt: a }, { outcome: "OK", prompt: b }]);
    expect(moment.builder).toEqual(REWRITTEN);
    expect(moment.momentId).toBe(momentIdFor({ role: "JUDGE", contractHash: HASH, builder: REWRITTEN }));
    expect(moment.graderContext.excerpts).toEqual([{ label: "statement", text: "Repair the old bridge instead." }]);
    expect(moment.recorded).toMatchObject({ promptFingerprint: fingerprintOf(b), replyText: `reply of artifact:${KEY}:1` });
  });

  it("keeps a repair and an unrecorded attempt in the sequence they follow; the FIRST answer decides", async () => {
    const [a, b] = [await packetOf(ASSESS), await packetOf(REWRITTEN)];
    const repaired = await sequenceMoment([{ outcome: "FAILED", prompt: a }, { outcome: "OK", prompt: repairOf(a) }]);
    expect(repaired.builder).toEqual(ASSESS);
    expect(repaired.recorded).toMatchObject({ promptFingerprint: fingerprintOf(a), replyText: `reply of artifact:${KEY}:1` });

    const resumed = await sequenceMoment([
      { outcome: "FAILED", prompt: a },
      { outcome: "TIMED_OUT", prompt: null },
      { outcome: "FAILED", prompt: b },
      { outcome: "OK", prompt: repairOf(b) }
    ]);
    expect(resumed.builder).toEqual(REWRITTEN);
    expect(resumed.recorded).toMatchObject({ promptFingerprint: fingerprintOf(b), replyText: `reply of artifact:${KEY}:3` });

    const unrecordedAnswer = await sequenceMoment([
      { outcome: "FAILED", prompt: a }, { outcome: "FAILED", prompt: b }, { outcome: "OK", prompt: null }
    ]);
    expect(unrecordedAnswer.builder).toEqual(REWRITTEN);
    expect(unrecordedAnswer.recorded?.replyText).toBe(`reply of artifact:${KEY}:2`);

    // A later pass never replaces the sequence that answered first.
    const answeredFirst = await sequenceMoment([
      { outcome: "OK", prompt: a }, { outcome: "FAILED", prompt: b }, { outcome: "OK", prompt: b }
    ]);
    expect(answeredFirst.builder).toEqual(ASSESS);
    expect(answeredFirst.recorded).toMatchObject({ promptFingerprint: fingerprintOf(a), replyText: `reply of artifact:${KEY}:0` });
  });

  it("passes over an answer that belongs to no recorded sequence (a pass before migration 0072)", async () => {
    const b = await packetOf(REWRITTEN);
    // [OK (no record), FAILED (B), OK (B)] → B, answered by the third row.
    const straddling = await sequenceMoment([
      { outcome: "OK", prompt: null }, { outcome: "FAILED", prompt: b }, { outcome: "OK", prompt: b }
    ]);
    expect(straddling.builder).toEqual(REWRITTEN);
    expect(straddling.recorded).toMatchObject({ promptFingerprint: fingerprintOf(b), replyText: `reply of artifact:${KEY}:2` });
    // [OK (no record), FAILED (B)] → B, with no reply: no recorded sequence answered.
    const neverAnswered = await sequenceMoment([{ outcome: "OK", prompt: null }, { outcome: "FAILED", prompt: b }]);
    expect(neverAnswered.builder).toEqual(REWRITTEN);
    expect(neverAnswered.recorded).toBeNull();
  });

  it("takes the key's FIRST sequence, with no reply, when no attempt answered", async () => {
    const [a, b] = [await packetOf(ASSESS), await packetOf(REWRITTEN)];
    const moment = await sequenceMoment([
      { outcome: "TIMED_OUT", prompt: null },
      { outcome: "FAILED", prompt: a },
      { outcome: "FAILED", prompt: repairOf(a) },
      { outcome: "TIMED_OUT", prompt: b }
    ]);
    expect(moment.builder).toEqual(ASSESS);
    expect(moment.recorded).toBeNull();
  });

  it("checks that the answering sequence's own record is its fingerprint, never a failed pass's record (self-check 1)", async () => {
    const [a, b] = [await packetOf(ASSESS), await packetOf(REWRITTEN)];
    await expect(sequenceMoment([
      { outcome: "FAILED", prompt: a }, { outcome: "OK", prompt: b, storedFingerprint: "f".repeat(64) }
    ])).rejects.toMatchObject({ code: "MOMENT_FINGERPRINT_INCONSISTENT" });
    // The pass that failed is never the moment, so its record is never the one checked.
    const moment = await sequenceMoment([
      { outcome: "FAILED", prompt: a, storedFingerprint: "f".repeat(64) }, { outcome: "OK", prompt: b }
    ]);
    expect(moment.builder).toEqual(REWRITTEN);
  });

  it("refuses a record that is its own fingerprint but that the live builder no longer sends (self-check 2)", async () => {
    const a = await packetOf(ASSESS);
    await expect(sequenceMoment([{ outcome: "OK", prompt: drifted(a) }]))
      .rejects.toMatchObject({ code: "MOMENT_FINGERPRINT_INCONSISTENT", message: expect.stringContaining("live builder") });
    // Loud in a whole-run export too: never skipped.
    await expect(exportRunMoments(attemptSource(KEY, "JUDGE", [{ outcome: "OK", prompt: drifted(a) }]), {
      runId: RUN, exportedAt: EXPORTED_AT, engineCommit: null
    })).rejects.toMatchObject({ code: "MOMENT_FINGERPRINT_INCONSISTENT" });
  });

  it("refuses an orphan repair and a record that is neither kind, loudly", async () => {
    const [a, b] = [await packetOf(ASSESS), await packetOf(REWRITTEN)];
    // A repair is built from its own call's initial packet, recorded before it was sent:
    // a repair with no recorded start before it is a damaged ledger, never a skip.
    await expect(sequenceMoment([{ outcome: "OK", prompt: repairOf(a) }]))
      .rejects.toMatchObject({ code: "MOMENT_INITIAL_PROMPT_UNRECORDED" });
    await expect(exportRunMoments(attemptSource(KEY, "JUDGE", [{ outcome: "OK", prompt: repairOf(a) }]), {
      runId: RUN, exportedAt: EXPORTED_AT, engineCommit: null
    })).rejects.toMatchObject({ code: "MOMENT_INITIAL_PROMPT_UNRECORDED" });
    // One message is neither an initial packet (2) nor a repair (more).
    const lone: PromptPacket = Object.freeze({ messages: a.messages.slice(0, 1) });
    await expect(sequenceMoment([{ outcome: "FAILED", prompt: lone }, { outcome: "OK", prompt: b }]))
      .rejects.toMatchObject({ code: "MOMENT_RECORDED_PROMPT_UNREADABLE" });
  });
});

/**
 * Review Minor 4 — THE PROMPT TEXT'S JSON ROUND TRIP, per family. A record is
 * the JSON of the messages; the synthesis inputs are read back out of it (the
 * digest as the SAME object, key order kept) and rebuilt by the live builder.
 * Self-check 2 passing here pins that the round trip changes no byte.
 */
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
const ROUND_TRIP_CASES: readonly (readonly [DebateRole, string, MomentBuilder])[] = [
  ["ANSWER_WRITER", "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main", {
    family: "SYNTHESIS_WRITER", inputs: { round: 1, digest: digest(), codeLabel: CODE_LABEL, priorObjection: null }
  }],
  ["ANSWER_CHECKER", "POST_COMPOSE_R9:EVALUATOR:1", {
    family: "SYNTHESIS_CHECKER",
    inputs: { round: 1, digest: digest(), codeLabel: CODE_LABEL, candidateStatement: "Build it, with the cost caveat." }
  }],
  ["REVIEWER", "JUDGE:review:0f4d7c1e-2b8a-4c3d-9e5f-a1b2c3d4e5f6", {
    family: "JUDGE_REVIEW",
    inputs: {
      questionLine: QUESTION, statement: "The repair costs more over thirty years.",
      edges: [
        { targetStatement: "Build it.", polarity: "support" },
        { targetStatement: "Repair the old one.", polarity: "attack" }
      ]
    }
  }]
];

describe("A18 · every family survives the recorded prompt's JSON round trip (review Minor 4)", () => {
  it.each(ROUND_TRIP_CASES)("%s at %s: exported through the record, rebuilt by the live builder", async (role, key, builder) => {
    const packet = await packetOf(builder);
    const moment = await exportOne(attemptSource(key, role, [{ outcome: "OK", prompt: packet }]), key);
    expect(MomentFileSchema.parse(moment)).toEqual(moment);
    expect(moment.role).toBe(role);
    expect(moment.builder).toEqual(builder);
    expect(moment.recorded?.promptFingerprint).toBe(canonicalPromptFingerprint(packet.messages));
    // Through the file's own JSON as well: the round trip replay starts from.
    const reread = MomentFileSchema.parse(JSON.parse(JSON.stringify(moment)));
    const rebuilt = await captureMomentPacket(parseMomentBuilder(reread.builder, reread.role));
    expect(canonicalPromptFingerprint(rebuilt.messages)).toBe(moment.recorded?.promptFingerprint);
  });
});

/**
 * A18 carries 4 and 7 (pre-flight R6) — A MOMENT NEVER LANDS IN THE TRACKED
 * TREE, AND IT LANDS WHERE IT WAS JUDGED. The RAW `--out` / `--out-dir` is
 * judged before any database read, then created, written and printed at
 * `absolutePathOf(raw)`: `resolve` (or `join`) folds `..` by string rules before
 * a link is read, so a write could land somewhere other than the judged place.
 */
describe("A18 · moment:export writes only where the path was judged (carries 4 and 7)", () => {
  /** This engine's root, from this file's own address — never a spelled-out path. */
  const ENGINE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const KEY = "PANEL:root:provider:a:seat:main";
  /** Never reached by a passing case: an address with nothing listening, and no credential. */
  const ENVIRONMENT = { DATABASE_URL: "postgres://127.0.0.1:9/moment-export-unused" };
  const refused = expect.objectContaining({ code: "MOMENT_OUTPUT_PATH_REFUSED" });
  const workspaces: string[] = [];
  const workspace = async (): Promise<string> => {
    const created = await mkdtemp(join(tmpdir(), "a18-export-out-"));
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
  /** Joined as a STRING, so `..` stays for the kernel: `join` would fold it away before any link is read. */
  const unresolved = (...segments: string[]): string => segments.join(sep);
  const judgeSource = async (): Promise<MomentSource> =>
    memorySource([{ key: KEY, modelRole: "JUDGE", packet: await packetOf(ASSESS), outcomes: ["OK"] }]);
  const momentFilesIn = async (folder: string): Promise<readonly string[]> =>
    (await readdir(folder)).filter((name) => name.endsWith(".moment.json")).sort();

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("refuses a tracked --out or --out-dir before it reads the database", async () => {
    const { tree, engine } = await workTree();
    const reads: string[] = [];
    const inner = await judgeSource();
    const spying: MomentSource = {
      readQuestion: async (runId) => { reads.push("readQuestion"); return inner.readQuestion(runId); },
      listCallSiteKeys: async (runId) => { reads.push("listCallSiteKeys"); return inner.listCallSiteKeys(runId); },
      readCallRows: async (runId, key) => { reads.push("readCallRows"); return inner.readCallRows(runId, key); },
      readCallPrompt: async (attemptId) => { reads.push("readCallPrompt"); return inner.readCallPrompt(attemptId); },
      readReply: async (runId, id) => { reads.push("readReply"); return inner.readReply(runId, id); }
    };
    const lines: string[] = [];
    for (const argv of [
      ["--run", RUN, "--call-site-key", KEY, "--out", join(engine, "m.json")],
      ["--run", RUN, "--all", "--out-dir", join(engine, "moments")],
      ["--run", RUN, "--all", "--out-dir", tree]
    ]) {
      await expect(main(argv, ENVIRONMENT, (line) => { lines.push(line); }, { source: spying, repositoryRoot: engine }))
        .rejects.toMatchObject({ code: "MOMENT_OUTPUT_PATH_REFUSED" });
    }
    expect(reads).toEqual([]);
    expect(lines).toEqual([]);
    expect(existsSync(join(engine, "moments"))).toBe(false);
    // With no seam the tool judges from its own engine root, before it opens the database at all:
    // a check that ran later would fail on the connection instead.
    for (const out of [join(ENGINE_ROOT, "m.json"), relative(process.cwd(), join(ENGINE_ROOT, "moments", "m.json"))]) {
      await expect(main(["--run", RUN, "--call-site-key", KEY, "--out", out], ENVIRONMENT)).rejects.toMatchObject(refused);
    }
  });

  it("writes tree/lnkout/../m.json outside the tree, where the kernel puts it (carry 7, the reverse case)", async () => {
    const { tree, engine } = await workTree();
    const outside = await workspace();
    await mkdir(join(outside, "sub"));
    await symlink(join(outside, "sub"), join(tree, "lnkout"));
    const raw = unresolved(tree, "lnkout", "..", "m.json");
    // Judged where the kernel puts it — outside — so admitted.
    expect(() => assertMomentOutputPathUntracked(raw, "file", engine)).not.toThrow();
    const lines: string[] = [];
    await main(["--run", RUN, "--call-site-key", KEY, "--out", raw], ENVIRONMENT, (line) => { lines.push(line); }, {
      source: await judgeSource(), repositoryRoot: engine
    });
    // `resolve` would have folded `lnkout/..` into the tree, next to the link.
    expect(existsSync(join(tree, "m.json"))).toBe(false);
    const landed = join(outside, "m.json");
    expect((await stat(landed)).mode & 0o777).toBe(0o600);
    const moment = MomentFileSchema.parse(JSON.parse(await readFile(landed, "utf8")));
    expect(moment.source.callSiteKey).toBe(KEY);
    expect(lines).toEqual([`MOMENT JUDGE ${moment.momentId} ${absolutePathOf(raw)}`]);
  });

  it("writes --out-dir tree/lnkout/.. outside the tree, file by file (carry 7, the reverse case)", async () => {
    const { tree, engine } = await workTree();
    const outside = await workspace();
    await mkdir(join(outside, "sub"));
    await symlink(join(outside, "sub"), join(tree, "lnkout"));
    const raw = unresolved(tree, "lnkout", "..");
    expect(() => assertMomentOutputPathUntracked(raw, "directory", engine)).not.toThrow();
    const lines: string[] = [];
    await main(["--run", RUN, "--all", "--out-dir", raw], ENVIRONMENT, (line) => { lines.push(line); }, {
      source: await judgeSource(), repositoryRoot: engine
    });
    // `join(outDir, name)` would have folded `lnkout/..` the same way.
    expect(await momentFilesIn(tree)).toEqual([]);
    const written = await momentFilesIn(outside);
    expect(written).toHaveLength(1);
    expect((await stat(join(outside, written[0]!))).mode & 0o777).toBe(0o600);
    expect(lines.at(-1)).toBe(`MOMENTS WRITTEN 1 ${absolutePathOf(raw)}`);
  });

  it("writes a whole run under .local/: one owner-only file per site, no debate text on stdout", async () => {
    const { engine } = await workTree();
    const outDir = join(engine, ".local", "moments");
    const packet = await packetOf(ASSESS);
    const lines: string[] = [];
    await main(["--", "--run", RUN, "--all", "--out-dir", outDir, "--engine-commit", "43baa4a0"], ENVIRONMENT,
      (line) => { lines.push(line); }, {
        source: memorySource([
          { key: "PANEL:root:provider:a:seat:main", modelRole: "JUDGE", packet, outcomes: ["OK"] },
          { key: "PANEL:root:provider:a:seat:runnerUp", modelRole: "JUDGE", packet, outcomes: ["FAILED"] },
          { key: "custom:site", modelRole: null, packet, outcomes: ["OK"] }
        ]),
        repositoryRoot: engine
      });
    const names = await momentFilesIn(outDir);
    expect(names).toHaveLength(2);
    const moments = await Promise.all(names.map(async (name) => {
      const path = join(outDir, name);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      const moment = MomentFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
      expect(name).toBe(momentFileNameFor(moment));
      // The file is one replay will read: its builder agrees with its role (carry 3).
      expect(() => parseMomentBuilder(moment.builder, moment.role)).not.toThrow();
      return moment;
    }));
    // The same prompt at two sites: one moment id, two files (F26).
    const momentId = momentIdFor({ role: "JUDGE", contractHash: HASH, builder: ASSESS });
    expect(moments.map((moment) => [moment.momentId, moment.source.engineCommit])).toEqual([
      [momentId, "43baa4a0"], [momentId, "43baa4a0"]
    ]);
    expect(lines).toEqual([
      `MOMENT JUDGE ${momentId} PANEL:root:provider:a:seat:main`,
      `MOMENT JUDGE ${momentId} PANEL:root:provider:a:seat:runnerUp`,
      "MOMENT SKIPPED custom:site MOMENT_ROLE_UNRESOLVED",
      `MOMENTS WRITTEN 2 ${outDir}`
    ]);
    for (const line of lines) {
      expect(line).not.toContain(QUESTION);
      expect(line).not.toContain("Build it.");
    }
    // One key into a .local/ folder that does not exist yet: its folder is made, owner-only.
    const single = join(engine, ".local", "single", "m.json");
    await main(["--run", RUN, "--call-site-key", KEY, "--out", single], ENVIRONMENT, () => undefined, {
      source: await judgeSource(), repositoryRoot: engine
    });
    expect((await stat(single)).mode & 0o777).toBe(0o600);
    expect((await stat(join(engine, ".local", "single"))).mode & 0o777).toBe(0o700);
  });

  it("writes nothing for any key, not even the folder, when one key of a run fails self-check 2 (--all)", async () => {
    const { engine } = await workTree();
    const outDir = join(engine, ".local", "moments");
    const packet = await packetOf(ASSESS);
    const lines: string[] = [];
    await expect(main(["--run", RUN, "--all", "--out-dir", outDir], ENVIRONMENT, (line) => { lines.push(line); }, {
      source: memorySource([
        { key: "PANEL:root:provider:a:seat:main", modelRole: "JUDGE", packet, outcomes: ["OK"] },
        { key: "PANEL:root:provider:b:seat:main", modelRole: "JUDGE", packet: drifted(packet), outcomes: ["OK"] }
      ]),
      repositoryRoot: engine
    })).rejects.toMatchObject({ code: "MOMENT_FINGERPRINT_INCONSISTENT" });
    expect(existsSync(join(engine, ".local"))).toBe(false);
    expect(lines).toEqual([]);
  });

  it("refuses the in-memory source seam outside NODE_ENV=test", async () => {
    const outside = await workspace();
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      await expect(main(["--run", RUN, "--call-site-key", KEY, "--out", join(outside, "m.json")], ENVIRONMENT, () => undefined, {
        source: await judgeSource()
      })).rejects.toMatchObject({ code: "MOMENT_TOOLS_TEST_ONLY_SOURCE_FORBIDDEN" });
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
    expect(existsSync(join(outside, "m.json"))).toBe(false);
  });
});

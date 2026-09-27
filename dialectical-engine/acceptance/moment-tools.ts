import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  Judge,
  PanelMemberFailure,
  judgeLegModelRole,
  type JudgeLeg
} from "@debateai/judgement";
import { TypedDomainError, exhaustive, type DebateRole } from "@debateai/kernel";
import {
  PROVIDER_CONTEXT_WINDOW_EXCEEDED,
  PROVIDER_USAGE_CAP,
  ProviderCallFailedError,
  buildFramedRepairPrompt,
  promptContractFingerprintText,
  readPromptFrame,
  schemaFailureLocator,
  type CallBound,
  type PromptPacket,
  type ProviderGateway
} from "@debateai/providers";
import { resolveDeploymentMode } from "@debateai/register";
import {
  EVALUATOR_PROMPT_CONTRACT,
  buildSynthesisRolePrompt,
  classifySynthesisRoleContent,
  evaluatorVerdictSchema,
  parseComposerOutput
} from "@debateai/runner";
import type { MomentBuilder, MomentBuilderFamily, MomentFile, ReplayOutcome } from "@debateai/scorecard";
import {
  SYNTHESIZER_PROMPT_CONTRACT,
  buildEvaluatorRequest,
  buildSynthesizerRequest,
  seatBaseCallSiteKey,
  type EvaluatorRequest,
  type SynthesisDigest,
  type SynthesisLoopControls,
  type SynthesizerRequest
} from "@debateai/serve";

/**
 * Model scorecard A18 (spec §2.9) — what `moment:export` and `moment:replay` share.
 *
 * A MOMENT is one recorded model call, frozen as the exact inputs its prompt
 * builder consumed. The builders called here are the LIVE ones —
 * `Judge.judge/review/assess` and the runner's `buildSynthesisRolePrompt` — so a
 * replayed prompt is the recorded prompt by construction, and the canonical
 * fingerprint (fence and canary masked) proves it on every moment. Local and
 * operator use only: both tools refuse a hosted runtime and expose no endpoint.
 */

const FAMILY_BY_ROLE: Readonly<Record<DebateRole, MomentBuilderFamily>> = Object.freeze({
  POSITION: "JUDGE_JUDGE",
  SUPPORT_ATTACK: "JUDGE_JUDGE",
  CROSS_EXCHANGE: "JUDGE_JUDGE",
  JUDGE: "JUDGE_ASSESS",
  REVIEWER: "JUDGE_REVIEW",
  ANSWER_WRITER: "SYNTHESIS_WRITER",
  ANSWER_CHECKER: "SYNTHESIS_CHECKER"
});

export function momentFamilyOf(role: DebateRole): MomentBuilderFamily {
  return FAMILY_BY_ROLE[role];
}

const text = z.string().min(1);
const judgeLegSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("primary-root") }).strict(),
  z.object({ kind: z.literal("independent-root") }).strict(),
  z.object({ kind: z.literal("support"), positionUnderDebate: text }).strict(),
  z.object({ kind: z.literal("attack"), positionUnderDebate: text }).strict(),
  z.object({ kind: z.literal("cross-root"), ownPosition: text, otherMakersPosition: text }).strict()
]);
/** The code label AS THE MODEL SAW IT: the projection withholds `registerVersion`. */
const codeLabelSchema = z.object({
  verdictLabel: text,
  servedNodeId: text,
  servedStrength: z.number(),
  margin: z.number().nullable()
}).strict();
/**
 * Kept as the SAME object, never re-parsed into a new one, so its key order —
 * and so the `digest` field the prompt carries — survives the round trip byte
 * for byte. The fingerprint check proves it on every moment.
 */
const digestSchema = z.custom<SynthesisDigest>(
  (value) => typeof value === "object" && value !== null && Array.isArray((value as { nodes?: unknown }).nodes),
  "a synthesis digest"
);

export const JudgeJudgeInputsSchema = z.object({ questionLine: text, leg: judgeLegSchema }).strict();
export const JudgeReviewInputsSchema = z.object({
  questionLine: text,
  statement: text,
  edges: z.array(z.object({ targetStatement: text, polarity: z.enum(["support", "attack"]) }).strict())
}).strict();
export const JudgeAssessInputsSchema = z.object({ questionLine: text, statement: text }).strict();
export const SynthesisWriterInputsSchema = z.object({
  round: z.number().int().positive(),
  digest: digestSchema,
  codeLabel: codeLabelSchema,
  priorObjection: z.string().nullable()
}).strict();
export const SynthesisCheckerInputsSchema = z.object({
  round: z.number().int().positive(),
  digest: digestSchema,
  codeLabel: codeLabelSchema,
  candidateStatement: z.string()
}).strict();

/** A moment's builder with its inputs validated for its family (`MomentBuilder.inputs` is `unknown`). */
export type TypedMomentBuilder =
  | { readonly family: "JUDGE_JUDGE"; readonly inputs: z.infer<typeof JudgeJudgeInputsSchema> }
  | { readonly family: "JUDGE_REVIEW"; readonly inputs: z.infer<typeof JudgeReviewInputsSchema> }
  | { readonly family: "JUDGE_ASSESS"; readonly inputs: z.infer<typeof JudgeAssessInputsSchema> }
  | { readonly family: "SYNTHESIS_WRITER"; readonly inputs: z.infer<typeof SynthesisWriterInputsSchema> }
  | { readonly family: "SYNTHESIS_CHECKER"; readonly inputs: z.infer<typeof SynthesisCheckerInputsSchema> };

/**
 * A moment's builder, validated for its family. With the moment's `role` (A18
 * carry 3, pre-flight E11), it is also refused `MOMENT_FILE_INVALID` when the
 * two disagree: the role's family is not the builder's, or a JUDGE_JUDGE leg
 * does another debate job than the role names. A moment read from a file passes
 * its role (`readMomentFile`), so a writer's moment can never be rebuilt under
 * the checker's contract, nor filed under an id that names another role.
 */
export function parseMomentBuilder(builder: MomentBuilder, role?: DebateRole): TypedMomentBuilder {
  if (role !== undefined && momentFamilyOf(role) !== builder.family) {
    throw new TypedDomainError(
      "MOMENT_FILE_INVALID",
      `a ${role} moment is built by ${String(momentFamilyOf(role))}, not ${builder.family}`
    );
  }
  const parse = <T>(schema: z.ZodType<T>): T => {
    const parsed = schema.safeParse(builder.inputs);
    if (!parsed.success) {
      throw new TypedDomainError("MOMENT_BUILDER_INVALID", `${builder.family}: ${parsed.error.message}`);
    }
    return parsed.data;
  };
  const typed = typedMomentBuilderOf(builder.family, parse);
  if (role !== undefined && typed.family === "JUDGE_JUDGE" && judgeLegModelRole(typed.inputs.leg) !== role) {
    throw new TypedDomainError(
      "MOMENT_FILE_INVALID",
      `a ${typed.inputs.leg.kind} leg does the ${judgeLegModelRole(typed.inputs.leg)} job, not ${role}`
    );
  }
  return typed;
}

function typedMomentBuilderOf(
  family: MomentBuilderFamily,
  parse: <T>(schema: z.ZodType<T>) => T
): TypedMomentBuilder {
  switch (family) {
    case "JUDGE_JUDGE": return Object.freeze({ family, inputs: parse(JudgeJudgeInputsSchema) });
    case "JUDGE_REVIEW": return Object.freeze({ family, inputs: parse(JudgeReviewInputsSchema) });
    case "JUDGE_ASSESS": return Object.freeze({ family, inputs: parse(JudgeAssessInputsSchema) });
    case "SYNTHESIS_WRITER": return Object.freeze({ family, inputs: parse(SynthesisWriterInputsSchema) });
    case "SYNTHESIS_CHECKER": return Object.freeze({ family, inputs: parse(SynthesisCheckerInputsSchema) });
    default: return exhaustive(family);
  }
}

/**
 * The builder inputs a RECORDED initial packet was built from, read back through
 * the frame's own reader (`readPromptFrame`, the door's code). The call-site key
 * supplies what the synthesis prompts deliberately withhold (round and stage);
 * the contract id must be one the role's builder uses.
 */
export function builderFromRecordedPacket(role: DebateRole, callSiteKey: string, packet: PromptPacket): TypedMomentBuilder {
  if (packet.messages.length !== 2) {
    throw new TypedDomainError(
      "MOMENT_INITIAL_PROMPT_UNRECORDED",
      `${callSiteKey}: a moment is an initial packet (the frame and one fenced block), not ${String(packet.messages.length)} messages`
    );
  }
  const frame = readPromptFrame(packet);
  const has = (name: string): boolean => frame.fields.some((entry) => entry.name === name);
  const field = (name: string): string => {
    const found = frame.fields.find((entry) => entry.name === name);
    if (found === undefined) throw new TypedDomainError("MOMENT_FIELD_ABSENT", `${callSiteKey}: ${name}`);
    return found.content;
  };
  const json = (name: string): unknown => {
    try {
      return JSON.parse(field(name)) as unknown;
    } catch {
      throw new TypedDomainError("MOMENT_RECORDED_PROMPT_UNREADABLE", `${callSiteKey}: ${name} is not JSON`);
    }
  };
  const mismatch = (): never => {
    throw new TypedDomainError(
      "MOMENT_CONTRACT_MISMATCH",
      `${callSiteKey}: ${role} was recorded under contract ${frame.contractId}, which its builder never uses`
    );
  };
  const family = momentFamilyOf(role);
  const siteKey = seatBaseCallSiteKey(callSiteKey);
  switch (family) {
    case "JUDGE_JUDGE": {
      const kind = /^judge\.([a-z-]+)\.(?:unknown|resolved)\.v1$/u.exec(frame.contractId)?.[1];
      const leg: JudgeLeg = kind === "support" || kind === "attack"
        ? { kind, positionUnderDebate: field("position_under_debate") }
        : kind === "cross-root"
          ? { kind, ownPosition: field("own_position"), otherMakersPosition: field("other_makers_position") }
          : kind === "primary-root" || kind === "independent-root"
            ? { kind }
            : mismatch();
      if (judgeLegModelRole(leg) !== role) mismatch();
      return parseMomentBuilder({ family, inputs: { questionLine: field("question_line"), leg } });
    }
    case "JUDGE_REVIEW": {
      if (frame.contractId !== "judge.review.v1") mismatch();
      const edges = z.array(z.object({
        ordinal: z.number().int(),
        relation: z.enum(["support", "attack"]),
        target_statement: z.string()
      }).strict()).safeParse(json("edges_sourced_by_this_node"));
      if (!edges.success) {
        throw new TypedDomainError("MOMENT_RECORDED_PROMPT_UNREADABLE", `${callSiteKey}: edges_sourced_by_this_node`);
      }
      return parseMomentBuilder({
        family,
        inputs: {
          questionLine: field("question_line"),
          statement: field("statement"),
          edges: edges.data.map((edge) => ({ targetStatement: edge.target_statement, polarity: edge.relation }))
        }
      });
    }
    case "JUDGE_ASSESS": {
      if (frame.contractId !== "judge.panel.v1") mismatch();
      return parseMomentBuilder({ family, inputs: { questionLine: field("question_line"), statement: field("statement") } });
    }
    case "SYNTHESIS_WRITER": {
      if (frame.contractId !== SYNTHESIZER_PROMPT_CONTRACT.contractId) mismatch();
      const site = /^COMPOSER:SYNTHESIZER:(INITIAL|RETRY):(\d+)$/u.exec(siteKey);
      if (site === null) return mismatch();
      const retry = site[1] === "RETRY";
      if (retry !== has("prior_objection")) {
        throw new TypedDomainError("MOMENT_FIELD_UNEXPECTED", `${callSiteKey}: prior_objection does not match the stage`);
      }
      return parseMomentBuilder({
        family,
        inputs: {
          round: Number(site[2]),
          digest: json("digest"),
          codeLabel: json("code_label"),
          priorObjection: retry ? field("prior_objection") : null
        }
      });
    }
    case "SYNTHESIS_CHECKER": {
      if (frame.contractId !== EVALUATOR_PROMPT_CONTRACT.contractId) mismatch();
      const site = /^POST_COMPOSE_R9:EVALUATOR:(\d+)$/u.exec(siteKey);
      if (site === null) return mismatch();
      return parseMomentBuilder({
        family,
        inputs: {
          round: Number(site[1]),
          digest: json("digest"),
          codeLabel: json("code_label"),
          candidateStatement: field("candidate_statement")
        }
      });
    }
    default:
      return exhaustive(family);
  }
}

/** The grader's context: the question and the material the model saw — never routing. */
export function graderContextOf(question: string, builder: TypedMomentBuilder): MomentFile["graderContext"] {
  const excerpts: { label: string; text: string }[] = [];
  switch (builder.family) {
    case "JUDGE_JUDGE": {
      const leg = builder.inputs.leg;
      if (leg.kind === "support" || leg.kind === "attack") {
        excerpts.push({ label: "position_under_debate", text: leg.positionUnderDebate });
      } else if (leg.kind === "cross-root") {
        excerpts.push(
          { label: "own_position", text: leg.ownPosition },
          { label: "other_makers_position", text: leg.otherMakersPosition }
        );
      }
      break;
    }
    case "JUDGE_REVIEW":
      excerpts.push(
        { label: "statement", text: builder.inputs.statement },
        ...builder.inputs.edges.map((edge, ordinal) => ({
          label: `edge_${String(ordinal)}_${edge.polarity}_target`, text: edge.targetStatement
        }))
      );
      break;
    case "JUDGE_ASSESS":
      excerpts.push({ label: "statement", text: builder.inputs.statement });
      break;
    case "SYNTHESIS_WRITER":
      excerpts.push(...builder.inputs.digest.nodes.map((node) => ({ label: `digest_node_${node.nodeId}`, text: node.statementSummary })));
      if (builder.inputs.priorObjection !== null) {
        excerpts.push({ label: "prior_objection", text: builder.inputs.priorObjection });
      }
      break;
    case "SYNTHESIS_CHECKER":
      excerpts.push(
        ...builder.inputs.digest.nodes.map((node) => ({ label: `digest_node_${node.nodeId}`, text: node.statementSummary })),
        { label: "candidate_statement", text: builder.inputs.candidateStatement }
      );
      break;
    default:
      return exhaustive(builder);
  }
  return { question, excerpts };
}

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

/** The family's contract hash as the seeders seal it (`apps/runner/src/dev-deployment-register.ts:524-526`). */
export function currentContractHash(family: MomentBuilderFamily): string {
  return family === "SYNTHESIS_WRITER"
    ? sha256(promptContractFingerprintText(SYNTHESIZER_PROMPT_CONTRACT))
    : family === "SYNTHESIS_CHECKER"
      ? sha256(promptContractFingerprintText(EVALUATOR_PROMPT_CONTRACT))
      : sha256(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT);
}

/** Routing a synthesis request carries and the prompt projection never sends. */
const MOMENT_SYNTHESIS_CONTROLS: SynthesisLoopControls = Object.freeze({
  synthesizerRoleRef: "moment:replay",
  evaluatorRoleRef: "moment:replay",
  evaluatorLoopMaxRounds: 1
});
/** The author never reaches a panel or review prompt (prompt-surface guard); the Judge requires the field. */
const WITHHELD_AUTHOR = "moment:withheld";

/**
 * The synthesis request a moment's inputs rebuild. Named per family, never a
 * two-way ternary (the A17 carry): no family falls through to the checker's
 * contract.
 */
function synthesisRequestOf(
  builder: Extract<TypedMomentBuilder, { readonly family: "SYNTHESIS_WRITER" | "SYNTHESIS_CHECKER" }>
): SynthesizerRequest | EvaluatorRequest {
  const codeLabel = { ...builder.inputs.codeLabel, registerVersion: 0 };
  switch (builder.family) {
    case "SYNTHESIS_WRITER":
      return buildSynthesizerRequest({
        controls: MOMENT_SYNTHESIS_CONTROLS,
        round: builder.inputs.round,
        digest: builder.inputs.digest,
        codeLabel,
        prior: builder.inputs.priorObjection === null
          ? null
          : { objection: builder.inputs.priorObjection, candidateRef: "moment:prior-candidate" }
      });
    case "SYNTHESIS_CHECKER":
      return buildEvaluatorRequest({
        controls: MOMENT_SYNTHESIS_CONTROLS,
        round: builder.inputs.round,
        digest: builder.inputs.digest,
        codeLabel,
        candidateStatement: builder.inputs.candidateStatement
      });
    default:
      return exhaustive(builder);
  }
}

export interface MomentCall {
  readonly providerRef: string;
  readonly bound: CallBound;
  readonly callSiteKey: string;
  readonly contractHash: string;
  readonly subjectItemId: string;
}

/**
 * Call the LIVE builder of a moment through `gateway` and return what the live
 * runner would have consumed (provenance refs dropped). Failures leave exactly
 * as the live call raises them, so `replayOutcomeOf` classifies a replay the
 * way a run's own call is classified.
 */
export async function invokeMomentBuilder(builder: TypedMomentBuilder, gateway: ProviderGateway, call: MomentCall): Promise<unknown> {
  const judge = new Judge(gateway);
  const subject = {
    runId: null,
    subjectItemId: call.subjectItemId,
    callSiteKey: call.callSiteKey,
    providerRef: call.providerRef,
    contractHash: call.contractHash,
    bound: call.bound
  };
  switch (builder.family) {
    case "JUDGE_JUDGE": {
      const judged = await judge.judge({ ...subject, questionLine: builder.inputs.questionLine, leg: builder.inputs.leg });
      return Object.freeze({
        statement: judged.statement, wayOfKnowing: judged.wayOfKnowing, locator: judged.locator,
        restatementText: judged.restatementText, restatementStatus: judged.restatementStatus,
        valueLaden: judged.valueLaden, claimType: judged.normalizedClaim.claimType, assessment: judged.assessment
      });
    }
    case "JUDGE_REVIEW": {
      const reviewed = await judge.review({
        ...subject,
        questionLine: builder.inputs.questionLine,
        statement: builder.inputs.statement,
        authorMaker: WITHHELD_AUTHOR,
        // Edge ids never reach the prompt; the bearings come back in this order.
        edges: builder.inputs.edges.map((edge, ordinal) => ({
          edgeId: `moment-edge-${String(ordinal)}`, targetStatement: edge.targetStatement, polarity: edge.polarity
        }))
      });
      return Object.freeze({
        outcome: reviewed.outcome, reasons: reviewed.reasons,
        edgeBearings: reviewed.edgeMeasurements.map((measurement) => measurement.bearing)
      });
    }
    case "JUDGE_ASSESS": {
      const assessed = await judge.assess({
        ...subject, questionLine: builder.inputs.questionLine, statement: builder.inputs.statement, authorMaker: WITHHELD_AUTHOR
      });
      return Object.freeze({ assessment: assessed.assessment });
    }
    case "SYNTHESIS_WRITER":
    case "SYNTHESIS_CHECKER": {
      const request = synthesisRequestOf(builder);
      const framed = buildSynthesisRolePrompt(request);
      const role = request.role;
      const response = await gateway.call({
        runId: null,
        subjectItemId: call.subjectItemId,
        callSiteKey: call.callSiteKey,
        role,
        lane: "served",
        modelRole: role === "SYNTHESIZER" ? "ANSWER_WRITER" : "ANSWER_CHECKER",
        bound: call.bound,
        contractHash: call.contractHash,
        providerRef: call.providerRef,
        packet: framed.packet,
        classifyContent: (content) => classifySynthesisRoleContent(role, content),
        buildRepairPacket: (rejected) => buildFramedRepairPrompt(framed, schemaFailureLocator(rejected))
      });
      if (role === "SYNTHESIZER") return parseComposerOutput(response.content);
      try {
        return evaluatorVerdictSchema.parse(JSON.parse(response.content));
      } catch (error) {
        throw new TypedDomainError("EVALUATOR_CONTRACT_ERROR", error instanceof Error ? error.message : String(error));
      }
    }
    default:
      return exhaustive(builder);
  }
}

/** The packet the live builder produces for a moment, captured before any byte could leave. */
export async function captureMomentPacket(builder: TypedMomentBuilder): Promise<PromptPacket> {
  if (builder.family === "SYNTHESIS_WRITER" || builder.family === "SYNTHESIS_CHECKER") {
    return buildSynthesisRolePrompt(synthesisRequestOf(builder)).packet;
  }
  const captured: { packet: PromptPacket | null } = { packet: null };
  const capture: ProviderGateway = {
    call: async (request) => {
      captured.packet = request.packet;
      throw new TypedDomainError("MOMENT_PACKET_CAPTURED", "offline capture: nothing was sent");
    }
  };
  await invokeMomentBuilder(builder, capture, {
    providerRef: "moment:capture",
    bound: { maxAttempts: 1, tokenCeiling: 1, deadlineMs: 1 },
    callSiteKey: "moment:capture",
    contractHash: "moment:capture",
    subjectItemId: "moment:capture"
  }).catch(() => undefined);
  if (captured.packet === null) throw new TypedDomainError("MOMENT_PACKET_UNCAPTURED", builder.family);
  return captured.packet;
}

const REFUSED_REPLY_CODES: ReadonlySet<string> = new Set([
  "PROVIDER_CONTENT_UNACCEPTED",
  "JUDGE_PARSE_FAILURE",
  "JUDGE_SCHEMA_FAILURE",
  "NODE_REVIEW_PARSE_FAILURE",
  "NODE_REVIEW_SCHEMA_FAILURE",
  "COMPOSITION_CONTRACT_ERROR",
  "EVALUATOR_CONTRACT_ERROR"
]);

const hasCode = (error: unknown, code: string): boolean => error instanceof TypedDomainError && error.code === code;

/**
 * A failed replay, in the replay-result vocabulary. The causes are R4's: a
 * usage cap, a transport exhaustion (timed out or failed), and — never a switch
 * trigger live, and REFUSED here — a reply the live classification refused
 * after its live repair. Everything else (an unsupported level, a relabelled
 * model or level, a frame refusal) is FAILED.
 */
export function replayOutcomeOf(error: unknown): Exclude<ReplayOutcome, "OK"> {
  const underlying = error instanceof PanelMemberFailure && error.cause !== undefined ? error.cause : error;
  if (hasCode(underlying, PROVIDER_USAGE_CAP)
    || (underlying instanceof ProviderCallFailedError && hasCode(underlying.cause, PROVIDER_USAGE_CAP))) {
    return "USAGE_CAP";
  }
  if (hasCode(underlying, PROVIDER_CONTEXT_WINDOW_EXCEEDED)) return "CONTEXT_TOO_LARGE";
  if (underlying instanceof ProviderCallFailedError) return underlying.lastOutcome === "TIMED_OUT" ? "TIMED_OUT" : "FAILED";
  if (error instanceof PanelMemberFailure) {
    return error.failureKind === "TIMEOUT"
      ? "TIMED_OUT"
      : error.failureKind === "PARSE_FAILURE" || error.failureKind === "SCHEMA_FAILURE" ? "REFUSED" : "FAILED";
  }
  if (underlying instanceof TypedDomainError && REFUSED_REPLY_CODES.has(underlying.code)) return "REFUSED";
  return "FAILED";
}

/**
 * Both tools read private debate text and call models outside any run ledger,
 * so they run in a LOCAL deployment only. `resolveDeploymentMode` also refuses a
 * production process that did not name its deployment (DEPLOYMENT_MODE_UNRESOLVED).
 */
export function assertMomentToolRuntime(env: Readonly<Record<string, string | undefined>>): void {
  if (resolveDeploymentMode(env.DEBATEAI_DEPLOYMENT_MODE, env.NODE_ENV) === "hosted") {
    throw new TypedDomainError(
      "MOMENT_TOOL_REFUSED_IN_HOSTED",
      "moment:export and moment:replay run only in a local deployment (spec §2.9)"
    );
  }
}

/** Moment files carry private debate text: written whole or not at all, owner-only (0600). */
export async function writePrivateJsonFile(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** This engine's root (acceptance/..), from the module's own address — never a spelled-out path. */
const MOMENT_TOOLS_ENGINE_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * `path` with every symbolic link resolved and every existing segment in its
 * on-disk letter case, including when its last segments do not exist yet —
 * relay-host's `canonicalPath`, restated: acceptance modules do not import one
 * another's private helpers.
 */
function canonicalPath(path: string): string {
  let existing = resolve(path);
  const missing: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    missing.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync.native(existing), ...missing);
}

/** The work tree around `root`: the nearest directory holding `.git` (a worktree's is a file), else `root`. */
function repositoryBoundaryOf(root: string): string {
  const canonicalRoot = canonicalPath(root);
  for (let current = canonicalRoot; ; current = dirname(current)) {
    if (existsSync(join(current, ".git"))) return current;
    if (dirname(current) === current) return canonicalRoot;
  }
}

/**
 * A18 carry 4 (pre-flight R6) — A MOMENT NEVER LANDS IN THE TRACKED TREE. A
 * moment file and a replay result carry DECRYPTED debate text, and a relative
 * `--out` / `--out-dir` resolves from the cwd, which `pnpm run` makes the
 * engine root. Inside the repository an output path must therefore sit under a
 * `.local/` folder (git-ignored); outside it, anywhere. Links are resolved
 * first, so a path cannot reach into the tree through one. relay-host's
 * endpoints rule (`acceptance/relay-host.ts`, `assertEndpointsPathUntracked`).
 *
 * A `"file"` is written AT `path`, so a `.local` folder must sit above it; a
 * `"directory"` receives files INSIDE it, so it may itself be the `.local`
 * folder. `repositoryRoot` is a test seam only: the tools never pass it.
 */
export function assertMomentOutputPathUntracked(
  path: string,
  kind: "file" | "directory",
  repositoryRoot?: string
): void {
  if (repositoryRoot !== undefined && process.env.NODE_ENV !== "test") {
    throw new TypedDomainError(
      "MOMENT_OUTPUT_PATH_ROOT_TEST_ONLY",
      "the repository-root seam exists for tests; the moment tools decide from their own engine root"
    );
  }
  const boundary = repositoryBoundaryOf(repositoryRoot ?? MOMENT_TOOLS_ENGINE_ROOT);
  const fromBoundary = relative(boundary, canonicalPath(path));
  const outside = isAbsolute(fromBoundary) || fromBoundary === ".." || fromBoundary.startsWith(`..${sep}`);
  if (outside) return;
  const segments = fromBoundary === "" ? [] : fromBoundary.split(sep);
  const folders = kind === "file" ? segments.slice(0, -1) : segments;
  if (!folders.includes(".local")) {
    throw new TypedDomainError(
      "MOMENT_OUTPUT_PATH_REFUSED",
      `${path} is inside the repository: moment files carry private debate text, so write them under a .local/ folder or outside the repository`
    );
  }
}

const completionBodySchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }).passthrough() }).passthrough()).min(1)
}).passthrough();

/**
 * Pre-flight fix F4 — THE ANSWER INSIDE A BODY. A gateway artifact's raw text is
 * the whole HTTP body the vendor sent (the completion envelope), not the answer.
 * A moment's `recorded.replyText` and a replay's `replyText` are the answer:
 * `choices[0].message.content` when the body parses as a completion. Any other
 * text (a plain-text answer, a refusal body) is kept exactly as it is.
 */
export function replyContentOf(rawText: string): string {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawText);
  } catch {
    return rawText;
  }
  const completion = completionBodySchema.safeParse(decoded);
  return completion.success ? completion.data.choices[0]!.message.content : rawText;
}

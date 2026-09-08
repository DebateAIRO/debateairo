import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  osascriptProposalInputCommand,
  ProposalNotificationInputSchema,
} from "../notify/osascript.js";
import {
  ProposalCommentInputSchema,
  renderProposalCommentInput,
} from "../notify/ticket-comment.js";
import { buildPacket, IncidentPacketSchema, type IncidentPacket } from "./packet.js";
import { renderDiagnosisPrompt } from "./spawn.js";
import type { FixProposal } from "./schema.js";
import { validateProposal, type DiagnosisPolicyBundle } from "./validate.js";

export const RP3_CANDIDATE_SCHEMA = "debateai.fixagent-rp3-injection-corpus.v1" as const;
export const RP3_CANDIDATE_SHA256 = "8f2733e2ee202b7f1533cfd068063d1b5bf3ca52feb566def000e3a6987d113e" as const;

type Target = "WORKER_PROMPT" | "TICKET_TEXT" | "NOTIFICATION_TEXT";
type Disposition = "SOURCE_FIELD_EXCLUDED" | "INVALID_VALUE_REJECTED" | "UNKNOWN_FIELD_REJECTED";

interface CorpusCase {
  readonly id: string;
  readonly target: Target;
  readonly attackClass: string;
  readonly plant: Readonly<{ readonly sourceField: string; readonly marker: string; readonly value: string }>;
  readonly expected: Readonly<{
    readonly disposition: Disposition;
    readonly targetMarkerOccurrences: number;
    readonly attackerDerivedToolCalls: number;
    readonly attackerDerivedPaths: number;
    readonly attackerDerivedOutputFields: number;
    readonly policyRelaxations: number;
    readonly externalEffects: number;
    readonly structureUnchanged: boolean;
  }>;
}

interface Corpus {
  readonly format: string;
  readonly status: string;
  readonly validatedBaseline: Readonly<{
    readonly incidentId: string;
    readonly proposalId: string;
    readonly sizeLabel: "PR_FIX";
    readonly verdict: "CODE_ROOT";
    readonly root: Readonly<{ readonly path: string; readonly symbol: string }>;
    readonly evidenceOccurrenceIds: readonly string[];
    readonly codes: readonly string[];
    readonly chainCodes: readonly string[];
    readonly normalizedFrames: readonly Readonly<{ readonly path: string; readonly symbol: string }>[];
  }>;
  readonly cases: readonly CorpusCase[];
}

export interface InjectionDrillResult {
  readonly exitCode: 0 | 1;
  readonly stdout: string;
  readonly violations: number;
  readonly cases: number;
  readonly pinStatus: "UNPINNED_CANDIDATE";
}

function parseCorpus(bytes: Buffer): Corpus {
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== RP3_CANDIDATE_SHA256) throw new TypeError("RP3_CANDIDATE_HASH_MISMATCH");
  let decoded: unknown;
  try { decoded = JSON.parse(bytes.toString("utf8")); }
  catch (_error) { throw new TypeError("RP3_CANDIDATE_JSON_INVALID"); }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new TypeError("RP3_CANDIDATE_SCHEMA_INVALID");
  }
  const corpus = decoded as Partial<Corpus>;
  if (corpus.format !== RP3_CANDIDATE_SCHEMA
      || typeof corpus.status !== "string" || !corpus.status.startsWith("UNPINNED")
      || !Array.isArray(corpus.cases) || corpus.cases.length !== 24
      || corpus.validatedBaseline === undefined) {
    throw new TypeError("RP3_CANDIDATE_SCHEMA_INVALID");
  }
  return corpus as Corpus;
}

function baseline(corpus: Corpus): Readonly<{
  packet: IncidentPacket;
  output: Readonly<Record<string, unknown>>;
  proposal: FixProposal;
  bundle: DiagnosisPolicyBundle;
}> {
  const value = corpus.validatedBaseline;
  const packet = buildPacket({
    incidentId: value.incidentId,
    occurrenceId: value.evidenceOccurrenceIds[0]!,
    source: "first_party",
    verdict: value.verdict,
    floor: "FLOOR_CLEAR",
    sizeLabel: value.sizeLabel,
    codes: value.codes,
  }, {
    root: value.root,
    frames: value.normalizedFrames.map((frame) => ({ kind: "CODE" as const, ...frame })),
    chainCodes: value.chainCodes,
  });
  const output = Object.freeze({
    incidentId: packet.incidentId,
    root: packet.root,
    diagnosis: Object.freeze({ defectClass: "BOUNDARY_CONTRACT", params: Object.freeze({ code: packet.codes[0] }) }),
    changeScope: Object.freeze([value.root.path]),
    sizeLabel: packet.sizeLabel,
    redTestPlan: Object.freeze({ invariantRef: "RT-30" }),
    spendUnits: 0,
    toolCalls: Object.freeze(["read_file"]),
  });
  const bundle: DiagnosisPolicyBundle = Object.freeze({
    productionSourceGlobs: Object.freeze(["apps/*/src/**", "packages/**/src/**"]),
    floorDenyGlobs: Object.freeze([]),
    allowedToolCalls: Object.freeze(["read_file", "search_repo"]),
    invariantRefs: Object.freeze(["RT-30"]),
    moduleGraph: Object.freeze({}),
  });
  const validated = validateProposal(output, packet, bundle);
  if (!validated.ok) throw new TypeError("RP3_BASELINE_PROPOSAL_INVALID");
  return Object.freeze({ packet, output, proposal: validated.proposal, bundle });
}

function sourceFieldIsExcluded(testCase: CorpusCase): boolean {
  const allowed = testCase.target === "WORKER_PROMPT"
    ? ["incident.incidentId", "trace.root.path", "trace.root.symbol", "trace.normalizedFrames", "trace.chainCodes"]
    : testCase.target === "TICKET_TEXT"
      ? ["incident.incidentId", "proposal.proposalId", "proposal.root.path", "trace.evidenceOccurrenceIds[0]", "incident.fingerprintPrefix"]
      : ["incident.incidentId", "proposal.proposalId", "proposal.root.path"];
  return !allowed.includes(testCase.plant.sourceField);
}

function baselineText(
  target: Target,
  value: ReturnType<typeof baseline>,
  proposalId: string,
): string {
  if (target === "WORKER_PROMPT") {
    const echoed = validateProposal(value.output, value.packet, value.bundle);
    if (!echoed.ok) throw new TypeError("RP3_STUB_MODEL_INVALID");
    return renderDiagnosisPrompt(value.packet);
  }
  if (target === "TICKET_TEXT") {
    return renderProposalCommentInput({ proposalId, hash: "a".repeat(64), proposal: value.proposal });
  }
  return JSON.stringify(osascriptProposalInputCommand({ incidentId: value.packet.incidentId, proposalId }));
}

function invalidValueRejected(
  testCase: CorpusCase,
  value: ReturnType<typeof baseline>,
  proposalId: string,
): boolean {
  const planted = testCase.plant.value;
  try {
    if (testCase.plant.sourceField === "trace.root.path") {
      buildPacket({
        incidentId: value.packet.incidentId, occurrenceId: value.packet.occurrenceId,
        source: "first_party", verdict: "CODE_ROOT", floor: "FLOOR_CLEAR",
        sizeLabel: value.packet.sizeLabel, codes: value.packet.codes,
      }, { root: { path: planted, symbol: "runLivenessSweep" }, frames: [], chainCodes: value.packet.chainCodes });
      return false;
    }
    if (testCase.plant.sourceField === "trace.root.symbol") {
      buildPacket({
        incidentId: value.packet.incidentId, occurrenceId: value.packet.occurrenceId,
        source: "first_party", verdict: "CODE_ROOT", floor: "FLOOR_CLEAR",
        sizeLabel: value.packet.sizeLabel, codes: value.packet.codes,
      }, { root: { path: "apps/scheduler/src/cli.ts", symbol: planted }, frames: [], chainCodes: value.packet.chainCodes });
      return false;
    }
    if (testCase.plant.sourceField === "incident.incidentId") {
      ProposalNotificationInputSchema.parse({ incidentId: planted, proposalId });
      return false;
    }
    if (testCase.plant.sourceField === "proposal.proposalId") {
      ProposalNotificationInputSchema.parse({ incidentId: value.packet.incidentId, proposalId: planted });
      return false;
    }
    if (testCase.plant.sourceField === "proposal.root.path") {
      const rejected = validateProposal({ ...value.output, root: `${planted}:runLivenessSweep` }, value.packet, value.bundle);
      return !rejected.ok;
    }
    if (testCase.plant.sourceField === "trace.evidenceOccurrenceIds[0]") {
      buildPacket({
        incidentId: value.packet.incidentId, occurrenceId: planted,
        source: "first_party", verdict: "CODE_ROOT", floor: "FLOOR_CLEAR",
        sizeLabel: value.packet.sizeLabel, codes: value.packet.codes,
      }, { root: { path: "apps/scheduler/src/cli.ts", symbol: "runLivenessSweep" }, frames: [], chainCodes: [] });
      return false;
    }
    if (testCase.plant.sourceField === "incident.fingerprintPrefix") {
      return !/^[0-9a-f]{8}$/u.test(planted);
    }
    return false;
  } catch (_error) {
    return true;
  }
}

function unknownFieldRejected(
  testCase: CorpusCase,
  value: ReturnType<typeof baseline>,
  proposalId: string,
): boolean {
  const extra = Object.fromEntries([[testCase.plant.sourceField, testCase.plant.value]]);
  if (testCase.target === "WORKER_PROMPT") {
    return !IncidentPacketSchema.safeParse({ ...value.packet, ...extra }).success;
  }
  if (testCase.target === "TICKET_TEXT") {
    return !ProposalCommentInputSchema.safeParse({
      proposalId, hash: "a".repeat(64), proposal: value.proposal, ...extra,
    }).success;
  }
  return !ProposalNotificationInputSchema.safeParse({
    incidentId: value.packet.incidentId, proposalId, ...extra,
  }).success;
}

function caseViolates(
  testCase: CorpusCase,
  value: ReturnType<typeof baseline>,
  proposalId: string,
): boolean {
  const expected = testCase.expected;
  if (expected.targetMarkerOccurrences !== 0 || expected.attackerDerivedToolCalls !== 0
      || expected.attackerDerivedPaths !== 0 || expected.attackerDerivedOutputFields !== 0
      || expected.policyRelaxations !== 0 || expected.externalEffects !== 0
      || expected.structureUnchanged !== true) return true;
  if (expected.disposition === "SOURCE_FIELD_EXCLUDED") {
    if (!sourceFieldIsExcluded(testCase)) return true;
    return baselineText(testCase.target, value, proposalId).includes(testCase.plant.marker);
  }
  if (expected.disposition === "INVALID_VALUE_REJECTED") {
    return !invalidValueRejected(testCase, value, proposalId);
  }
  return !unknownFieldRejected(testCase, value, proposalId);
}

export async function runInjectionDrill(candidatePath: string): Promise<InjectionDrillResult> {
  const corpus = parseCorpus(await readFile(candidatePath));
  const value = baseline(corpus);
  const proposalId = corpus.validatedBaseline.proposalId;
  let violations = 0;
  for (const testCase of corpus.cases) {
    if (caseViolates(testCase, value, proposalId)) violations += 1;
  }
  return Object.freeze({
    exitCode: violations === 0 ? 0 : 1,
    stdout: `RP-3 status: UNPINNED_CANDIDATE\nviolations: ${violations} / ${corpus.cases.length} cases\n`,
    violations,
    cases: corpus.cases.length,
    pinStatus: "UNPINNED_CANDIDATE",
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.length !== 2 || argv[0] !== "--candidate") {
    process.stdout.write("PENDING RP-3\n");
    process.exitCode = 2;
    return;
  }
  try {
    const result = await runInjectionDrill(argv[1]!);
    process.stdout.write(result.stdout);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "RP3_DRILL_FAILED"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

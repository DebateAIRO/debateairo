import { createHash } from "node:crypto";

import type { IncidentPacket } from "./packet.js";
import { FixProposalSchema, ModelProposalSchema, type FixProposal } from "./schema.js";

export interface DiagnosisPolicyBundle {
  readonly productionSourceGlobs: readonly string[];
  readonly floorDenyGlobs: readonly string[];
  readonly allowedToolCalls: readonly string[];
  readonly invariantRefs: readonly string[];
  readonly moduleGraph: Readonly<Record<string, readonly string[]>>;
}

export type ProposalValidation =
  | Readonly<{ readonly ok: true; readonly proposal: FixProposal; readonly hash: string }>
  | Readonly<{ readonly ok: false; readonly violation: string }>;

function regexForGlob(glob: string): RegExp {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]!;
    if (character === "*") {
      if (glob[index + 1] === "*") {
        pattern += ".*";
        index += 1;
      } else {
        pattern += "[^/]*";
      }
    } else {
      pattern += /[\\^$.*+?()[\]{}|]/u.test(character) ? `\\${character}` : character;
    }
  }
  return new RegExp(`${pattern}$`, "u");
}

function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => regexForGlob(glob).test(path));
}

function packetAtoms(packet: IncidentPacket): ReadonlySet<string> {
  const values = new Set<string>([
    packet.schema,
    packet.incidentId,
    packet.occurrenceId,
    packet.source,
    packet.verdict,
    packet.floor,
    packet.sizeLabel,
    packet.root,
    ...packet.codes,
    ...packet.chainCodes,
  ]);
  for (const frame of packet.frames) {
    values.add(frame.kind);
    if (frame.kind === "CODE") {
      values.add(frame.path);
      values.add(frame.symbol);
    } else {
      values.add(frame.code);
    }
  }
  return values;
}

function blastRadius(
  scope: readonly string[],
  graph: Readonly<Record<string, readonly string[]>>,
): FixProposal["blastRadius"] {
  const seen = new Set<string>();
  const pending = [...scope];
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph[current] ?? []) {
      if (!seen.has(next)) pending.push(next);
    }
  }
  const modules = Object.freeze([...seen].sort());
  return Object.freeze({ reachableModules: modules.length, modules });
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = sortedJson((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  return value;
}

export function canonicalProposal(proposal: FixProposal): string {
  return JSON.stringify(sortedJson(FixProposalSchema.parse(proposal)));
}

export function validateProposal(
  output: unknown,
  packet: IncidentPacket,
  bundle: DiagnosisPolicyBundle,
): ProposalValidation {
  const parsed = ModelProposalSchema.safeParse(output);
  if (!parsed.success) return Object.freeze({ ok: false, violation: "PROPOSAL_SCHEMA" });
  const model = parsed.data;
  if (model.incidentId !== packet.incidentId || model.root !== packet.root || model.sizeLabel !== packet.sizeLabel) {
    return Object.freeze({ ok: false, violation: "NON_DERIVABLE_VALUE" });
  }
  if (!bundle.invariantRefs.includes(model.redTestPlan.invariantRef)) {
    return Object.freeze({ ok: false, violation: "NON_DERIVABLE_VALUE" });
  }
  const allowedTools = new Set(bundle.allowedToolCalls);
  if ((model.toolCalls ?? []).some((tool) => !allowedTools.has(tool))) {
    return Object.freeze({ ok: false, violation: "TOOL_CALL_DENIED" });
  }
  for (const path of model.changeScope) {
    if (!matchesAny(path, bundle.productionSourceGlobs)) {
      return Object.freeze({ ok: false, violation: "CHANGE_SCOPE_OUTSIDE_ALLOWLIST" });
    }
    if (matchesAny(path, bundle.floorDenyGlobs)) {
      return Object.freeze({ ok: false, violation: "CHANGE_SCOPE_DENIED" });
    }
  }
  const derivable = packetAtoms(packet);
  for (const value of Object.values(model.diagnosis.params)) {
    if (typeof value === "string" && !derivable.has(value)) {
      return Object.freeze({ ok: false, violation: "NON_DERIVABLE_VALUE" });
    }
  }
  const scope = Object.freeze([...new Set(model.changeScope)].sort());
  const proposal = FixProposalSchema.parse({
    incidentId: model.incidentId,
    root: model.root,
    diagnosis: model.diagnosis,
    changeScope: scope,
    sizeLabel: model.sizeLabel,
    redTestPlan: model.redTestPlan,
    blastRadius: blastRadius(scope, bundle.moduleGraph),
    spendUnits: model.spendUnits,
  });
  const canonical = canonicalProposal(proposal);
  return Object.freeze({
    ok: true,
    proposal: Object.freeze(proposal),
    hash: createHash("sha256").update(canonical, "utf8").digest("hex"),
  });
}

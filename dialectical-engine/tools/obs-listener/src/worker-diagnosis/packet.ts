import { z } from "zod";
import {
  CodeSchema,
  RepoRelativePathSchema,
  RootSchema,
  SymbolSchema,
  UuidSchema,
} from "./schema.js";

const CodeFrameSchema = z.object({
  kind: z.literal("CODE"),
  path: RepoRelativePathSchema,
  symbol: SymbolSchema,
}).strict();

const BoundaryFrameSchema = z.object({
  kind: z.literal("BOUNDARY"),
  code: CodeSchema,
}).strict();

export const IncidentPacketSchema = z.object({
  schema: z.literal("debateai.fixagent-diagnosis-packet.v1"),
  incidentId: UuidSchema,
  occurrenceId: UuidSchema,
  source: z.enum(["first_party", "hatchet"]),
  verdict: z.literal("CODE_ROOT"),
  floor: z.literal("FLOOR_CLEAR"),
  sizeLabel: z.enum(["QUICK", "PR_FIX"]),
  codes: z.array(CodeSchema).min(1).max(64),
  chainCodes: z.array(CodeSchema).max(64),
  frames: z.array(z.discriminatedUnion("kind", [CodeFrameSchema, BoundaryFrameSchema])).max(32),
  root: RootSchema,
}).strict();

type ParsedIncidentPacket = z.infer<typeof IncidentPacketSchema>;
export type IncidentPacket = Readonly<
  Omit<ParsedIncidentPacket, "codes" | "chainCodes" | "frames">
  & {
    readonly codes: readonly string[];
    readonly chainCodes: readonly string[];
    readonly frames: readonly (
      | Readonly<{ readonly kind: "CODE"; readonly path: string; readonly symbol: string }>
      | Readonly<{ readonly kind: "BOUNDARY"; readonly code: string }>
    )[];
  }
>;

export interface PacketIncidentInput {
  readonly incidentId: string;
  readonly occurrenceId: string;
  readonly source: "first_party" | "hatchet";
  readonly verdict: "CODE_ROOT";
  readonly floor: "FLOOR_CLEAR";
  readonly sizeLabel: "QUICK" | "PR_FIX";
  readonly codes: readonly string[];
}

export interface PacketTraceInput {
  readonly root: Readonly<{ readonly path: string; readonly symbol: string }>;
  readonly frames: readonly (
    | Readonly<{ readonly kind: "CODE"; readonly path: string; readonly symbol: string }>
    | Readonly<{ readonly kind: "BOUNDARY"; readonly code: string }>
  )[];
  readonly chainCodes: readonly string[];
}

function freezeFrame(frame: PacketTraceInput["frames"][number]): PacketTraceInput["frames"][number] {
  return Object.freeze({ ...frame });
}

export function buildPacket(
  incident: PacketIncidentInput,
  trace: PacketTraceInput,
): IncidentPacket {
  const candidate = {
    schema: "debateai.fixagent-diagnosis-packet.v1" as const,
    incidentId: incident.incidentId,
    occurrenceId: incident.occurrenceId,
    source: incident.source,
    verdict: incident.verdict,
    floor: incident.floor,
    sizeLabel: incident.sizeLabel,
    codes: Object.freeze([...incident.codes]),
    chainCodes: Object.freeze([...trace.chainCodes]),
    frames: Object.freeze(trace.frames.map(freezeFrame)),
    root: `${trace.root.path}:${trace.root.symbol}`,
  };
  const parsed = IncidentPacketSchema.parse(candidate);
  return Object.freeze({
    ...parsed,
    codes: Object.freeze(parsed.codes),
    chainCodes: Object.freeze(parsed.chainCodes),
    frames: Object.freeze(parsed.frames.map((frame) => Object.freeze(frame))),
  });
}

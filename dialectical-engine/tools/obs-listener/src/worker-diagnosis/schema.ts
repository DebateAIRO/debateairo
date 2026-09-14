import { z } from "zod";

export const DIAGNOSIS_DEFECT_CLASSES = Object.freeze([
  "BOUNDARY_CONTRACT",
  "ERROR_PROPAGATION",
  "MISSING_VALIDATION",
  "RESOURCE_LIFECYCLE",
  "STATE_TRANSITION",
  "WRONG_BRANCH",
] as const);

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/u;
export const SYMBOL_PATTERN = /^(?:[A-Za-z_$][A-Za-z0-9_$]*)(?:\.[A-Za-z_$][A-Za-z0-9_$]*){0,15}$/u;
export const REPO_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9@+._-]+(?:\/[A-Za-z0-9@+._-]+)*$/u;
export const ROOT_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9@+._-]+(?:\/[A-Za-z0-9@+._-]+)*:(?:[A-Za-z_$][A-Za-z0-9_$]*)(?:\.[A-Za-z_$][A-Za-z0-9_$]*){0,15}$/u;
export const INVARIANT_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,7}$/u;
export const PARAMETER_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/u;
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

export const UuidSchema = z.string().regex(UUID_PATTERN);
export const CodeSchema = z.string().regex(CODE_PATTERN);
export const SymbolSchema = z.string().regex(SYMBOL_PATTERN);
export const RepoRelativePathSchema = z.string().max(512).regex(REPO_PATH_PATTERN);
export const RootSchema = z.string().max(640).regex(ROOT_PATTERN);
export const InvariantRefSchema = z.string().max(64).regex(INVARIANT_PATTERN);

export const ClosedParameterValueSchema = z.union([
  UuidSchema,
  CodeSchema,
  SymbolSchema,
  RepoRelativePathSchema,
  RootSchema,
  z.number().int().safe().min(0).max(1_000_000_000),
  z.boolean(),
]);

export const DiagnosisSchema = z.object({
  defectClass: z.enum(DIAGNOSIS_DEFECT_CLASSES),
  params: z.record(z.string().regex(PARAMETER_KEY_PATTERN), ClosedParameterValueSchema),
}).strict();

export const ModelProposalSchema = z.object({
  incidentId: UuidSchema,
  root: RootSchema,
  diagnosis: DiagnosisSchema,
  changeScope: z.array(RepoRelativePathSchema).min(1).max(32),
  sizeLabel: z.enum(["QUICK", "PR_FIX"]),
  redTestPlan: z.object({ invariantRef: InvariantRefSchema }).strict(),
  spendUnits: z.number().int().safe().min(0).max(1_000_000_000),
  toolCalls: z.array(z.string().regex(TOOL_NAME_PATTERN)).max(128).optional(),
  // The worker cannot author blast radius. It is accepted only so the daemon
  // can discard it and replace it with its own module-graph projection.
  blastRadius: z.unknown().optional(),
}).strict();

export const FixProposalSchema = ModelProposalSchema.omit({
  toolCalls: true,
  blastRadius: true,
}).extend({
  blastRadius: z.object({
    reachableModules: z.number().int().safe().min(0),
    modules: z.array(RepoRelativePathSchema),
  }).strict(),
}).strict();

type ParsedFixProposal = z.infer<typeof FixProposalSchema>;
export type FixProposal = Readonly<
  Omit<ParsedFixProposal, "diagnosis" | "changeScope" | "redTestPlan" | "blastRadius">
  & {
    readonly diagnosis: Readonly<{
      readonly defectClass: ParsedFixProposal["diagnosis"]["defectClass"];
      readonly params: Readonly<Record<string, string | number | boolean>>;
    }>;
    readonly changeScope: readonly string[];
    readonly redTestPlan: Readonly<{ readonly invariantRef: string }>;
    readonly blastRadius: Readonly<{
      readonly reachableModules: number;
      readonly modules: readonly string[];
    }>;
  }
>;
export type DiagnosisDefectClass = (typeof DIAGNOSIS_DEFECT_CLASSES)[number];

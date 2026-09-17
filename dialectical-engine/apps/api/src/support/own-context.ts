import { createHash } from "node:crypto";
import { supportTemplate,type SupportLanguage } from "./templates.js";

const OWN_CONTEXT_SUBJECT = /\b(?:my|mine|own|mea|mele|meu)\b|propri[au]/iu;
const OWN_CONTEXT_OBJECT = /\b(?:debate|debates|run|runs)\b|dezbat|rulare|rulări/iu;
const OWN_CONTEXT_STATE = /\b(?:current|status|state|stuck|progress|visibility|failure)\b|stare|blocat|progres|vizibil|eroare|ultim/iu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const NIL_RUN_ID = "00000000-0000-4000-8000-000000000000";

export const OWN_RUN_STATE_KEYS = Object.freeze([
  "run_id","created_at","run_state","terminal_state","staleness_state","visibility",
  "public_ref","progress_stage","last_event_at","failure_code"
] as const);

export type OwnRunStateProjection = Readonly<{
  run_id: string;
  created_at: string;
  run_state: "generating" | "failed" | "served";
  terminal_state: string | null;
  staleness_state: string;
  visibility: "PRIVATE" | "PUBLISHED";
  public_ref?: string;
  progress_stage: string | null;
  last_event_at: string;
  failure_code: string | null;
}>;

export type OwnRunStateSource = Readonly<{
  run_id: string;
  created_at: Date | string;
  run_state: "generating" | "failed" | "served";
  terminal_state: string | null;
  staleness_state: string | null;
  visibility: "PRIVATE" | "PUBLISHED";
  public_ref: string | null;
  progress_stage: string | null;
  last_event_at: Date | string;
  failure_code: string | null;
}> & Readonly<Record<string,unknown>>;

export type OwnContextSubject = Readonly<{
  ownerRef: string;
  legacyAskerId: null;
}>;

type OwnContextReadInput = OwnContextSubject & Readonly<{
  sessionId: string;
  runId: string;
  latest: boolean;
  at: Date;
}>;

type OwnContextListInput = OwnContextSubject & Readonly<{
  sessionId: string;
  at: Date;
}>;

export interface SupportOwnContextPort {
  read(input: OwnContextReadInput): Promise<OwnRunStateProjection | "NOT_OWNED">;
  list(input: OwnContextListInput): Promise<readonly OwnRunStateProjection[]>;
  listCalls?(sessionId: string): Promise<readonly Readonly<{
    name: string;at: Date;outcome: "ALLOWED" | "BOUNDARY_DENY";
  }>[] >;
}

export interface SupportOwnContextRepositoryPort {
  read(input: OwnContextReadInput): Promise<OwnRunStateSource | null>;
  list(input: OwnContextSubject): Promise<readonly OwnRunStateSource[]>;
  recordToolCall(input: Readonly<{
    sessionId: string;
    argsSha256: string;
    result: OwnRunStateProjection | "NOT_OWNED";
    at: Date;
  }>): Promise<void>;
  listToolCalls?(sessionId: string): Promise<readonly Readonly<{
    name: string;at: Date;result: OwnRunStateSource | "NOT_OWNED";
  }>[] >;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function projectOwnRunState(source: OwnRunStateSource): OwnRunStateProjection {
  return Object.freeze({
    run_id: source.run_id,
    created_at: iso(source.created_at),
    run_state: source.run_state,
    terminal_state: source.terminal_state,
    staleness_state: source.staleness_state ?? "FRESH",
    visibility: source.visibility,
    ...(source.visibility === "PUBLISHED" && source.public_ref !== null
      ? { public_ref: source.public_ref } : {}),
    progress_stage: source.progress_stage,
    last_event_at: iso(source.last_event_at),
    failure_code: source.failure_code
  });
}

function argsSha256(runId: string): string {
  return createHash("sha256").update(JSON.stringify({ run_id: runId }),"utf8").digest("hex");
}

/**
 * The repository query invokes core.run_is_owned_by for every requested run. This service never
 * accepts an identity parameter from a message or tool argument.
 */
export function createSupportOwnContextService(
  repository: SupportOwnContextRepositoryPort
): SupportOwnContextPort {
  return Object.freeze({
    async read(input: OwnContextReadInput) {
      const runId = UUID.test(input.runId) ? input.runId : NIL_RUN_ID;
      const row = await repository.read({ ...input,runId });
      const result = row === null ? "NOT_OWNED" as const : projectOwnRunState(row);
      await repository.recordToolCall({
        sessionId: input.sessionId,argsSha256: argsSha256(runId),result,at: input.at
      });
      return result;
    },
    async list(input: OwnContextListInput) {
      const rows = await repository.list(input);
      const projections = await Promise.all(rows.map(async (row) => {
        const result = projectOwnRunState(row);
        await repository.recordToolCall({
          sessionId: input.sessionId,argsSha256: argsSha256(result.run_id),result,at: input.at
        });
        return result;
      }));
      return Object.freeze(projections);
    },
    async listCalls(sessionId: string) {
      if (repository.listToolCalls === undefined) return Object.freeze([]);
      return Object.freeze((await repository.listToolCalls(sessionId)).map((call) => Object.freeze({
        name: call.name,at: call.at,
        outcome: call.result === "NOT_OWNED" ? "BOUNDARY_DENY" as const : "ALLOWED" as const
      })));
    }
  });
}

export function formatOwnRunStateAnswer(
  projection: OwnRunStateProjection,
  language: SupportLanguage,
  readAt: Date
): string {
  const state = language === "en"
    ? `Your debate is ${projection.run_state}. Visibility: ${projection.visibility}. Last event: ${projection.last_event_at}.`
    : `Dezbaterea ta este ${projection.run_state}. Vizibilitate: ${projection.visibility}. Ultimul eveniment: ${projection.last_event_at}.`;
  const source = supportTemplate("STATE_SOURCE",language)
    .replace("{run_id_short}",projection.run_id.slice(0,8))
    .replace("{time}",readAt.toISOString());
  return `${state}\n${source}`;
}

/** This intent check selects a capability; identity always comes from the authenticated session. */
export function isOwnContextQuestion(message: string): boolean {
  return OWN_CONTEXT_SUBJECT.test(message)
    && OWN_CONTEXT_OBJECT.test(message)
    && OWN_CONTEXT_STATE.test(message);
}

export function isOwnContextListQuestion(message: string): boolean {
  return (/\b(?:list|show|enumerate)\b|listeaz|arat/iu.test(message))
    && OWN_CONTEXT_SUBJECT.test(message)
    && OWN_CONTEXT_OBJECT.test(message);
}

import { z } from "zod";
import type { SupportActionId } from "@debateai/support-kb/catalog";

const MAX_RAW_CODE_POINTS = 8_192;
const MAX_TEXT_CODE_POINTS = 4_000;
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const schema = z.object({
  kind: z.literal("answer"),
  text: z.string().min(1),
  sourceIds: z.array(identifier).max(3),
  actionIds: z.array(identifier).max(3)
}).strict();
const caseSummarySchema = z.object({
  kind: z.literal("case_summary"),
  text: z.string().min(1),
  sourceIds: z.array(z.never()).length(0),
  actionIds: z.array(z.never()).length(0)
}).strict();

export type SupportDraft = Readonly<{
  kind: "answer";
  text: string;
  sourceIds: readonly string[];
  actionIds: readonly SupportActionId[];
}>;
export type SupportCaseSummaryDraft = Readonly<{
  kind: "case_summary";
  text: string;
  sourceIds: readonly never[];
  actionIds: readonly never[];
}>;

export type SupportDraftDiagnosticCode =
  | "RAW_TOO_LONG"
  | "JSON_INVALID"
  | "KEY_SET_INVALID"
  | "KIND_INVALID"
  | "SCHEMA_INVALID"
  | "TEXT_EMPTY"
  | "TEXT_TOO_LONG"
  | "TEXT_LINK_OR_MARKUP"
  | "TEXT_SECRET_LIKE"
  | "TEXT_CREDENTIAL_OR_SECURITY_ACTION"
  | "TEXT_SIX_DIGIT_CODE"
  | "TEXT_GROUPED_SECURITY_CODE"
  | "TEXT_REDACTION_ECHO"
  | "SOURCE_MEMBERSHIP_INVALID"
  | "ACTION_MEMBERSHIP_INVALID"
  | "ACCEPTED";

export type SupportDraftDiagnostic = Readonly<{
  code: SupportDraftDiagnosticCode;
  jsonValid: boolean;
  fenced: boolean;
  exactKeys: boolean;
  kindValid: boolean;
  textCodePoints: number | null;
  sourceIdCount: number;
  allowedSourceIdCount: number;
  actionIdCount: number;
  allowedActionIdCount: number;
}>;

const MARKUP_OR_LINK = /(?:https?:\/\/|www\.|\[[^\]]+\]\s*\(|<\/?[a-z][^>]*>|(?:^|\s)\/\/?(?:[a-z0-9][^\s]*))/iu;
const SECRET_LIKE = /(?:\b(?:sk|pk|api)[_-][a-z0-9_-]{8,}\b|\bbearer\s+[a-z0-9._~-]{8,}\b|\b[a-z0-9_-]{32,}\b|\b(?:password|parol[ăa]?)\s*[:=]\s*\S+)/iu;
const CREDENTIAL_OR_SECURITY_ACTION = /(?:\b(?:password|passcode|otp|totp|mfa|authenticator|recovery\s+code|verification\s+code|reset\s+token)\b|\b(?:parol[ăa]|cod(?:ul)?\s+de\s+(?:recuperare|verificare|autentificare)|autentificator|token(?:ul)?\s+de\s+resetare)\b)/iu;
const SIX_DIGIT_CODE = /\b\d{6}\b/u;
const GROUPED_SECURITY_CODE = /\b\d{3,8}(?:[- ]\d{3,8})+\b/u;
const REDACTION_ECHO = /\[REDACTED_(?:SECRET_LIKE|CONTACT|URL_QUERY)\]/u;

function normalizedForScreening(value: string): readonly string[] {
  const values = [value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu,"")];
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const decoded = decodeURIComponent(values.at(-1)!);
      if (decoded === values.at(-1)) break;
      values.push(decoded.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu,""));
    } catch { break; }
  }
  return Object.freeze(values);
}

function screenCategory(value: string): SupportDraftDiagnosticCode | null {
  if ([...value].length > MAX_TEXT_CODE_POINTS) return "TEXT_TOO_LONG";
  const normalized = normalizedForScreening(value);
  if (normalized[0]!.trim() === "") return "TEXT_EMPTY";
  if (normalized.some((candidate) => MARKUP_OR_LINK.test(candidate))) {
    return "TEXT_LINK_OR_MARKUP";
  }
  if (normalized.some((candidate) => SECRET_LIKE.test(candidate))) return "TEXT_SECRET_LIKE";
  if (normalized.some((candidate) => CREDENTIAL_OR_SECURITY_ACTION.test(candidate))) {
    return "TEXT_CREDENTIAL_OR_SECURITY_ACTION";
  }
  if (normalized.some((candidate) => SIX_DIGIT_CODE.test(candidate))) return "TEXT_SIX_DIGIT_CODE";
  if (normalized.some((candidate) => GROUPED_SECURITY_CODE.test(candidate))) {
    return "TEXT_GROUPED_SECURITY_CODE";
  }
  if (normalized.some((candidate) => REDACTION_ECHO.test(candidate))) return "TEXT_REDACTION_ECHO";
  return null;
}

export function screenSupportModelText(value: string): boolean {
  return screenCategory(value) === null;
}

const ANSWER_KEYS = Object.freeze(["actionIds","kind","sourceIds","text"]);

export function diagnoseSupportDraft(
  raw: string,
  allowedSourceIds: readonly string[],
  allowedActionIds: readonly SupportActionId[]
): SupportDraftDiagnostic {
  const fenced = raw.trimStart().startsWith("```") || raw.trimEnd().endsWith("```");
  const base: Omit<SupportDraftDiagnostic,"code"> = {
    jsonValid: false,fenced,exactKeys: false,kindValid: false,
    textCodePoints: null,sourceIdCount: 0,allowedSourceIdCount: 0,
    actionIdCount: 0,allowedActionIdCount: 0
  };
  const result = (
    code: SupportDraftDiagnosticCode,
    values: Omit<SupportDraftDiagnostic,"code"> = base
  ): SupportDraftDiagnostic =>
    Object.freeze({ code,...values });
  if ([...raw].length > MAX_RAW_CODE_POINTS) return result("RAW_TOO_LONG");
  let decoded: unknown;
  try { decoded = JSON.parse(raw) as unknown; }
  catch { return result("JSON_INVALID"); }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return result("SCHEMA_INVALID",{ ...base,jsonValid: true });
  }
  const row = decoded as Readonly<Record<string,unknown>>;
  const exactKeys = Object.keys(row).sort().join("\0") === ANSWER_KEYS.join("\0");
  const kindValid = row.kind === "answer";
  const textCodePoints = typeof row.text === "string" ? [...row.text].length : null;
  const sourceIds = Array.isArray(row.sourceIds) ? row.sourceIds : [];
  const actionIds = Array.isArray(row.actionIds) ? row.actionIds : [];
  const sourceSet = new Set(allowedSourceIds);
  const actionSet = new Set<string>(allowedActionIds);
  const values = {
    jsonValid: true,fenced,exactKeys,kindValid,textCodePoints,
    sourceIdCount: sourceIds.length,
    allowedSourceIdCount: sourceIds.filter(
      (id): id is string => typeof id === "string" && sourceSet.has(id)
    ).length,
    actionIdCount: actionIds.length,
    allowedActionIdCount: actionIds.filter(
      (id): id is string => typeof id === "string" && actionSet.has(id)
    ).length
  };
  if (!exactKeys) return result("KEY_SET_INVALID",values);
  if (!kindValid) return result("KIND_INVALID",values);
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) return result("SCHEMA_INVALID",values);
  const unsafeText = screenCategory(parsed.data.text);
  if (unsafeText !== null) return result(unsafeText,values);
  if (parsed.data.sourceIds.length === 0
    || new Set(parsed.data.sourceIds).size !== parsed.data.sourceIds.length
    || values.allowedSourceIdCount !== parsed.data.sourceIds.length) {
    return result("SOURCE_MEMBERSHIP_INVALID",values);
  }
  if (new Set(parsed.data.actionIds).size !== parsed.data.actionIds.length
    || values.allowedActionIdCount !== parsed.data.actionIds.length) {
    return result("ACTION_MEMBERSHIP_INVALID",values);
  }
  return result("ACCEPTED",values);
}

export function parseSupportDraft(raw: string): SupportDraft | null {
  if ([...raw].length > MAX_RAW_CODE_POINTS) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success || !screenSupportModelText(parsed.data.text)) return null;
    return Object.freeze({
      kind: parsed.data.kind,
      text: parsed.data.text,
      sourceIds: Object.freeze([...parsed.data.sourceIds]),
      actionIds: Object.freeze([...parsed.data.actionIds] as SupportActionId[])
    });
  } catch {
    return null;
  }
}

export function parseSupportCaseSummaryDraft(raw: string): SupportCaseSummaryDraft | null {
  if ([...raw].length > MAX_RAW_CODE_POINTS) return null;
  try {
    const parsed = caseSummarySchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success || !screenSupportModelText(parsed.data.text)) return null;
    return Object.freeze({
      kind: parsed.data.kind,text: parsed.data.text,
      sourceIds: Object.freeze([]),actionIds: Object.freeze([])
    });
  } catch { return null; }
}

export function validateSupportDraft(
  draft: SupportDraft,
  allowedSourceIds: readonly string[],
  requestedActions: readonly (SupportActionId | string)[]
): SupportDraft | null {
  const sourceSet = new Set(allowedSourceIds);
  const actionSet = new Set<string>(requestedActions);
  if (draft.sourceIds.length === 0
    || new Set(draft.sourceIds).size !== draft.sourceIds.length
    || new Set(draft.actionIds).size !== draft.actionIds.length
    || draft.sourceIds.some((id) => !sourceSet.has(id))
    || draft.actionIds.some((id) => !actionSet.has(id))) return null;
  return draft;
}

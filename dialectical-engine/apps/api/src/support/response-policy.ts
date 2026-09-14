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

export function screenSupportModelText(value: string): boolean {
  if ([...value].length > MAX_TEXT_CODE_POINTS) return false;
  const normalized = normalizedForScreening(value);
  return normalized[0]!.trim() !== "" && normalized.every((candidate) =>
    !MARKUP_OR_LINK.test(candidate)
    && !SECRET_LIKE.test(candidate)
    && !CREDENTIAL_OR_SECURITY_ACTION.test(candidate)
    && !SIX_DIGIT_CODE.test(candidate)
    && !GROUPED_SECURITY_CODE.test(candidate)
    && !REDACTION_ECHO.test(candidate));
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

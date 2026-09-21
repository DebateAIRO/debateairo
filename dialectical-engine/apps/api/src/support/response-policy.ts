import { z } from "zod";
import {
  analyzeSupportCredentialText,canonicalSupportTextViews,supportTextContainsCredentialOperation,
  supportTextViewHasUnsafePath
} from "@debateai/kernel";
import {
  SUPPORT_ACTION_CATALOG,SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,SUPPORT_GUIDE_LABELS,
  type SupportActionId
} from "@debateai/support-kb/catalog";

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
  actionIds: readonly string[];
}>;
export type SupportCaseSummaryDraft = Readonly<{
  kind: "case_summary";
  text: string;
  sourceIds: readonly never[];
  actionIds: readonly never[];
}>;

const ACCOUNT_DETAIL_CLAIM = /\b(?:active sessions?|privacy preferences?|cookie preferences?|claim legacy debates?|delete account|deletion schedule|sesiuni active|preferin(?:te|tele) (?:cookie|de confidentialitate)|revendic(?:a|area) dezbaterilor vechi|sterger(?:ea|ii) contului|programarea stergerii)\b/u;
const NAVIGATION_COMMITMENT = /\b(?:support|asistenta)\b[^.!?;\n]{0,80}\b(?:can\s+(?:guide|navigate|direct)|poate\s+(?:ghida|naviga|indrepta|deschide))\b/u;
const EMAIL = /\b(?:e-?mail(?:ul)?|mail)\b/u;
const CASE = /\b(?:human\s+case|support\s+case|case|caz(?:ul)?)\b/u;
const CASE_CREATION = /\b(?:create[ds]?|open(?:s|ed)?|cre(?:eaza|at|are)|deschide)\b/u;
const CASE_CREATION_NEGATION = /\b(?:does\s+not|doesn['’]?t|did\s+not|never|cannot|can['’]?t|nu)\b[^.!?;\n]{0,40}\b(?:create|open|cre(?:eaza|a)|deschide)\b/u;
const FINANCIAL_CAPABILITY = /\b(?:pay(?:ing|ment|ments|ed|s)?|purchas\p{L}*|checkout|buy(?:ing|s)?|plat\p{L}*|cump\p{L}*)\b/gu;
const FINANCIAL_NEGATION_BEFORE = /(?:\b(?:no|not|without)\s+(?:(?:a|an|the)\s+)?|\b(?:cannot|can['’]?t|does\s+not|doesn['’]?t|did\s+not)\s+|\b(?:is\s+not|isn['’]?t)\s+(?:(?:a|an|the)\s+)?|\bdoes\s+not\s+(?:establish|verify|show|state|confirm)\s+(?:(?:where|whether|that)\s+)?|\b(?:fara|niciun|nicio)\s+(?:(?:un|o)\s+)?|\bnu\s+(?:(?:poate|poti|puteti)\s+|(?:este|e)\s+(?:(?:un|o)\s+)?(?:(?:flux|functie|optiune)\s+de\s+)?|(?:stabileste|verifica|arata|spune|confirma)\s+(?:(?:unde|daca|ca)\s+)?(?:are\s+loc\s+)?))$/u;
const FINANCIAL_NEGATION_AFTER = /^\s*(?:cannot|can['’]?t|does\s+not|doesn['’]?t|did\s+not|isn['’]?t|is\s+not|(?:(?:may|might|can|could|would|should)\s+)(?:not|never)|(?:poate(?:\s+sa)?|ar\s+putea(?:\s+sa)?)\s+nu|nu\s+(?:este|e|sunt|poate|pot)|(?:is\s+)?(?:unsupported|unavailable|unknown|unverified)|(?:este\s+)?(?:indisponibil|neverificat))\b/u;
const FINANCIAL_SENTENCE_BOUNDARY = /[.!?;\n:]+|[—–]/u;

function authorityText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("en-US");
}

function authorityWords(value: string): string {
  return authorityText(value).replace(/[^\p{L}\p{N}]+/gu," ").trim();
}

function conflatesCaseAndEmail(value: string): boolean {
  return authorityText(value).split(/[.!?;\n]+|\b(?:while|whereas|iar|in timp ce)\b/u).some((clause) =>
    EMAIL.test(clause) && CASE.test(clause) && CASE_CREATION.test(clause)
      && !CASE_CREATION_NEGATION.test(clause)
  );
}

function hasUnsupportedPositiveFinancialClaim(value: string): boolean {
  return authorityText(value).split(FINANCIAL_SENTENCE_BOUNDARY).some((clause) => {
    FINANCIAL_CAPABILITY.lastIndex = 0;
    return [...clause.matchAll(FINANCIAL_CAPABILITY)].some((match) => {
      const at = match.index ?? 0;
      const before = clause.slice(0,at);
      const after = clause.slice(at + match[0].length,at + match[0].length + 64);
      return !FINANCIAL_NEGATION_BEFORE.test(before)
        && !FINANCIAL_NEGATION_AFTER.test(after);
    });
  });
}

type NavigationMatch = Readonly<{
  actionId: SupportActionId;
  phrase: string;
}>;

function navigationMatches(clause: string): readonly NavigationMatch[] {
  const words = ` ${authorityWords(clause)} `;
  const matches = SUPPORT_GUIDE_LABELS.flatMap((row) => row.actionId === null ? []
    : [...row.labels.en,...row.labels.ro].flatMap((label) => {
      const phrase = authorityWords(label);
      return phrase !== "" && words.includes(` ${phrase} `)
        ? [Object.freeze({ actionId:row.actionId!,phrase })] : [];
    }));
  return Object.freeze(matches.filter((candidate,index) =>
    matches.findIndex(({ actionId,phrase }) =>
      actionId === candidate.actionId && phrase === candidate.phrase
    ) === index
    && !matches.some((other) => other.actionId !== candidate.actionId
      && other.phrase.length > candidate.phrase.length
      && ` ${other.phrase} `.includes(` ${candidate.phrase} `))
  ));
}

function actionHasRequestAuthority(
  actionId: SupportActionId,
  sourceIds: readonly string[],
  allowedSourceIds: readonly string[],
  requestedActionIds: readonly (SupportActionId | string)[],
  draftActionIds: readonly string[]
): boolean {
  const action = SUPPORT_ACTION_CATALOG.find(({ id }) => id === actionId);
  if (action === undefined || action.availability === "unresolved"
    || action.availability === "excluded") return false;
  if (!requestedActionIds.includes(actionId) || !draftActionIds.includes(actionId)) return false;
  const reviewedSources = SUPPORT_GUIDE_LABELS
    .filter((row) => row.actionId === actionId)
    .map(({ articleId }) => articleId);
  return reviewedSources.some((id) => sourceIds.includes(id) && allowedSourceIds.includes(id));
}

/**
 * Binds material visitor prose to the canonical source/action authority that
 * was supplied for this request. It may complete an omitted visible citation
 * from that already supplied authority, but it never invents authority.
 */
export function bindSupportDraftAuthority(
  draft: SupportDraft,
  allowedSourceIds: readonly string[],
  requestedActionIds: readonly (SupportActionId | string)[]
): SupportDraft | null {
  const text = authorityText(draft.text);
  if (conflatesCaseAndEmail(text) || hasUnsupportedPositiveFinancialClaim(text)) return null;

  const sourceIds = [...draft.sourceIds];
  if (ACCOUNT_DETAIL_CLAIM.test(text) && !sourceIds.includes("settings-help-menus")) {
    if (!allowedSourceIds.includes("settings-help-menus") || sourceIds.length >= 3) return null;
    sourceIds.push("settings-help-menus");
  }

  const requiredActions = new Set<SupportActionId>();
  for (const clause of text.split(/[.!?;\n]+/u)) {
    if (!NAVIGATION_COMMITMENT.test(clause)) continue;
    for (const { actionId } of navigationMatches(clause)) requiredActions.add(actionId);
  }
  if ([...requiredActions].some((id) => !actionHasRequestAuthority(
    id,sourceIds,allowedSourceIds,requestedActionIds,draft.actionIds
  ))) return null;

  if (sourceIds.length === draft.sourceIds.length) return draft;
  return Object.freeze({
    ...draft,sourceIds:Object.freeze(sourceIds),actionIds:Object.freeze([...draft.actionIds])
  });
}

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
  | "TEXT_INTERNAL_IDENTIFIER"
  | "SOURCE_MEMBERSHIP_INVALID"
  | "ACTION_MEMBERSHIP_INVALID"
  | "ACCEPTED";

export type SupportDraftPredicate =
  | "RAW_LENGTH"
  | "JSON_SYNTAX"
  | "EXACT_KEY_SET"
  | "KIND"
  | "SCHEMA"
  | "TEXT_EMPTY"
  | "TEXT_LENGTH"
  | "RAW_LINK_OR_PROTOCOL"
  | "ENCODED_LINK_OR_PATH"
  | "MARKUP"
  | "PATH_OR_ROUTE"
  | "LABELLED_OR_TOKEN_SECRET"
  | "CREDENTIAL_OPERATION"
  | "SIX_DIGIT_CODE"
  | "GROUPED_SECURITY_CODE"
  | "REDACTION_ECHO"
  | "NARRATIVE_INTERNAL_IDENTIFIER"
  | "SOURCE_MEMBERSHIP"
  | "ACTION_MEMBERSHIP"
  | "ACCEPTED";

export type SupportDraftDiagnostic = Readonly<{
  code: SupportDraftDiagnosticCode;
  predicate: SupportDraftPredicate;
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

export type SupportDraftReport = SupportDraftDiagnostic & Readonly<{ attemptId: string }>;
export type SupportDraftLogRecord = Readonly<{
  code: `SUPPORT_DRAFT_${SupportDraftDiagnosticCode}`;
  attemptId: string;
  predicate: SupportDraftPredicate;
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

export function projectSupportDraftReport(diagnostic: SupportDraftReport): SupportDraftLogRecord {
  return Object.freeze({
    code: `SUPPORT_DRAFT_${diagnostic.code}`,
    attemptId: diagnostic.attemptId,
    predicate: diagnostic.predicate,
    jsonValid: diagnostic.jsonValid,
    fenced: diagnostic.fenced,
    exactKeys: diagnostic.exactKeys,
    kindValid: diagnostic.kindValid,
    textCodePoints: diagnostic.textCodePoints,
    sourceIdCount: diagnostic.sourceIdCount,
    allowedSourceIdCount: diagnostic.allowedSourceIdCount,
    actionIdCount: diagnostic.actionIdCount,
    allowedActionIdCount: diagnostic.allowedActionIdCount
  });
}

const MARKUP_OR_LINK = /(?:https?:\/\/|www\.|\[[^\]]+\]\s*\(|<\/?[a-z][^>]*>|(?:^|\s)\/\/?(?:[a-z0-9][^\s]*))/iu;
const SECRET_LIKE = /(?:\b(?:sk|pk|api)[_-][a-z0-9_-]{8,}\b|\bbearer\s+[a-z0-9._~-]{8,}\b|\b[a-z0-9_-]{32,}\b)/iu;
const SIX_DIGIT_CODE = /\b\d{6}\b/u;
const GROUPED_SECURITY_CODE = /\b\d{3,8}(?:[- ]\d{3,8})+\b/u;
const REDACTION_ECHO = /\[REDACTED_(?:SECRET_LIKE|CONTACT|URL_QUERY)\]/u;
const NARRATIVE_ID = /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/giu;
const CLOSED_NARRATIVE_IDS = new Set<string>([
  ...SUPPORT_ACTION_IDS,...SUPPORT_CAPABILITIES.map(({ id }) => id),
  ...SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
].filter((id) => id.includes("-")));

type TextScreenResult = Readonly<{
  code: SupportDraftDiagnosticCode;predicate: SupportDraftPredicate;
}>;

function result(
  code: SupportDraftDiagnosticCode,predicate: SupportDraftPredicate
): TextScreenResult { return Object.freeze({ code,predicate }); }

function linkPredicate(value: string): SupportDraftPredicate | null {
  const canonical = canonicalSupportTextViews(value);
  if (canonical.unsafeEncoding) return "ENCODED_LINK_OR_PATH";
  for (const candidate of canonical.views) {
    if (!MARKUP_OR_LINK.test(candidate) && !supportTextViewHasUnsafePath(candidate)) continue;
    if (candidate !== canonical.views[0]) return "ENCODED_LINK_OR_PATH";
    if (/(?:\[[^\]]+\]\s*\(|<\/?[a-z][^>]*>)/iu.test(candidate)) return "MARKUP";
    if (/(?:https?:\/\/|www\.|(?:^|\s)\/\/)/iu.test(candidate)) return "RAW_LINK_OR_PROTOCOL";
    return "PATH_OR_ROUTE";
  }
  return null;
}

function containsInternalIdentifier(
  value: string,additionalIds: readonly string[]
): boolean {
  const ids = new Set(CLOSED_NARRATIVE_IDS);
  for (const id of additionalIds) if (id.includes("-")) ids.add(id.toLocaleLowerCase("en-US"));
  return canonicalSupportTextViews(value).views.some((candidate) => {
    NARRATIVE_ID.lastIndex = 0;
    return [...candidate.toLocaleLowerCase("en-US").matchAll(NARRATIVE_ID)]
      .some(([id]) => ids.has(id));
  });
}

function screenCategory(value: string,internalIds: readonly string[] = []): TextScreenResult | null {
  if ([...value].length > MAX_TEXT_CODE_POINTS) return result("TEXT_TOO_LONG","TEXT_LENGTH");
  const canonical = canonicalSupportTextViews(value);
  const normalized = canonical.views;
  if (normalized[0]!.trim() === "") return result("TEXT_EMPTY","TEXT_EMPTY");
  const unsafeLink = linkPredicate(value);
  if (unsafeLink !== null) return result("TEXT_LINK_OR_MARKUP",unsafeLink);
  if (normalized.some((candidate) =>
    analyzeSupportCredentialText(candidate).credentialValueSpans.length > 0)
    || normalized.some((candidate) => SECRET_LIKE.test(candidate))) {
    return result("TEXT_SECRET_LIKE","LABELLED_OR_TOKEN_SECRET");
  }
  if (normalized.some(supportTextContainsCredentialOperation)) {
    return result("TEXT_CREDENTIAL_OR_SECURITY_ACTION","CREDENTIAL_OPERATION");
  }
  if (normalized.some((candidate) => SIX_DIGIT_CODE.test(candidate))) {
    return result("TEXT_SIX_DIGIT_CODE","SIX_DIGIT_CODE");
  }
  if (normalized.some((candidate) => GROUPED_SECURITY_CODE.test(candidate))) {
    return result("TEXT_GROUPED_SECURITY_CODE","GROUPED_SECURITY_CODE");
  }
  if (normalized.some((candidate) => REDACTION_ECHO.test(candidate))) {
    return result("TEXT_REDACTION_ECHO","REDACTION_ECHO");
  }
  if (containsInternalIdentifier(value,internalIds)) {
    return result("TEXT_INTERNAL_IDENTIFIER","NARRATIVE_INTERNAL_IDENTIFIER");
  }
  return null;
}

export function screenSupportModelText(value: string,internalIds: readonly string[] = []): boolean {
  return screenCategory(value,internalIds) === null;
}

const ANSWER_KEYS = Object.freeze(["actionIds","kind","sourceIds","text"]);

export function diagnoseSupportDraft(
  raw: string,
  allowedSourceIds: readonly string[],
  allowedActionIds: readonly string[],
  narrativeInternalIds: readonly string[] = [...allowedSourceIds,...allowedActionIds]
): SupportDraftDiagnostic {
  const fenced = raw.trimStart().startsWith("```") || raw.trimEnd().endsWith("```");
  const base: Omit<SupportDraftDiagnostic,"code" | "predicate"> = {
    jsonValid: false,fenced,exactKeys: false,kindValid: false,
    textCodePoints: null,sourceIdCount: 0,allowedSourceIdCount: 0,
    actionIdCount: 0,allowedActionIdCount: 0
  };
  const result = (
    code: SupportDraftDiagnosticCode,predicate: SupportDraftPredicate,
    values: Omit<SupportDraftDiagnostic,"code" | "predicate"> = base
  ): SupportDraftDiagnostic =>
    Object.freeze({ code,predicate,...values });
  if ([...raw].length > MAX_RAW_CODE_POINTS) return result("RAW_TOO_LONG","RAW_LENGTH");
  let decoded: unknown;
  try { decoded = JSON.parse(raw) as unknown; }
  catch { return result("JSON_INVALID","JSON_SYNTAX"); }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return result("SCHEMA_INVALID","SCHEMA",{ ...base,jsonValid: true });
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
  if (!exactKeys) return result("KEY_SET_INVALID","EXACT_KEY_SET",values);
  if (!kindValid) return result("KIND_INVALID","KIND",values);
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) return result("SCHEMA_INVALID","SCHEMA",values);
  const unsafeText = screenCategory(parsed.data.text,narrativeInternalIds);
  if (unsafeText !== null) return result(unsafeText.code,unsafeText.predicate,values);
  if (parsed.data.sourceIds.length === 0
    || new Set(parsed.data.sourceIds).size !== parsed.data.sourceIds.length
    || values.allowedSourceIdCount !== parsed.data.sourceIds.length) {
    return result("SOURCE_MEMBERSHIP_INVALID","SOURCE_MEMBERSHIP",values);
  }
  if (new Set(parsed.data.actionIds).size !== parsed.data.actionIds.length
    || values.allowedActionIdCount !== parsed.data.actionIds.length) {
    return result("ACTION_MEMBERSHIP_INVALID","ACTION_MEMBERSHIP",values);
  }
  return result("ACCEPTED","ACCEPTED",values);
}

export function parseSupportDraft(raw: string,internalIds: readonly string[] = []): SupportDraft | null {
  if ([...raw].length > MAX_RAW_CODE_POINTS) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success || !screenSupportModelText(parsed.data.text,internalIds)) return null;
    return Object.freeze({
      kind: parsed.data.kind,
      text: parsed.data.text,
      sourceIds: Object.freeze([...parsed.data.sourceIds]),
      actionIds: Object.freeze([...parsed.data.actionIds])
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

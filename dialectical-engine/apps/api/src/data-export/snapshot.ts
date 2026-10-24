import type { ExportSnapshot, DebateEntry, RoleRotation, Row, SupportCaseEntry, SupportSessionEntry, SynthesisCheckEntry, PublicationReviewEntry } from "./types.js";
import type { RecordAad } from "../../../../packages/crypto/src/records.js";

export type ExportClaim = Readonly<{
  exportId: string; userId: string; ownerRef: string; sessionId: string;
  locale: string; requestedAt: Date; attempt: number;
}>;

export const RAW_SECTIONS = [
  "user", "channels", "registration_region", "age_checks", "erasure_requests",
  "mfa_factors", "passkey_credentials", "recovery_codes", "sessions", "social_identities",
  "email_change_requests", "recovery_email_requests", "recovery_requests", "runs",
  "erasure_tombstones", "visibility_events", "legal_acceptances", "sensitive_data_consents",
  "billing", "support_sessions", "support_messages", "support_cases", "support_case_events",
  "support_case_messages", "support_ratings", "support_key_states", "audit_events", "threat_reports",
] as const;
export type RawSection = typeof RAW_SECTIONS[number];
export type RawExportRows = Readonly<Record<RawSection, unknown>>;

export interface DataExportSourcePort {
  readRaw(exportId: string, workerId: string): Promise<RawExportRows>;
}

export interface OwnerViewPort {
  runKeyPresent(runId: string): Promise<boolean>;
  runRemovedByCheck(runId: string): Promise<boolean>;
  readSynthesisChecks(ownerRef: string, answerId: string): Promise<readonly SynthesisCheckEntry[]>;
  readPublicationReviews(ownerRef: string, runId: string, answerId: string): Promise<readonly PublicationReviewEntry[]>;
  readRun(ownerRef: string, runId: string): Promise<unknown>;
  readRunAnswer(ownerRef: string, runId: string): Promise<unknown | null>;
  readAnswer(ownerRef: string, answerId: string, version: number): Promise<unknown>;
  readInspection(ownerRef: string, answerId: string, version: number): Promise<unknown>;
  readLedgerDigest(ownerRef: string, answerId: string): Promise<unknown>;
  readStory(ownerRef: string, answerId: string): Promise<unknown>;
  readDisclosure(ownerRef: string, answerId: string): Promise<unknown>;
  readNode(ownerRef: string, answerId: string, nodeId: string): Promise<unknown>;
}

export type UserDekField = "user.email_ciphertext" | "user.recovery_email_ciphertext" | "user.phone_ciphertext";
export type SupportKeyHandle = Readonly<{ kind: "session" | "case"; ref: string }>;
export type SupportContentContext = Readonly<Record<string, unknown>>;
export interface ExportDecryptors {
  openUserField(userId: string, field: UserDekField, envelope: unknown): Promise<string>;
  openRecord(aad: RecordAad, ciphertext: Buffer): string;
  openSupport(keyRef: SupportKeyHandle, wrapped: Buffer, context: SupportContentContext, ciphertext: Buffer): Promise<string>;
}

export class DataExportBuildError extends Error {
  constructor(readonly code: "DATA_EXPORT_DECRYPT_FAILED" | "DATA_EXPORT_SOURCE_FAILED", cause?: unknown) {
    super(code, { cause });
    this.name = "DataExportBuildError";
  }
}

// Each array is the finite set of raw columns that may reach an archive projection.
// Ciphertext members are replaced with their plaintext names before serialization.
export const KEEP_COLUMNS = {
  user: ["pseudonym", "email_ciphertext", "recovery_email_ciphertext", "phone_ciphertext", "phone_source", "phone_verification_status", "state", "created_at", "adult_affirmed_at"],
  channels: ["channel_type", "address_ciphertext", "state", "verified_at"],
  registration_region: ["country_code", "us_state"],
  age_checks: ["outcome", "min_age_applied", "rule_version", "context", "checked_at", "country_code"],
  erasure_requests: ["requested_at", "execute_at", "status"],
  mfa_factors: ["factor_type", "state", "created_at", "verified_at", "revoked_at", "last_accepted_step"],
  passkey_credentials: ["label", "device_type", "transports", "created_at", "last_used_at"],
  recovery_codes: ["unused_count", "generated_at"],
  sessions: ["created_at", "last_seen_at", "idle_expires_at", "absolute_expires_at", "last_mfa_at", "revoked_at"],
  social_identities: ["provider", "issuer", "subject", "created_at", "revoked_at"],
  email_change_requests: ["issued_at", "new_email_ciphertext", "outcome", "closed_at"],
  recovery_email_requests: ["issued_at", "candidate_ciphertext", "outcome", "closed_at"],
  recovery_requests: ["kind", "at", "state"],
  runs: ["as_of", "composition_budget_tier", "depth_params", "plan_tier", "role_rotation"],
  erasure_tombstones: ["completed_at"],
  visibility_events: ["state", "occurred_at"],
  legal_acceptances: ["kind", "document_version", "document_sha256", "locale", "surface", "accepted_at", "evidence_ciphertext"],
  sensitive_data_consents: ["notice_version", "locale", "consented_at"],
  billing: {
    customers: ["customer_id", "created_at", "created_locale"],
    customer_xmoney: ["customer_id", "environment", "xmoney_customer_id", "at"],
    customer_profile_events: ["customer_id", "at", "locale", "profile_ciphertext"],
    quotes: ["plan_id", "kind", "net_micros", "tax_micros", "total_micros", "tax_country", "tax_region", "tax_rate_bp", "tax_status", "tax_name", "quaderno_ref", "created_at", "expires_at", "location_ciphertext", "recurring_total_micros", "currency"],
    subscription_events: ["kind", "at", "plan_id", "period_anchor_at", "xmoney_order_id", "xmoney_customer_id", "card_ref", "data"],
    entitlement_events: ["plan_id", "effective_at", "period_anchor_at", "cause", "month_credit_override_micros", "paid_through", "recorded_at"],
    run_charge_scopes: ["plan_id", "admitted_at", "recorded_at", "funding_kind"],
    charges: ["charge_id", "kind", "attempt", "period_start", "period_end", "net_micros", "tax_micros", "total_micros", "currency", "created_at", "payment_provider", "payment_environment"],
    internal_grants: ["revision", "amount_micros", "day_micros", "week_micros", "starts_at", "expires_at", "funding_approval_ref", "policy_register_version", "revoked_at", "created_at"],
    withdrawal_owner_settlements: ["dashboard_refund_micros", "settled_at"],
    charge_events: ["charge_id", "kind", "at", "payment_provider", "payment_environment", "provider_payment_id", "refunds_transaction_id", "amount_micros", "error_code", "provider_created_at"],
    quote_uses: ["used_at", "charge_id"],
    invoice_intents: ["charge_id", "kind", "issuer", "requested_at"],
    invoices: ["charge_id", "kind", "issuer", "external_ref", "series", "number", "url", "total_micros", "at"],
    location_evidence: ["charge_id", "ip_country", "declared_country", "card_country", "verdict", "ip_ciphertext", "at"],
  },
  support_sessions: ["language", "state", "created_at", "consent_own_context_at", "shredded_at"],
  support_messages: ["role", "content_ciphertext", "outcome", "received_at", "first_token_at", "completed_at", "rating"],
  support_cases: ["language", "created_at", "state", "summary_at", "shredded_at", "transcript_snapshot_ciphertext", "summary_ciphertext"],
  support_case_events: ["from_state", "to_state", "at"],
  support_case_messages: ["role", "content_ciphertext", "at"],
  support_ratings: ["rating", "at"],
  support_key_states: ["kind", "ref", "destroyed_at"],
  audit_events: ["event_type", "occurred_at"],
  threat_reports: ["question", "kept_at"],
} as const;

type RawRow = Record<string, unknown>;
type BillingKey = keyof typeof KEEP_COLUMNS.billing;

function row(value: unknown): RawRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
  return value as RawRow;
}

function rows(value: unknown): RawRow[] {
  if (!Array.isArray(value)) throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
  return value.map(row);
}

function project(source: RawRow, columns: readonly string[]): Row {
  const output: Record<string, unknown> = {};
  for (const name of columns) {
    if (!Object.hasOwn(source, name)) throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
    output[name] = source[name];
  }
  return output;
}

function plain(source: Row, cipher: string, outputName: string, value: string | null): Row {
  const { [cipher]: _discard, ...rest } = source;
  return { ...rest, [outputName]: value };
}

function bytes(value: unknown): Buffer {
  if (typeof value !== "string") throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
  return Buffer.from(value, "base64");
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
  return value;
}

function object(value: unknown): RawRow {
  return value === null ? {} : row(value);
}

// PostgreSQL jsonb renders timestamptz in the database session's offset.
// Normalize timestamp fields after collection, including owner reads, while
// leaving user-authored text intact and retaining PostgreSQL's microseconds.
function timestampField(name: string): boolean {
  return name === "at" || name === "as_of" || name === "period_start" || name === "period_end"
    || name === "paid_through" || name === "hold_until" || name === "waits_until"
    || /(?:_at|_as_of|At|AsOf)$/.test(name);
}

function utcTimestampStrings<T>(value: T, field?: string): T {
  if (typeof value === "string") {
    if (field === undefined || !timestampField(field)) return value;
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?([+-]\d{2}:\d{2})$/.exec(value);
    if (match === null) return value;
    const instant = Date.parse(value);
    if (!Number.isFinite(instant)) return value;
    const fraction = (match[2] ?? "").padEnd(3, "0");
    return `${new Date(instant).toISOString().slice(0, 19)}.${fraction}Z` as T;
  }
  if (Array.isArray(value)) return value.map((item) => utcTimestampStrings(item, field)) as T;
  if (value === null || value instanceof Date || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, utcTimestampStrings(item, key)])) as T;
}

function nodeIds(answer: unknown): string[] {
  const value = object(answer).nodes;
  if (!Array.isArray(value)) throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED");
  return value.map((node: unknown) => typeof node === "string" ? node : string(row(node).node_id));
}

function answerInfo(value: unknown): { id: string; version: number } {
  const answer = row(value);
  const id = answer.answer_id;
  const version = answer.answer_version;
  if (typeof id !== "string" || typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED");
  }
  return { id, version };
}

async function openedUser(decrypt: ExportDecryptors, userId: string, field: UserDekField, envelope: unknown): Promise<string | null> {
  return envelope == null ? null : decrypt.openUserField(userId, field, envelope);
}

function openedRecord(decrypt: ExportDecryptors, source: RawRow, column: string, aad: RecordAad): string | null {
  return source[column] == null ? null : decrypt.openRecord(aad, bytes(source[column]));
}

// SPEC-v11 row C7 (V-42): null when the run has no row; otherwise exactly C7's keys, each role projected to its three.
function roleRotation(value: unknown): RoleRotation | null {
  if (value === null) return null;
  const source = row(value);
  const role = (name: string) => {
    const item = row(source[name]);
    return { provider_ref: string(item.provider_ref), model_id: string(item.model_id), maker: string(item.maker) };
  };
  const eligible = source.eligible_model_ids;
  if (!Array.isArray(eligible)) throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
  return { rule: string(source.rule), writer: role("writer"), checker: role("checker"), storyteller: role("storyteller"),
    story_checker: role("story_checker"), eligible_model_ids: eligible.map(string), created_at: string(source.created_at) };
}

async function collectDebates(raw: RawExportRows, ownerView: OwnerViewPort, ownerRef: string): Promise<DebateEntry[]> {
  const tombstones = new Map(rows(raw.erasure_tombstones).map((item) => [string(item.run_id), string(item.completed_at)]));
  const visibility = rows(raw.visibility_events);
  const entries: DebateEntry[] = [];
  for (const run of rows(raw.runs)) {
    const reference = string(run.run_id);
    const history = visibility.filter((item) => item.run_id === reference).map((item) => ({ state: string(item.state), at: string(item.occurred_at) }));
    const deletedAt = tombstones.get(reference) ?? null;
    const base = {
      reference, created_at: string(run.as_of), deleted_at: deletedAt,
      tier: run.composition_budget_tier, depth: run.depth_params, plan_tier: run.plan_tier,
      state: null as unknown, visibility_history: history,
      role_rotation: roleRotation(Object.hasOwn(run, "role_rotation") ? run.role_rotation : undefined),
    };
    if (deletedAt !== null || await ownerView.runRemovedByCheck(reference) || !await ownerView.runKeyPresent(reference)) {
      entries.push({ ...base, content_status: "UNRECOVERABLE" });
      continue;
    }
    const runView = await ownerView.readRun(ownerRef, reference);
    if (runView === null) throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED");
    const runAnswer = await ownerView.readRunAnswer(ownerRef, reference);
    const answers: NonNullable<DebateEntry["answers"]>[number][] = [];
    if (runAnswer !== null) {
      const { id, version: lastVersion } = answerInfo(runAnswer);
      const versions: { version: number; answer: unknown; inspection: unknown; nodes: Readonly<Record<string, unknown>> }[] = [];
      for (let version = 1; version <= lastVersion; version++) {
        const answer = await ownerView.readAnswer(ownerRef, id, version);
        const inspection = await ownerView.readInspection(ownerRef, id, version);
        const nodes: Record<string, unknown> = {};
        for (const nodeId of nodeIds(answer)) {
          const node = await ownerView.readNode(ownerRef, id, nodeId);
          if (node == null) throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED");
          nodes[nodeId] = node;
        }
        versions.push({ version, answer, inspection, nodes });
      }
      answers.push({
        answer_id: id, versions,
        synthesis_checks: (await ownerView.readSynthesisChecks(ownerRef, id)).map((check) => ({
          answer_version: check.answer_version, verdict: check.verdict,
          categories: [...check.categories], checked_at: check.checked_at,
        })),
        publication_reviews: await ownerView.readPublicationReviews(ownerRef, reference, id),
        ledger_digest: await ownerView.readLedgerDigest(ownerRef, id),
        story: await ownerView.readStory(ownerRef, id),
        disclosure: await ownerView.readDisclosure(ownerRef, id),
      });
    }
    const view = object(runView);
    if (typeof view.state !== "string" || typeof view.question_line !== "string" || view.question_line.length === 0) {
      throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED");
    }
    entries.push({ ...base, content_status: "READABLE", state: view.state, question: view.question_line,
      run: runView, run_answer: runAnswer, answers });
  }
  return entries;
}

async function collectSupport(raw: RawExportRows, decrypt: ExportDecryptors): Promise<ExportSnapshot["support"]> {
  const keyStates = new Map(rows(raw.support_key_states).map((item) => [`${string(item.kind)}:${string(item.ref)}`, item]));
  const messages = rows(raw.support_messages);
  const caseMessages = rows(raw.support_case_messages);
  const caseEvents = rows(raw.support_case_events);
  const ratings = new Map(rows(raw.support_ratings).map((item) => [string(item.message_id), item]));
  const sessions: SupportSessionEntry[] = [];
  for (const source of rows(raw.support_sessions)) {
    const reference = string(source.session_id);
    const key = keyStates.get(`session:${reference}`);
    const unrecoverable = source.shredded_at != null || key?.destroyed_at != null;
    const outputMessages: Row[] = [];
    if (!unrecoverable) {
      for (const message of messages.filter((item) => item.session_id === reference)) {
        if (!key?.wrapped_key) throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED");
        const messageId = string(message.message_id);
        const content = await decrypt.openSupport({ kind: "session", ref: reference }, bytes(key.wrapped_key),
          { kind: "session-message", sessionId: reference, messageId, role: message.role, outcome: message.outcome, purpose: "content" }, bytes(message.content_ciphertext));
        const projected = plain(project(message, KEEP_COLUMNS.support_messages), "content_ciphertext", "content", content);
        const rating = ratings.get(messageId);
        outputMessages.push(rating ? { ...projected, rating: rating.rating, rating_at: rating.at } : projected);
      }
    }
    sessions.push({ ...project(source, KEEP_COLUMNS.support_sessions), reference,
      content_status: unrecoverable ? "UNRECOVERABLE" : "READABLE", messages: outputMessages });
  }
  const cases: SupportCaseEntry[] = [];
  for (const source of rows(raw.support_cases)) {
    const reference = string(source.case_id);
    const key = keyStates.get(`case:${reference}`);
    const unrecoverable = source.shredded_at != null || key?.destroyed_at != null;
    const outputMessages: Row[] = [];
    let output: Row = project(source, KEEP_COLUMNS.support_cases);
    if (!unrecoverable) {
      output = plain(output, "transcript_snapshot_ciphertext", "transcript_snapshot", null);
      output = plain(output, "summary_ciphertext", "summary", null);
      const hasContent = source.transcript_snapshot_ciphertext != null || source.summary_ciphertext != null || caseMessages.some((item) => item.case_id === reference);
      if (hasContent && !key?.wrapped_key) throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED");
      const wrapped = key?.wrapped_key == null ? null : bytes(key.wrapped_key);
      if (source.transcript_snapshot_ciphertext != null && wrapped) {
        const transcript = await decrypt.openSupport({ kind: "case", ref: reference }, wrapped,
          { kind: "case-snapshot", caseId: reference, purpose: "transcript" }, bytes(source.transcript_snapshot_ciphertext));
        output = plain(output, "transcript_snapshot_ciphertext", "transcript_snapshot", transcript);
      }
      if (source.summary_ciphertext != null && wrapped) {
        const summary = await decrypt.openSupport({ kind: "case", ref: reference }, wrapped,
          { kind: "case-summary", caseId: reference, purpose: "summary" }, bytes(source.summary_ciphertext));
        output = plain(output, "summary_ciphertext", "summary", summary);
      }
      for (const message of caseMessages.filter((item) => item.case_id === reference)) {
        const content = await decrypt.openSupport({ kind: "case", ref: reference }, wrapped!,
          { kind: "case-message", caseId: reference, messageId: string(message.case_message_id), role: message.role, purpose: "content" }, bytes(message.content_ciphertext));
        outputMessages.push(plain(project(message, KEEP_COLUMNS.support_case_messages), "content_ciphertext", "content", content));
      }
    } else {
      const { transcript_snapshot_ciphertext: _transcript, summary_ciphertext: _summary, ...rest } = output;
      output = rest;
    }
    cases.push({ ...output, reference, content_status: unrecoverable ? "UNRECOVERABLE" : "READABLE",
      events: caseEvents.filter((item) => item.case_id === reference).map((item) => project(item, KEEP_COLUMNS.support_case_events)),
      messages: outputMessages });
  }
  return { sessions, cases };
}

async function collectBilling(rawBilling: unknown, decrypt: ExportDecryptors): Promise<ExportSnapshot["billing"]> {
  const input = row(rawBilling);
  const keys = Object.keys(KEEP_COLUMNS.billing) as BillingKey[];
  if (Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) {
    throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
  }
  const result: Record<string, Row[]> = {};
  for (const key of keys) {
    result[key] = [];
    for (const source of rows(input[key])) {
      let output: Row = project(source, KEEP_COLUMNS.billing[key]);
      if (key === "customer_profile_events") output = plain(output, "profile_ciphertext", "profile",
        openedRecord(decrypt, source, "profile_ciphertext", { table: "billing.customer_profile_event", column: "profile_ciphertext", rowId: string(source.customer_id) }));
      if (key === "quotes") output = plain(output, "location_ciphertext", "location",
        openedRecord(decrypt, source, "location_ciphertext", { table: "billing.quote", column: "location_ciphertext", rowId: string(source.quote_id) }));
      if (key === "location_evidence") output = plain(output, "ip_ciphertext", "ip",
        openedRecord(decrypt, source, "ip_ciphertext", { table: "billing.location_evidence", column: "ip_ciphertext", rowId: string(source.charge_id) }));
      if (key === "run_charge_scopes") output = { ...output, reference: string(source.run_id) };
      result[key]!.push(output);
    }
  }
  return result as ExportSnapshot["billing"];
}

export async function collectSnapshot(input: {
  claim: ExportClaim; workerId: string; source: DataExportSourcePort; ownerView: OwnerViewPort;
  decrypt: ExportDecryptors; now: () => Date;
}): Promise<ExportSnapshot> {
  let raw: RawExportRows;
  try {
    raw = await input.source.readRaw(input.claim.exportId, input.workerId);
    const keys = Object.keys(row(raw));
    if (keys.length !== RAW_SECTIONS.length || RAW_SECTIONS.some((section) => !Object.hasOwn(raw, section))) {
      throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED");
    }
  } catch (error) {
    throw new DataExportBuildError("DATA_EXPORT_SOURCE_FAILED", error);
  }
  try {
    const { claim, decrypt } = input;
    let account = project(row(raw.user), KEEP_COLUMNS.user);
    const email = await openedUser(decrypt, claim.userId, "user.email_ciphertext", row(raw.user).email_ciphertext);
    account = plain(account, "email_ciphertext", "email", email);
    account = plain(account, "recovery_email_ciphertext", "recovery_email",
      await openedUser(decrypt, claim.userId, "user.recovery_email_ciphertext", row(raw.user).recovery_email_ciphertext));
    account = plain(account, "phone_ciphertext", "phone",
      await openedUser(decrypt, claim.userId, "user.phone_ciphertext", row(raw.user).phone_ciphertext));
    const channels: Row[] = [];
    for (const source of rows(raw.channels)) {
      const field: UserDekField = source.channel_type === "email" ? "user.email_ciphertext" : "user.recovery_email_ciphertext";
      channels.push(plain(project(source, KEEP_COLUMNS.channels), "address_ciphertext", "address",
        await openedUser(decrypt, claim.userId, field, source.address_ciphertext)));
    }
    const emailChanges: Row[] = [];
    for (const source of rows(raw.email_change_requests)) emailChanges.push(plain(project(source, KEEP_COLUMNS.email_change_requests), "new_email_ciphertext", "new_email",
      await openedUser(decrypt, claim.userId, "user.email_ciphertext", source.new_email_ciphertext)));
    const recoveryEmailChanges: Row[] = [];
    for (const source of rows(raw.recovery_email_requests)) recoveryEmailChanges.push(plain(project(source, KEEP_COLUMNS.recovery_email_requests), "candidate_ciphertext", "candidate",
      await openedUser(decrypt, claim.userId, "user.recovery_email_ciphertext", source.candidate_ciphertext)));
    const legalAcceptances: Row[] = [];
    for (const source of rows(raw.legal_acceptances)) legalAcceptances.push(plain(project(source, KEEP_COLUMNS.legal_acceptances), "evidence_ciphertext", "evidence",
      openedRecord(decrypt, source, "evidence_ciphertext", { table: "legal.acceptance", column: "evidence_ciphertext", rowId: string(source.acceptance_id) })));
    const simple = <K extends Exclude<RawSection, "billing">>(section: K): Row[] => rows(raw[section]).map((source) => project(source, KEEP_COLUMNS[section]));
    return utcTimestampStrings({
      exportId: claim.exportId, userId: claim.userId, locale: claim.locale,
      requestedAt: claim.requestedAt, generatedAt: input.now(), recipient: email ?? "",
      account: {
        account, channels,
        registration_region: raw.registration_region == null ? null : project(row(raw.registration_region), KEEP_COLUMNS.registration_region),
        age_checks: simple("age_checks"), erasure_requests: simple("erasure_requests"),
        kept_questions: simple("threat_reports"),
      },
      security: {
        mfa_factors: simple("mfa_factors"), passkeys: simple("passkey_credentials"),
        recovery_codes: raw.recovery_codes == null ? null : project(row(raw.recovery_codes), KEEP_COLUMNS.recovery_codes),
        sessions: simple("sessions"), social_identities: simple("social_identities"),
        email_changes: emailChanges, recovery_email_changes: recoveryEmailChanges, recovery_requests: simple("recovery_requests"),
      },
      consents: { legal_acceptances: legalAcceptances, sensitive_data_consents: simple("sensitive_data_consents") },
      debates: { debates: await collectDebates(raw, input.ownerView, claim.ownerRef) },
      billing: await collectBilling(raw.billing, decrypt),
      support: await collectSupport(raw, decrypt),
      activity: { events: rows(raw.audit_events).map((source) => ({ type: string(source.event_type), at: string(source.occurred_at) })) },
    });
  } catch (error) {
    if (error instanceof DataExportBuildError && error.code === "DATA_EXPORT_SOURCE_FAILED") throw error;
    throw new DataExportBuildError("DATA_EXPORT_DECRYPT_FAILED", error);
  }
}

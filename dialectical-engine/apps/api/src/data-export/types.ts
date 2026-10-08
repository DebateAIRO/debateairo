export type ContentStatus = "READABLE" | "UNRECOVERABLE";
export type Row = Readonly<Record<string, unknown>>;

export type DebateEntry = Readonly<{
  reference: string;
  content_status: ContentStatus;
  created_at: string;
  deleted_at: string | null;
  tier: unknown;
  depth: unknown;
  plan_tier: unknown;
  state: unknown;
  visibility_history: Readonly<{ state: string; at: string }>[];
  question?: string;
  run?: unknown;
  run_answer?: unknown | null;
  answers?: Readonly<{
    answer_id: string;
    ledger_digest: unknown;
    story: unknown;
    disclosure: unknown;
    versions: Readonly<{
      version: number;
      answer: unknown;
      inspection: unknown;
      nodes: Readonly<Record<string, unknown>>;
    }>[];
  }>[];
}>;

export type SupportSessionEntry = Readonly<{
  reference: string;
  content_status: ContentStatus;
  [column: string]: unknown;
  messages: Row[];
}>;
export type SupportCaseEntry = Readonly<{
  reference: string;
  content_status: ContentStatus;
  [column: string]: unknown;
  events: Row[];
  messages: Row[];
}>;

export type ExportSnapshot = Readonly<{
  exportId: string;
  userId: string;
  locale: string;
  requestedAt: Date;
  generatedAt: Date;
  account: Readonly<{ account: Row; channels: Row[]; registration_region: Row | null; age_checks: Row[]; erasure_requests: Row[] }>;
  security: Readonly<{ mfa_factors: Row[]; passkeys: Row[]; recovery_codes: Row | null; sessions: Row[]; social_identities: Row[]; email_changes: Row[]; recovery_email_changes: Row[]; recovery_requests: Row[] }>;
  consents: Readonly<{ legal_acceptances: Row[]; sensitive_data_consents: Row[] }>;
  debates: Readonly<{ debates: DebateEntry[] }>;
  billing: Readonly<{ customers: Row[]; customer_xmoney: Row[]; customer_profile_events: Row[]; quotes: Row[]; subscription_events: Row[]; entitlement_events: Row[]; run_charge_scopes: Row[]; charges: Row[]; internal_grants: Row[]; withdrawal_owner_settlements: Row[]; charge_events: Row[]; quote_uses: Row[]; invoice_intents: Row[]; invoices: Row[]; location_evidence: Row[] }>;
  support: Readonly<{ sessions: SupportSessionEntry[]; cases: SupportCaseEntry[] }>;
  activity: Readonly<{ events: Readonly<{ type: string; at: string }>[] }>;
  recipient: string;
}>;

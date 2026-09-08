import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import pg from "pg";
import { z } from "zod";

import {
  createSharedRedactor,
  type PostRedactionEnvelope,
} from "@debateai/obs-capture";
import { readObsBounds } from "@debateai/obs-capture/runtime";
import {
  AUTHORED_CODES,
  DECLARED_GAP_CODES,
  DERIVED_CODES,
  resolveSafeTemplate,
} from "@debateai/obs-capture/registry-internal";

const CLIENT_COMPONENTS = Object.freeze(["ui-app", "ui-scoring"] as const);
const CLIENT_ROUTE_TEMPLATES = Object.freeze([
  "/",
  "/:segment",
  "/debate/:id",
] as const);
const CLIENT_KINDS = Object.freeze([
  "error_boundary",
  "global_error_boundary",
  "scoring_error_boundary",
  "window_error",
  "unhandled_rejection",
] as const);
const CLIENT_CODES = Object.freeze(
  [...DERIVED_CODES, ...DECLARED_GAP_CODES, ...AUTHORED_CODES]
    .filter((code) => resolveSafeTemplate(code)?.binding === undefined),
);
const CLIENT_CODE_SET: ReadonlySet<string> = new Set(CLIENT_CODES);
const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ORIGINS = 4_096;
const BUILD_REF_FALLBACK = "UNTRACKED-DEV:UNKNOWN";
const ENVIRONMENT_FALLBACK = "unknown";
const BUILD_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/u;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const CLIENT_REPORT_GAP_CLASS = "CLIENT_REPORT_RATE_LIMITED" as const;

const OCCURRENCE_COLUMNS = Object.freeze([
  "prev_link", "occurred_at", "environment", "build_ref", "build_dirty",
  "runtime", "component", "capture_point", "code", "taxonomy_class",
  "severity", "condition_mark", "disposition", "fingerprint",
  "fingerprint_version", "redaction_policy_version", "allowlist_set_id",
  "fallback_minimized", "capture_status", "run_ref", "work_item_ref",
  "node_ref", "attempt_ref", "ledger_ref", "parent_occurrence_ref",
  "cause_relation", "at_seq_watermark", "frames", "safe_template_id",
  "template_parameters", "source", "source_event_ref", "zone_context",
  "attempt_index", "writer_identity",
] as const);

export const CLIENT_REPORT_AUTH = Object.freeze({
  config: Object.freeze({ auth: "public" as const }),
});

export interface ClientReportBundle {
  readonly schema: "debateai.client-report-enums.v1";
  readonly build_ref: string;
  readonly codes: readonly string[];
  readonly components: typeof CLIENT_COMPONENTS;
  readonly route_templates: typeof CLIENT_ROUTE_TEMPLATES;
  readonly kinds: typeof CLIENT_KINDS;
}

export interface ClientReportDrop {
  readonly source: "ui_client";
  readonly gap_class: typeof CLIENT_REPORT_GAP_CLASS;
  readonly lost_count: number;
  readonly opened_at: Date;
  readonly closed_at: Date;
}

export interface ClientReportStore {
  writeOccurrence(envelope: PostRedactionEnvelope): Promise<void>;
  writeDrop(drop: ClientReportDrop): Promise<void>;
  close(): Promise<void>;
}

export interface TransientOriginRateLimiter {
  hashOrigin(origin: string): string;
  admit(origin: string): boolean;
  timestamp(): number;
}

interface RateBucket {
  count: number;
  readonly openedAt: number;
}

function safeBuildRef(value: string | undefined): string {
  return typeof value === "string" && BUILD_REF_PATTERN.test(value)
    ? value
    : BUILD_REF_FALLBACK;
}

function safeEnvironment(value: string | undefined): string {
  return typeof value === "string" && ENVIRONMENT_PATTERN.test(value)
    ? value
    : ENVIRONMENT_FALLBACK;
}

export function createClientReportBundle(buildRef: string): ClientReportBundle {
  return Object.freeze({
    schema: "debateai.client-report-enums.v1" as const,
    build_ref: safeBuildRef(buildRef),
    codes: CLIENT_CODES,
    components: CLIENT_COMPONENTS,
    route_templates: CLIENT_ROUTE_TEMPLATES,
    kinds: CLIENT_KINDS,
  });
}

export function createTransientOriginRateLimiter(options: {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly maxOrigins?: number;
  readonly now?: () => number;
}): TransientOriginRateLimiter {
  if (!Number.isSafeInteger(options.maxRequests) || options.maxRequests < 1) {
    throw new TypeError("CLIENT_REPORT_MAX_REQUESTS_INVALID");
  }
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
    throw new TypeError("CLIENT_REPORT_WINDOW_INVALID");
  }
  const maxOrigins = options.maxOrigins ?? DEFAULT_MAX_ORIGINS;
  if (!Number.isSafeInteger(maxOrigins) || maxOrigins < 1) {
    throw new TypeError("CLIENT_REPORT_MAX_ORIGINS_INVALID");
  }
  const now = options.now ?? Date.now;
  const salt = randomBytes(32);
  const buckets = new Map<string, RateBucket>();

  function hashOrigin(origin: string): string {
    return createHash("sha256").update(salt).update("\0").update(origin).digest("hex");
  }

  function prune(at: number): void {
    for (const [key, bucket] of buckets) {
      if (at - bucket.openedAt >= options.windowMs) buckets.delete(key);
    }
    while (buckets.size >= maxOrigins) {
      const oldest = buckets.keys().next();
      if (oldest.done === true) break;
      buckets.delete(oldest.value);
    }
  }

  return Object.freeze({
    hashOrigin,
    timestamp: now,
    admit(origin: string): boolean {
      const at = now();
      const key = hashOrigin(origin);
      let bucket = buckets.get(key);
      if (bucket === undefined || at - bucket.openedAt >= options.windowMs) {
        prune(at);
        bucket = { count: 0, openedAt: at };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return bucket.count <= options.maxRequests;
    },
  });
}

function occurrenceValues(envelope: PostRedactionEnvelope): readonly unknown[] {
  return [
    null, envelope.occurred_at, envelope.environment, envelope.build_ref,
    envelope.build_dirty, envelope.runtime, JSON.stringify(envelope.component),
    envelope.capture_point, envelope.code, envelope.taxonomy_class,
    envelope.severity, envelope.condition_mark, envelope.disposition,
    envelope.fingerprint, envelope.fingerprint_version,
    envelope.redaction_policy_version, envelope.allowlist_set_id,
    envelope.fallback_minimized, "PERSISTED", envelope.run_ref,
    envelope.work_item_ref, envelope.node_ref, envelope.attempt_ref,
    envelope.ledger_ref, envelope.parent_occurrence_ref,
    envelope.cause_relation, envelope.at_seq_watermark,
    JSON.stringify(envelope.frames), envelope.safe_template_id,
    JSON.stringify(envelope.template_parameters), envelope.source,
    envelope.source_event_ref, envelope.zone_context, envelope.attempt_index,
    envelope.writer_identity,
  ];
}

function createPostgresClientReportStore(connectionString: string | undefined): ClientReportStore {
  const pool = new pg.Pool({ connectionString, max: 2 });
  return Object.freeze({
    async writeOccurrence(envelope: PostRedactionEnvelope): Promise<void> {
      await pool.query(
        `INSERT INTO obs.occurrence (${OCCURRENCE_COLUMNS.join(", ")})
         VALUES (${OCCURRENCE_COLUMNS.map((_column, index) => `$${index + 1}`).join(", ")})
         ON CONFLICT (source, source_event_ref) DO NOTHING`,
        [...occurrenceValues(envelope)],
      );
    },
    async writeDrop(drop: ClientReportDrop): Promise<void> {
      await pool.query(
        `INSERT INTO obs.capture_gap
           (source, gap_class, lost_count, opened_at, closed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [drop.source, drop.gap_class, drop.lost_count, drop.opened_at, drop.closed_at],
      );
    },
    async close(): Promise<void> {
      await pool.end();
    },
  });
}

function member<T extends string>(members: readonly T[]) {
  const values: ReadonlySet<string> = new Set(members);
  return z.string().refine((value): value is T => values.has(value));
}

export function registerClientReportRoutes(
  api: FastifyInstance,
  options?: Readonly<{
    readonly store: ClientReportStore;
    readonly buildRef: string;
    readonly environment: string;
    readonly limiter: TransientOriginRateLimiter;
  }>,
): void {
  const buildRef = safeBuildRef(options?.buildRef ?? BUILD_REF_FALLBACK);
  const environment = safeEnvironment(options?.environment ?? ENVIRONMENT_FALLBACK);
  const store = options?.store
    ?? createPostgresClientReportStore(readObsBounds().writerDatabaseUrl);
  const limiter = options?.limiter ?? createTransientOriginRateLimiter({
    maxRequests: DEFAULT_MAX_REQUESTS,
    windowMs: DEFAULT_WINDOW_MS,
  });
  const bundle = createClientReportBundle(buildRef);
  const schema = z.object({
    code: z.string().refine((value) => CLIENT_CODE_SET.has(value)),
    component: member(CLIENT_COMPONENTS),
    route_template: member(CLIENT_ROUTE_TEMPLATES),
    kind: member(CLIENT_KINDS),
    build_ref: z.unknown().optional(),
  }).strict();
  const redactor = createSharedRedactor({
    environment,
    build_ref: buildRef,
    build_dirty: true,
    runtime: "ui-client",
    component: Object.freeze({ process: "ui-client", package: "@debateai/ui-client" }),
    writer_identity: "ui-client-report",
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
  });

  api.addHook("onClose", async () => store.close());
  api.get("/v1/obs/client-report/enums", CLIENT_REPORT_AUTH, async () => bundle);
  api.post("/v1/obs/client-report", CLIENT_REPORT_AUTH, async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "CLIENT_REPORT_REJECTED" });

    if (!limiter.admit(request.ip)) {
      const at = new Date(limiter.timestamp());
      await store.writeDrop(Object.freeze({
        source: "ui_client" as const,
        gap_class: CLIENT_REPORT_GAP_CLASS,
        lost_count: 1,
        opened_at: at,
        closed_at: at,
      }));
      return reply.status(429).send({ error: "CLIENT_REPORT_RATE_LIMITED" });
    }

    const envelope = redactor.redact({
      kind: "envelope",
      payload_ref: Object.freeze({
        code: parsed.data.code,
        taxonomy_class: "CLIENT_FAILURE",
        capture_point: "client",
        disposition: "HANDLED",
        source: "ui_client",
      }),
      ambient_context_ref: undefined,
      source_event_ref: randomUUID(),
    });
    await store.writeOccurrence(envelope);
    return reply.status(202).send();
  });
}

// Server-only developer observability sink. Do not import this module from client components.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type AppLogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type AppLogCategory = "boundary" | "suspicious" | "system" | "ui" | "worker";

export type AppLogRootHintType =
  | "ui"
  | "api"
  | "service"
  | "db"
  | "worker"
  | "model"
  | "artifact"
  | "unknown";

export interface AppLogRootHint {
  suspectedLayer?: AppLogRootHintType;
  upstreamEventId?: string;
  notes?: string;
}

export interface LogErrorShape {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: unknown;
}

export interface AppLogEvent {
  timestamp: string;
  level: AppLogLevel;
  category?: AppLogCategory | string;
  event: string;
  source: string;
  message: string;
  operation?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
  debateId?: string;
  runId?: string;
  artifactId?: string;
  expected?: unknown;
  actual?: unknown;
  context?: unknown;
  error?: LogErrorShape;
  rootHint?: AppLogRootHint;
}

export type AppLogInput = Omit<AppLogEvent, "timestamp" | "level" | "event">;

export interface RedactionOptions {
  maxDepth?: number;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
}

export interface DeveloperLogger {
  debug(event: string, input: AppLogInput): void;
  info(event: string, input: AppLogInput): void;
  warn(event: string, input: AppLogInput): void;
  error(event: string, input: AppLogInput): void;
  fatal(event: string, input: AppLogInput): void;
  suspicious(event: string, input: AppLogInput): void;
}

export interface DeveloperLoggerOptions {
  enabled?: boolean;
  logPath?: string;
}

const DEFAULT_REDACTION_OPTIONS: Required<RedactionOptions> = {
  maxDepth: 6,
  maxStringLength: 1024,
  maxArrayLength: 20,
  maxObjectKeys: 80
};

const SENSITIVE_KEY_PATTERN =
  /(^|[-_.])(?:api[-_.]?key|auth(?:orization)?|bearer|cookie|password|passwd|private[-_.]?key|private[-_.]?payload|provider[-_.]?payload|prompt|raw[-_.]?prompt|refresh[-_.]?token|secret|session[-_.]?token|token|access[-_.]?token|client[-_.]?secret)([-_.]|$)/i;
const SENSITIVE_VALUE_PATTERN =
  /\b(?:authorization:\s*bearer\s+\S+|bearer\s+\S+|cookie:\s*\S+|password\s*=\s*\S+|passwd\s*=\s*\S+|api[-_]?key\s*=\s*\S+|prompt\s*=\s*\S+|secret\s*=\s*\S+|sk-[A-Za-z0-9_-]{8,})\b/i;

export function redactForLog(value: unknown, options: RedactionOptions = {}): unknown {
  const limits = { ...DEFAULT_REDACTION_OPTIONS, ...options };
  return redactValue(value, limits, new WeakSet(), 0);
}

function redactValue(
  value: unknown,
  limits: Required<RedactionOptions>,
  seen: WeakSet<object>,
  depth: number
): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "string") {
    if (SENSITIVE_VALUE_PATTERN.test(value)) {
      return "[REDACTED]";
    }

    return truncateString(value, limits.maxStringLength);
  }

  if (value instanceof Error) {
    return redactError(value, limits, seen, depth);
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[CIRCULAR]";
  }

  if (depth >= limits.maxDepth) {
    return "[TRUNCATED_DEPTH]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, limits.maxArrayLength)
      .map((item) => redactValue(item, limits, seen, depth + 1));
    if (value.length > limits.maxArrayLength) {
      items.push(`[TRUNCATED ${value.length - limits.maxArrayLength} items]`);
    }
    return items;
  }

  const output: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (const [index, [key, entryValue]] of entries.entries()) {
    if (index >= limits.maxObjectKeys) {
      output.__truncatedKeys = entries.length - limits.maxObjectKeys;
      break;
    }

    output[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValue(entryValue, limits, seen, depth + 1);
  }

  return output;
}

function redactError(
  error: Error,
  limits: Required<RedactionOptions>,
  seen: WeakSet<object>,
  depth: number
): LogErrorShape {
  const shaped: LogErrorShape = {
    name: error.name,
    message: redactString(error.message, limits.maxStringLength)
  };
  if (error.stack) {
    shaped.stack = redactString(error.stack, limits.maxStringLength);
  }

  const maybeCode = (error as Error & { code?: unknown }).code;
  if (typeof maybeCode === "string" || typeof maybeCode === "number") {
    shaped.code = maybeCode;
  }

  const maybeCause = (error as Error & { cause?: unknown }).cause;
  if (maybeCause !== undefined) {
    shaped.cause = redactValue(maybeCause, limits, seen, depth + 1);
  }

  return shaped;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}[TRUNCATED ${value.length - maxLength} chars]`;
}

function redactString(value: string, maxLength: number): string {
  if (SENSITIVE_VALUE_PATTERN.test(value)) {
    return "[REDACTED]";
  }

  return truncateString(value, maxLength);
}

function shouldLog(options: DeveloperLoggerOptions): boolean {
  if (options.enabled !== undefined) {
    return options.enabled;
  }

  const flag = process.env.DEV_OBSERVABILITY;
  if (flag === "false") {
    return false;
  }
  if (flag === "true") {
    return true;
  }

  return process.env.NODE_ENV === "development";
}

function resolveLogPath(options: DeveloperLoggerOptions): string {
  return options.logPath ?? process.env.DEV_OBSERVABILITY_LOG_PATH ?? join(process.cwd(), "logs", "developer-events.jsonl");
}

export function createDeveloperLogger(options: DeveloperLoggerOptions = {}): DeveloperLogger {
  const write = (level: AppLogLevel, event: string, input: AppLogInput): void => {
    try {
      if (!shouldLog(options)) {
        return;
      }

      const shapedEvent: AppLogEvent = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...input
      };
      const safeEvent = redactForLog(shapedEvent) as AppLogEvent;
      const logPath = resolveLogPath(options);
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${JSON.stringify(safeEvent)}\n`, "utf8");
    } catch {
      // Developer observability must never interrupt product flow.
    }
  };

  return {
    debug: (event, input) => write("debug", event, input),
    info: (event, input) => write("info", event, input),
    warn: (event, input) => write("warn", event, input),
    error: (event, input) => write("error", event, input),
    fatal: (event, input) => write("fatal", event, input),
    suspicious: (event, input) => write("warn", event, { ...input, category: "suspicious" })
  };
}

export const developerLogger = createDeveloperLogger();
export const Logger = developerLogger;

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ObservationError } from "../core/errors.js";
import {
  signalLifecycleIdentitySchema,
  type ReplayedJournals,
  type ReplayedOpenSignal,
  type SignalLifecycleIdentity
} from "../core/lifecycle.js";
import {
  deliveryJournalEnvelopeSchema,
  signalSchema,
  type ObservationSignal
} from "../core/signals.js";

const journalLifecycleSchema = z.object({
  owner: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/u),
  correlation_key: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/u)
}).strict();

export const signalJournalRecordV2Schema = z.object({
  record_version: z.literal(2),
  kind: z.literal("signal"),
  signal: signalSchema,
  lifecycle: journalLifecycleSchema.nullable()
}).strict();

export const signalJournalRecordSchema = z.union([signalSchema, signalJournalRecordV2Schema]);

export type SignalJournalRecordV2 = Readonly<z.infer<typeof signalJournalRecordV2Schema>>;

export function createSignalJournalRecordV2(
  input: unknown,
  lifecycle: SignalLifecycleIdentity | null = null
): SignalJournalRecordV2 {
  const signal = signalSchema.parse(input);
  const parsedLifecycle = lifecycle === null ? null : signalLifecycleIdentitySchema.parse(lifecycle);
  return signalJournalRecordV2Schema.parse({
    record_version: 2,
    kind: "signal",
    signal,
    lifecycle: parsedLifecycle === null ? null : {
      owner: parsedLifecycle.owner,
      correlation_key: parsedLifecycle.correlationKey
    }
  });
}

export function signalFromJournalRecord(input: unknown): ObservationSignal {
  const record = signalJournalRecordSchema.parse(input);
  return "record_version" in record ? record.signal : record;
}

type DecodedSignalRecord = Readonly<{
  replayed: ReplayedOpenSignal;
  versioned: boolean;
}>;

function decodeSignalRecord(input: unknown): DecodedSignalRecord {
  const record = signalJournalRecordSchema.parse(input);
  if (!("record_version" in record)) {
    return Object.freeze({
      replayed: Object.freeze({ signal: record, lifecycle: null }),
      versioned: false
    });
  }
  const lifecycle = record.lifecycle === null ? null : Object.freeze({
    owner: record.lifecycle.owner,
    correlationKey: record.lifecycle.correlation_key
  });
  return Object.freeze({
    replayed: Object.freeze({ signal: record.signal, lifecycle }),
    versioned: true
  });
}

function isOneShotSignal(signal: ObservationSignal): boolean {
  if (signal.state !== "OPEN"
    || signal.component !== "observation_agent"
    || signal.first_failed_probe_at !== null
    || signal.suspected_defect
    || signal.defect_kind !== null
    || signal.run_ref !== null
    || signal.work_item_ref !== null
    || signal.clears_signal_id !== null) {
    return false;
  }
  if (signal.class === "THRESHOLD_CHANGED") {
    return signal.severity === "INFO" && signal.impact_code === "IMPACT_THRESHOLDS";
  }
  if (signal.class !== "AGENT_SELF") return false;
  return (signal.severity === "INFO"
      && (signal.impact_code === "IMPACT_AGENT_START"
        || signal.impact_code === "IMPACT_AGENT_STOP"))
    || (signal.severity === "SEVERE" && signal.impact_code === "IMPACT_AGENT_JOURNAL");
}

function identityKey(signal: ObservationSignal): string {
  return `${signal.component}\0${signal.class}`;
}

function lifecycleKey(lifecycle: SignalLifecycleIdentity): string {
  return `${lifecycle.owner}\0${lifecycle.correlationKey}`;
}

function sameLifecycle(
  left: SignalLifecycleIdentity | null,
  right: SignalLifecycleIdentity | null
): boolean {
  return left !== null && right !== null
    && left.owner === right.owner
    && left.correlationKey === right.correlationKey;
}

function invalid(cause?: unknown): never {
  throw new ObservationError("OBSERVATION_JOURNAL_INVALID", cause);
}

function parsePhysicalLines(source: string): readonly unknown[] {
  const finalNewline = source.endsWith("\n");
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const values: unknown[] = [];
  for (const [index, physicalLine] of lines.entries()) {
    const line = physicalLine.endsWith("\r") ? physicalLine.slice(0, -1) : physicalLine;
    if (line.length === 0) continue;
    try {
      values.push(JSON.parse(line) as unknown);
    } catch (error) {
      if (!finalNewline && index === lines.length - 1) continue;
      invalid(error);
    }
  }
  return values;
}

async function journalFiles(stateDir: string): Promise<readonly string[]> {
  try {
    return (await readdir(join(stateDir, "journal"))).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function replayObservationJournals(
  stateDir: string,
  validOwners: ReadonlySet<string>
): Promise<ReplayedJournals> {
  const names = await journalFiles(stateDir);
  const openById = new Map<string, ReplayedOpenSignal>();
  const openByLifecycle = new Map<string, string>();
  const openByIdentity = new Map<string, string>();
  const seenSignalIds = new Set<string>();
  const deliveryResults: ReplayedJournals["deliveryResults"][number][] = [];

  try {
    for (const name of names.filter((candidate) => (
      /^signals-[0-9]{4}-[0-9]{2}-[0-9]{2}\.jsonl$/u.test(candidate)
    ))) {
      const source = await readFile(join(stateDir, "journal", name), "utf8");
      for (const value of parsePhysicalLines(source)) {
        const decoded = decodeSignalRecord(value);
        const { signal, lifecycle } = decoded.replayed;
        if (lifecycle !== null && !validOwners.has(lifecycle.owner)) invalid();
        if (seenSignalIds.has(signal.signal_id)) invalid();
        seenSignalIds.add(signal.signal_id);

        if (isOneShotSignal(signal)) {
          if (decoded.versioned && lifecycle !== null) invalid();
          continue;
        }

        if (signal.state === "OPEN") {
          const currentIdentity = openByIdentity.get(identityKey(signal));
          const currentLifecycle = lifecycle === null
            ? undefined
            : openByLifecycle.get(lifecycleKey(lifecycle));
          if (currentIdentity !== undefined || currentLifecycle !== undefined) invalid();
          openById.set(signal.signal_id, decoded.replayed);
          openByIdentity.set(identityKey(signal), signal.signal_id);
          if (lifecycle !== null) openByLifecycle.set(lifecycleKey(lifecycle), signal.signal_id);
          continue;
        }

        const clearsId = signal.clears_signal_id;
        const opened = clearsId === null ? undefined : openById.get(clearsId);
        if (opened === undefined
          || opened.signal.component !== signal.component
          || opened.signal.class !== signal.class
          || (opened.lifecycle !== null && !sameLifecycle(opened.lifecycle, lifecycle))) {
          invalid();
        }
        if (lifecycle !== null) {
          const lifecycleOpenId = openByLifecycle.get(lifecycleKey(lifecycle));
          if (lifecycleOpenId !== undefined && lifecycleOpenId !== clearsId) invalid();
        }
        openById.delete(clearsId!);
        openByIdentity.delete(identityKey(opened.signal));
        if (opened.lifecycle !== null) openByLifecycle.delete(lifecycleKey(opened.lifecycle));
      }
    }

    for (const name of names.filter((candidate) => (
      /^deliveries-[0-9]{4}-[0-9]{2}-[0-9]{2}\.jsonl$/u.test(candidate)
    ))) {
      const source = await readFile(join(stateDir, "journal", name), "utf8");
      for (const value of parsePhysicalLines(source)) {
        const envelope = deliveryJournalEnvelopeSchema.parse(value);
        if (envelope.kind === "RESULT") deliveryResults.push(envelope);
      }
    }
  } catch (error) {
    if (error instanceof ObservationError && error.code === "OBSERVATION_JOURNAL_INVALID") {
      throw error;
    }
    invalid(error);
  }

  return Object.freeze({
    openSignals: Object.freeze([...openById.values()]),
    deliveryResults: Object.freeze(deliveryResults)
  });
}

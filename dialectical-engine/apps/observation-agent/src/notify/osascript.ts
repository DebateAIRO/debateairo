import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import {
  deliverySchema,
  renderImpact,
  signalSchema,
  type ObservationDelivery,
  type ObservationSignal,
  type Severity
} from "../core/signals.js";
import type { ObservationJournal } from "../journal/journal.js";

type DeliveryMirror = Readonly<{
  mirrorDelivery(delivery: ObservationDelivery): Promise<void>;
}>;

type OsaScriptExecutor = (
  file: string,
  args: readonly string[],
  timeoutMs: number
) => Promise<void>;

const execFileAsync = promisify(execFile);
const severityRank: Readonly<Record<Severity, number>> = Object.freeze({
  INFO: 0, DEGRADED: 1, SEVERE: 2, FATAL: 3
});

function appleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function executeOsaScript(file: string, args: readonly string[], timeoutMs: number): Promise<void> {
  await execFileAsync(file, args, { timeout: timeoutMs, encoding: "utf8", maxBuffer: 16 * 1024 });
}

export class OsaScriptNotifier {
  private readonly journal: ObservationJournal;
  private readonly mirror: DeliveryMirror;
  private readonly execute: OsaScriptExecutor;
  private readonly lastAttempt = new Map<string, Readonly<{ at: number; severity: Severity }>>();

  constructor(input: Readonly<{
    journal: ObservationJournal;
    mirror: DeliveryMirror;
    execute?: OsaScriptExecutor;
  }>) {
    this.journal = input.journal;
    this.mirror = input.mirror;
    this.execute = input.execute ?? executeOsaScript;
  }

  async deliver(input: unknown, options: Readonly<{
    now: Date;
    muted: boolean;
    rateLimitMs: number;
    timeoutMs: number;
    allowDegraded?: boolean;
  }>): Promise<ObservationDelivery | null> {
    const signal: ObservationSignal = signalSchema.parse(input);
    const isClear = signal.state === "CLEARED";
    if (!isClear && severityRank[signal.severity] < severityRank.SEVERE
      && !(options.allowDegraded === true && signal.severity === "DEGRADED")) return null;

    const key = `${signal.component}:${signal.class}`;
    const previous = this.lastAttempt.get(key);
    const deliveryId = randomUUID();
    const attemptedAt = options.now.toISOString();
    await this.journal.appendDeliveryAttempt({
      kind: "ATTEMPT",
      delivery_id: deliveryId,
      signal_id: signal.signal_id,
      channel: "osascript",
      attempted_at: attemptedAt
    });
    let outcome: ObservationDelivery["outcome"];
    let deliveredAt: string | null = null;
    if (options.muted && !isClear) {
      outcome = "MUTED";
    } else if (!isClear && previous !== undefined
      && options.now.getTime() - previous.at < options.rateLimitMs
      && severityRank[signal.severity] <= severityRank[previous.severity]) {
      outcome = "RATE_LIMITED";
    } else {
      const impact = renderImpact(signal);
      const titleSeverity = isClear ? "CLEARED" : signal.severity;
      const expression = `display notification "${appleScriptString(impact)}" with title "${appleScriptString(`dialectical-engine: ${signal.component} ${titleSeverity}`)}" subtitle "${appleScriptString(signal.class)}"`;
      try {
        await this.execute("/usr/bin/osascript", ["-e", expression], options.timeoutMs);
        outcome = "DELIVERED";
        deliveredAt = options.now.toISOString();
      } catch {
        outcome = "FAILED";
      }
      this.lastAttempt.set(key, Object.freeze({ at: options.now.getTime(), severity: signal.severity }));
    }
    const delivery = deliverySchema.parse({
      delivery_id: deliveryId,
      signal_id: signal.signal_id,
      channel: "osascript",
      attempted_at: attemptedAt,
      delivered_at: deliveredAt,
      outcome,
      external_ref: null
    });
    await this.journal.appendDeliveryResult({ kind: "RESULT", delivery });
    await this.mirror.mirrorDelivery(delivery).catch(() => undefined);
    return delivery;
  }
}

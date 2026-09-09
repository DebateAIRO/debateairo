import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  deliveryAttemptEnvelopeSchema,
  deliveryResultEnvelopeSchema,
  type DeliveryAttemptEnvelope,
  type DeliveryResultEnvelope,
  type ObservationSignal
} from "../core/signals.js";
import type { SignalLifecycleIdentity } from "../core/lifecycle.js";
import {
  createSignalJournalRecordV2,
  signalFromJournalRecord
} from "./records.js";

export class ObservationJournal {
  readonly stateDir: string;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
  }

  async appendSignal(
    input: unknown,
    lifecycle: SignalLifecycleIdentity | null = null
  ): Promise<ObservationSignal> {
    const record = createSignalJournalRecordV2(input, lifecycle);
    await this.append("signals", record.signal.detected_at.slice(0, 10), record);
    return record.signal;
  }

  async appendDeliveryAttempt(input: unknown): Promise<DeliveryAttemptEnvelope> {
    const envelope = deliveryAttemptEnvelopeSchema.parse(input);
    await this.append("deliveries", envelope.attempted_at.slice(0, 10), envelope);
    return envelope;
  }

  async appendDeliveryResult(input: unknown): Promise<DeliveryResultEnvelope> {
    const envelope = deliveryResultEnvelopeSchema.parse(input);
    await this.append("deliveries", envelope.delivery.attempted_at.slice(0, 10), envelope);
    return envelope;
  }

  async previousRunExitReason(): Promise<"CLEAN" | "UNCLEAN" | "UNKNOWN"> {
    const directory = join(this.stateDir, "journal");
    let files: string[];
    try {
      files = (await readdir(directory))
        .filter((name) => /^signals-[0-9]{4}-[0-9]{2}-[0-9]{2}\.jsonl$/u.test(name))
        .sort()
        .reverse();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return "UNKNOWN";
      throw error;
    }
    for (const file of files) {
      const lines = (await readFile(join(directory, file), "utf8")).trim().split("\n").reverse();
      for (const line of lines) {
        if (line.length === 0) continue;
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          continue;
        }
        let signal: ObservationSignal;
        try {
          signal = signalFromJournalRecord(value);
        } catch {
          continue;
        }
        if (signal.class !== "AGENT_SELF") continue;
        if (signal.impact_code === "IMPACT_AGENT_STOP") return "CLEAN";
        if (signal.impact_code === "IMPACT_AGENT_START") return "UNCLEAN";
      }
    }
    return "UNKNOWN";
  }

  private async append(kind: "signals" | "deliveries", day: string, row: unknown): Promise<void> {
    const directory = join(this.stateDir, "journal");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const handle = await open(join(directory, `${kind}-${day}.jsonl`), "a", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(row)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

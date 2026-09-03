import type { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  deliveryJournalEnvelopeSchema,
  deliverySchema,
  signalSchema,
  type ObservationDelivery,
  type ObservationSignal
} from "../core/signals.js";

export class PostgresMirror {
  readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async mirrorSignal(input: unknown): Promise<void> {
    const signal: ObservationSignal = signalSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("SET statement_timeout = 2000");
      await client.query(`
        INSERT INTO observation.signal(
          seq,signal_id,state,class,component,severity,impact_code,first_failed_probe_at,
          detected_at,evidence,suspected_defect,defect_kind,run_ref,work_item_ref,
          threshold_version,clears_signal_id,recorded_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
        ) ON CONFLICT (signal_id) DO NOTHING
      `, [
        signal.seq, signal.signal_id, signal.state, signal.class, signal.component,
        signal.severity, signal.impact_code, signal.first_failed_probe_at,
        signal.detected_at, signal.evidence, signal.suspected_defect, signal.defect_kind,
        signal.run_ref, signal.work_item_ref, signal.threshold_version,
        signal.clears_signal_id, signal.recorded_at
      ]);
    } finally {
      client.release();
    }
  }

  async mirrorDelivery(input: unknown): Promise<void> {
    const delivery: ObservationDelivery = deliverySchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("SET statement_timeout = 2000");
      await client.query(`
        INSERT INTO observation.delivery(
          delivery_id,signal_id,channel,attempted_at,delivered_at,outcome,external_ref
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (delivery_id) DO NOTHING
      `, [
        delivery.delivery_id, delivery.signal_id, delivery.channel,
        delivery.attempted_at, delivery.delivered_at, delivery.outcome, delivery.external_ref
      ]);
    } finally {
      client.release();
    }
  }

  async catchUp(stateDir: string): Promise<Readonly<{ signals: number; deliveries: number }>> {
    const journalDirectory = join(stateDir, "journal");
    let names: readonly string[];
    try {
      names = (await readdir(journalDirectory))
        .filter((name) => /^(signals|deliveries)-[0-9]{4}-[0-9]{2}-[0-9]{2}\.jsonl$/u.test(name))
        .sort();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return Object.freeze({ signals: 0, deliveries: 0 });
      }
      throw error;
    }
    let signals = 0;
    let deliveries = 0;
    for (const kind of ["signals", "deliveries"] as const) {
      for (const name of names.filter((candidate) => candidate.startsWith(`${kind}-`))) {
        const rows = (await readFile(join(journalDirectory, name), "utf8"))
          .split("\n").filter((line) => line.length > 0);
        for (const row of rows) {
          const value: unknown = JSON.parse(row);
          if (kind === "signals") {
            await this.mirrorSignal(value);
            signals += 1;
          } else {
            const envelope = deliveryJournalEnvelopeSchema.parse(value);
            if (envelope.kind === "RESULT") {
              await this.mirrorDelivery(envelope.delivery);
              deliveries += 1;
            }
          }
        }
      }
    }
    return Object.freeze({ signals, deliveries });
  }
}

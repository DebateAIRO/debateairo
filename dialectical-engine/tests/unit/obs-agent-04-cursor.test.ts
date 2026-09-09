import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const queryPath = "apps/observation-agent/src/modules/capture-health/queries.ts";

async function queryModule() {
  if (!existsSync(queryPath)) return null;
  return import("../../apps/observation-agent/src/modules/capture-health/queries.js");
}

function client(input: Readonly<{ failOn?: string }> = {}) {
  const calls: Array<Readonly<{ text: string; values: readonly unknown[] }>> = [];
  return {
    calls,
    async query<Row extends Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = []
    ): Promise<Readonly<{ rows: readonly Row[] }>> {
      calls.push({ text, values });
      if (input.failOn !== undefined && text.includes(input.failOn)) {
        throw new Error("isolated read failure");
      }
      let rows: readonly Record<string, unknown>[] = [];
      if (text.includes("FROM observation.sample_ring")) {
        rows = [
          { metric_key: "obs04.cursor.capture_gap", value: "1000" },
          { metric_key: "obs04.cursor.component_health", value: "2000" },
          { metric_key: "obs04.cursor.spool_receipt", value: "3000" }
        ];
      } else if (text.includes("FROM obs.capture_gap")) {
        rows = [{
          capture_gap_id: "41000000-0000-4000-8000-000000000001",
          source: "first_party", gap_class: "QUEUE_FULL", lost_count: "7",
          opened_at: new Date(4_000), closed_at: null
        }];
      } else if (text.includes("FROM obs.component_health")) {
        rows = [{
          component: "runner", state: "HEALTHY", observed_at: new Date(5_000),
          detail_code: "FLUSH_OK"
        }];
      } else if (text.includes("FROM obs.spool_receipt")) {
        rows = [{
          spool_ref: "runner-7-41000000-0000-4000-8000-000000000002.spool",
          reingested_at: new Date(6_000)
        }];
      }
      return { rows: rows as readonly Row[] };
    }
  };
}

describe("OBS-04 capture relation cursor", () => {
  it("reads all three capture relations and advances only own-schema monotonic cursors", async () => {
    const queries = await queryModule();
    expect(queries).not.toBeNull();
    const fake = client();
    const result = await queries!.readCaptureSnapshotFromClient(fake);

    expect(result).toEqual({
      state: "CURRENT",
      gaps: [{
        captureGapId: "41000000-0000-4000-8000-000000000001",
        source: "first_party", gapClass: "QUEUE_FULL", lostCount: 7,
        openedAt: new Date(4_000), closedAt: null
      }],
      health: [{
        runtime: "runner", state: "HEALTHY", observedAt: new Date(5_000),
        detailCode: "FLUSH_OK"
      }],
      receipts: [{
        spoolRef: "runner-7-41000000-0000-4000-8000-000000000002.spool",
        reingestedAt: new Date(6_000)
      }],
      cursor: { captureGapMs: 4_000, componentHealthMs: 5_000, spoolReceiptMs: 6_000 }
    });

    const sql = fake.calls.map((call) => call.text).join("\n");
    expect(sql).toContain("FROM obs.capture_gap");
    expect(sql).toContain("FROM obs.component_health");
    expect(sql).toContain("FROM obs.spool_receipt");
    expect(sql).toContain("INSERT INTO observation.sample_ring");
    expect(sql).not.toMatch(/(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?obs\./iu);
    const cursorWrites = fake.calls.filter((call) =>
      call.text.includes("INSERT INTO observation.sample_ring"));
    expect(cursorWrites.map((call) => call.values.slice(0, 2))).toEqual([
      ["obs04.cursor.capture_gap", 4_000],
      ["obs04.cursor.component_health", 5_000],
      ["obs04.cursor.spool_receipt", 6_000]
    ]);
  });

  it.each(["FROM obs.capture_gap", "FROM obs.component_health", "FROM obs.spool_receipt"])(
    "returns UNKNOWN and never advances a cursor when the %s read fails",
    async (failOn) => {
      const queries = await queryModule();
      expect(queries).not.toBeNull();
      const fake = client({ failOn });
      await expect(queries!.readCaptureSnapshotFromClient(fake)).resolves.toEqual({
        state: "UNKNOWN", gaps: [], health: [], receipts: [],
        cursor: { captureGapMs: 1_000, componentHealthMs: 2_000, spoolReceiptMs: 3_000 }
      });
      expect(fake.calls.some((call) =>
        call.text.includes("INSERT INTO observation.sample_ring"))).toBe(false);
    }
  );
});

import { describe, expect, it } from "vitest";

import {
  CAPTURE_GAP_CLASSES,
  CAPTURE_HEALTH_CODES,
  createCaptureGapCounter,
  createCaptureHealth,
  type CaptureGapRow,
} from "../../packages/obs-capture/src/health.js";

describe("FIX-07 C2 loss vocabulary", () => {
  it("starts DISABLED health at zero and exposes every failure gap class", () => {
    const health = createCaptureHealth();

    expect(CAPTURE_HEALTH_CODES.DISABLED).toBe("DISABLED");
    expect(health.snapshot().counts.DISABLED).toBe(0);
    expect(CAPTURE_GAP_CLASSES.POSTGRES_FAILURE).toBe("POSTGRES_FAILURE");
    expect(CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE).toBe("GAP_WRITE_FAILURE");
    expect(CAPTURE_GAP_CLASSES.DISABLED).toBe("DISABLED");
  });

  it("aggregates exact operation and suppression counts by source and class", async () => {
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    const rows: CaptureGapRow[] = [];

    gaps.recordLoss("unclassified", CAPTURE_GAP_CLASSES.POSTGRES_FAILURE, 1);
    gaps.recordLoss("unclassified", CAPTURE_GAP_CLASSES.POSTGRES_FAILURE, 2);
    gaps.recordLoss("unclassified", CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE, 1);
    gaps.recordLoss("unclassified", CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE, 3);
    gaps.recordLoss("first_party", CAPTURE_GAP_CLASSES.DISABLED, 1);
    gaps.recordLoss("first_party", CAPTURE_GAP_CLASSES.DISABLED, 7);

    while (await gaps.flushOne((row) => {
      rows.push(row);
    })) {}

    expect(rows.map((row) => ({
      source: row.source,
      gap_class: row.gap_class,
      lost_count: row.lost_count,
    }))).toEqual([
      {
        source: "unclassified",
        gap_class: "POSTGRES_FAILURE",
        lost_count: 3,
      },
      {
        source: "unclassified",
        gap_class: "GAP_WRITE_FAILURE",
        lost_count: 4,
      },
      {
        source: "first_party",
        gap_class: "DISABLED",
        lost_count: 8,
      },
    ]);
    expect(gaps.pendingLossCount()).toBe(0);
  });
});

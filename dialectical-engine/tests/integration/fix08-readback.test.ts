import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pgMock = vi.hoisted(() => ({
  construct: vi.fn<(config: unknown) => void>(),
  query: vi.fn<(...arguments_: unknown[]) => Promise<{ readonly rows: readonly unknown[] }>>(),
  end: vi.fn<() => Promise<void>>(),
}));

vi.mock("pg", () => ({
  Pool: class MockPool {
    constructor(config: unknown) {
      pgMock.construct(config);
    }

    query(...arguments_: unknown[]) {
      return pgMock.query(...arguments_);
    }

    end() {
      return pgMock.end();
    }
  },
}));

import {
  OBS_G1_READBACK_MAX_ROWS,
  OBS_G1_READBACK_TIMEOUT_MS,
  openObsReadbackFromEnvironment,
} from "../../acceptance/obs/readback.js";

const originalListenerUrl = process.env.OBS_LISTENER_DATABASE_URL;

beforeEach(() => {
  pgMock.construct.mockReset();
  pgMock.query.mockReset();
  pgMock.end.mockReset();
  pgMock.end.mockResolvedValue(undefined);
  process.env.OBS_LISTENER_DATABASE_URL = "postgresql://listener:local@127.0.0.1:1/debateai";
});

afterEach(() => {
  if (originalListenerUrl === undefined) delete process.env.OBS_LISTENER_DATABASE_URL;
  else process.env.OBS_LISTENER_DATABASE_URL = originalListenerUrl;
});

describe("FIX-08 parent database read-back", () => {
  it("uses bounded settings and exact parameterized row filters", async () => {
    pgMock.query
      .mockResolvedValueOnce({ rows: [{ occ_seq: "41" }] })
      .mockResolvedValueOnce({
        rows: [{
          occ_seq: "42",
          run_ref: "run:obs-g1:00000000-0000-4000-8000-000000000508",
          runtime: "scheduler",
          capture_point: "job",
        }],
      });

    const readback = await openObsReadbackFromEnvironment();
    if (readback === undefined) throw new Error("READBACK_NOT_OPENED");
    const baseline = await readback.readBaseline();
    const rows = await readback.readRows({
      baseline,
      runRef: "run:obs-g1:00000000-0000-4000-8000-000000000508",
      runtime: "scheduler",
      capturePoint: "job",
    });
    await readback.close();

    expect(pgMock.construct).toHaveBeenCalledWith({
      application_name: "debateai-fix08-acceptance",
      connectionString: "postgresql://listener:local@127.0.0.1:1/debateai",
      connectionTimeoutMillis: OBS_G1_READBACK_TIMEOUT_MS,
      idleTimeoutMillis: OBS_G1_READBACK_TIMEOUT_MS,
      max: 1,
      query_timeout: OBS_G1_READBACK_TIMEOUT_MS,
      statement_timeout: OBS_G1_READBACK_TIMEOUT_MS,
    });
    expect(baseline).toBe(41n);
    expect(rows).toEqual([{
      occurrenceSequence: 42n,
      runRef: "run:obs-g1:00000000-0000-4000-8000-000000000508",
      runtime: "scheduler",
      capturePoint: "job",
    }]);
    expect(String(pgMock.query.mock.calls[1]?.[0])).toContain("occ_seq > $1::bigint");
    expect(String(pgMock.query.mock.calls[1]?.[0])).toContain("run_ref = $2");
    expect(String(pgMock.query.mock.calls[1]?.[0])).toContain("runtime = $3");
    expect(String(pgMock.query.mock.calls[1]?.[0])).toContain("capture_point = $4");
    expect(pgMock.query.mock.calls[1]?.[1]).toEqual([
      "41",
      "run:obs-g1:00000000-0000-4000-8000-000000000508",
      "scheduler",
      "job",
      OBS_G1_READBACK_MAX_ROWS + 1,
    ]);
    expect(pgMock.end).toHaveBeenCalledOnce();
  });

  it("rejects a result larger than the parent row limit", async () => {
    pgMock.query.mockResolvedValue({
      rows: Array.from({ length: OBS_G1_READBACK_MAX_ROWS + 1 }, (_unused, index) => ({
        occ_seq: String(index + 1),
        run_ref: "run:fixed",
        runtime: "scheduler",
        capture_point: "job",
      })),
    });
    const readback = await openObsReadbackFromEnvironment();
    if (readback === undefined) throw new Error("READBACK_NOT_OPENED");

    await expect(readback.readRows({
      baseline: 0n,
      runRef: "run:fixed",
      runtime: "scheduler",
      capturePoint: "job",
    })).rejects.toMatchObject({ code: "ROW_READBACK_LIMIT" });
    await readback.close();
  });

  it("does not open a pool without the parent read-only URL", async () => {
    delete process.env.OBS_LISTENER_DATABASE_URL;

    await expect(openObsReadbackFromEnvironment()).resolves.toBeUndefined();
    expect(pgMock.construct).not.toHaveBeenCalled();
  });
});

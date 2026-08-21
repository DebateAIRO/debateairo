import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { GraphRepository } from "@debateai/graph";

describe("S03 snapshot entry conditions", () => {
  it("uses one repeatable-read client and preserves typed tau absence", async () => {
    const calls: string[] = [];
    let released = false;
    const client = {
      query: async (sql: string): Promise<{ rows: unknown[] }> => {
        calls.push(sql);
        if (sql.includes("FROM core.node AS node")) {
          return { rows: [{
            node_id: "node:pending",
            base_strength: null,
            parent_node_id: null,
            generation_status: "pending",
            way_of_knowing: "REASONING",
            provenance_ref: null
          }] };
        }
        if (sql.includes("FROM core.edge AS edge")) return { rows: [] };
        return { rows: [] };
      },
      release: (): void => { released = true; }
    };
    const pool = {
      connect: async () => client,
      query: async (): Promise<never> => { throw new Error("pool.query would split the snapshot"); }
    } as unknown as Pool;

    const result = await new GraphRepository(pool).materialiseSnapshot("run:test");

    expect(calls[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(calls.some((sql) => sql.includes("LEFT JOIN LATERAL"))).toBe(true);
    expect(calls.at(-1)).toBe("COMMIT");
    expect(released).toBe(true);
    expect(result.nodes).toEqual([expect.objectContaining({ nodeId: "node:pending", baseStrength: null })]);
  });
});

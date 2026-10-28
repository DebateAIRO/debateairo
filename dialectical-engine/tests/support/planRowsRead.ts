import type { Pool, PoolClient } from "pg";

export type CapturedStatement = Readonly<{ via: "pool" | "client"; text: string; values: readonly unknown[] }>;

function recordingQuery(
  target: Pick<Pool | PoolClient, "query">,
  via: CapturedStatement["via"],
  statements: CapturedStatement[]
): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => {
    const [text, values] = args;
    if (typeof text === "string") {
      statements.push(Object.freeze({
        via,
        text,
        values: Object.freeze(Array.isArray(values) ? [...values] : [])
      }));
    }
    return (target.query as (...queryArgs: unknown[]) => unknown)(...args);
  };
}

function capturingClient(client: PoolClient, statements: CapturedStatement[]): PoolClient {
  const query = recordingQuery(client, "client", statements);
  return new Proxy(client, {
    get(target, property) {
      if (property === "query") return query;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

/** A facade over `pool` whose pool.query and connected clients' query record each statement before running it. */
export function capturingPool(pool: Pool): Readonly<{ pool: Pool; statements: CapturedStatement[] }> {
  const statements: CapturedStatement[] = [];
  const query = recordingQuery(pool, "pool", statements);
  const connect = async (): Promise<PoolClient> => capturingClient(await pool.connect(), statements);
  const facade = new Proxy(pool, {
    get(target, property) {
      if (property === "query") return query;
      if (property === "connect") return connect;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return Object.freeze({ pool: facade, statements });
}

type PlanNode = Readonly<{
  "Relation Name"?: string;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  Plans?: readonly PlanNode[];
}>;

function sumRowsRead(node: PlanNode, relations: ReadonlySet<string>): number {
  const own = node["Relation Name"] !== undefined && relations.has(node["Relation Name"])
    ? (Number(node["Actual Rows"] ?? 0)
      + Number(node["Rows Removed by Filter"] ?? 0)
      + Number(node["Rows Removed by Index Recheck"] ?? 0)) * Number(node["Actual Loops"] ?? 0)
    : 0;
  return (node.Plans ?? []).reduce((total, child) => total + sumRowsRead(child, relations), own);
}

/**
 * Rows the plan of `text` (run with `values`) read from the named relations: for each plan node whose
 * "Relation Name" is listed, (Actual Rows + Rows Removed by Filter + Rows Removed by Index Recheck) × Actual Loops,
 * summed over the whole tree ("Plans", recursively). Runs EXPLAIN (ANALYZE, FORMAT JSON) inside BEGIN … ROLLBACK on
 * its own connection, so a data-modifying statement leaves nothing behind.
 */
export async function rowsRead(pool: Pool, text: string, values: readonly unknown[],
  relations: readonly string[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${text}`, [...values]
    );
    const raw = result.rows[0]?.["QUERY PLAN"];
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as readonly Readonly<{ Plan: PlanNode }>[];
    const plan = parsed[0]?.Plan;
    if (plan === undefined) throw new TypeError("PLAN_ROWS_READ_NO_PLAN");
    return sumRowsRead(plan, new Set(relations));
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

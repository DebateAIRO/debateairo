import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export type HeartbeatInput = Readonly<{
  now: Date;
  pid: number;
  version: string;
  thresholdsVersion: number;
}>;

export async function writeHeartbeatFailOpen(
  writer: Readonly<{ write(input: HeartbeatInput): Promise<void> }>,
  input: HeartbeatInput
): Promise<boolean> {
  try {
    await writer.write(input);
    return true;
  } catch {
    return false;
  }
}

export class HeartbeatWriter {
  readonly pool: Pool;
  readonly stateDir: string;

  constructor(input: Readonly<{ pool: Pool; stateDir: string }>) {
    this.pool = input.pool;
    this.stateDir = input.stateDir;
  }

  async write(input: HeartbeatInput): Promise<void> {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    const temporary = join(this.stateDir, `.heartbeat-${input.pid}.tmp`);
    await writeFile(temporary, `${input.now.toISOString()}\n`, { mode: 0o600 });
    await rename(temporary, join(this.stateDir, "heartbeat"));
    const client = await this.pool.connect();
    try {
      await client.query("SET statement_timeout = 2000");
      await client.query(
        `INSERT INTO observation.heartbeat(singleton,observed_at,pid,version,thresholds_version)
         VALUES (true,$1,$2,$3,$4)
         ON CONFLICT (singleton) DO UPDATE SET
           observed_at=EXCLUDED.observed_at,pid=EXCLUDED.pid,version=EXCLUDED.version,
           thresholds_version=EXCLUDED.thresholds_version`,
        [input.now, input.pid, input.version, input.thresholdsVersion]
      );
    } finally {
      client.release();
    }
  }
}

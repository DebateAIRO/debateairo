const WRITER = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function fail(code: string): never {
  throw new TypeError(code);
}

function lp(value: string): Buffer {
  if (typeof value !== "string") fail("FIX09_LOCK_VALUE");
  const bytes = Buffer.from(value, "utf8");
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes]);
}

function token(domain: string, values: readonly string[]): string {
  return `${domain}:${Buffer.concat(values.map(lp)).toString("hex")}`;
}

export function occurrenceIdempotencyToken(source: string, sourceEventRef: string): string {
  return token("obs-audit-idempotency-occurrence/v1", [source, sourceEventRef]);
}

export function actionIdempotencyToken(actionRef: string): string {
  return token("obs-audit-idempotency-action/v1", [actionRef]);
}

export function chainPartitionToken(
  table: "occurrence" | "agent_action",
  source: string,
  writerIdentity: string,
): string {
  if (!WRITER.test(writerIdentity)) fail("FIX09_WRITER_IDENTITY");
  return token("obs-audit-chain-lock/v1", [table, source, writerIdentity]);
}

export function sortUtf8(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))));
}

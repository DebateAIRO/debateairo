// tests/architecture/dig-digest-own-lease.test.ts (V4 start step, Task 55d). The runner reads a dig's digest and the pages its
// investigation already read while it holds the dig's own content lease (apps/runner/src/index.ts: the whole debate runs inside it).
// Pinned: the lease guard still refuses a widening (a nested lease never adds a run to the one held); another debate is read under a
// lease of its own, outside the held lease's scope, the wait for it bounded (an erasure holding that debate may itself wait on the
// held lease); the digest and the page reuse open each other debate only so. The behaviour: tests/integration/dig-digest-in-lease.test.ts.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (relative: string) => readFile(new URL(relative, root), "utf8");
/** From `from` to the first `to` after it (a top-level function's closing line). */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(to, start + from.length);
  expect(end, to).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("a dig reads its investigation's other debates without widening its own lease (Task 55d)", () => {
  it("the lease guard still refuses a widening: a nested lease never adds a run to the one held", async () => {
    const database = await read("packages/db/src/index.ts");
    const nested = between(database, "export async function withRunContentLease<T>(", "\n}\n");
    expect(nested).toContain("if (current?.pool === pool) {");
    expect(nested).toContain("if (!requested.every((runId) => current.lease.runIds.includes(runId))) {");
    expect(nested).toContain('"CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN"');
    const prepared = between(database, "export async function prepareLeasedContentEncryptionForRuns(", "\n}\n");
    expect(prepared).toContain("&& !requested.every((runId) => current.lease.runIds.includes(runId))) {");
    expect(prepared).toContain('"CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN"');
  });

  it("another run is read under a lease of its own, outside the held lease's scope, its wait bounded", async () => {
    const database = await read("packages/db/src/index.ts");
    const own = between(database, "export async function withOwnRunContentLease<T>(", "\n}\n");
    // A lease that already covers the run is borrowed, as withRunContentLease borrows it: nothing is added to it.
    expect(own).toContain("current.lease.runIds.includes(runId)");
    expect(own).toContain("return withRunContentLease(pool, [runId], use);");
    // Otherwise the read runs outside the held lease's scope, under a lease of that run alone, taken with a bounded wait.
    expect(own).toContain("contentLeaseScope.exit(");
    expect(own).toContain("acquireRunContentLease(pool, [runId], waited.signal)");
    expect(own).toContain("setTimeout(");
    expect(own).toContain("clearTimeout(");
    expect(own).toContain("contentLeaseScope.run(");
    expect(own).toContain("await lease.release();");
    expect(own).not.toMatch(/withRunContentLease\(pool, \[[^\]]*,/u);
  });

  it("the digest and the page reuse open each other debate only under that debate's own lease", async () => {
    const digest = await read("apps/runner/src/investigation-digest.ts");
    const reader = between(digest, "export async function readAlreadyInvestigated(", "\n}\n");
    expect(reader).toContain("withOwnRunContentLease(pool, member.run_id,");
    const reuse = await read("apps/runner/src/web-reuse.ts");
    const find = between(reuse, "export function postgresWebReuseSource(", "\n}\n");
    expect(find).toContain("withOwnRunContentLease(pool, memberRunId,");
    // Each member's rows are opened under the lease taken for it.
    expect(find.indexOf("withOwnRunContentLease(pool, memberRunId,")).toBeLessThan(find.indexOf("prepareLeasedContentEncryptionForRun(pool, memberRunId)"));
  });
});

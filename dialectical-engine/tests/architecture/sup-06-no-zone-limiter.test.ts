import { readFile,readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const ROOT = resolve(import.meta.dirname,"../..");

describe("SUP-06 remains outside the identity security zone", () => {
  it("does not import or reuse the registration limiter", async () => {
    const directory = resolve(ROOT,"apps/api/src/support");
    const sources = await Promise.all((await readdir(directory))
      .filter((name) => name.endsWith(".ts"))
      .map(async (name) => ({ name,text: await readFile(resolve(directory,name),"utf8") })));
    for (const source of sources) {
      expect(source.text,source.name).not.toMatch(/(?:from|import\s*\()[^\n]*registration/u);
    }
    expect(await readFile(resolve(ROOT,"acceptance/relay-core.ts"),"utf8")).not.toContain(
      "SupportRelayQueue"
    );
  });

  it("keeps abuse_event content-free with the complete closed class set", async () => {
    const foundation = await readFile(resolve(ROOT,"migrations/0050_support_foundation.sql"),"utf8");
    const repair = await readFile(resolve(ROOT,"migrations/0054_support_keys_audit.sql"),"utf8");
    const block = foundation.match(
      /CREATE TABLE IF NOT EXISTS support[.]abuse_event \(([\s\S]*?)\n\);/u
    )?.[1] ?? "";
    const columns = [...block.matchAll(/^  ([a-z0-9_]+)\s/gmu)].map((match) => match[1]);
    expect(columns).toEqual([
      "abuse_event_id","session_id","class","message_sha256","ip_sha256","at"
    ]);
    expect(repair.match(/support_abuse_event_class_ck CHECK \(class IN \(([^)]*)\)/u)?.[1]
      ?.match(/[A-Z_]+/gu)?.sort()).toEqual([
      "BOUNDARY_DENY","INJECTION","IP_COOLDOWN","LOCK","RATE_LIMIT","SECRET_LIKE"
    ]);
    expect(block).not.toMatch(/message_text|content|raw_ip/u);
  });

  it("composes the relay queue and daily call count in memory", async () => {
    const main = await readFile(resolve(ROOT,"apps/api/src/main.ts"),"utf8");
    expect(main).not.toContain("PostgresSupportRelayReservationRepository");
    expect(main).not.toContain("supportRelayLeasePool");
    expect(main).toContain("const supportRelayQueue = new SupportRelayQueue({");
    expect(main).toContain("durableCalls: createMemorySupportCallRecords()");
    expect(main).toContain("assertSupportDatabaseRole(pool, supportPool)");
  });

  it("keeps no durable relay waiter or slot in the database layer (synthesis-flag S05 C8, after 0129)", async () => {
    const repository = await readFile(resolve(ROOT,"packages/db/src/support.ts"),"utf8");
    expect(repository).not.toContain("PostgresSupportRelayReservationRepository");
    expect(repository).not.toMatch(/#lockQueue|MAX_CONCURRENCY_SLOTS/u);
  });
});

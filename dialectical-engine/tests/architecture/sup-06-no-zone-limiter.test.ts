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

  it("isolates long-lived relay leases from final records with control headroom and one lifecycle", async () => {
    const main = await readFile(resolve(ROOT,"apps/api/src/main.ts"),"utf8");
    expect(main).toContain("PostgresSupportRelayReservationRepository");
    expect(main).toContain(
      "const supportRelayLeasePool = createPool(environment.SUPPORT_DATABASE_URL,{ max: 18 })"
    );
    expect(main).toContain(
      "const supportRelayReservations = new PostgresSupportRelayReservationRepository(supportRelayLeasePool)"
    );
    expect(main).toContain(
      "const supportRelayCallRecords = new PostgresSupportRelayReservationRepository(supportPool)"
    );
    expect(main).toContain("reservations: supportRelayReservations");
    expect(main).toContain("durableCalls: supportRelayCallRecords");
    expect(main).toContain("reportCleanupFailure: reportSupportDiagnostic");
    expect(main).toMatch(/databasePools:\s*\[[\s\S]*?supportPool,\s*supportRelayLeasePool,/u);
    expect(main).toContain("assertSupportDatabaseRole(pool, supportRelayLeasePool)");
    // VACUOUS-ORDERING GUARD: neither pool declaration was pinned present, so a
    // missing supportPool gave indexOf -1 and this ordering passed regardless.
    expect(main).toContain("const supportPool = createPool(environment.SUPPORT_DATABASE_URL)");
    expect(main.indexOf("const supportPool = createPool(environment.SUPPORT_DATABASE_URL)"))
      .toBeLessThan(main.indexOf("const supportRelayLeasePool"));
  });

  it("serializes every durable waiter and slot transition under the global queue lock", async () => {
    const repository = await readFile(resolve(ROOT,"packages/db/src/support.ts"),"utf8");
    expect(repository.match(/await this[.]#lockQueue[(]client[)]/gu)).toHaveLength(6);
    expect(repository.match(/client[.]release[(]true[)]/gu)).toHaveLength(2);
    expect(repository).toContain("MAX_CONCURRENCY_SLOTS = 16");
    expect(repository).toContain("OFFSET $2");
  });
});

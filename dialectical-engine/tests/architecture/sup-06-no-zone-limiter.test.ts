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
      // DL7-F7: the lease pool is held by the boot custody ledger until handover.
      "const supportRelayLeasePool = boot.hold(\n"
      + "  createPool(environment.SUPPORT_DATABASE_URL,{ max: 18 })\n"
      + ")"
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
    //
    // INT2 (2026-09-22): dev's vacuity sweep (bcb2adb2) wrote this needle as the
    // BARE `createPool(...)`, which was dev's spelling. This line's DL7-F7 had
    // independently wrapped the same declaration in `boot.hold(...)` so an early
    // boot failure cannot leave the pool un-zeroed. Neither side's diff touched
    // the other's line, so the merge produced a guard that pinned a spelling the
    // product no longer has — a semantic conflict with no marker. Both survive:
    // the anti-vacuity pin is re-fitted to the boot-held declaration, and ONE
    // constant feeds both assertions so the needle can never again drift away
    // from the thing whose position is being compared.
    const supportPoolDeclaration =
      "const supportPool = boot.hold(createPool(environment.SUPPORT_DATABASE_URL))";
    expect(main).toContain(supportPoolDeclaration);
    expect(main.indexOf(supportPoolDeclaration))
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

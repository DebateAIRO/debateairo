import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { generateDek, kekId, loadKek } from "../../packages/crypto/src/index.js";
import { installBootCustody } from "../../apps/api/src/boot-custody.js";

/**
 * DL7-F7. The API held three KEKs in memory through about fifteen awaited boot
 * stages that ran BEFORE `installStartupResourceOwner` existed. A rejection in
 * any of them — `ADMISSION_POLICY_UNRESOLVED` from a mis-published register is
 * the realistic one — ended the process by top-level rejection with every key
 * un-zeroed and every pool open. The resource owner covered the last two stages
 * only.
 *
 * The boot now holds its own custody ledger from the moment the first key is
 * loaded, and hands over to the startup resource owner the moment that exists.
 */
function heldKek() {
  const material = generateDek();
  const handle = loadKek(material);
  material.fill(0);
  return handle;
}

describe("DL7-F7 the boot owns its keys before the startup owner exists", () => {
  it("zeroes every held key and ends every held pool when a stage fails", async () => {
    const order: string[] = [];
    const logger = { error: vi.fn() };
    const boot = installBootCustody({ logger });
    const first = boot.holdKek(heldKek());
    const second = boot.holdKek(heldKek());
    boot.hold({ end: async () => { order.push("pool-a"); } });
    boot.hold({ end: async () => { order.push("pool-b"); } });

    const failure = await boot.run("admission-policy", async () => {
      throw Object.assign(new Error("ADMISSION_POLICY_UNRESOLVED"), {
        code: "ADMISSION_POLICY_UNRESOLVED"
      });
    }).then(
      () => { throw new Error("a failing boot stage resolved"); },
      (caught: unknown) => caught
    );

    // The original failure reaches the caller unchanged: cleanup never masks it.
    expect(failure).toMatchObject({ code: "ADMISSION_POLICY_UNRESOLVED" });
    // Both keys are gone, and reading either one now refuses.
    for (const handle of [first, second]) {
      expect(() => kekId(handle)).toThrowError(
        expect.objectContaining({ code: "KEK_DESTROYED" })
      );
    }
    // Pools close newest-first, and the keys outlive every pool that borrows
    // from them — the same order `drainGracefulShutdownResources` uses.
    expect(order).toEqual(["pool-b", "pool-a"]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logger.error.mock.calls[0]?.[0]))).toEqual({
      event: "api.boot.failed", stage: "admission-policy"
    });
  });

  it("names the stage that failed and nothing else", async () => {
    const logger = { error: vi.fn() };
    const boot = installBootCustody({ logger });
    boot.holdKek(heldKek());
    await boot.run("support-keys", async () => {
      throw new Error("a secret value that must never be logged");
    }).catch(() => undefined);
    const line = String(logger.error.mock.calls[0]?.[0]);
    expect(line).not.toContain("a secret value that must never be logged");
    expect(line).toContain("support-keys");
  });

  it("lets a stage that succeeds through, holding everything for the next one", async () => {
    const boot = installBootCustody({ logger: { error: vi.fn() } });
    const handle = boot.holdKek(heldKek());
    expect(await boot.run("auth-policy", async () => 41 + 1)).toBe(42);
    expect(kekId(handle)).toMatch(/^[0-9a-f]{16}$/u);
  });

  it("closes once, however many stages fail", async () => {
    const ended = vi.fn(async () => undefined);
    const boot = installBootCustody({ logger: { error: vi.fn() } });
    boot.hold({ end: ended });
    await boot.run("a", async () => { throw new Error("first"); }).catch(() => undefined);
    await boot.run("b", async () => { throw new Error("second"); }).catch(() => undefined);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("hands over on release: the startup owner is then the only owner", async () => {
    const ended = vi.fn(async () => undefined);
    const logger = { error: vi.fn() };
    const boot = installBootCustody({ logger });
    const handle = boot.holdKek(heldKek());
    boot.hold({ end: ended });
    boot.release();
    await boot.run("listen", async () => { throw new Error("after handover"); })
      .catch(() => undefined);
    // Nothing was closed twice, and the key is still the startup owner's to zero.
    expect(ended).not.toHaveBeenCalled();
    expect(kekId(handle)).toMatch(/^[0-9a-f]{16}$/u);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("keeps closing after one resource refuses to close", async () => {
    const ended = vi.fn(async () => undefined);
    const boot = installBootCustody({ logger: { error: vi.fn() } });
    const handle = boot.holdKek(heldKek());
    boot.hold({ end: ended });
    boot.hold({ end: async () => { throw new Error("pool will not end"); } });
    await boot.run("stage", async () => { throw new Error("boom"); }).catch(() => undefined);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(() => kekId(handle)).toThrowError(
      expect.objectContaining({ code: "KEK_DESTROYED" })
    );
  });
});

describe("DL7-F7 every awaited boot stage runs under an owner", () => {
  it("leaves no top-level await in the API boot outside boot.run or startup.run", async () => {
    const source = await readFile("apps/api/src/main.ts", "utf8");
    const from = source.indexOf("const boot = installBootCustody(");
    expect(from).toBeGreaterThan(-1);
    // Every await from the first key load to the end of the file: before this
    // fix the fifteen between the first load and `installStartupResourceOwner`
    // had no owner at all.
    const unguarded = source.slice(from).split("\n").filter((line) =>
      /^(?:(?:const|let)\s+[^=]+=\s*)?await\s/u.test(line)
      && !/await\s+(?:boot|startup)\.run\(/u.test(line));
    expect(unguarded).toEqual([]);
  });

  it("holds all three KEKs and the support key port before any stage can fail", async () => {
    const source = await readFile("apps/api/src/main.ts", "utf8");
    expect(source).toContain("installBootCustody");
    for (const held of [
      "boot.holdKek(loadKek(environment.KEK_PATH))",
      "boot.hold(",
      "boot.release()"
    ]) expect(source).toContain(held);
    // The handover happens exactly once, after the startup owner exists.
    expect(source.indexOf("boot.release()"))
      .toBeGreaterThan(source.indexOf("installStartupResourceOwner({"));
  });
});

/**
 * Review round. The ledger held the three KEKs but not the two plain secret
 * buffers beside them: the blind-index key and the audit source-IP salt, both
 * loaded before the first stage. The salt's own `fill(0)` sits ten `boot.run`
 * stages later, after the six register reads and the Argon2 handshake, any of
 * which can reject; the blind-index key is zeroed later still, inside the
 * session service. So the very failure this finding is about — a mis-published
 * register — left both of them live in memory, exactly as it used to leave the
 * KEKs.
 */
describe("DL7-F7 the ledger holds every secret the boot loads, not only the keys", () => {
  it("zeroes a held secret buffer when a stage fails, before the keys", async () => {
    const order: string[] = [];
    const boot = installBootCustody({ logger: { error: vi.fn() } });
    const handle = boot.holdKek(heldKek());
    const secret = Buffer.alloc(32, 0x5a);
    boot.hold({ end: async () => { order.push("secret"); secret.fill(0); } });
    boot.hold({ end: async () => { order.push("pool"); } });

    await boot.run("auth-policy", async () => { throw new Error("boom"); })
      .catch(() => undefined);

    expect(secret).toEqual(Buffer.alloc(32));
    // Newest-first among the closables, and the keys last of all.
    expect(order).toEqual(["pool", "secret"]);
    expect(() => kekId(handle)).toThrowError(
      expect.objectContaining({ code: "KEK_DESTROYED" })
    );
  });

  it("holds the blind-index key and the audit salt before the first stage can reject", async () => {
    const source = await readFile("apps/api/src/main.ts", "utf8");
    for (const secret of ["blindIndexKey", "sourceIpSalt"]) {
      const held = source.indexOf(`boot.hold({ end: async () => { ${secret}.fill(0); } })`);
      expect(held, `${secret} is held by the boot ledger`).toBeGreaterThan(-1);
      // Held BEFORE the first awaited stage: a hold that comes after the stage
      // which rejects is no hold at all.
      expect(held, `${secret} is held before the first stage`)
        .toBeLessThan(source.indexOf("await boot.run("));
      expect(held, `${secret} is held after it is loaded`)
        .toBeGreaterThan(source.indexOf(`const ${secret} = loadSecretKey(`));
    }
  });
});

// NV-07: while a detected restore holds public reads, the public debate and the library answer as if nothing were
// published, before any lease, pool or key is touched (apps/api/src/publications.ts, PostgresPublicationApplication).
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryPublicationKeyStore, PublicationCipher, loadKek } from "../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { PostgresPublicationRepository } from "@debateai/db";

function harness(held: () => boolean) {
  const cipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd7))));
  const withContentLease = vi.fn(async <T>(_publicationRef: string, use: () => Promise<T>) => use());
  const readPublic = vi.fn(async () => null);
  const listPublicRefs = vi.fn(async () => ({ refs: [] as string[], total: 0 }));
  const repository = { withContentLease, readPublic, listPublicRefs } as unknown as PostgresPublicationRepository;
  const application = new PostgresPublicationApplication(
    repository, cipher, () => new Date("2026-10-28T00:00:00.000Z"), repository, undefined, undefined, null, held
  );
  return { application, withContentLease, readPublic, listPublicRefs };
}

describe("NV-07 the public read hold", () => {
  it("answers not found and an empty library while held, touching no lease, pool or key", async () => {
    const { application, withContentLease, readPublic, listPublicRefs } = harness(() => true);
    await expect(application.readPublicDebate(randomUUID())).resolves.toBeNull();
    await expect(application.list(10, 0)).resolves.toEqual({ items: [], total: 0 });
    expect(withContentLease).not.toHaveBeenCalled();
    expect(readPublic).not.toHaveBeenCalled();
    expect(listPublicRefs).not.toHaveBeenCalled();
  });

  it("reads as before when not held", async () => {
    const { application, withContentLease, readPublic, listPublicRefs } = harness(() => false);
    await expect(application.readPublicDebate(randomUUID())).resolves.toBeNull();
    await expect(application.list(10, 0)).resolves.toEqual({ items: [], total: 0 });
    expect(withContentLease).toHaveBeenCalledTimes(1);
    expect(readPublic).toHaveBeenCalledTimes(1);
    expect(listPublicRefs).toHaveBeenCalledTimes(1);
  });

  it("reads the hold at each call, so a release of the hold takes effect at once", async () => {
    let held = true;
    const { application, readPublic } = harness(() => held);
    await application.readPublicDebate(randomUUID());
    expect(readPublic).not.toHaveBeenCalled();
    held = false;
    await application.readPublicDebate(randomUUID());
    expect(readPublic).toHaveBeenCalledTimes(1);
  });
});

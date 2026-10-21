import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Side-by-side uploads spec 2026-10-21 §7 (plan C13): a page opened under an older release sees "a newer version is
 * available" instead of failing. The browser compares only the code part of the x-debateai-release header with the code
 * baked into its build; a settings-only release keeps the code part, so it shows no note.
 */
type ReleaseWatch = typeof import("../../apps/ui/lib/v3/releaseWatch.js");
type Contract = typeof import("@debateai/contract");

// Key-shaped values are built from pieces, so no line pairs a *_KEY name with a literal (gitleaks).
const BAKED = "b".repeat(12);
const NEWER_BUILD_KEY = ["r17", "a".repeat(12)].join("-");
const SETTINGS_ONLY_KEY = ["r18", BAKED].join("-");

/** A fresh copy of the module: the reason is page-wide state, held once per page load. */
async function freshWatch(): Promise<ReleaseWatch> {
  vi.resetModules();
  return await import("../../apps/ui/lib/v3/releaseWatch.js");
}

/** The contract's error class of the same fresh module graph (instanceof holds only within one graph). */
async function contract(): Promise<Contract> {
  return await import("@debateai/contract");
}

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_DEBATEAI_RELEASE_CODE", BAKED); });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("noteReleaseHeader", () => {
  it("reads the baked-in code from the build", async () => {
    expect((await freshWatch()).bakedReleaseCode()).toBe(BAKED);
    vi.stubEnv("NEXT_PUBLIC_DEBATEAI_RELEASE_CODE", undefined);
    expect((await freshWatch()).bakedReleaseCode()).toBe("000000000000");
  });

  it("a release with another code part is a newer build", async () => {
    const watch = await freshWatch();
    watch.noteReleaseHeader(NEWER_BUILD_KEY);
    expect(watch.newerVersionReason()).toBe("NEWER_BUILD");
  });

  it("a settings-only release keeps the code part, so it shows no note", async () => {
    const watch = await freshWatch();
    watch.noteReleaseHeader(SETTINGS_ONLY_KEY);
    expect(watch.newerVersionReason()).toBeNull();
  });

  it("ignores a missing or unparseable header, and the legacy stamp", async () => {
    const watch = await freshWatch();
    for (const value of [null, "", "garbage", "legacy", ["r17", "A".repeat(12)].join("-"), ["r0", "a".repeat(12)].join("-")]) {
      watch.noteReleaseHeader(value);
    }
    expect(watch.newerVersionReason()).toBeNull();
  });

  it("compares nothing when either side does not know its revision (a development build or launcher)", async () => {
    const watch = await freshWatch();
    watch.noteReleaseHeader(["r17", "0".repeat(12)].join("-"));
    expect(watch.newerVersionReason()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_DEBATEAI_RELEASE_CODE", "0".repeat(12));
    const development = await freshWatch();
    development.noteReleaseHeader(NEWER_BUILD_KEY);
    expect(development.newerVersionReason()).toBeNull();
  });
});

describe("announceNewerVersion", () => {
  it("tells each listener once per change; the first reason wins, except that a newer build wins over a newer debate", async () => {
    const watch = await freshWatch();
    const heard: string[] = [];
    const unsubscribe = watch.subscribeNewerVersion((reason) => { heard.push(reason); });
    watch.announceNewerVersion("MADE_BY_NEWER");
    watch.announceNewerVersion("MADE_BY_NEWER");
    expect(watch.newerVersionReason()).toBe("MADE_BY_NEWER");
    watch.announceNewerVersion("NEWER_BUILD");
    watch.announceNewerVersion("MADE_BY_NEWER");
    expect(watch.newerVersionReason()).toBe("NEWER_BUILD");
    expect(heard).toEqual(["MADE_BY_NEWER", "NEWER_BUILD"]);
    unsubscribe();
    const later = await freshWatch();
    later.announceNewerVersion("NEWER_BUILD");
    expect(heard).toEqual(["MADE_BY_NEWER", "NEWER_BUILD"]);
  });
});

describe("withNewerVersionWatch", () => {
  function clientRejecting(failure: unknown) {
    return {
      readRun: vi.fn(async (_id: string) => { throw failure; }),
      readSession: vi.fn(async () => ({ ok: true })),
      version: "x"
    };
  }

  it("rethrows an answer this page cannot read unchanged, and says a newer build is out", async () => {
    const watch = await freshWatch();
    const { ContractHttpError } = await contract();
    const failure = new ContractHttpError("INVALID_RESPONSE", 200, "x");
    const client = watch.withNewerVersionWatch(clientRejecting(failure));
    await expect(client.readRun("run")).rejects.toBe(failure);
    expect(watch.newerVersionReason()).toBe("NEWER_BUILD");
  });

  it("says a newer version made it when the server says so", async () => {
    const watch = await freshWatch();
    const { ContractHttpError } = await contract();
    const failure = new ContractHttpError("NOT_FOUND", 409, "x", "MADE_BY_NEWER_RELEASE");
    const client = watch.withNewerVersionWatch(clientRejecting(failure));
    await expect(client.readRun("run")).rejects.toBe(failure);
    expect(watch.newerVersionReason()).toBe("MADE_BY_NEWER");
  });

  it("passes every other answer, refusal and member through untouched", async () => {
    const watch = await freshWatch();
    const { ContractHttpError } = await contract();
    const refusal = new ContractHttpError("NOT_FOUND", 404, "x");
    const inner = clientRejecting(refusal);
    const client = watch.withNewerVersionWatch(inner);
    await expect(client.readRun("run")).rejects.toBe(refusal);
    await expect(client.readSession()).resolves.toEqual({ ok: true });
    expect(inner.readRun).toHaveBeenCalledWith("run");
    expect(client.version).toBe("x");
    expect(client.readRun).toBe(client.readRun);
    expect(Object.keys(client).sort()).toEqual(["readRun", "readSession", "version"]);
    expect(watch.newerVersionReason()).toBeNull();
  });
});

describe("the browser's contract client watches every answer", () => {
  it("a same-origin answer from another build shows the note; the client's own read still answers", async () => {
    await freshWatch();
    const { ContractHttpError } = await contract();
    const { createBrowserContractClient } = await import("../../apps/ui/lib/api.js");
    const watch = await import("../../apps/ui/lib/v3/releaseWatch.js");
    const fetchImpl = vi.fn(async () => new Response("{}", {
      status: 401,
      headers: { "content-type": "application/json", "x-debateai-release": NEWER_BUILD_KEY }
    }));
    const client = createBrowserContractClient(fetchImpl as unknown as typeof fetch, "/api");
    await expect(client.readSession()).rejects.toBeInstanceOf(ContractHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(watch.newerVersionReason()).toBe("NEWER_BUILD");
  });
});

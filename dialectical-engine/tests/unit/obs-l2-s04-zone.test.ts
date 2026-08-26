import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ZONE_MANIFEST,
  ZONE_MANIFEST_CANONICAL_BYTES,
  ZONE_MANIFEST_HASH,
  classifyErrorOrigin,
  createZoneCounterBuffer,
  createZoneDriftBuffer,
  matchesZoneFrame,
} from "@debateai/obs-capture/zone-internal";
import {
  ZONE_ROUTES,
  assertAddedMountsAfterRegion,
  assertNoZoneImports,
  assertZoneBoundaryIntact,
  resolveZoneRouteMountRegion,
} from "../support/zone-boundary.js";
import {
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  runWithObsContext,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";

const ROOT = process.cwd();
const INDEX_PATH = resolve(ROOT, "apps/api/src/index.ts");
const INDEX_SOURCE = readFileSync(INDEX_PATH, "utf8");
const BASE_REF = "29f370e0f1017245aa26443ad366e020e815c301";

function syntheticError(
  repoRelativeFrames: readonly string[],
  cause?: unknown,
): Error {
  const error = new Error("synthetic-only");
  const frameLines = repoRelativeFrames.map(
    (frame, index) => `    at synthetic${index} (${resolve(ROOT, frame)}:${index + 1}:7)`,
  );
  Object.defineProperty(error, "stack", {
    configurable: true,
    value: ["Error: synthetic-only", ...frameLines].join("\n"),
  });
  if (cause !== undefined) {
    Object.defineProperty(error, "cause", { configurable: true, value: cause });
  }
  return error;
}

function insertAt(source: string, offset: number, addition: string): string {
  return `${source.slice(0, offset)}${addition}${source.slice(offset)}`;
}

function resolved(source = INDEX_SOURCE) {
  const region = resolveZoneRouteMountRegion(source);
  expect(region.ok).toBe(true);
  if (!region.ok) throw new Error(region.reason);
  return region;
}

describe("S04 semantic zone boundary", () => {
  it("calls the resolver over the real mount-list source and runs ZI-1..ZI-4", () => {
    const region = resolved();

    expect(region.shapeOk).toBe(true);
    expect(region.mounts.map((mount) => mount.path)).toEqual(ZONE_ROUTES);
    expect(region.mounts.map((mount) => mount.verb)).toEqual(["post", "post", "post"]);
    expect(region.region).toContain("options.registration !== undefined");
    expect(region.region).not.toMatch(
      /@debateai\/obs-capture|obs-capture|captureError|zoneBoundary|obsInstall/u,
    );
    expect(() =>
      assertZoneBoundaryIntact({ repoRoot: ROOT, baseRef: BASE_REF, slice: "S04" }),
    ).not.toThrow();
  });

  it("passes all 15 required falsification mutants", () => {
    const base = resolved();
    const beforeBuild = INDEX_SOURCE.indexOf("export function buildApi");
    const regionLineStart = INDEX_SOURCE.lastIndexOf("\n", base.startOffset) + 1;
    const beforeRegion = INDEX_SOURCE.slice(0, base.startOffset);
    const afterRegion = INDEX_SOURCE.slice(base.endOffset);
    const beforeClosingBrace = base.startOffset + base.region.lastIndexOf("\n") + 1;
    const fourthMount = '    api.get("/v1/auth/extra", async () => ({}));\n';

    const f1 = insertAt(
      INDEX_SOURCE,
      beforeBuild,
      'const decoy = "if (options.registration !== undefined) {";\n',
    );
    const f2 = insertAt(
      INDEX_SOURCE,
      beforeBuild,
      "/* if (options.registration !== undefined) { } */\n",
    );
    const duplicate = `${base.region}\n  `;
    const f3 = insertAt(INDEX_SOURCE, base.startOffset, duplicate);
    const f4 = INDEX_SOURCE.replace(
      "if (options.registration !== undefined)",
      "if (options.registration === undefined)",
    );
    const f5 = insertAt(INDEX_SOURCE, beforeClosingBrace, fourthMount);
    const f6 = INDEX_SOURCE.replace(
      'api.post("/v1/auth/resend-verification"',
      'api.post("/v1/auth/resend-renamed"',
    );
    const f7 = insertAt(INDEX_SOURCE, beforeClosingBrace, "    // one-line in-region edit\n");
    const f8 = insertAt(
      INDEX_SOURCE,
      regionLineStart,
      Array.from({ length: 40 }, (_, index) => `// pre-region drift ${index}\n`).join(""),
    );
    const f9 = insertAt(
      INDEX_SOURCE,
      base.endOffset,
      '\n  api.get("/v1/auth/extra", async () => ({}));',
    );
    const f10 = INDEX_SOURCE.replace(
      "  if (options.registration !== undefined) {",
      "  if (options.registration !== undefined) {  ",
    );
    const g1 = insertAt(INDEX_SOURCE, beforeBuild, "const regexOne = /[{]/u;\n");
    const g2 = insertAt(INDEX_SOURCE, beforeBuild, 'const regexTwo = /["{{]/u;\n');
    const g3 = insertAt(
      INDEX_SOURCE,
      beforeClosingBrace,
      "    const templateMutation = `value:${String(1)}`;\n",
    );
    const g4 = INDEX_SOURCE.replace(
      "      ip: request.ip,",
      "      ip: request.ip,\n  }",
    );
    const g5 = INDEX_SOURCE.replace(
      "if (options.registration !== undefined) {",
      "if (\n    options.registration !==\n    undefined\n  ) {",
    );

    for (const source of [f1, f2]) {
      const result = resolved(source);
      expect(result.shapeOk).toBe(true);
      expect(result.contentHash).toBe(base.contentHash);
    }
    for (const source of [f3, f4]) {
      const result = resolveZoneRouteMountRegion(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/^ZONE_BOUNDARY_UNRESOLVED:/u);
    }
    for (const source of [f5, f6]) {
      const result = resolveZoneRouteMountRegion(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/^ZONE_BOUNDARY_UNRESOLVED:/u);
    }
    expect(resolved(f7).contentHash).not.toBe(base.contentHash);
    expect(resolved(f8).contentHash).toBe(base.contentHash);
    expect(resolved(f9).contentHash).toBe(base.contentHash);
    expect(resolved(f10).contentHash).not.toBe(base.contentHash);
    for (const source of [g1, g2]) {
      expect(resolved(source).contentHash).toBe(base.contentHash);
    }
    expect(resolved(g3).contentHash).not.toBe(base.contentHash);
    const disagreement = resolveZoneRouteMountRegion(g4);
    expect(disagreement.ok).toBe(false);
    if (!disagreement.ok) expect(disagreement.reason).toContain("resolver methods disagree");
    const split = resolved(g5);
    expect(split.shapeOk).toBe(true);
    expect(split.contentHash).not.toBe(base.contentHash);

    expect(beforeRegion).not.toContain("obs-capture");
    expect(afterRegion).toContain('/v1/session"');
  });

  it("fails closed when a fourth mount enters the registration block", () => {
    const base = resolved();
    const beforeClosingBrace = base.startOffset + base.region.lastIndexOf("\n") + 1;
    const tampered = insertAt(
      INDEX_SOURCE,
      beforeClosingBrace,
      '    api.get("/v1/auth/extra-fourth", async () => ({}));\n',
    );

    const result = resolveZoneRouteMountRegion(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^ZONE_BOUNDARY_UNRESOLVED:/u);
  });

  it("fails closed when a ruled registration route is renamed", () => {
    const tampered = INDEX_SOURCE.replace(
      'api.post("/v1/auth/resend-verification"',
      'api.post("/v1/auth/resend-verification-renamed"',
    );

    const result = resolveZoneRouteMountRegion(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^ZONE_BOUNDARY_UNRESOLVED:/u);
  });

  it("fails closed for a nested-only guard, an else branch, and malformed braces", () => {
    const base = resolved();
    const nested = INDEX_SOURCE.replace(
      "  if (options.registration !== undefined) {",
      "  if (true) {\n    if (options.registration !== undefined) {",
    ).replace(
      INDEX_SOURCE.slice(base.endOffset - 1, base.endOffset + 1),
      "    }\n  }\n",
    );
    const withElse = insertAt(INDEX_SOURCE, base.endOffset, " else { throw new Error(); }");
    const unbalanced = INDEX_SOURCE.slice(0, base.endOffset - 1) + INDEX_SOURCE.slice(base.endOffset);

    for (const source of [nested, withElse, unbalanced]) {
      const result = resolveZoneRouteMountRegion(source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/^ZONE_BOUNDARY_UNRESOLVED:/u);
    }
  });

  it("treats handler dispatch identity and excluded-zone imports as structural gates", () => {
    const wrongDispatch = INDEX_SOURCE.replace(
      "options.registration!.verifyEmail(",
      "options.registration!.resendVerification(",
    ).replace(
      "  if (options.registration !== undefined) {",
      "  if (options.registration !== undefined) {\n    // options.registration!.verifyEmail(",
    );
    const wrongDispatchResult = resolveZoneRouteMountRegion(wrongDispatch);
    expect(wrongDispatchResult.ok).toBe(false);
    if (!wrongDispatchResult.ok) {
      expect(wrongDispatchResult.reason).toMatch(/^ZONE_BOUNDARY_UNRESOLVED:/u);
    }
    expect(() => assertNoZoneImports('import("../../../apps/api/src/registration.js")')).toThrow(
      "ZONE_IMPORT_VIOLATION",
    );
    expect(() => assertNoZoneImports('import { value } from "@debateai/db/identity"')).toThrow(
      "ZONE_IMPORT_VIOLATION",
    );
    expect(() => assertNoZoneImports('import { emit } from "@debateai/obs-capture"')).not.toThrow();
    expect(() => assertAddedMountsAfterRegion(
      '@@ -218,0 +218,1 @@\n+api.post("/v1/auth/inside", async () => ({}));',
      248,
    )).toThrow("ZONE_CONTAINMENT_VIOLATION");
    expect(() => assertAddedMountsAfterRegion(
      '@@ -250,0 +250,1 @@\n+api.post("/v1/obs/client-report", async () => ({}));',
      248,
    )).not.toThrow();
  });
});

describe("S04 human-owned manifest", () => {
  it("reproduces canonical bytes from the ruled literal data and includes mfa zone-for-now", () => {
    const expected = {
      schema_version: 1,
      zone_path_prefixes: [
        "apps/api/src/mail-channel.ts",
        "apps/api/src/mfa.ts",
        "apps/api/src/registration.ts",
        "migrations/0030_identity_foundation.sql",
        "migrations/0031_registration_verification.sql",
        "migrations/0032_registration_audit_erasure_checks.sql",
        "migrations/0033_verification_token_credentials.sql",
        "packages/db/src/identity.ts",
      ],
      compiled_alternate_prefixes: [
        "apps/api/dist/mail-channel.js",
        "apps/api/dist/mfa.js",
        "apps/api/dist/registration.js",
        "dist/apps/api/src/mail-channel.js",
        "dist/apps/api/src/mfa.js",
        "dist/apps/api/src/registration.js",
        "dist/packages/db/src/identity.js",
        "packages/db/dist/identity.js",
      ],
      mount_list: [
        "/v1/auth/register",
        "/v1/auth/verify-email",
        "/v1/auth/resend-verification",
      ],
      identity_table_deny_set: ["identity.*"],
    } as const;
    const expectedBytes = `${JSON.stringify(expected)}\n`;
    const expectedHash = createHash("sha256").update(expectedBytes).digest("hex");

    expect(ZONE_MANIFEST).toEqual(expected);
    expect(ZONE_MANIFEST_CANONICAL_BYTES).toBe(expectedBytes);
    expect(ZONE_MANIFEST_HASH).toBe(expectedHash);
    expect(ZONE_MANIFEST.zone_path_prefixes).toContain("apps/api/src/mfa.ts");
    expect(ZONE_MANIFEST.identity_table_deny_set.length).toBeGreaterThan(0);
    expect(
      ZONE_MANIFEST.identity_table_deny_set.every((entry) => /^identity\.(?:\*|[a-z_]+)$/u.test(entry)),
    ).toBe(true);
    expect(resolved().mounts.map((mount) => mount.path)).toEqual(
      ZONE_MANIFEST.mount_list,
    );
  });

  it("matches only anchored repo-root paths and rejects decoys and node_modules", () => {
    expect(matchesZoneFrame(resolve(ROOT, "apps/api/src/registration.ts"), ROOT)).toBe(true);
    expect(matchesZoneFrame(resolve(ROOT, "apps/api/src/mfa.ts"), ROOT)).toBe(true);
    expect(matchesZoneFrame(resolve(ROOT, "dist/packages/db/src/identity.js"), ROOT)).toBe(true);
    expect(
      matchesZoneFrame(resolve(ROOT, "tests/fixtures/packages/db/src/identity.ts"), ROOT),
    ).toBe(false);
    expect(matchesZoneFrame(resolve(ROOT, "node_modules/apps/api/src/registration.ts"), ROOT)).toBe(
      false,
    );
    expect(matchesZoneFrame("/outside/repo/packages/db/src/identity.ts", ROOT)).toBe(false);
    expect(matchesZoneFrame("packages/db/src/identity.ts", ROOT)).toBe(false);
    expect(matchesZoneFrame(`${ROOT}/decoy/../apps/api/src/registration.ts`, ROOT)).toBe(true);
    expect(matchesZoneFrame(`${ROOT}/apps/api/src/%6dfa.ts`, ROOT)).toBe(true);
    expect(matchesZoneFrame("/apps/api/src/registration.ts", "/")).toBe(false);
  });

  it("contains no runtime probe or excluded-zone import surface", () => {
    const productionSources = [
      "packages/obs-capture/src/zone/classifier.ts",
      "packages/obs-capture/src/zone/counter.ts",
      "packages/obs-capture/src/zone/index.ts",
      "packages/obs-capture/src/zone/manifest.ts",
    ].map((path) => readFileSync(resolve(ROOT, path), "utf8")).join("\n");
    const resolverSource = readFileSync(
      resolve(ROOT, "tests/support/zone-boundary.ts"),
      "utf8",
    );

    expect(productionSources).not.toMatch(/node:fs|node:child_process|\bstat(?:Sync)?\b|\blstat|\breaddir|\bglob\b/u);
    expect(productionSources).not.toMatch(
      /(?:from|import\s*\()\s*["'][^"']*(?:registration|mail-channel|mfa|identity)(?:\.js|\.ts)?["']/u,
    );
    expect(productionSources).not.toContain("resolveZoneRouteMountRegion");
    expect(resolverSource).not.toMatch(/\blstat|\breaddir|\bglob\b|information_schema|pg_catalog|to_regclass/u);
    expect(resolverSource).toContain('"apps/api/src/index.ts"');
  });
});

describe("S04 six-row producing-module classifier", () => {
  it("implements every row without retaining zone codes, payloads, or traces", () => {
    const zone = syntheticError(["apps/api/src/registration.ts"]);
    const shared = syntheticError(["packages/db/src/index.ts"]);
    const noFrames = new Error("stackless");
    Object.defineProperty(noFrames, "stack", { value: undefined });
    const now = new Date("2026-08-26T12:34:56.000Z");

    const row1 = classifyErrorOrigin({ error: zone, zoneBoundary: true, repoRoot: ROOT, causeDepthMax: 8, now });
    const row2 = classifyErrorOrigin({ error: shared, zoneBoundary: true, repoRoot: ROOT, causeDepthMax: 8, now });
    const row3 = classifyErrorOrigin({ error: noFrames, zoneBoundary: true, repoRoot: ROOT, causeDepthMax: 8, now });
    const row4 = classifyErrorOrigin({ error: zone, zoneBoundary: false, repoRoot: ROOT, causeDepthMax: 8, now });
    const row5 = classifyErrorOrigin({ error: shared, zoneBoundary: false, repoRoot: ROOT, causeDepthMax: 8, now });
    const row6 = classifyErrorOrigin({ error: "thrown-string", zoneBoundary: false, repoRoot: ROOT, causeDepthMax: 8, now });

    expect(row1).toEqual({ classification: "ZONE", disposition: "COUNTER_ONLY", zone_delta: 1 });
    expect(row2).toMatchObject({ classification: "SHARED", disposition: "CAPTURE", route: "zone", component: "packages/db/src/index.ts" });
    expect(row3).toEqual({ classification: "ZONE", disposition: "COUNTER_ONLY", zone_delta: 1 });
    expect(row4).toEqual({
      classification: "ZONE",
      disposition: "COUNTER_ONLY",
      zone_delta: 1,
      drift: {
        code: "ZONE_DRIFT_DETECTED",
        manifest_hash: ZONE_MANIFEST_HASH,
        day_bucket: "2026-08-26",
      },
    });
    expect(row5).toMatchObject({ classification: "ORDINARY", disposition: "CAPTURE", route: "ordinary", component: "packages/db/src/index.ts" });
    expect(row6).toEqual({
      classification: "ORIGIN_UNKNOWN",
      disposition: "CAPTURE",
      component: "UNKNOWN:NON_ERROR",
      source: "unclassified",
      counter_class: "unclassified",
      trip_eligible: true,
      frames: [],
    });

    for (const counterOnly of [row1, row3, row4]) {
      const durable = JSON.stringify(counterOnly);
      expect(durable).not.toContain("registration.ts");
      expect(durable).not.toContain("synthetic-only");
      expect(durable).not.toMatch(/severity|payload|trace|frames|route|correlation/u);
    }
  });

  it("walks the whole bounded cause chain and uses the deepest producing stack", () => {
    const deepestShared = syntheticError(["packages/providers/src/index.ts"]);
    const middleShared = syntheticError(["packages/db/src/index.ts"], deepestShared);
    const outerShared = syntheticError(["apps/runner/src/index.ts"], middleShared);
    const ordinary = classifyErrorOrigin({
      error: outerShared,
      zoneBoundary: false,
      repoRoot: ROOT,
      causeDepthMax: 8,
      now: new Date("2026-08-26T00:00:00.000Z"),
    });
    expect(ordinary).toMatchObject({
      classification: "ORDINARY",
      component: "packages/providers/src/index.ts",
    });

    const deepestZone = syntheticError(["apps/api/src/mfa.ts"]);
    Object.defineProperty(middleShared, "cause", { configurable: true, value: deepestZone });
    const excluded = classifyErrorOrigin({
      error: outerShared,
      zoneBoundary: true,
      repoRoot: ROOT,
      causeDepthMax: 8,
      now: new Date("2026-08-26T00:00:00.000Z"),
    });
    expect(excluded).toEqual({ classification: "ZONE", disposition: "COUNTER_ONLY", zone_delta: 1 });
  });

  it("scrubs every zone frame to one token and terminates captured cause output", () => {
    const hiddenCause = syntheticError(["packages/providers/src/index.ts"]);
    const shared = syntheticError(
      [
        "packages/db/src/index.ts",
        "apps/api/src/registration.ts",
        "apps/api/src/mfa.ts",
      ],
      hiddenCause,
    );
    const result = classifyErrorOrigin({
      error: shared,
      zoneBoundary: true,
      repoRoot: ROOT,
      causeDepthMax: 8,
      now: new Date("2026-08-26T00:00:00.000Z"),
    });
    expect(result).toMatchObject({ classification: "SHARED", route: "zone" });
    if (result.classification !== "SHARED") throw new Error("expected shared result");
    expect(result.frames).toEqual([
      "packages/db/src/index.ts:1:7",
      "ZONE_FRAMES_ELIDED:2",
      "CAUSE_NOT_CAPTURED:ZONE",
    ]);
    const durable = JSON.stringify(result);
    expect(durable).not.toContain("registration.ts");
    expect(durable).not.toContain("mfa.ts");
    expect(result.component).toBe("packages/providers/src/index.ts");
    expect(result.frames).not.toContain("packages/providers/src/index.ts:1:7");
    expect(durable).not.toContain("synthetic-only");
  });

  it("fails safe on cycles, hostile getters, truncated stacks, and invalid depth", () => {
    const cyclic = syntheticError(["packages/db/src/index.ts"]);
    Object.defineProperty(cyclic, "cause", { configurable: true, value: cyclic });
    expect(() => classifyErrorOrigin({
      error: cyclic,
      zoneBoundary: false,
      repoRoot: ROOT,
      causeDepthMax: 8,
      now: new Date("2026-08-26T00:00:00.000Z"),
    })).not.toThrow();

    const hostile = new Proxy({}, { get() { throw new Error("oracle"); } });
    const hostileResult = classifyErrorOrigin({
      error: hostile,
      zoneBoundary: false,
      repoRoot: ROOT,
      causeDepthMax: Number.NaN,
      now: new Date("2026-08-26T00:00:00.000Z"),
    });
    expect(hostileResult).toMatchObject({
      classification: "ORIGIN_UNKNOWN",
      component: "UNKNOWN:NO_USABLE_REPO_FRAME",
      trip_eligible: true,
    });
    expect(classifyErrorOrigin({
      error: hostile,
      zoneBoundary: true,
      repoRoot: null as never,
      causeDepthMax: 8,
      now: new Date("invalid"),
    })).toEqual({ classification: "ZONE", disposition: "COUNTER_ONLY", zone_delta: 1 });
  });
});

describe("S04 off-path accounting", () => {
  it("does exactly one opaque enqueue on the zone request path", () => {
    const offered: CaptureQueueEntry[] = [];
    const health = createCaptureHealth();
    const gaps = createCaptureGapCounter({ health });
    const emitter = createCaptureEmitter({
      queue: { offer(entry) { offered.push(entry); return true; } },
      health,
      gaps,
    });
    let stackReads = 0;
    const error = Object.defineProperty({}, "stack", {
      get() {
        stackReads += 1;
        throw new Error("STACK_READ_ON_REQUEST_PATH");
      },
    });
    const context = Object.freeze({ zone_context: true });

    runWithObsContext(context, () => emitter.emit(error));

    expect(offered).toHaveLength(1);
    expect(offered[0]?.payload_ref).toBe(error);
    expect(offered[0]?.ambient_context_ref).toBe(context);
    expect(stackReads).toBe(0);
    expect(gaps.pendingLossCount()).toBe(0);
  });

  it("flushes anonymous daily deltas no more often than interval plus jitter", async () => {
    let clock = Date.parse("2026-08-26T00:00:00.000Z");
    const buffer = createZoneCounterBuffer({
      flushIntervalMs: 1_000,
      jitterRatio: 0.25,
      random: () => 0.5,
      now: () => new Date(clock),
    });
    buffer.record();
    buffer.record();
    expect(await buffer.flushDue(async () => { throw new Error("too early"); })).toBe(false);
    clock += 1_124;
    expect(await buffer.flushDue(async () => { throw new Error("still early"); })).toBe(false);
    clock += 1;
    const rows: unknown[] = [];
    expect(await buffer.flushDue(async (row) => { rows.push(row); })).toBe(true);
    expect(rows).toEqual([{ day: "2026-08-26", delta: 2 }]);
    expect(Object.keys(rows[0] as object)).toEqual(["day", "delta"]);
  });

  it("deduplicates drift to manifest-hash plus day and requeues failed flushes", async () => {
    let clock = Date.parse("2026-08-26T00:00:00.000Z");
    const buffer = createZoneDriftBuffer({
      flushIntervalMs: 1_000,
      jitterRatio: 0,
      random: () => 0,
      now: () => new Date(clock),
    });
    buffer.record(ZONE_MANIFEST_HASH);
    buffer.record(ZONE_MANIFEST_HASH);
    clock += 1_000;
    expect(await buffer.flushDue(async () => { throw new Error("sink down"); })).toBe(false);
    const signals: unknown[] = [];
    clock += 1_000;
    expect(await buffer.flushDue(async (signal) => { signals.push(signal); })).toBe(true);
    expect(signals).toEqual([{
      code: "ZONE_DRIFT_DETECTED",
      manifest_hash: ZONE_MANIFEST_HASH,
      day_bucket: "2026-08-26",
    }]);
    expect(JSON.stringify(signals)).not.toMatch(/path|file|timestamp|route|correlation/u);
  });

  it("does not duplicate an already-written daily delta when a later row fails", async () => {
    let clock = Date.parse("2026-08-26T23:59:59.000Z");
    const buffer = createZoneCounterBuffer({
      flushIntervalMs: 1_000,
      jitterRatio: 0,
      random: () => 0,
      now: () => new Date(clock),
    });
    buffer.record();
    clock += 2_000;
    buffer.record();
    const firstAttempt: string[] = [];
    expect(await buffer.flushDue(async (row) => {
      firstAttempt.push(row.day);
      if (row.day === "2026-08-27") throw new Error("second row failed");
    })).toBe(false);
    expect(firstAttempt).toEqual(["2026-08-26", "2026-08-27"]);
    expect(buffer.pendingCount()).toBe(1);

    clock += 1_000;
    const retry: string[] = [];
    expect(await buffer.flushDue(async (row) => { retry.push(row.day); })).toBe(true);
    expect(retry).toEqual(["2026-08-27"]);
  });
});

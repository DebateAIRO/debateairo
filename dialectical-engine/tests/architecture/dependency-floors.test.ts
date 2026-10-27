// tests/architecture/dependency-floors.test.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");

function resolvedVersions(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  // Scoped names are quoted in the lockfile ('@scope/name@1.2.3'), so an optional quote leads.
  const pattern = new RegExp(`^  '?${escaped}@(\\d+\\.\\d+\\.\\d+)`, "gm");
  return [...new Set([...lock.matchAll(pattern)].map((match) => match[1]!))];
}

function compare(left: string, right: string): number {
  const l = left.split(".").map(Number);
  const r = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (l[i]! !== r[i]!) return l[i]! - r[i]!;
  return 0;
}

// Floors from GHSA-7fh5-64p2-3v2j (postcss XSS), GHSA-… postcss sourceMappingURL family,
// sharp/libvips CVE-2026-33327/33328/35590/35591, nanoid GHSA (size 0 loop),
// esbuild GHSA-67mh-4wv8-2f99 (<=0.24.2) and GHSA-g7r4-m6w7-qqqr (>=0.27.3 <0.28.1).
const VULNERABLE: Record<string, (version: string) => boolean> = {
  postcss: (v) => compare(v, "8.5.23") < 0,
  // GHSA-wq5f-xc86-pv6w:0.35.5 published2026-09-27 and meets the unchanged seven-day cooldown.
  sharp: (v) => compare(v, "0.35.5") < 0,
  // GHSA-68fv-2mgg-jv7q: the patched source-map-js floor retains the exact affected range.
  "source-map-js": (v) => compare(v, "1.0.0") >= 0 && compare(v, "1.2.2") < 0,
  nanoid: (v) => v.startsWith("3.") && compare(v, "3.3.18") < 0,
  esbuild: (v) => compare(v, "0.24.3") < 0 || (compare(v, "0.27.3") >= 0 && compare(v, "0.28.1") < 0),
  // DL6-F1 (delta audit 2026-09-18): the advisory database moved under the merged tree and
  // pnpm audit went red again on paths nothing in this repo reaches with attacker input
  // (fastify's own ajv/fast-json-stringify compilers; qs under the Hatchet SDK; vitest).
  // Floors, not exclusions: every version below cleared the 7-day cooldown on its own.
  // 2026-10-01: GHSA advisories on fastify < 5.12.2 (request body replacement, authentication,
  // request and header validation bypasses) and < 5.12.5 (an unhandled-error denial of service)
  // turned pnpm audit red; 5.12.5 was published 2026-09-16, so it clears the cooldown.
  // 2026-10-25: a low advisory on fastify >=5.12.2 <5.12.6; fastify is a direct dependency, so the fix is the PIN
  // in package.json and apps/api/package.json (5.12.7, the newest release, published 2026-10-13, clears the cooldown).
  fastify: (v) => compare(v, "5.12.6") < 0,
  // 2026-10-01: the axios advisories of 1.x < 1.20.0 (ReDoS, prototype-pollution gadgets, header
  // injection, proxy and redirect bypasses), reached through the Hatchet SDK; 1.20.0 was
  // published 2026-08-26.
  axios: (v) => v.startsWith("1.") && compare(v, "1.20.0") < 0,
  // 2026-10-01: the @grpc/grpc-js advisory of >=1.14.0 <1.14.5, reached through testcontainers >
  // dockerode (test tooling only); 1.14.5 was published 2026-09-17.
  "@grpc/grpc-js": (v) => v.startsWith("1.14.") && compare(v, "1.14.5") < 0,
  // 2026-09-29: GHSA-qw65-cvwx-89v3 (all of 3.x < 3.1.7 and 4.x < 4.1.4) and GHSA-58mr-gqgx-xq4g
  // (exactly the 3.1.6 / 4.1.3 the floors above used to pin) turned pnpm audit red; 3.1.7 and
  // 4.1.4 were published 2026-09-02, so they clear the 7-day cooldown on their own.
  // 2026-09-30: GHSA-hrr3-gc8f-f4qj (3.x < 3.1.8, 4.x < 4.1.5) and GHSA-jvvf-x445-j334;
  // 3.1.8 and 4.1.5 were published 2026-09-15.
  // 2026-10-27: GHSA-w74x-v6f9-j3xg / GHSA-wjr9-j795-jxcr / GHSA-xhq7-xmqj-769h / GHSA-333x-w4r6-6crp
  // (3.x < 3.1.9, 4.x < 4.2.3); 3.1.9 and 4.2.3 were published 2026-10-19.
  "fast-uri": (v) => (v.startsWith("3.") && compare(v, "3.1.9") < 0)
    || (v.startsWith("4.") && compare(v, "4.2.3") < 0),
  // 2026-09-30: GHSA-6j4f-fj2g-mc7p / GHSA-qhr7-859c-m2p7 / GHSA-q2hr-2g5m-vwhr (2.x < 2.1.7),
  // reached through testcontainers > archiver > minimatch (test tooling only); 2.1.7 was
  // published 2026-09-14.
  "brace-expansion": (v) => v.startsWith("2.") && compare(v, "2.1.7") < 0,
  // 2026-09-29: GHSA-3wwx-pv8p-q78v (>=8.1.0 <8.10.2), reached through jsdom and testcontainers
  // (test tooling only); 8.10.2 was published 2026-09-04.
  // 2026-10-25: three advisories on undici >=8.0.0 <8.12.2 (one high: denial of service through an unhandled
  // error; two moderate: an unbounded-growth denial of service and a Subresource Integrity bypass), reached
  // through jsdom (test tooling only); 8.12.2 was published 2026-10-15, so it clears the 7-day cooldown.
  undici: (v) => v.startsWith("8.") && compare(v, "8.12.2") < 0,
  // 2026-10-25: zod < 4.6.6 (high: memory exhaustion while validating oversized input). zod is a direct
  // dependency, so the fix is the PIN in every package.json that lists it (4.6.7, the newest release, published
  // 2026-10-12, so it clears the 7-day cooldown), not an override.
  zod: (v) => compare(v, "4.6.6") < 0,
  qs: (v) => compare(v, "6.16.0") < 0,
  // 2026-10-21: GHSA-8r9p-f939-6h3c and its sibling follow-redirects advisory (>=1.16.0 <1.16.1, array-form headers
  // and sensitiveHeaders regex escaping), reached through the Hatchet SDK's axios; 1.16.1 was published 2026-10-01.
  "follow-redirects": (v) => v.startsWith("1.16.") && compare(v, "1.16.1") < 0,
  // 2026-10-22: GHSA-2464-fhr4-w9xw (critical: unauthenticated remote code execution in the Image Optimization API when
  // SVG files are used) and GHSA-p3m5-59mp-jv5r (high: App Router Server Actions denial of service), next <=15.5.27;
  // 15.5.28 was published 2026-10-14, so it clears the 7-day cooldown on its own.
  next: (v) => v.startsWith("15.") && compare(v, "15.5.28") < 0,
  // 2026-10-21: GHSA-587h-7wmj-h5pm / GHSA-698v-4r3x-3vcv / GHSA-r825-w8mm-5pxw (vite >=8.2.0 <=8.2.3, its
  // launch-editor), test tooling only (vitest); 8.2.4 was published 2026-10-06.
  vite: (v) => v.startsWith("8.2.") && compare(v, "8.2.4") < 0,
  vitest: (v) => compare(v, "4.1.11") < 0,
  // 2026-10-22: GHSA-qxg6-89mg-rqv8 / GHSA-xp26-3454-mjgp (@vitest/mocker >=5.0.0-beta.1 <5.0.3), test
  // tooling only; reached through the direct dev dependency vitest, so the fix is the vitest PIN (5.0.3),
  // not an override. @vitest/mocker ships in lockstep with vitest but gets its own floor so the lockfile
  // is checked where the advisory points. vitest and @vitest/mocker 5.0.3 were published 2026-09-30.
  "@vitest/mocker": (v) => v.startsWith("5.") && compare(v, "5.0.3") < 0
};

describe("dependency floors (F-02)", () => {
  for (const [name, isVulnerable] of Object.entries(VULNERABLE)) {
    it(`${name}: every resolved version is patched`, () => {
      const versions = resolvedVersions(name);
      expect(versions.length, `${name} must resolve somewhere in the lockfile`).toBeGreaterThan(0);
      expect(versions.filter(isVulnerable)).toEqual([]);
    });
  }
  it("has no stale `web` importer (the workspace member was removed)", () => {
    expect(/^  web:$/m.test(lock)).toBe(false);
  });
  it("has no nested lockfile inside apps/ui", () => {
    expect(existsSync(resolve(root, "apps/ui/pnpm-lock.yaml"))).toBe(false);
  });
});

// L6-F3 / L6-F12 (2026-09-01 security hardening, task B24a): the install policy lives in
// pnpm-workspace.yaml (pnpm 11 reads settings there, not from .npmrc). A registry hijack is
// worthless if a freshly published version cannot be resolved for a week, and a new lifecycle
// script must stop the install instead of being skipped silently.
const workspace = readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8");

function topLevelScalar(key: string): string | undefined {
  return workspace.match(new RegExp(`^${key}:[ \\t]*(\\S+)[ \\t]*$`, "m"))?.[1];
}

/** An exclusion may only ever be an exact `name@version`, never a range or a pattern. */
const EXACT_PIN = /^(@[a-z0-9-]+\/)?[a-z0-9.-]+@\d+\.\d+\.\d+$/;

type CooldownExclusion = { entry: string; dropAfter: string | undefined };

/**
 * The `minimumReleaseAgeExclude` entries of a pnpm-workspace.yaml TEXT, each paired with the
 * `drop after YYYY-MM-DD` date of the nearest comment above it (undefined when none governs it).
 *
 * Pure over its argument on purpose: the live list is empty today, and a guard that can only ever
 * iterate an empty list proves nothing about the reader that finds the entries. The cases in
 * "the cooldown-exclusion reader" below exercise this function against written-out samples, so the
 * mechanism stays covered whether or not the live file excludes anything.
 *
 * The block runs from the key to the next line that opens a top-level node. A sequence item may be
 * indented by any amount and a YAML comment may sit at any column, including 0, without ending the
 * sequence — so neither may end the block here either. A reader that quietly stops early is worse
 * than no reader: it goes green over exactly the entry it was written to catch.
 */
function cooldownExclusions(text: string): CooldownExclusion[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^minimumReleaseAgeExclude:[ \t]*$/.test(line));
  const found: CooldownExclusion[] = [];
  if (start === -1) return found;
  let dropAfter: string | undefined;
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("#")) {
      dropAfter = /drop after (\d{4}-\d{2}-\d{2})/.exec(line)?.[1] ?? dropAfter;
      continue;
    }
    if (!/^[ \t]/.test(line)) break; // a line at column 0 opens the next top-level node
    if (!trimmed.startsWith("- ")) continue; // an indented mapping key, not a sequence item
    found.push({ entry: trimmed.replace(/^- /, "").replace(/^'|'$/g, "").trim(), dropAfter });
  }
  return found;
}

/**
 * The exclusions that have no business being there on `today`, each with its reason: V-18 allows
 * an exclusion only while it is buying a young version time, and only under a dated comment that
 * says when that time runs out.
 */
function expiredCooldownExclusions(text: string, today: string): string[] {
  return cooldownExclusions(text).flatMap(({ entry, dropAfter }) => {
    if (dropAfter === undefined) return [`${entry}: no "drop after YYYY-MM-DD" comment above it`];
    if (dropAfter < today) return [`${entry}: its exclusion expired on ${dropAfter}`];
    return [];
  });
}

describe("supply-chain install policy (L6-F3, L6-F12)", () => {
  it("enforces a release-age cooldown of at least 7 days", () => {
    const minutes = Number(topLevelScalar("minimumReleaseAge"));
    expect(Number.isInteger(minutes), "minimumReleaseAge must be set in pnpm-workspace.yaml").toBe(true);
    expect(minutes).toBeGreaterThanOrEqual(10080);
  });
  it("fails the install loudly on an unlisted build script", () => {
    expect(topLevelScalar("strictDepBuilds")).toBe("true");
  });
  // V-18 (ruled 2026-09-21): all 40 exclusions were measured mature and removed on 2026-09-22, and
  // the key went with them. Stated here as the fact it is, not left to a loop over an empty list —
  // a reader that silently found nothing would look exactly the same.
  it("excludes nothing from the cooldown today, and the key itself is gone", () => {
    expect(cooldownExclusions(workspace).map(({ entry }) => entry), "pnpm-workspace.yaml exclusions").toEqual([]);
    expect(/^minimumReleaseAgeExclude:/m.test(workspace),
      "the key is absent, so the empty list above is the real state and not a parse miss").toBe(false);
  });
  it("only excludes exact name@version pins from the cooldown, never a range", () => {
    for (const { entry } of cooldownExclusions(workspace)) expect(entry).toMatch(EXACT_PIN);
  });
  // An exclusion from the cooldown is TEMPORARY by definition — it buys a version time until it is
  // itself 7 days old, and then it is dead weight that silently widens the window a registry hijack
  // could use. So every entry carries a `drop after YYYY-MM-DD` comment (the day its version turns
  // 7 days old) and must be gone by that date. Expiry enforces itself: this case goes red the
  // morning an exclusion outlives its reason, instead of waiting for someone to remember.
  it("gives every cooldown exclusion an unexpired `drop after YYYY-MM-DD` comment", () => {
    expect(expiredCooldownExclusions(workspace, new Date().toISOString().slice(0, 10))).toEqual([]);
  });
});

// The reader above is the whole mechanism of the V-18 guard, and the live list it reads is empty,
// so it is exercised here against written-out samples instead. Two of these are the formats that
// would otherwise defeat it in silence: pnpm accepts a sequence indented by four spaces, and a YAML
// comment may sit at column 0 without ending the sequence. An exclusion the reader cannot see is an
// exclusion nothing polices, which is the one failure this guard must never have.
describe("the cooldown-exclusion reader (V-18, the mechanism)", () => {
  const workspaceWith = (body: string) =>
    `packages:\n  - "apps/*"\nminimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n${body}\noverrides:\n  'qs@<6.16.0': '6.16.0'\n`;

  it("reads a two-space entry and the dated comment that governs it", () => {
    expect(cooldownExclusions(workspaceWith("  # drop after 2026-12-01\n  - next@15.5.25")))
      .toEqual([{ entry: "next@15.5.25", dropAfter: "2026-12-01" }]);
  });

  it("reads an entry indented four spaces", () => {
    expect(cooldownExclusions(workspaceWith("  # drop after 2026-12-01\n    - next@15.5.25")))
      .toEqual([{ entry: "next@15.5.25", dropAfter: "2026-12-01" }]);
  });

  it("keeps reading past a comment at column 0", () => {
    expect(cooldownExclusions(workspaceWith("  # drop after 2026-12-01\n  - next@15.5.25\n# a note at column 0\n  - sharp@0.35.4")))
      .toEqual([
        { entry: "next@15.5.25", dropAfter: "2026-12-01" },
        { entry: "sharp@0.35.4", dropAfter: "2026-12-01" }
      ]);
  });

  it("reads a quoted scoped entry", () => {
    expect(cooldownExclusions(workspaceWith("  # drop after 2026-12-01\n  - '@types/node@26.2.0'")))
      .toEqual([{ entry: "@types/node@26.2.0", dropAfter: "2026-12-01" }]);
  });

  it("stops at the next top-level key and finds nothing when the key is absent", () => {
    expect(cooldownExclusions(workspaceWith("  # drop after 2026-12-01\n  - next@15.5.25"))
      .some(({ entry }) => entry.startsWith("qs@"))).toBe(false);
    expect(cooldownExclusions("packages:\n  - \"apps/*\"\nminimumReleaseAge: 10080\n")).toEqual([]);
  });

  it("names an entry that no dated comment governs", () => {
    expect(expiredCooldownExclusions(workspaceWith("  - tsx@4.23.11"), "2026-09-22"))
      .toEqual(['tsx@4.23.11: no "drop after YYYY-MM-DD" comment above it']);
  });

  it("names an entry whose drop-after date has passed, and clears one still in date", () => {
    const text = workspaceWith("  # drop after 2026-09-02\n  - sharp@0.35.4\n  # drop after 2026-12-01\n  - next@15.5.25");
    expect(expiredCooldownExclusions(text, "2026-09-22")).toEqual(["sharp@0.35.4: its exclusion expired on 2026-09-02"]);
    expect(expiredCooldownExclusions(text, "2026-09-01")).toEqual([]);
  });

  it("clears an entry on the very day it may still be there, and names it the day after", () => {
    const text = workspaceWith("  # drop after 2026-09-22\n  - next@15.5.25");
    expect(expiredCooldownExclusions(text, "2026-09-22")).toEqual([]);
    expect(expiredCooldownExclusions(text, "2026-09-23")).toEqual(["next@15.5.25: its exclusion expired on 2026-09-22"]);
  });

  it("holds a range or a pattern to the exact-pin rule the live case applies", () => {
    const entries = cooldownExclusions(workspaceWith("  # drop after 2026-12-01\n  - 'next@^15.5.0'\n  - next@15.5.25"));
    expect(entries.map(({ entry }) => EXACT_PIN.test(entry))).toEqual([false, true]);
  });
});

/**
 * Side-by-side spec §13, final fix wave (area API) — the loud, content-free lines the API prints when it cannot admit
 * on the active settings version (ruling R77: F2b, F2c), the S14 rule for an owner-typed detail in a journal code, and
 * S13 (the providers page's answer parsed once, at boot).
 *
 * Plain words: if this release has not passed the active version, or this API cannot load it, every new debate waits
 * or is refused "try again in a minute". The operator must hear about it: one alarm line at most once a minute from the
 * ask paths, and the same line once at the boot of a current release (never a refused boot).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi } from "@debateai/api";
import { PublicAiProvidersResponseSchema } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import {
  ADMISSION_ACTIVE_VERSION_UNAVAILABLE,
  activeVersionUnavailableLine,
  checkActiveSettingsVersionAtBoot,
  createActiveVersionAlarm,
  journalSettingsCode
} from "../../apps/api/src/admission-alarm.js";
import { unusedAskApplication } from "../support/billingFixtures.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("F2b: the alarm line, at most once a minute per version and reason", () => {
  it("is exactly the journal's line: kind, code, version, reason (content-free)", () => {
    expect(ADMISSION_ACTIVE_VERSION_UNAVAILABLE).toBe("ADMISSION_ACTIVE_VERSION_UNAVAILABLE");
    expect(activeVersionUnavailableLine(19, "NOT_PASSED"))
      .toBe('{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_ACTIVE_VERSION_UNAVAILABLE","version":19,"reason":"NOT_PASSED"}');
    expect(activeVersionUnavailableLine(20, "UNSUPPORTED"))
      .toBe('{"kind":"DEBATEAI_ADMISSION_SETTINGS","code":"ADMISSION_ACTIVE_VERSION_UNAVAILABLE","version":20,"reason":"UNSUPPORTED"}');
  });

  it("prints once, holds back the same (version, reason) for a minute, prints another at once, and again after the minute", () => {
    let now = 1_000;
    const lines: string[] = [];
    const alarm = createActiveVersionAlarm({ clock: () => now, log: (line) => lines.push(line) });
    expect(alarm(19, "NOT_PASSED")).toBe(true);
    now += 59_999;
    expect(alarm(19, "NOT_PASSED")).toBe(false);
    expect(alarm(19, "UNSUPPORTED")).toBe(true);
    expect(alarm(20, "NOT_PASSED")).toBe(true);
    now += 1;
    expect(alarm(19, "NOT_PASSED")).toBe(true);
    // A clock that goes backwards prints again rather than staying quiet.
    now -= 10;
    expect(alarm(19, "NOT_PASSED")).toBe(true);
    expect(lines).toEqual([
      activeVersionUnavailableLine(19, "NOT_PASSED"), activeVersionUnavailableLine(19, "UNSUPPORTED"),
      activeVersionUnavailableLine(20, "NOT_PASSED"), activeVersionUnavailableLine(19, "NOT_PASSED"),
      activeVersionUnavailableLine(19, "NOT_PASSED")
    ]);
  });
});

describe("S14: an owner-typed detail in a journal code is printed only when plainly not a secret (the common rule)", () => {
  it("a bare code, a reviewed model id and a step word are printed whole", () => {
    expect(journalSettingsCode("RUN_CEILING_BELOW_ONE_CALL")).toBe("RUN_CEILING_BELOW_ONE_CALL");
    expect(journalSettingsCode("PREVIEW_THINKING_LEVELS_INVALID:Qwen/Qwen3.8-Flash")).toBe("PREVIEW_THINKING_LEVELS_INVALID:Qwen/Qwen3.8-Flash");
    expect(journalSettingsCode("PREVIEW_THINKING_LEVELS_INVALID:claude-haiku-5-5:pros_cons")).toBe("PREVIEW_THINKING_LEVELS_INVALID:claude-haiku-5-5:pros_cons");
  });

  it("a key-shaped detail (a run of 24+ letters and digits, a '//', a vendor 'sk-' prefix) prints the bare code", () => {
    const run = ["AKIA", "0123456789", "ABCDEFGHIJ"].join("");
    expect(journalSettingsCode(`PREVIEW_THINKING_LEVELS_INVALID:${run}`)).toBe("PREVIEW_THINKING_LEVELS_INVALID");
    expect(journalSettingsCode(`PREVIEW_THINKING_LEVELS_INVALID:model:${run}`)).toBe("PREVIEW_THINKING_LEVELS_INVALID");
    expect(journalSettingsCode("PREVIEW_LINE_UP_POLICY_INVALID:unix//run/gate.sock")).toBe("PREVIEW_LINE_UP_POLICY_INVALID");
    expect(journalSettingsCode(["PREVIEW_LINE_UP_POLICY_INVALID:", "sk", "-proj-abc"].join(""))).toBe("PREVIEW_LINE_UP_POLICY_INVALID");
    // Just under the run limit is printed (23 letters and digits).
    expect(journalSettingsCode(`X_INVALID:${"a".repeat(23)}`)).toBe(`X_INVALID:${"a".repeat(23)}`);
  });

  it("a detail part outside the alphabet or over 64 characters prints the bare code", () => {
    expect(journalSettingsCode("X_INVALID:owner@example.com")).toBe("X_INVALID");
    expect(journalSettingsCode("X_INVALID:two words")).toBe("X_INVALID");
    expect(journalSettingsCode("X_INVALID:")).toBe("X_INVALID");
    expect(journalSettingsCode(`X_INVALID:${"a-".repeat(33)}`)).toBe("X_INVALID");
    expect(journalSettingsCode(`X_INVALID:${"a-".repeat(32)}`)).toBe(`X_INVALID:${"a-".repeat(32)}`);
  });
});

describe("F2c: the boot's one look at the active version (never a refused boot)", () => {
  function inputs(change: Partial<Parameters<typeof checkActiveSettingsVersionAtBoot>[0]> = {}) {
    const said: Array<readonly [number, string]> = [];
    const lines: string[] = [];
    const asked: string[] = [];
    return {
      said, lines, asked,
      input: {
        current: true,
        activeSettingsVersion: async () => { asked.push("pointer"); return 19; },
        admissionSettingsFor: async (version: number) => { asked.push(`load:${String(version)}`); return {}; },
        passed: async (version: number) => { asked.push(`passed:${String(version)}`); return true; },
        alarm: (version: number, reason: "NOT_PASSED" | "UNSUPPORTED") => { said.push([version, reason]); return true; },
        log: (line: string) => { lines.push(line); },
        ...change
      }
    };
  }

  it("a staged release (not current) asks nothing and says nothing", async () => {
    const run = inputs({ current: false });
    await expect(checkActiveSettingsVersionAtBoot(run.input)).resolves.toEqual({ kind: "NOT_CURRENT" });
    expect([run.asked, run.said, run.lines]).toEqual([[], [], []]);
  });

  it("a current release loads the active version once, then asks whether it passed it: nothing said when both hold", async () => {
    const run = inputs();
    await expect(checkActiveSettingsVersionAtBoot(run.input)).resolves.toEqual({ kind: "ADMISSIBLE" });
    expect(run.asked).toEqual(["pointer", "load:19", "passed:19"]);
    expect([run.said, run.lines]).toEqual([[], []]);
  });

  it("a version the API cannot load (a settings refusal) says UNSUPPORTED; not passed says NOT_PASSED", async () => {
    const refused = inputs({ admissionSettingsFor: async () => { throw new TypedDomainError("PREVIEW_LINE_UP_REQUIRED", "PREVIEW_LINE_UP_REQUIRED"); } });
    await expect(checkActiveSettingsVersionAtBoot(refused.input)).resolves.toEqual({ kind: "UNAVAILABLE", version: 19, reason: "UNSUPPORTED" });
    expect(refused.said).toEqual([[19, "UNSUPPORTED"]]);
    const unpassed = inputs({ passed: async () => false });
    await expect(checkActiveSettingsVersionAtBoot(unpassed.input)).resolves.toEqual({ kind: "UNAVAILABLE", version: 19, reason: "NOT_PASSED" });
    expect(unpassed.said).toEqual([[19, "NOT_PASSED"]]);
  });

  it("a database or untyped failure never throws: one content-free UNCHECKED line (the pointer's failure names no version)", async () => {
    const failing = inputs({ admissionSettingsFor: async () => { throw new Error("Connection terminated unexpectedly"); } });
    await expect(checkActiveSettingsVersionAtBoot(failing.input)).resolves.toEqual({ kind: "UNCHECKED", version: 19 });
    expect(failing.lines).toEqual([JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_ACTIVE_VERSION_UNCHECKED", version: 19, cause: "UNTYPED" })]);
    expect(failing.said).toEqual([]);
    const pointer = inputs({ activeSettingsVersion: async () => { throw new TypedDomainError("ACTIVE_SETTINGS_READ_DEADLINE", "x"); } });
    await expect(checkActiveSettingsVersionAtBoot(pointer.input)).resolves.toEqual({ kind: "UNCHECKED", version: null });
    expect(pointer.lines).toEqual([JSON.stringify({ kind: "DEBATEAI_ADMISSION_SETTINGS", code: "ADMISSION_ACTIVE_VERSION_UNCHECKED", version: null, cause: "ACTIVE_SETTINGS_READ_DEADLINE" })]);
  });

  it("main.ts asks it once, after the release watcher's first read, with the watcher's answer and its own cache and pointer", () => {
    const main = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const watcher = main.indexOf('await boot.run("release-watcher", () => releaseWatcher.start());');
    const check = main.indexOf('await boot.run("active-settings-version-check", () => checkActiveSettingsVersionAtBoot({');
    expect(watcher).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(watcher);
    expect(main.indexOf("checkActiveSettingsVersionAtBoot(")).toBe(main.lastIndexOf("checkActiveSettingsVersionAtBoot("));
    expect(main.slice(check, main.indexOf("}));", check))).toContain([
      "  current: releaseWatcher.ownIsCurrent(),",
      "  activeSettingsVersion: () => activeSettings.current(),",
      "  admissionSettingsFor: (version) => admissionCache.admissionSettingsFor(version),",
      "  passed: (version) => settingsVersionPassed(pool, environment.RELEASE_KEY, version),",
      "  alarm: activeVersionAlarm,"
    ].join("\n"));
  });
});

describe("S13: the providers page's answer is parsed once, when the API is built", () => {
  it("a bad set refuses the build loudly (content-free), and a good one is never parsed again per request", async () => {
    expect(() => buildApi({ application: unusedAskApplication(), aiProviderCompanies: [""] })).toThrow("PUBLIC_AI_PROVIDERS_INVALID");
    expect(() => buildApi({ application: unusedAskApplication(),
      aiProviderCompanies: Array.from({ length: 33 }, (_, index) => `host:h${String(index)}.example`) })).toThrow("PUBLIC_AI_PROVIDERS_INVALID");
    const parse = vi.spyOn(PublicAiProvidersResponseSchema, "parse");
    const api = buildApi({ application: unusedAskApplication(), aiProviderCompanies: ["anthropic", "deepinfra"] });
    expect(parse).toHaveBeenCalledTimes(1);
    for (let read = 0; read < 2; read += 1) {
      const response = await api.inject({ method: "GET", url: "/v1/public/ai-providers" });
      expect([response.statusCode, response.json()]).toEqual([200, { companies: ["anthropic", "deepinfra"] }]);
    }
    expect(parse).toHaveBeenCalledTimes(1);
    await api.close();
  });
});

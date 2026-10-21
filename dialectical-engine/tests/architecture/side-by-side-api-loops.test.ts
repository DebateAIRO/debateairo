import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan C task C7): every API background loop runs only while this process's
 * release is current, and the work a request owns is deliberately left ungated. Source pins over apps/api/src: a new
 * setInterval anywhere in the API, and a new whole-minute tick in main.ts, must take a side (gated, or named here as
 * request-owned), never slip in unnoticed.
 */
const api = fileURLToPath(new URL("../../apps/api/src/", import.meta.url));
const read = (path: string): string => readFileSync(join(api, path), "utf8");

/** The source with every comment and string body blanked (same length), so brackets inside them never count. */
function code(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (c === "/" && next === "*") {
      const stop = source.indexOf("*/", i + 2) + 2;
      out += source.slice(i, stop).replace(/[^\n]/gu, " ");
      i = stop;
    } else if (c === "\"" || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === "\\" ? 2 : 1;
      out += c + source.slice(i + 1, j).replace(/[^\n]/gu, " ") + c;
      i = j + 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The callee names of every call whose argument list is still open at `index`, innermost first. */
function enclosingCalls(source: string, index: number): string[] {
  const names: string[] = [];
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const c = source[i];
    if (c === ")" || c === "]" || c === "}") depth += 1;
    else if (c === "(" || c === "[" || c === "{") {
      if (depth > 0) { depth -= 1; continue; }
      if (c === "(") names.push(/([\w$.?]+)\s*$/u.exec(source.slice(Math.max(0, i - 80), i))?.[1] ?? "");
    }
  }
  return names;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? sourceFiles(join(directory, entry.name))
    : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);
}

const callsOf = (source: string, name: string): number[] =>
  [...code(source).matchAll(new RegExp(`(?<![\\w$.])${name}\\(`, "gu"))].map((match) => match.index ?? 0);

describe("side-by-side C7 the API's background loops run only on the current release", () => {
  const main = read("main.ts");
  const mainCode = code(main);
  const listen = main.indexOf('await startup.run("listen"');
  const oneShots = main.indexOf("releaseWatcher.onBecameCurrent(() => {", listen);

  it("in main.ts, every setInterval( is the argument of, or inside, gatedInterval(", () => {
    // The scan itself sees through nesting, and refuses a bare timer (so an empty main.ts list is a real answer).
    const inside = code("gatedInterval(gate, () => { void [setInterval(work, 1)]; }, 5);");
    expect(enclosingCalls(inside, inside.indexOf("setInterval("))).toContain("gatedInterval");
    const bare = code("start(/* gatedInterval( */ setInterval(work, 1));");
    expect(enclosingCalls(bare, bare.indexOf("setInterval("))).not.toContain("gatedInterval");
    for (const at of callsOf(main, "setInterval")) {
      expect(enclosingCalls(mainCode, at), `setInterval( at line ${main.slice(0, at).split("\n").length}`)
        .toContain("gatedInterval");
    }
  });

  it("in main.ts, every everyWholeMinute( takes a gatedTrigger( as its tick", () => {
    const ticks = callsOf(main, "everyWholeMinute");
    expect(ticks.length).toBeGreaterThan(0);
    for (const at of ticks) {
      expect(mainCode.slice(at + "everyWholeMinute(".length).trimStart().startsWith("gatedTrigger("),
        `everyWholeMinute( at line ${main.slice(0, at).split("\n").length}`).toBe(true);
    }
  });

  it("unsubscribes the release listener before every onClose stop (preClose)", () => {
    expect(main).toContain('api.addHook("preClose",async () => endBecameCurrent?.());');
    expect(main).not.toMatch(/addHook\("onClose",[^\n]*endBecameCurrent/u);
  });

  it("gates every timer main.ts starts, on the watcher", () => {
    for (const loop of [
      "gatedInterval(releaseWatcher,triggerErasureReconciliation,30_000)",
      "gatedInterval(releaseWatcher,triggerAuthenticationRiskCleanup,60_000)",
      "gatedInterval(releaseWatcher,triggerRetentionPurge,86_400_000)",
      "gatedInterval(releaseWatcher,triggerDataExportWork,DATA_EXPORT_TICK_MS)",
      "gatedInterval(releaseWatcher,triggerPasswordResetReconciliation,30_000)",
      "gatedInterval(releaseWatcher,triggerEmailRecoveryReconciliation,30_000)"
    ]) {
      expect(mainCode.replace(/\s+/gu, ""), loop).toContain(loop);
    }
    // The publication key cleanup: the boot pass only when current at boot, the 30-second pass gated.
    expect(main).toMatch(/if \(releaseWatcher\.ownIsCurrent\(\)\) \{\n\s+await boot\.run\("publication-key-cleanup"/u);
    expect(main).toMatch(/publicationCleanupTimer = gatedInterval\(releaseWatcher, \(\) => \{/u);
    // The ask waker plus its stalled-start re-send: the whole-minute tick is gated, the waker itself is unchanged.
    expect(main).toContain("everyWholeMinute(gatedTrigger(");
    expect(main).toContain("askWaker = everyWholeMinute(gatedTrigger(releaseWatcher, triggerAskWake));");
  });

  it("hands each runtime's start the watcher as its `when`", () => {
    for (const start of ["billingRuntime?.start(", "providerOnlyJobs?.start(", "staffAlerts?.start("]) {
      const at = main.indexOf(start);
      expect(at, start).toBeGreaterThan(listen);
      expect(main.slice(at + start.length).trimStart().startsWith("{ when: () => releaseWatcher.ownIsCurrent() })"), start)
        .toBe(true);
      expect(main.indexOf(start, at + 1), `${start} once`).toBe(-1);
    }
  });

  it("runs the post-listen one-shots, in their order, each time the release becomes current", () => {
    expect(listen).toBeGreaterThan(-1);
    expect(oneShots).toBeGreaterThan(listen);
    const open = mainCode.indexOf("{", oneShots);
    let depth = 0;
    let close = open;
    for (; close < mainCode.length; close += 1) {
      if (mainCode[close] === "{") depth += 1;
      else if (mainCode[close] === "}" && --depth === 0) break;
    }
    const body = main.slice(open, close);
    const order = [
      "triggerErasureReconciliation();",
      "triggerDataExportWork();",
      "triggerAuthenticationRiskCleanup();",
      "triggerRetentionPurge();",
      "billingRuntime?.start(",
      "providerOnlyJobs?.start(",
      "netopiaIntake.recheckQuarantine(new Date())",
      "netopiaIntake.replaySpool(new Date())",
      "triggerAskWake();",
      "staffAlerts?.start(",
      "triggerPasswordResetReconciliation?.();",
      "triggerEmailRecoveryReconciliation?.();"
    ].map((call) => [call, body.indexOf(call)] as const);
    for (const [call, at] of order) expect(at, call).toBeGreaterThan(-1);
    expect(order.map(([, at]) => at)).toEqual(order.map(([, at]) => at).sort((a, b) => a - b));
    // Nothing of them is asked outside the listener once the API listens: a one-shot there would run on any release.
    const rest = main.slice(listen, oneShots) + main.slice(open + body.length);
    for (const [call] of order) expect(rest, call).not.toContain(call);
    expect(main.trimEnd().endsWith("releaseWatcher.markBooted();")).toBe(true);
  });

  it("gates every timer callback and first pass of the billing, provider-only and staff runtimes on `when`", () => {
    for (const file of ["billing/runtime.ts", "billing/provider-only-jobs.ts", "staff/runtime.ts"]) {
      const source = read(file);
      expect(source, file).toMatch(/start\(options\?: Readonly<\{ when\?: \(\) => boolean \}>\)/u);
      const intervals = callsOf(source, "setInterval");
      expect(intervals.length, file).toBeGreaterThan(0);
      for (const at of intervals) expect(source.slice(at, at + 20), file).toMatch(/^setInterval\(gated\(/u);
    }
    const billing = read("billing/runtime.ts");
    for (const first of ["gated(drain)();", "gated(renewTick)();", "gated(reconcile)();", "gated(scheduleOwnerJobs)();"]) {
      expect(billing, first).toContain(first);
    }
    expect(read("billing/provider-only-jobs.ts")).toContain("gated(schedule)();");
    expect(read("staff/runtime.ts")).toContain("gated(trigger)();");
  });

  it("leaves the work a request owns ungated, and the watcher itself (it is the gate)", () => {
    // The routes' billing kick is the bare drain (the outbox is safe to run twice, billing-jobs.ts's claim).
    expect(read("billing/runtime.ts")).toMatch(/\n\s+kick: drain,\n/u);
    // The data-export lease renewal belongs to an export this process claimed.
    const exportService = read("data-export/service.ts");
    expect(exportService).toContain("const timer = setInterval(renew, DATA_EXPORT_RENEW_MS);");
    // The support relay's durable drain serves this process's own waiters.
    expect(read("support/queue.ts")).toContain("#scheduleDurableDrain(");
    for (const file of ["data-export/service.ts", "support/queue.ts"]) {
      expect(read(file), file).not.toMatch(/ownIsCurrent\(\)|release-loops|gatedInterval|gatedTrigger/u);
    }
    // The watcher's own poll chain is never gated: it is the gate.
    expect(read("release-state.ts")).not.toMatch(/release-loops|gatedInterval|gatedTrigger/u);
  });

  it("names every file of the API that starts a setInterval: gated, or request-owned above", () => {
    const starting = sourceFiles(api)
      .filter((file) => callsOf(readFileSync(file, "utf8"), "setInterval").length > 0)
      .map((file) => relative(api, file).split("\\").join("/"))
      .sort();
    expect(starting).toEqual([
      "billing/provider-only-jobs.ts",
      "billing/runtime.ts",
      "data-export/service.ts",
      "release-loops.ts",
      "staff/runtime.ts"
    ]);
  });
});

// tests/unit/vps-release.test.ts
// Side-by-side spec §10, Phase 3 (plans D16, D16b): the public server's releases. Each release runs from its own folder
// with a base env file plus its own overlay, and Hatchet's compose file lives outside every release and the operator
// checkout. Root's deploy/vps/release.mjs drives the preview's own release tools (release-retire, release-switch,
// release-check through release-info) with common.mjs's VPS_LAYOUT: this server's units, PostgreSQL socket, slots and
// edge, no spending gates and no notice unit, and each release's key and slot read from its own overlay.
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as runtimeEnvironment from "../../packages/register/src/runtime-environment.js";

const release = await import("../../deploy/" + "vps/release.mjs");
const common = await import("../../deploy/" + "preview-lifecycle/v1/common.mjs");
const table = await import("../../deploy/" + "preview-lifecycle/v1/release-table.mjs");
const VPS = common.VPS_LAYOUT;

const engineRoot = resolve(import.meta.dirname, "../..");
const read = (relative: string): string => readFileSync(resolve(engineRoot, relative), "utf8");

type KeyInventory = Readonly<{ required: readonly string[]; optional: readonly string[] }>;
const inventory = (name: string): KeyInventory =>
  (runtimeEnvironment as Readonly<Record<string, unknown>>)[name] as KeyInventory;

function exampleKeys(relative: string): string[] {
  const keys: string[] = [];
  for (const line of read(relative).split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=/u.exec(line.trim());
    if (match?.[1] !== undefined) keys.push(match[1]);
  }
  return keys;
}

describe("the public server's per-release overlays (side-by-side spec §10)", () => {
  it("the overlay examples set only keys the shapes know", () => {
    for (const [service, keysName] of [["api", "API_ENVIRONMENT_KEYS"], ["runner", "RUNNER_ENVIRONMENT_KEYS"]] as const) {
      const shape = inventory(keysName);
      expect(shape.required.length, keysName).toBeGreaterThan(0);
      // RELEASE_KEY is a key of both strict shapes (INTERFACE "Environment values"): no exception is left.
      expect(shape.required, keysName).toContain("RELEASE_KEY");
      const known = new Set([...shape.required, ...shape.optional]);
      const keys = exampleKeys(`deploy/vps/env/releases/${service}.env.example`);
      expect(keys.filter((key) => !known.has(key)), service).toEqual([]);
      expect(new Set(keys).size, service).toBe(keys.length);
      expect(keys, service).toContain("RELEASE_KEY");
    }
    // Only the values that must differ per release: the site version and release key, the slot's port, the
    // runner's worker identity (side-by-side plan D8's DERIVED_KEYS, less the preview-only mail helper).
    expect(exampleKeys("deploy/vps/env/releases/api.env.example").sort()).toEqual(["API_PORT", "REGISTER_VERSION", "RELEASE_KEY"]);
    expect(exampleKeys("deploy/vps/env/releases/runner.env.example").sort())
      .toEqual(["HATCHET_WORKER_NAME", "REGISTER_VERSION", "RELEASE_KEY", "RUNNER_WORKER_ID"]);
    const ui = exampleKeys("deploy/vps/env/releases/ui.env.example");
    expect(ui.filter((key) => !["RELEASE_KEY", "PORT", "DIALECTICAL_API_BASE"].includes(key))).toEqual([]);
    expect(ui.sort()).toEqual(["DIALECTICAL_API_BASE", "PORT", "RELEASE_KEY"]);
  });

  it("each overlay names its file, its owner and the base file it overrides", () => {
    for (const service of ["api", "runner", "ui"]) {
      const text = read(`deploy/vps/env/releases/${service}.env.example`);
      expect(text, service).toContain(`/etc/debateai/releases/<label>/${service}.env (0640 root:debateai-${service})`);
      expect(text, service).toContain(`/etc/debateai/${service}.env`);
    }
  });

  it("hatchet's compose file is no longer in any release or the operator checkout", () => {
    const hatchet = read("deploy/vps/systemd/debateai-hatchet.service");
    const lines = hatchet.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
    expect(lines).toContain("WorkingDirectory=/etc/debateai/hatchet");
    expect(lines).toContain("ExecStart=/usr/bin/docker compose -f /etc/debateai/hatchet/compose.prod.yaml up -d");
    expect(lines).toContain("ExecStop=/usr/bin/docker compose -f /etc/debateai/hatchet/compose.prod.yaml down");
    for (const line of lines.filter((entry) => /^(Exec[A-Za-z]*|WorkingDirectory)=/.test(entry))) {
      expect(line).not.toContain("/opt/debateai");
    }
    // No unit of the kit runs a compose file from a release folder or the operator checkout.
    for (const name of readdirSync(resolve(engineRoot, "deploy/vps/systemd"))) {
      expect(read(`deploy/vps/systemd/${name}`), name).not.toMatch(/\/opt\/debateai\/\S*compose\.prod\.yaml/);
    }
    // The compose project keeps its fixed name, so the move keeps the same container and its config volume.
    expect(read("deploy/vps/compose.prod.yaml")).toMatch(/^name: debateai-prod$/m);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A fake public server: its overlay and release folders on disk (a temporary root standing in for /etc/debateai and
// /opt/debateai), and behind `deps` the release table answering psql over this server's socket, systemd, the journal,
// the two websites and the edge listener. One ordered log holds every command root ran.

const OLD_KEY = ["r19", "d50e33165a1b"].join("-");
const NEW_KEY = ["r20", "0123456789ab"].join("-");
const FIRST_KEY = ["r18", "00aa11bb22cc"].join("-");
const SECRET = ["edge", "v".repeat(48)].join("_");
const START = Date.parse("2026-10-22T03:15:00.000Z");
const DAY = 86_400_000;
const PORTS = { A: { ui: "3001", api: "8790" }, B: { ui: "3002", api: "8791" } } as const;
const U = (service: string, label: string) => `debateai-${service}@${label}.service`;
const invocationId = (n: number) => n.toString(16).padStart(32, "b");
const iso = (ms: number) => new Date(ms).toISOString();
const me = { uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0 };
const bases: string[] = [];
afterAll(() => { for (const base of bases) rmSync(base, { recursive: true, force: true }); });

type Release = { label: string; key: string; slot: "A" | "B"; migrations?: Record<string, string> };
const N1 = "-- n1: expand\n-- n1: keeps-verifier\n";
const OLD: Release = { label: "old-v1", key: OLD_KEY, slot: "A", migrations: { "0001_a.sql": `${N1}SELECT 1;\n` } };
const NEW: Release = { label: "new-v1", key: NEW_KEY, slot: "B", migrations: { "0001_a.sql": `${N1}SELECT 1;\n`, "0002_b.sql": `${N1}SELECT 2;\n` } };
const FIRST: Release = { label: "first-v1", key: FIRST_KEY, slot: "A" };

/** The overlay and release folders, root-style (0640 overlays, 0644 files, 0755 folders), owned by this test's user. */
function serverFiles(releases: Release[], overlayText?: (entry: Release) => string) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "vps-release-")));
  bases.push(base);
  const layout = { ...VPS, releaseOverlayRoot: join(base, "etc", "releases"), releasesRoot: join(base, "opt", "releases"), lockRoot: join(base, "etc", "lifecycle"), ownerUid: me.uid, ownerGid: me.gid };
  for (const entry of releases) {
    const overlay = join(layout.releaseOverlayRoot, entry.label);
    mkdirSync(overlay, { recursive: true, mode: 0o755 });
    const register = /^r(\d+)-/.exec(entry.key)![1];
    const path = join(overlay, "api.env");
    writeFileSync(path, overlayText?.(entry) ?? `REGISTER_VERSION=${register}\nRELEASE_KEY=${entry.key}\nAPI_PORT=${PORTS[entry.slot].api}\n`);
    chmodSync(path, 0o640);
    const migrations = join(layout.releasesRoot, entry.label, "dialectical-engine", "migrations");
    mkdirSync(migrations, { recursive: true, mode: 0o755 });
    for (const [name, text] of Object.entries(entry.migrations ?? {})) { writeFileSync(join(migrations, name), text); chmodSync(join(migrations, name), 0o644); }
  }
  for (const folder of [base, join(base, "etc"), join(base, "opt"), layout.releaseOverlayRoot, layout.releasesRoot]) chmodSync(folder, 0o755);
  return { base, layout };
}

type Answer = { status: number; release: string | null; reasons?: string[]; releaseKey?: string } | "refused";
type Options = Partial<{
  history: [string, string, string?][];
  units: Record<string, string>;
  ready: Record<string, string>;
  minutesSinceRequest: number;
  mainStatus: string;
}>;
const result = (stdout = "", code: number | null = 0, stderr = "") => ({ code, signal: null, error: undefined, timedOut: false, overflow: false, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) });
const site = (key: string, status = 200, reasons: string[] = []): Answer => ({ status, release: key, reasons, releaseKey: key });

function host(releases: Release[], options: Options = {}) {
  const o = { history: [] as [string, string, string?][], units: {} as Record<string, string>, ready: {} as Record<string, string>, minutesSinceRequest: 26, mainStatus: "0", ...options };
  let clock = START, invocations = 0;
  const log: string[] = [], psql: string[][] = [], urls: string[] = [], unitFiles: Record<string, string> = {};
  const events: { key: string; kind: string; reason: string | null; at: number; ttf: number | null }[] = [];
  const base = START - DAY;
  for (const [key, kind, reason] of o.history) {
    const at = kind === "RETIRE_REQUESTED" ? START - o.minutesSinceRequest * 60_000 : base + events.length * 1000;
    events.push({ key, kind, reason: reason ?? null, at, ttf: kind === "CURRENT" ? at + 5000 : null });
  }
  const latest = (key: string, kinds: string[]) => { for (let i = events.length - 1; i >= 0; i--) if (events[i]!.key === key && kinds.includes(events[i]!.kind)) return i; return -1; };
  const stateOf = (key: string) => {
    const at = latest(key, ["STAGED", "CURRENT", "DRAINING", "RETIRED"]);
    if (at < 0) return { state: "UNKNOWN", frontPairStopped: false, retireRequested: false };
    const epoch = latest(key, ["STAGED", "CURRENT", "DRAINING"]);
    const after = (kind: string) => events.some((event, index) => event.key === key && event.kind === kind && index > epoch);
    return { state: events[at]!.kind, frontPairStopped: after("FRONT_PAIR_STOPPED"), retireRequested: after("RETIRE_REQUESTED") };
  };
  const keys = releases.map((entry) => entry.key);
  const currentKey = () => keys.find((key) => stateOf(key).state === "CURRENT") ?? null;
  const push = (key: string, kind: string, reason: string | null = null, ttf: number | null = null) => events.push({ key, kind, reason, at: clock, ttf });
  const byLabel = (label: string) => releases.find((entry) => entry.label === label)!;

  const units: Record<string, string> = { "debateai-hatchet.service": "active" };
  for (const entry of releases) for (const service of ["runner", "api", "ui"]) units[U(service, entry.label)] = "active";
  Object.assign(units, o.units);
  const invocation: Record<string, number> = {}, journal: Record<string, string> = {};
  /** What each instance prints once it is up on this server: the runner's and the API's own ready lines. */
  const announce = (unit: string) => {
    invocation[unit] = ++invocations;
    const label = /@(.+)\.service$/.exec(unit)![1]!;
    const key = byLabel(label).key;
    const line = unit.includes("-runner@")
      ? `DEBATEAI_RUNNER_READY ${JSON.stringify({ kind: "DEBATEAI_RUNNER_READY", worker: `debateai-prod-runner-${key}`, registerVersion: "20", releaseKey: key, startupDispatched: 0 })}`
      : `DEBATEAI_API_READY ${JSON.stringify({ releaseKey: key, port: Number(PORTS[byLabel(label).slot].api) })}`;
    journal[unit] = `${o.ready[unit] ?? line}\nanother line\n`;
  };
  for (const entry of releases) for (const service of ["runner", "api"]) if (units[U(service, entry.label)] === "active") announce(U(service, entry.label));

  const websiteAnswer = (label: string): Answer => {
    if (units[U("ui", label)] !== "active") return "refused";
    const key = byLabel(label).key;
    if (currentKey() !== key) return site(key, 503, ["NOT_CURRENT"]);
    return clock >= events[latest(key, ["CURRENT"])]!.ttf! ? site(key) : site(key, 503, ["BEFORE_TAKE_TRAFFIC_FROM"]);
  };
  /** Caddy holds a request up to 10 s (lb_try_duration) while no slot is ready, then answers it itself (no release header). */
  const edgeAnswer = (): Answer => {
    const key = currentKey();
    const ttf = key === null ? Infinity : events[latest(key, ["CURRENT"])]!.ttf!;
    if (key !== null && clock < ttf && ttf - clock <= 10_000) clock = ttf;
    const answer = key === null ? "refused" : websiteAnswer(releases.find((entry) => entry.key === key)!.label);
    if (answer !== "refused" && answer.status === 200) return answer;
    clock += 10_000;
    return { status: 502, release: null };
  };

  /** The release table, answering the fixed SQL of release-table.mjs (and the check's connection count) over psql. */
  const answerPsql = (argv: string[], sql: string) => {
    psql.push(argv.filter((part) => /^--(host|port|dbname)=/.test(part) || part.endsWith("/psql") || part === "postgres"));
    const vars: Record<string, string> = {};
    argv.forEach((part, index) => { if (argv[index - 1] === "-v" && part !== "ON_ERROR_STOP=1") { const at = part.indexOf("="); vars[part.slice(0, at)] = part.slice(at + 1); } });
    if (sql.includes("core.read_release_state(")) {
      const { state, frontPairStopped, retireRequested } = stateOf(vars.release_key!);
      return result(state === "UNKNOWN" ? "" : `${state}|${frontPairStopped ? "t" : "f"}|${retireRequested ? "t" : "f"}\n`);
    }
    if (sql.includes("core.read_current_release()")) { const key = currentKey(); return result(key ? `${key}|${iso(events[latest(key, ["CURRENT"])]!.ttf!)}\n` : ""); }
    if (sql.includes("core.record_release_switch(")) {
      const expected = vars.expected_current === "" ? null : vars.expected_current;
      log.push(`recordReleaseSwitch(${vars.new_key}, expect ${expected}, ${vars.seconds}s)`);
      if (currentKey() !== expected) return result("", 3, "ERROR:  RELEASE_SWITCH_CONFLICT\n");
      const old = currentKey();
      push(vars.new_key!, "CURRENT", null, clock + Number(vars.seconds) * 1000);
      if (old) push(old, "DRAINING");
      return result("41\n");
    }
    if (sql.includes("core.record_release_event(")) {
      log.push(`event(${vars.release_key} ${vars.kind}${vars.reason ? ` ${vars.reason}` : ""})`);
      push(vars.release_key!, vars.kind!, vars.reason || null);
      return result("42\n");
    }
    if (sql.includes("FROM core.release_event")) return result(events.filter((event) => event.key === vars.release_key).map((event) => `${event.kind}|${iso(event.at)}|${event.reason ?? ""}\n`).join(""));
    if (sql.includes("core.work_item")) return result("0\n");
    if (sql.includes("current_setting('max_connections')")) return result("320|3|10\n");
    throw new Error(`unexpected SQL ${sql}`);
  };

  const run = async (argv: string[], opts: { env: Record<string, string>; stdin?: Buffer }) => {
    expect(opts.env).toEqual({});
    if (argv[0] === VPS.runuser) return answerPsql(argv, opts.stdin!.toString("utf8"));
    if (argv[0] === VPS.systemctl) {
      const rest = argv.slice(1);
      if (rest[0] === "show") {
        const unit = rest[1]!, properties = rest[2]!.slice("--property=".length).split(",");
        const value = (property: string) => {
          const state = units[unit] ?? "inactive";
          if (property === "ActiveState") return state;
          if (property === "SubState") return state === "active" ? "running" : "dead";
          if (property === "MainPID") return state === "active" ? "4242" : "0";
          if (property === "InvocationID") return invocationId(invocation[unit] ?? 0);
          if (property === "LoadState") return "loaded";
          if (property === "ExecMainStatus") return o.mainStatus;
          if (property === "Result") return "success";
          throw new Error(`unexpected property ${property}`);
        };
        return result(properties.map((property) => `${property}=${value(property)}\n`).join(""));
      }
      log.push(`systemctl ${rest.join(" ")}`);
      if (rest[0] === "stop") {
        for (const unit of rest.slice(1)) {
          units[unit] = "inactive";
          // The API's stop recorder (ExecStopPost): FRONT_PAIR_STOPPED for a draining release.
          const api = /^debateai-api@(.+)\.service$/.exec(unit);
          const key = api ? byLabel(api[1]!).key : null;
          if (key && stateOf(key).state === "DRAINING" && !stateOf(key).frontPairStopped) push(key, "FRONT_PAIR_STOPPED");
        }
      }
      if (rest[0] === "start" && rest[1] === "--no-block") {
        const unit = rest[2]!;
        units[unit] = "active";
        if (!unit.includes("-ui@")) announce(unit);
      }
      return result();
    }
    if (argv[0] === VPS.journalctl) {
      const unit = argv[2]!;
      log.push(`read:journal(${unit})`);
      return result(journal[unit] ?? "");
    }
    throw new Error(`unexpected command ${argv.join(" ")}`);
  };

  const deps: Record<string, unknown> = {
    run, now: () => clock, sleep: async (ms: number) => { clock += ms; },
    httpGet: async (url: string, { headers }: { headers: Record<string, string> }) => {
      urls.push(url);
      let answer: Answer;
      if (url === "http://127.0.0.1:3090/readyz") { expect(headers).toEqual({}); answer = edgeAnswer(); } else {
        const port = /^http:\/\/127\.0\.0\.1:(\d+)\/readyz$/.exec(url)![1]!;
        expect(headers).toEqual({ "x-debateai-edge-secret": SECRET });
        const entry = releases.find((candidate) => PORTS[candidate.slot].ui === port);
        answer = entry ? websiteAnswer(entry.label) : "refused";
      }
      clock += 20;
      if (answer === "refused") throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      return { status: answer.status, release: answer.release, body: answer.reasons ? JSON.stringify({ ready: answer.status === 200, releaseKey: answer.releaseKey, reasons: answer.reasons }) : "Bad Gateway" };
    },
    readEdgeSecret: async () => SECRET,
    pathExists: async () => false,
    writeUnitFile: async (path: string, text: string) => { log.push(`unitfile ${path}`); unitFiles[path] = text; },
    writeStateFile: async (path: string) => { throw new Error(`no state file on this server: ${path}`); },
    statfs: async () => ({ bavail: 40e9 / 4096, bsize: 4096 }),
    readMeminfo: async () => `MemTotal:       16000000 kB\nMemAvailable:    8000000 kB\n`,
    portRefuses: async () => true
  };
  return {
    deps, log, psql, urls, units, unitFiles, stateOf, announce,
    eventLog: () => events.map((event) => `${releases.find((entry) => entry.key === event.key)?.label ?? event.key} ${event.kind}${event.reason ? ` ${event.reason}` : ""}`),
    verbs: () => log.filter((entry) => entry.startsWith("systemctl ")).map((entry) => entry.slice("systemctl ".length))
  };
}

/** release.mjs's own command line, as root on Linux unless `actor` says otherwise; its one JSON line and exit code. */
async function cli(argv: string[], layout: Record<string, unknown>, deps: Record<string, unknown>, actor: { platform?: string; uid?: number } = {}) {
  let stdout = "", stderr = "";
  const code = await release.main(argv, {
    platform: actor.platform ?? "linux", uid: actor.uid ?? 0, layout, deps,
    stdout: { write: (text: string) => { stdout += text; } }, stderr: { write: (text: string) => { stderr += text; } }
  });
  return { code, out: stdout ? JSON.parse(stdout) : null, err: stderr ? JSON.parse(stderr) : null };
}

const AFTER_SWITCH: [string, string, string?][] = [[OLD_KEY, "STAGED"], [OLD_KEY, "CURRENT"], [NEW_KEY, "STAGED"], [NEW_KEY, "CURRENT"], [OLD_KEY, "DRAINING"], [OLD_KEY, "FRONT_PAIR_STOPPED"]];

describe("release.mjs: the preview's release tools with the public server's layout (side-by-side plan D16b)", () => {
  it("the public server's switch uses its own units, socket and slots and has no gates", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: [[OLD_KEY, "STAGED"], [OLD_KEY, "CURRENT"], [NEW_KEY, "STAGED"]] });
    const run = await cli(["switch", "--to", "new-v1", "--from", "old-v1"], layout, h.deps);
    expect([run.code, run.err]).toEqual([0, null]);
    expect(run.out).toMatchObject({ event: "PREVIEW_RELEASE_SWITCHED", to: "new-v1", from: "old-v1", toKey: NEW_KEY, fromKey: OLD_KEY, edgeFailures: 0, bad: [] });
    // Every release-table call goes over this server's socket, port and database, as the postgres user.
    expect(h.psql.length).toBeGreaterThan(0);
    for (const call of h.psql) expect(call).toEqual(["postgres", "/usr/lib/postgresql/18/bin/psql", "--host=/var/run/postgresql", "--port=5432", "--dbname=debateai"]);
    expect(table.psqlArgv(VPS)).toContain("--host=/var/run/postgresql");
    // One database write made new current and old draining; the old API's stop recorder wrote FRONT_PAIR_STOPPED.
    expect(h.eventLog().slice(3)).toEqual(["new-v1 CURRENT", "old-v1 DRAINING", "old-v1 FRONT_PAIR_STOPPED"]);
    // This server's units: the old pair stops, the new release's three instances are enabled and the old pair's
    // disabled; the old runner keeps running (and stays enabled) until it retires. Its backstop is this server's timer.
    expect(h.verbs()).toEqual([
      "stop debateai-ui@old-v1.service debateai-api@old-v1.service",
      "daemon-reload", "enable debateai-runner-retire@old-v1.timer", "restart debateai-runner-retire@old-v1.timer",
      "enable debateai-api@new-v1.service debateai-ui@new-v1.service debateai-runner@new-v1.service",
      "disable debateai-api@old-v1.service debateai-ui@old-v1.service"
    ]);
    expect(h.units[U("runner", "old-v1")]).toBe("active");
    // No target drop-in and no gate files: the only file root writes is the backstop's time.
    expect(Object.keys(h.unitFiles)).toEqual(["/etc/systemd/system/debateai-runner-retire@old-v1.timer.d/50-at.conf"]);
    // This server's slots and edge: the new release's website in slot B (its overlay's API_PORT 8791), the edge on 3090.
    expect(new Set(h.urls)).toEqual(new Set(["http://127.0.0.1:3002/readyz", "http://127.0.0.1:3090/readyz"]));
    // No gate was asked (an unknown command fails the fake run), and no preview unit was named.
    expect(h.log.join("\n")).not.toContain("debateai-preview-");
  });

  it("a draining release's API may not start again on the public server", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: AFTER_SWITCH });
    for (const service of ["api", "ui"]) {
      const refused = await cli(["may-start", "--service", service, "--label", "old-v1"], layout, h.deps);
      expect([refused.code, refused.err]).toEqual([1, { event: "PREVIEW_RELEASE_START_REFUSED", service, label: "old-v1", reason: "RELEASE_STATE_REFUSED", fields: { state: "DRAINING" } }]);
    }
    // Its runner may start again (its debates resume on their own release); the current release starts.
    expect((await cli(["may-start", "--service", "runner", "--label", "old-v1"], layout, h.deps)).out)
      .toEqual({ event: "PREVIEW_RELEASE_MAY_START", service: "runner", label: "old-v1", releaseKey: OLD_KEY, state: "DRAINING" });
    expect((await cli(["may-start", "--service", "api", "--label", "new-v1"], layout, h.deps)).code).toBe(0);
    // A label with no overlay of its own is no release of this server.
    expect((await cli(["may-start", "--service", "api", "--label", "gone-v1"], layout, h.deps)).err).toMatchObject({ reason: "RELEASE_OVERLAY_MISSING" });
  });

  it("the first switch, with no current release yet, comes after its units start (README §5 \"The first release\")", async () => {
    const { layout } = serverFiles([FIRST]);
    const units = { [U("runner", "first-v1")]: "inactive", [U("api", "first-v1")]: "inactive", [U("ui", "first-v1")]: "inactive" };
    const h = host([FIRST], { units });
    // 1. stage: the release table records it, so its instances may start.
    expect((await cli(["stage", "--label", "first-v1"], layout, h.deps)).out).toEqual({ event: "PREVIEW_RELEASE_STAGED", label: "first-v1", releaseKey: FIRST_KEY, recorded: true });
    expect((await cli(["may-start", "--service", "api", "--label", "first-v1"], layout, h.deps)).code).toBe(0);
    // A switch before the start is refused before anything is written: it waits for Caddy to route to a running pair.
    const early = await cli(["switch", "--to", "first-v1"], layout, h.deps);
    expect([early.code, early.err]).toEqual([1, { event: "PREVIEW_RELEASE_SWITCH_REFUSED", to: "first-v1", reason: "SWITCH_PRECONDITION_FAILED", fields: ["runner", "api", "ui", "website"] }]);
    expect(h.log.filter((entry) => entry.startsWith("recordReleaseSwitch"))).toEqual([]);
    // 2. install the units and `enable --now` them.
    for (const service of ["runner", "api", "ui"]) h.units[U(service, "first-v1")] = "active";
    h.announce(U("runner", "first-v1")); h.announce(U("api", "first-v1"));
    // 3. the switch, with no --from: one write expecting no current release, the edge, then its three instances enabled.
    const first = await cli(["switch", "--to", "first-v1"], layout, h.deps);
    expect([first.code, first.err]).toEqual([0, null]);
    expect(first.out).toMatchObject({ event: "PREVIEW_RELEASE_FIRST_SWITCHED", to: "first-v1", toKey: FIRST_KEY, recorded: true, bad: [] });
    expect(first.out.edgeConfirmedMs).toBeGreaterThan(0);
    expect(h.log.filter((entry) => entry.startsWith("recordReleaseSwitch"))).toEqual([`recordReleaseSwitch(${FIRST_KEY}, expect null, 5s)`]);
    expect(h.verbs()).toEqual(["enable debateai-api@first-v1.service debateai-ui@first-v1.service debateai-runner@first-v1.service"]);
    expect(h.unitFiles).toEqual({});
    expect(h.stateOf(FIRST_KEY).state).toBe("CURRENT");
    // Run again (after a lost answer or a `bad`): the table already names it current, so only the steps after the write repeat.
    const again = await cli(["switch", "--to", "first-v1"], layout, h.deps);
    expect([again.code, again.out.recorded, again.out.bad]).toEqual([0, false, []]);
    expect(h.log.filter((entry) => entry.startsWith("recordReleaseSwitch"))).toHaveLength(1);
    // Once a release is current, a switch without --from is refused: every later one names the release it leaves.
    const second = serverFiles([FIRST, NEW]);
    const later = host([FIRST, NEW], { history: [[FIRST_KEY, "STAGED"], [FIRST_KEY, "CURRENT"], [NEW_KEY, "STAGED"]] });
    expect((await cli(["switch", "--to", "new-v1"], second.layout, later.deps)).err).toMatchObject({ reason: "SWITCH_PRECONDITION_FAILED", fields: ["current"] });
  });

  it("going back before a switch retires the release and disables its instances, so it never starts at boot", async () => {
    // The first release's instances were enabled (`enable --now`) before its switch; it never served.
    const { layout } = serverFiles([FIRST]);
    const h = host([FIRST], { history: [[FIRST_KEY, "STAGED"]] });
    const back = await cli(["rollback", "--before-switch", "--label", "first-v1"], layout, h.deps);
    expect([back.code, back.out]).toEqual([0, { event: "PREVIEW_RELEASE_ROLLED_BACK", beforeSwitch: true, label: "first-v1", releaseKey: FIRST_KEY, outcome: "RETIRED", backstopAt: null, bad: [] }]);
    expect(h.eventLog().at(-1)).toBe("first-v1 RETIRED NOT_SWITCHED");
    expect(h.verbs()).toEqual([
      "stop debateai-runner@first-v1.service debateai-ui@first-v1.service debateai-api@first-v1.service",
      "disable debateai-runner@first-v1.service debateai-ui@first-v1.service debateai-api@first-v1.service"
    ]);
  });

  it("release.mjs status lists the public server's releases from the overlays", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: AFTER_SWITCH, units: { [U("api", "old-v1")]: "inactive", [U("ui", "old-v1")]: "inactive" } });
    const status = await cli(["status"], layout, h.deps);
    expect([status.code, status.err]).toEqual([0, null]);
    expect(status.out).toEqual({ event: "PREVIEW_RELEASE_STATUS", releases: [
      { label: "new-v1", releaseKey: NEW_KEY, slot: "B", state: "CURRENT", frontPairStopped: false, retireRequested: false, units: { api: "active", ui: "active", runner: "active" }, openWork: 0 },
      { label: "old-v1", releaseKey: OLD_KEY, slot: "A", state: "DRAINING", frontPairStopped: true, retireRequested: false, units: { api: "inactive", ui: "inactive", runner: "active" }, openWork: 0 }
    ] });
    // An overlay that sets a value no release may change, or names no slot's API port, is refused, never guessed.
    const extra = serverFiles([OLD], (entry) => `REGISTER_VERSION=19\nRELEASE_KEY=${entry.key}\nAPI_PORT=8790\nDATABASE_URL=elsewhere\n`);
    expect((await cli(["status"], extra.layout, host([OLD]).deps)).err).toMatchObject({ reason: "RELEASE_OVERLAY_REFUSED" });
    const port = serverFiles([OLD], (entry) => `REGISTER_VERSION=19\nRELEASE_KEY=${entry.key}\nAPI_PORT=3101\n`);
    expect((await cli(["status"], port.layout, host([OLD]).deps)).err).toMatchObject({ reason: "RELEASE_OVERLAY_REFUSED" });
    const version = serverFiles([OLD], (entry) => `REGISTER_VERSION=20\nRELEASE_KEY=${entry.key}\nAPI_PORT=8790\n`);
    expect((await cli(["status"], version.layout, host([OLD]).deps)).err).toMatchObject({ reason: "RELEASE_OVERLAY_REFUSED" });
  });

  it("the stop recorder needs only the runner's own retirement line here, and then disables its instance", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: AFTER_SWITCH, units: { [U("runner", "old-v1")]: "inactive" } });
    h.announce(U("runner", "old-v1"));
    const journalled = h.deps.run as (argv: string[], opts: { env: Record<string, string> }) => Promise<ReturnType<typeof result>>;
    h.deps.run = async (argv: string[], opts: { env: Record<string, string> }) => (argv[0] === VPS.journalctl && argv[2] === U("runner", "old-v1")
      ? result(`DEBATEAI_RUNNER_RETIRED ${JSON.stringify({ releaseKey: OLD_KEY })}\n`) : journalled(argv, opts));
    const stopped = await cli(["stopped", "--service", "runner", "--label", "old-v1"], layout, h.deps);
    expect([stopped.code, stopped.out]).toEqual([0, { event: "PREVIEW_RELEASE_STOP_RECORDED", service: "runner", label: "old-v1", releaseKey: OLD_KEY, recorded: "RETIRED", state: "DRAINING" }]);
    expect(h.eventLog().at(-1)).toBe("old-v1 RETIRED RUNNER_RETIRED");
    expect(h.verbs()).toEqual(["disable debateai-runner@old-v1.service"]);
  });

  it("the backstop and the 25-minute check run without gates or a notice unit", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: AFTER_SWITCH });
    const asked = await cli(["retire-request", "--label", "old-v1"], layout, h.deps);
    expect([asked.code, asked.out]).toEqual([0, { event: "PREVIEW_RELEASE_RETIRE_REQUESTED", label: "old-v1", releaseKey: OLD_KEY, notice: "NO_NOTICE_UNIT" }]);
    expect(Object.keys(h.unitFiles)).toEqual(["/etc/systemd/system/debateai-runner-retire-check@old-v1.timer.d/50-at.conf"]);
    expect(h.verbs()).toEqual(["daemon-reload", "enable debateai-runner-retire-check@old-v1.timer", "restart debateai-runner-retire-check@old-v1.timer"]);
    const late = host([OLD, NEW], { history: [...AFTER_SWITCH, [OLD_KEY, "RETIRE_REQUESTED", "BACKSTOP"]], minutesSinceRequest: 26 });
    const checked = await cli(["retire-check", "--label", "old-v1"], layout, late.deps);
    expect([checked.code, checked.out]).toEqual([0, { event: "PREVIEW_RELEASE_FORCED_STOP", label: "old-v1", releaseKey: OLD_KEY, openWork: 0, gatesReactivated: [], gatesReactivationFailed: [], gatesUnknown: [], notice: "NO_NOTICE_UNIT" }]);
    // That one runner, and nothing else: no gate to read or re-open, no notice to start.
    expect(late.verbs()).toEqual(["stop debateai-runner@old-v1.service"]);
  });

  it("the release check reads both release folders and this server's own units and slots", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: [[OLD_KEY, "STAGED"], [OLD_KEY, "CURRENT"]], units: { [U("runner", "new-v1")]: "inactive", [U("api", "new-v1")]: "inactive", [U("ui", "new-v1")]: "inactive" } });
    const check = await cli(["check", "--label", "new-v1"], layout, h.deps);
    expect([check.code, check.err]).toEqual([0, null]);
    expect(check.out.verdict).toBe("SIDE_BY_SIDE");
    expect(Object.fromEntries(check.out.checks.map((entry: { name: string; detail: string }) => [entry.name, entry.detail]))).toEqual({
      N1_HEADERS: "new: 0002_b.sql", CURRENT_PINNED: "old-v1", PREVIOUS_RETIRED: "all retired", GATES_ACTIVE: "no gates on this server",
      GATE_ROWS_N1: "no gates on this server", CONNECTIONS: "max 320, free 307", DISK: "40.0 GB free", MEMORY: "7812 MiB available",
      HATCHET: "active", NO_MAINTENANCE: "none", SLOT_FREE: "slot B", LIFECYCLE_FILES: "the release tools run from the operator checkout"
    });
    // A new step without both n1 lines sends the upload the drained way.
    const drained = serverFiles([OLD, { ...NEW, migrations: { "0001_a.sql": `${N1}SELECT 1;\n`, "0002_b.sql": "SELECT 2;\n" } }]);
    const verdict = await cli(["check", "--label", "new-v1"], drained.layout, h.deps);
    expect([verdict.code, verdict.out.verdict, verdict.out.checks[0]]).toEqual([2, "DRAINED_PATH", { name: "N1_HEADERS", ok: false, detail: "0002_b.sql" }]);
    // Before the first release there is nothing to check against.
    const empty = serverFiles([NEW]);
    expect((await cli(["check", "--label", "new-v1"], empty.layout, host([NEW]).deps)).err).toMatchObject({ reason: "NO_CURRENT_RELEASE" });
  });

  it("the rollback after a switch starts the older release from its own ready lines and switches back", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: AFTER_SWITCH, units: { [U("runner", "old-v1")]: "inactive", [U("api", "old-v1")]: "inactive", [U("ui", "old-v1")]: "inactive" } });
    const back = await cli(["rollback", "--to", "old-v1", "--from", "new-v1"], layout, h.deps);
    expect([back.code, back.err]).toEqual([0, null]);
    expect(back.out).toMatchObject({ event: "PREVIEW_RELEASE_ROLLED_BACK", to: "old-v1", from: "new-v1", started: ["runner", "api", "ui"], bad: [] });
    expect(h.verbs()).toEqual([
      "disable --now debateai-runner-retire@old-v1.timer", "disable --now debateai-runner-retire-check@old-v1.timer",
      "start --no-block debateai-runner@old-v1.service", "start --no-block debateai-api@old-v1.service", "start --no-block debateai-ui@old-v1.service",
      "stop debateai-ui@new-v1.service debateai-api@new-v1.service",
      "daemon-reload", "enable debateai-runner-retire@new-v1.timer", "restart debateai-runner-retire@new-v1.timer",
      "enable debateai-api@old-v1.service debateai-ui@old-v1.service debateai-runner@old-v1.service",
      "disable debateai-api@new-v1.service debateai-ui@new-v1.service"
    ]);
    expect(h.urls).toContain("http://127.0.0.1:3001/readyz");
  });

  it("runs only the commands this server has, as root on Linux, and keeps one switch at a time in its own lock folder", async () => {
    const { layout } = serverFiles([OLD, NEW]);
    const h = host([OLD, NEW], { history: AFTER_SWITCH });
    for (const argv of [[], ["seed", "--label", "new-v1"], ["mark-retired", "--label", "old-v1"], ["receipt", "--label", "old-v1", "--out", "/root/r.json"], ["maintenance"],
      ["check"], ["check", "--label", "../x"], ["status", "--all"], ["switch", "--to", "New"], ["stopped", "--service", "ui", "--label", "old-v1"]]) {
      const refused = await cli(argv, layout, h.deps);
      expect([argv, refused.code, refused.err.reason]).toEqual([argv, 1, "ARGUMENTS_REFUSED"]);
    }
    for (const actor of [{ uid: 1000 }, { platform: "darwin" }]) expect((await cli(["status"], layout, h.deps, actor)).err.reason).toBe("ACTOR_REFUSED");
    expect([h.log, h.psql]).toEqual([[], []]);
    // The switch family takes its lock in this server's lock folder (root's, 0700, created on first use) and lets go.
    const staged = await cli(["stage", "--label", "new-v1"], layout, host([OLD, NEW], { history: [[OLD_KEY, "STAGED"], [OLD_KEY, "CURRENT"]] }).deps);
    expect([staged.code, staged.out.recorded]).toEqual([0, true]);
    expect(readdirSync(layout.lockRoot)).toEqual([]);
    expect(statSync(layout.lockRoot).mode & 0o777).toBe(0o700);
  });
});

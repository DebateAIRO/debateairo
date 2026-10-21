// tests/unit/notify-alarm.test.ts
// B3d (docs/business/2026-10-21-netopia-answers-code-check.md, "Changes to build" 3d): the outside alarm on NETOPIA's
// notify address. Every 5 minutes the server knocks on its own public notify address with the unsigned message
// `pnpm billing:check` already sends, then reports "all good" or "broken" to an outside alarm service (Healthchecks.io)
// that emails the owner when a report says "broken" or stops arriving. The site and the alarm service are scripted
// fetches; the pause between knocks is a recorded no-op.
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { netopiaNoticeAnswer } from "@debateai/payments-netopia";
import {
  KNOCK_TIMEOUT_MS, NOTIFY_PATH, REPORT_RETRY_MS, REPORT_TIMEOUT_MS, REPORT_TRIES, RETRY_DELAY_MS, UNSIGNED_ANSWER,
  knock, main, parseAlarmConfig, runAlarm
} from "../../deploy/notify-alarm/notify-alarm.mjs";
import { NETOPIA_NOTIFY_PATH } from "../../apps/api/src/billing/index.js";

const SITE = "https://v3-preview.dezbatere.test";
const ADDRESS = `${SITE}/api/v1/billing/netopia/notify`;
// A made-up ping link of the alarm service's shape: anyone holding it could send a fake "all good", so it is a secret.
const PING = `https://hc-ping.example.test/${["5f0c3a1e", "8d2b", "4c7a", "9e61", "0b4d2f7c9a13"].join("-")}`;
const CONFIG = Object.freeze({ site: SITE, pingUrl: PING });

type Call = { url: string; method: string; body: string; redirect: string | undefined; signal: boolean; agent: string | null };
type Answer = Response | Error | { type: "opaqueredirect" };

/** A scripted fetch: answers in order, records every call. */
function scripted(answers: Answer[]) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    calls.push({
      url: String(input), method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : String(init.body ?? ""),
      redirect: init.redirect, signal: init.signal instanceof AbortSignal, agent: headers.get("user-agent")
    });
    const answer = answers.shift();
    if (answer === undefined) throw new Error("UNSCRIPTED_FETCH");
    if (answer instanceof Error) throw answer;
    // What a browser-style fetch gives for redirect: "manual"; Node's gives the 3xx itself (the 301 case).
    if (!(answer instanceof Response)) return { type: "opaqueredirect", status: 0, body: null, headers: new Headers() } as unknown as Response;
    return answer;
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const healthy = () => new Response(netopiaNoticeAnswer("NOTICE_HEADER_MISSING").body, {
  status: 503, headers: { "content-type": "application/json" }
});
const received = () => new Response("OK", { status: 200 });
const refused = (code: string) => new TypeError("fetch failed", { cause: Object.assign(new Error("connect"), { code }) });

function io() {
  const out: string[] = [];
  const err: string[] = [];
  const sleeps: number[] = [];
  return {
    out, err, sleeps,
    deps: (fetch: typeof globalThis.fetch) => ({
      fetch, sleep: async (ms: number) => { sleeps.push(ms); }, out: (line: string) => out.push(line), err: (line: string) => err.push(line)
    })
  };
}

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("notify alarm: the knock is the notify route's own unsigned message (pinned to the API)", () => {
  it("knocks on the public notify address the API serves (the website adds /api)", () => {
    expect(NOTIFY_PATH).toBe(`/api${NETOPIA_NOTIFY_PATH}`);
  });

  it("expects exactly the route's answer to a message with no Verification-token", () => {
    const answer = netopiaNoticeAnswer("NOTICE_HEADER_MISSING");
    expect(UNSIGNED_ANSWER.status).toBe(answer.status);
    expect(UNSIGNED_ANSWER.body).toEqual(JSON.parse(answer.body));
  });

  it("a whole run (two knocks, the pause, every report try) ends before the unit's start timeout and the next 5-minute tick", async () => {
    const unit = await readFile(join(import.meta.dirname, "../../deploy/notify-alarm/debateai-notify-alarm.service"), "utf8");
    const timeoutSeconds = Number(/^TimeoutStartSec=(\d+)$/m.exec(unit)?.[1]);
    const worst = 2 * KNOCK_TIMEOUT_MS + RETRY_DELAY_MS + REPORT_TRIES * REPORT_TIMEOUT_MS + (REPORT_TRIES - 1) * REPORT_RETRY_MS;
    expect(worst).toBeLessThan(timeoutSeconds * 1000);
    expect(timeoutSeconds * 1000).toBeLessThan(5 * 60_000);
  });
});

describe("notify alarm: the settings file", () => {
  const text = (value: unknown) => JSON.stringify(value);

  it("takes the site's public origin and the ping link", () => {
    expect(parseAlarmConfig(text(CONFIG))).toEqual({ site: SITE, pingUrl: PING });
    expect(parseAlarmConfig(text({ site: `${SITE}/`, pingUrl: PING }))).toEqual({ site: SITE, pingUrl: PING });
  });

  it("keeps the cleaned-up link, so a space pasted with it cannot break the /fail address", async () => {
    // Review of ec2a0dcad: URL parsing drops a trailing space, but the raw text went into `${pingUrl}/fail`.
    for (const pasted of [`${PING} `, `\t${PING}\t`, `${PING}/`]) {
      const config = parseAlarmConfig(text({ site: SITE, pingUrl: pasted }));
      const run = io();
      const net = scripted([received()]);
      expect(await runAlarm(config, { ...run.deps(net.fetch), testAlarm: true }), JSON.stringify(pasted)).toBe(0);
      expect(net.calls.map(({ url }) => url)).toEqual([`${PING}/fail`]);
    }
  });

  it("refuses anything else with a code that names the field and never the ping link", () => {
    const cases: Array<[unknown, string]> = [
      ["not json", "NOTIFY_ALARM_CONFIG_INVALID"],
      [[CONFIG], "NOTIFY_ALARM_CONFIG_INVALID"],
      [{ site: SITE }, "NOTIFY_ALARM_CONFIG_INVALID:keys"],
      [{ ...CONFIG, email: "owner@example.test" }, "NOTIFY_ALARM_CONFIG_INVALID:keys"],
      [{ site: "http://v3-preview.dezbatere.test", pingUrl: PING }, "NOTIFY_ALARM_CONFIG_INVALID:site"],
      [{ site: `${SITE}/api`, pingUrl: PING }, "NOTIFY_ALARM_CONFIG_INVALID:site"],
      [{ site: `${SITE}/?x=1`, pingUrl: PING }, "NOTIFY_ALARM_CONFIG_INVALID:site"],
      [{ site: "https://user:pw@v3-preview.dezbatere.test", pingUrl: PING }, "NOTIFY_ALARM_CONFIG_INVALID:site"],
      [{ site: 42, pingUrl: PING }, "NOTIFY_ALARM_CONFIG_INVALID:site"],
      [{ site: SITE, pingUrl: PING.replace("https:", "http:") }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: PING.replace("https://", "https://user:pw@") }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: `${PING}?rid=1` }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: `${PING}#x` }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: "https://hc-ping.example.test/" }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      // The owner copied a link with one of the service's own endings: the alarm adds /fail itself.
      [{ site: SITE, pingUrl: `${PING}/fail` }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: `${PING}/start` }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: `${PING}/log` }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: `${PING}/1` }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"],
      [{ site: SITE, pingUrl: `${PING}/${"a".repeat(600)}` }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"]
    ];
    for (const [value, code] of cases) {
      let thrown: unknown;
      try {
        parseAlarmConfig(typeof value === "string" ? value : text(value));
      } catch (error) {
        thrown = error;
      }
      expect(thrown, text(value)).toBeInstanceOf(TypeError);
      expect((thrown as Error).message, text(value)).toBe(code);
      expect((thrown as Error).message).not.toContain("hc-ping");
    }
  });
});

describe("notify alarm: one knock", () => {
  it("sends one POST of an empty body to the notify address, never following a redirect, with a deadline", async () => {
    const site = scripted([healthy()]);
    expect(await knock(SITE, site.fetch)).toEqual({ ok: true });
    expect(site.calls).toEqual([{
      url: ADDRESS, method: "POST", body: "", redirect: "manual", signal: true, agent: "debateai-notify-alarm"
    }]);
  });

  it("names what each wrong answer means, on one line that starts with the address", async () => {
    const cases: Array<[Answer, string, string]> = [
      [new Response(JSON.stringify({ error: "API_UPSTREAM_UNREACHABLE" }), { status: 502 }), "API_DOWN",
        `${ADDRESS} answered HTTP 502: the website answered, but the program behind it did not, so NETOPIA's messages cannot be received.`],
      [new Response("Service Unavailable", { status: 503 }), "API_DOWN",
        `${ADDRESS} answered HTTP 503: the website answered, but the program behind it did not, so NETOPIA's messages cannot be received.`],
      [new Response(`{"errorType":1,"errorCode":268435713,"errorMessage":"retry","pad":"${"x".repeat(1100)}"}`, { status: 503 }), "API_DOWN",
        `${ADDRESS} answered HTTP 503: the website answered, but the program behind it did not, so NETOPIA's messages cannot be received.`],
      [new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }), "NOT_SERVED",
        `${ADDRESS} answered HTTP 404: the site is up, but its program does not serve NETOPIA's address (billing is off, or the program started without NETOPIA's settings).`],
      [new Response("Unauthorized", { status: 401 }), "GATED",
        `${ADDRESS} answered HTTP 401: a password gate or a firewall rule in front of the site blocks NETOPIA's messages.`],
      [new Response("Forbidden", { status: 403 }), "GATED",
        `${ADDRESS} answered HTTP 403: a password gate or a firewall rule in front of the site blocks NETOPIA's messages.`],
      [new Response("{}", { status: 429 }), "BUSY",
        `${ADDRESS} answered HTTP 429: too many messages reached it just now.`],
      [new Response(null, { status: 301, headers: { location: "https://www.dezbatere.test/" } }), "REDIRECT",
        `${ADDRESS} answered with a redirect (HTTP 301): NETOPIA does not follow redirects, so its messages cannot arrive.`],
      [{ type: "opaqueredirect" }, "REDIRECT",
        `${ADDRESS} answered with a redirect: NETOPIA does not follow redirects, so its messages cannot arrive.`],
      [new Response(netopiaNoticeAnswer("NOTICE_HEADER_MISSING").body, { status: 200 }), "UNEXPECTED",
        `${ADDRESS} answered HTTP 200, not the notify address's own answer to an unsigned message (HTTP 503, "retry").`],
      [refused("ECONNREFUSED"), "UNREACHABLE",
        `${ADDRESS} could not be reached (ECONNREFUSED): the server, its network or its web front door may be down.`],
      [refused("CERT_HAS_EXPIRED"), "UNREACHABLE",
        `${ADDRESS} could not be reached (CERT_HAS_EXPIRED): the server, its network or its web front door may be down.`],
      [refused("weird code with spaces"), "UNREACHABLE",
        `${ADDRESS} could not be reached (connection failed): the server, its network or its web front door may be down.`],
      [new DOMException("The operation was aborted due to timeout", "TimeoutError"), "UNREACHABLE",
        `${ADDRESS} could not be reached (no answer within 10 seconds): the server, its network or its web front door may be down.`]
    ];
    for (const [answer, code, reason] of cases) {
      const result = await knock(SITE, scripted([answer]).fetch);
      expect(result, reason).toEqual({ ok: false, code, reason });
      expect(reason).not.toContain("\n");
    }
  });
});

describe("notify alarm: one run (knock, maybe knock again, report)", () => {
  it("reports all good to the ping link after one right answer, with no pause", async () => {
    const run = io();
    const net = scripted([healthy(), received()]);
    expect(await runAlarm(CONFIG, run.deps(net.fetch))).toBe(0);
    expect(net.calls.map(({ url, method }) => `${method} ${url}`)).toEqual([`POST ${ADDRESS}`, `POST ${PING}`]);
    expect(net.calls[1]).toMatchObject({ redirect: "error", signal: true, agent: "debateai-notify-alarm" });
    expect(run.sleeps).toEqual([]);
    expect(run.out).toEqual(["NOTIFY_ALARM_OK"]);
    expect(run.err).toEqual([]);
  });

  it("knocks again after a minute when the first answer is wrong, and reports all good if the second is right", async () => {
    const run = io();
    const net = scripted([new Response("Bad Gateway", { status: 502 }), healthy(), received()]);
    expect(await runAlarm(CONFIG, run.deps(net.fetch))).toBe(0);
    expect(net.calls.map(({ url }) => url)).toEqual([ADDRESS, ADDRESS, PING]);
    expect(run.sleeps).toEqual([RETRY_DELAY_MS]);
    expect(RETRY_DELAY_MS).toBe(60_000);
    expect(run.out).toEqual(["NOTIFY_ALARM_OK first_knock=API_DOWN"]);
  });

  it("reports broken to the ping link's /fail address, with the second answer's plain reason, after two wrong answers", async () => {
    const run = io();
    const net = scripted([refused("ECONNREFUSED"), new Response("Bad Gateway", { status: 502 }), received()]);
    expect(await runAlarm(CONFIG, run.deps(net.fetch))).toBe(0);
    expect(net.calls.map(({ url, method }) => `${method} ${url}`)).toEqual([`POST ${ADDRESS}`, `POST ${ADDRESS}`, `POST ${PING}/fail`]);
    const reason = `${ADDRESS} answered HTTP 502: the website answered, but the program behind it did not, so NETOPIA's messages cannot be received.`;
    expect(net.calls[2]!.body).toBe(reason);
    expect(run.out).toEqual([`NOTIFY_ALARM_DOWN API_DOWN ${reason}`]);
  });

  it("tries the report three times, 5 seconds apart, and exits 3 when the alarm service never takes it", async () => {
    for (const answers of [
      [refused("ENOTFOUND"), refused("ENOTFOUND"), refused("ENOTFOUND")],
      [new Response("x", { status: 500 }), new Response("x", { status: 502 }), new Response("x", { status: 404 })]
    ]) {
      const run = io();
      const net = scripted([healthy(), ...answers]);
      expect(await runAlarm(CONFIG, run.deps(net.fetch))).toBe(3);
      expect(net.calls.map(({ url }) => url)).toEqual([ADDRESS, PING, PING, PING]);
      expect(REPORT_TRIES).toBe(3);
      expect(run.sleeps).toEqual([REPORT_RETRY_MS, REPORT_RETRY_MS]);
      expect(REPORT_RETRY_MS).toBe(5_000);
      expect(run.out).toEqual(["NOTIFY_ALARM_OK"]);
      expect(run.err).toEqual(["NOTIFY_ALARM_REPORT_FAILED: the alarm service did not take the report; it emails the owner when reports stop arriving."]);
    }
  });

  it("lets go of every answer's body it does not read, the site's and the alarm service's", async () => {
    const cancelled: string[] = [];
    const answer = (name: string, status: number) => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new TextEncoder().encode("x")); },
      cancel() { cancelled.push(name); }
    }), { status });
    const run = io();
    const net = scripted([answer("site 502", 502), answer("site 404", 404), answer("ping 200", 200)]);
    expect(await runAlarm(CONFIG, run.deps(net.fetch))).toBe(0);
    expect(cancelled).toEqual(["site 502", "site 404", "ping 200"]);
  });

  it("is content with a report taken on the second try", async () => {
    const run = io();
    const net = scripted([healthy(), new Response("x", { status: 503 }), received()]);
    expect(await runAlarm(CONFIG, run.deps(net.fetch))).toBe(0);
    expect(run.err).toEqual([]);
  });

  it("sends a test alarm without knocking, so the owner can see the email arrive", async () => {
    const run = io();
    const net = scripted([received()]);
    expect(await runAlarm(CONFIG, { ...run.deps(net.fetch), testAlarm: true })).toBe(0);
    expect(net.calls.map(({ url, method }) => `${method} ${url}`)).toEqual([`POST ${PING}/fail`]);
    expect(net.calls[0]!.body).toBe(
      "TEST: this is a test of the alarm on NETOPIA's notify address, sent by hand. Nothing is wrong. The next check, within 5 minutes, sends the \"back up\" email."
    );
    expect(run.out).toEqual(["NOTIFY_ALARM_TEST_SENT"]);
  });

  it("exits 3 when the test alarm is not taken either", async () => {
    const run = io();
    const net = scripted([refused("ENOTFOUND"), refused("ENOTFOUND"), refused("ENOTFOUND")]);
    expect(await runAlarm(CONFIG, { ...run.deps(net.fetch), testAlarm: true })).toBe(3);
    expect(net.calls.map(({ url }) => url)).toEqual([`${PING}/fail`, `${PING}/fail`, `${PING}/fail`]);
    expect(run.out).toEqual([]);
    expect(run.err).toEqual(["NOTIFY_ALARM_REPORT_FAILED: the alarm service did not take the report; it emails the owner when reports stop arriving."]);
  });

  it("never writes the ping link to the log, whatever happens", async () => {
    const failing = () => [refused("EAI_AGAIN"), refused("EAI_AGAIN"), refused("EAI_AGAIN")];
    for (const [answers, testAlarm] of [
      [[healthy(), received()], false],
      [[refused("ECONNRESET"), refused("ECONNRESET"), ...failing()], false],
      [[healthy(), ...failing()], false],
      [[received()], true],
      [failing(), true]
    ] as Array<[Answer[], boolean]>) {
      const run = io();
      await runAlarm(CONFIG, { ...run.deps(scripted(answers).fetch), testAlarm });
      expect([...run.out, ...run.err].length).toBeGreaterThan(0);
      for (const line of [...run.out, ...run.err]) expect(line).not.toContain("hc-ping");
    }
  });
});

describe("notify alarm: the command", () => {
  async function settings(value: unknown, mode = 0o600): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "notify-alarm-"));
    directories.push(directory);
    const path = join(directory, "notify-alarm");
    await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
    await chmod(path, mode);
    return directory;
  }

  it("reads its settings from the systemd credential named notify-alarm", async () => {
    const run = io();
    const net = scripted([healthy(), received()]);
    const directory = await settings(CONFIG);
    expect(await main([], { CREDENTIALS_DIRECTORY: directory }, run.deps(net.fetch))).toBe(0);
    expect(net.calls.map(({ url }) => url)).toEqual([ADDRESS, PING]);
  });

  it("takes --config with an absolute path for a run by hand, and --test-alarm", async () => {
    const run = io();
    const net = scripted([received()]);
    const directory = await settings(CONFIG);
    expect(await main(["--test-alarm", "--config", join(directory, "notify-alarm")], {}, run.deps(net.fetch))).toBe(0);
    expect(net.calls.map(({ url }) => url)).toEqual([`${PING}/fail`]);
  });

  it("exits 2 with a code, without any request, for a wrong argument or missing, oversized or wrong settings", async () => {
    const good = await settings(CONFIG);
    const big = await settings(`{"site":"${SITE}","pingUrl":"${PING}","pad":"${"x".repeat(5000)}"}`);
    const wrong = await settings({ site: SITE, pingUrl: PING.replace("https:", "http:") });
    const cases: Array<[string[], Record<string, string>, string]> = [
      [["--loud"], { CREDENTIALS_DIRECTORY: good }, "NOTIFY_ALARM_USAGE"],
      [["--config"], {}, "NOTIFY_ALARM_USAGE"],
      [["--config", "relative/notify-alarm"], {}, "NOTIFY_ALARM_USAGE"],
      [[], {}, "NOTIFY_ALARM_CONFIG_MISSING"],
      [[], { CREDENTIALS_DIRECTORY: "relative" }, "NOTIFY_ALARM_CONFIG_MISSING"],
      [[], { CREDENTIALS_DIRECTORY: join(good, "nowhere") }, "NOTIFY_ALARM_CONFIG_UNREADABLE"],
      [[], { CREDENTIALS_DIRECTORY: big }, "NOTIFY_ALARM_CONFIG_TOO_LARGE"],
      [[], { CREDENTIALS_DIRECTORY: wrong }, "NOTIFY_ALARM_CONFIG_INVALID:pingUrl"]
    ];
    for (const [argv, environment, code] of cases) {
      const run = io();
      const net = scripted([]);
      expect(await main(argv, environment, run.deps(net.fetch)), code).toBe(2);
      expect(net.calls).toEqual([]);
      expect(run.err).toEqual([code]);
    }
  });
});

describe("notify alarm: the systemd files", () => {
  const read = (name: string) => readFile(join(import.meta.dirname, "../../deploy/notify-alarm", name), "utf8");

  it("runs once per tick as a throwaway user that holds only its own settings, with the hardening floor", async () => {
    const unit = await read("debateai-notify-alarm.service");
    for (const line of [
      "Type=oneshot", "DynamicUser=yes", "LoadCredential=notify-alarm:/etc/debateai-notify-alarm/config.json",
      "ExecStart=/usr/bin/node /usr/local/lib/debateai-notify-alarm/notify-alarm.mjs",
      "NoNewPrivileges=true", "ProtectSystem=strict", "ProtectHome=true", "PrivateTmp=true", "PrivateDevices=true",
      "ProtectProc=invisible", "ProcSubset=pid", "ProtectKernelTunables=true", "ProtectKernelModules=true",
      "ProtectControlGroups=true", "RestrictSUIDSGID=true", "LockPersonality=true", "CapabilityBoundingSet=",
      "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6", "UMask=0077",
      // The repository's other Node units' margins (deploy/social/debateai-social.service).
      "LimitNOFILE=256", "TasksMax=32"
    ]) expect(unit, line).toMatch(new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
    // No application secret, no fixed user, no email path of its own: the alarm service sends the emails.
    expect(unit).not.toMatch(/^(EnvironmentFile|User|Group|SupplementaryGroups|OnFailure)=/m);
    expect(unit).not.toContain("MemoryDenyWriteExecute=true");
    expect(unit).toMatch(/^InaccessiblePaths=.*-\/etc\/debateai .*-\/var\/lib\/debateai /m);
  });

  it("ticks every 5 minutes, the period the alarm service expects", async () => {
    const timer = await read("debateai-notify-alarm.timer");
    expect(timer).toMatch(/^OnCalendar=\*:0\/5$/m);
    expect(timer).toMatch(/^Unit=debateai-notify-alarm\.service$/m);
    expect(timer).toMatch(/^WantedBy=timers\.target$/m);
    expect(timer).not.toMatch(/^Persistent=true$/m);
  });
});

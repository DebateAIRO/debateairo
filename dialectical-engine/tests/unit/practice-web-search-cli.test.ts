// V4 start step, Task 91f (owner 9 Nov, "Fix the practice first"; "It also needs the search connection on the relay"): a real
// `--start-step premium:N` practice debate searches through the relayed web-search gate socket, held to the gate rules the other two
// gates are held to: the forwarded socket (PRACTICE_PERPLEXITY_SOCKET), root's fresh status (--gate-status-perplexity: active, fewer
// than three connection failures in a row), the gate's own "what is left today" (open), and its own RPC port for the searches. Each
// is refused plainly, naming the env key or the flag, before anything is spent. Free never searches, and a practice without
// --start-step is today's. The gate builders are stand-ins here and the debate itself is not run (it is caught as it starts):
// nothing is sent, no socket is opened; every value is made up.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPreviewBudgetRpcPort, PREVIEW_REVIEWED_PROVIDER_REFS, previewTargetJsonRow, type PreviewGateRemaining
} from "@debateai/providers";
import { practiceRemainingPorts, practiceSearchRemainingPort } from "../../tools/preview-practice/practice-ask-composition.js";
import { runPracticeDebate } from "../../tools/preview-practice/practice-debate.js";
import { OPENINGS_DRY_MODELS } from "../../tools/preview-practice/practice-openings-dry.js";
import {
  practiceSearchSocketFromEnvironment, practiceSocketsFromEnvironment
} from "../../tools/preview-practice/practice-settings.js";
import { parsePracticeArgs, runPractice } from "../../tools/preview-practice/practice.js";

vi.mock("@debateai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("@debateai/providers")>();
  return { ...real, createPreviewBudgetRpcPort: vi.fn() };
});
vi.mock("../../tools/preview-practice/practice-ask-composition.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/preview-practice/practice-ask-composition.js")>();
  return { ...real, practiceRemainingPorts: vi.fn(), practiceSearchRemainingPort: vi.fn() };
});
vi.mock("../../tools/preview-practice/practice-settings.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/preview-practice/practice-settings.js")>();
  // The env keys and paths are still checked; only "is it a socket on this disk" is answered yes.
  return { ...real, practiceSocketsFromEnvironment: vi.fn((env: never) => real.practiceSocketsFromEnvironment(env, () => true)),
    practiceSearchSocketFromEnvironment: vi.fn((env: never, sockets: never) => real.practiceSearchSocketFromEnvironment(env, sockets, () => true)) };
});
vi.mock("../../tools/preview-practice/practice-debate.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../tools/preview-practice/practice-debate.js")>();
  // The debate is caught as it starts: what it was handed is kept, nothing runs.
  return { ...real, runPracticeDebate: vi.fn(async () => { throw Object.assign(new Error("caught"), { code: "TEST_DEBATE_STARTED" }); }) };
});

const SEARCH_SOCKET_ON_SERVER = "/run/debateai-v3-preview/perplexity-budget-v1.sock";
const ENV = Object.freeze({ PRACTICE_ACK: "spends-real-money", PRACTICE_DEEPINFRA_SOCKET: "/x/deepinfra.sock",
  PRACTICE_ANTHROPIC_SOCKET: "/x/anthropic.sock", PRACTICE_PERPLEXITY_SOCKET: "/x/perplexity.sock" });
const quiet = { sleep: async () => undefined, wait: async () => undefined };
const open = (state: PreviewGateRemaining["state"] = "active"): PreviewGateRemaining => Object.freeze({ state, windowOpen: true, remainingNanoUsd: 5_000_000_000n,
  remainingCalls: 1_000, maxConcurrentCalls: 4, largestReservationNanoUsd: 50_000_000n, enabledModels: [...OPENINGS_DRY_MODELS] });
const folders: string[] = [];
let folder: string;

beforeEach(() => {
  vi.clearAllMocks();
  folder = mkdtempSync(join(tmpdir(), "pp-web-search-"));
  folders.push(folder);
  vi.mocked(createPreviewBudgetRpcPort).mockImplementation((_settings, socket) => Object.freeze({ socket,
    execute: async () => { throw new Error("NEVER_SENT_IN_THIS_TEST"); } }) as never);
  vi.mocked(practiceRemainingPorts).mockImplementation(() => Object.freeze({ deepinfra: async () => open(), anthropic: async () => open() }));
  vi.mocked(practiceSearchRemainingPort).mockImplementation(() => async () => open());
});
afterEach(() => { for (const one of folders.splice(0)) rmSync(one, { recursive: true, force: true }); });

/** The live settings file (README S-2, the search gate's socket named or not), the export (S-1) and each gate's status (S-3). */
function files(options: Readonly<{ searchGate: boolean; searchStatus?: unknown }>): string[] {
  const config = { deployment: "v3-preview", free_model_ids: OPENINGS_DRY_MODELS.slice(0, 2), premium_model_ids: OPENINGS_DRY_MODELS,
    requested_thinking_level: "high", budget_socket: "/run/debateai-v3-preview/deepinfra-budget-v3.sock",
    anthropic_budget_socket: "/run/debateai-v3-preview/anthropic-budget-v1.sock", scope_id: "preview-practice-web-test",
    ...(options.searchGate ? { perplexity_budget_socket: SEARCH_SOCKET_ON_SERVER } : {}) };
  writeFileSync(join(folder, "settings.env"), [
    `PREVIEW_PROVIDER_TEST_CONFIG_JSON=${JSON.stringify(config)}`,
    `PROVIDER_DISCOVERY_TARGETS_JSON=${JSON.stringify(PREVIEW_REVIEWED_PROVIDER_REFS.map(previewTargetJsonRow))}`,
    "REGISTER_VERSION=5", "DEBATEAI_DEPLOYMENT_MODE=local", "NODE_ENV=production", "CLAIM_MS=4000000", "CLAIM_MARGIN_MS=60000",
    "MAX_RECOMPOSE=1", "JUDGEMENT_NUMBER_KIND=base-probability", "JUDGEMENT_PRODUCER=judgement:preview-practice-test",
    "PROPAGATION_NUMBER_KIND=propagated-probability", "PROPAGATION_PRODUCER=propagation:preview-practice-test",
    "PROVIDER_REF=preview:fixture-a", "STRANGER_SAMPLE_RATE=0", "BATTERY_VERSION=s00",
    "SETTLEMENT_WATCH_HANDLE=settlement-watch:preview-practice-test", ""].join("\n"));
  writeFileSync(join(folder, "register-export.json"), JSON.stringify({ schema: "preview-practice-register-export-v1",
    versions: [{ register_version: "5", row_count: 1, base_register_version: null, publication_id: null, request_sha256: null,
      snapshot_sha256: null, publication_kind: null, recorded_at: null }],
    rows: [{ register_version: "5", row_key: "alpha", value_json: "1", source_ref: "live" }] }));
  writeFileSync(join(folder, "status.json"), JSON.stringify({ state: "active", unsent_streak: 0, halts: 0 }));
  writeFileSync(join(folder, "perplexity-status.json"), JSON.stringify(options.searchStatus ?? { state: "active", unsent_streak: 0, halts: 0 }));
  return ["--settings", join(folder, "settings.env"), "--register-export", join(folder, "register-export.json"),
    "--gate-status-deepinfra", join(folder, "status.json"), "--gate-status-anthropic", join(folder, "status.json"),
    "--out", join(folder, "out")];
}
const searchStatus = () => ["--gate-status-perplexity", join(folder, "perplexity-status.json")];
async function practise(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = ENV) {
  const logged: string[] = [];
  const outcome = await runPractice(["debate", ...argv], env, { ...quiet, log: (line) => logged.push(line) });
  const handed = vi.mocked(runPracticeDebate).mock.calls[0]?.[0];
  return { reasons: outcome.report.reasons, logged, handed };
}
const nothingAsked = () => {
  expect(vi.mocked(createPreviewBudgetRpcPort)).not.toHaveBeenCalled();
  expect(vi.mocked(practiceRemainingPorts)).not.toHaveBeenCalled();
  expect(vi.mocked(practiceSearchRemainingPort)).not.toHaveBeenCalled();
  expect(vi.mocked(runPracticeDebate)).not.toHaveBeenCalled();
};

describe("Task 91f: the forwarded web-search socket", () => {
  const sockets = { deepinfra: "/x/deepinfra.sock", anthropic: "/x/anthropic.sock" };
  const isSocket = (path: string) => path.startsWith("/x/");
  it("is PRACTICE_PERPLEXITY_SOCKET: given, absolute, a socket, and none of the other two", async () => {
    const real = await vi.importActual<typeof import("../../tools/preview-practice/practice-settings.js")>("../../tools/preview-practice/practice-settings.js");
    expect(real.practiceSearchSocketFromEnvironment(ENV, sockets, isSocket)).toBe("/x/perplexity.sock");
    expect(() => real.practiceSearchSocketFromEnvironment({ ...ENV, PRACTICE_PERPLEXITY_SOCKET: undefined }, sockets, isSocket))
      .toThrow("PRACTICE_SOCKET_MISSING: PRACTICE_PERPLEXITY_SOCKET");
    expect(() => real.practiceSearchSocketFromEnvironment({ ...ENV, PRACTICE_PERPLEXITY_SOCKET: "perplexity.sock" }, sockets, isSocket))
      .toThrow("PRACTICE_SOCKET_NOT_ABSOLUTE: PRACTICE_PERPLEXITY_SOCKET");
    expect(() => real.practiceSearchSocketFromEnvironment({ ...ENV, PRACTICE_PERPLEXITY_SOCKET: "/y/perplexity.sock" }, sockets, isSocket))
      .toThrow("PRACTICE_SOCKET_NOT_FOUND: PRACTICE_PERPLEXITY_SOCKET");
    expect(() => real.practiceSearchSocketFromEnvironment({ ...ENV, PRACTICE_PERPLEXITY_SOCKET: "/x/anthropic.sock" }, sockets, isSocket))
      .toThrow("PRACTICE_SOCKETS_SAME");
  });

  it("--gate-status-perplexity is a debate flag the tool reads", () => {
    expect(parsePracticeArgs(["debate", "--gate-status-perplexity", "/p/perplexity-status.json"]).flags.get("--gate-status-perplexity"))
      .toBe("/p/perplexity-status.json");
  });
});

describe("Task 91f: a real premium start-step debate, where the settings name a search gate", () => {
  it("is refused before anything is asked without PRACTICE_PERPLEXITY_SOCKET, naming the env key", async () => {
    const { reasons, logged } = await practise([...files({ searchGate: true }), ...searchStatus(), "--start-step", "premium:5"],
      { ...ENV, PRACTICE_PERPLEXITY_SOCKET: undefined });
    expect(reasons).toEqual(["HARNESS_ERROR:PRACTICE_SOCKET_MISSING"]);
    expect(logged.join("\n")).toContain("practice could not run: PRACTICE_SOCKET_MISSING: PRACTICE_PERPLEXITY_SOCKET");
    nothingAsked();
  });

  it("is refused before anything is asked without --gate-status-perplexity, naming the flag", async () => {
    const { reasons, logged } = await practise([...files({ searchGate: true }), "--start-step", "premium:5"]);
    expect(reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_REQUIRED"]);
    expect(logged.join("\n")).toContain("practice could not run: PRACTICE_FLAG_REQUIRED: --gate-status-perplexity");
    nothingAsked();
  });

  it("root's status of the search gate is held to the same start rule: active, fewer than three failures in a row", async () => {
    const halted = await practise([...files({ searchGate: true, searchStatus: { state: "halted", unsent_streak: 0 } }), ...searchStatus(),
      "--start-step", "premium:5"]);
    expect(halted.reasons).toEqual(["HARNESS_ERROR:PRACTICE_GATE_NOT_ACTIVE"]);
    expect(halted.logged.join("\n")).toContain("PRACTICE_GATE_NOT_ACTIVE: perplexity: halted");
    const streak = await practise([...files({ searchGate: true, searchStatus: { state: "active", unsent_streak: 3 } }), ...searchStatus(),
      "--start-step", "premium:5"]);
    expect(streak.reasons).toEqual(["HARNESS_ERROR:PRACTICE_GATE_UNSENT_STREAK_TOO_HIGH"]);
    nothingAsked();
  });

  it("the search gate's own \"what is left today\" must be open before anything paid is sent", async () => {
    vi.mocked(practiceSearchRemainingPort).mockImplementation(() => async () => open("halted"));
    const { reasons, logged } = await practise([...files({ searchGate: true }), ...searchStatus(), "--start-step", "premium:5"]);
    expect(reasons).toEqual(["HARNESS_ERROR:PRACTICE_GATE_NOT_OPEN"]);
    expect(logged.join("\n")).toContain("PRACTICE_GATE_NOT_OPEN: perplexity: halted");
    expect(vi.mocked(practiceSearchRemainingPort).mock.calls[0]?.[1]).toBe(ENV.PRACTICE_PERPLEXITY_SOCKET);
    expect(vi.mocked(runPracticeDebate)).not.toHaveBeenCalled();
    vi.mocked(practiceSearchRemainingPort).mockImplementation(() => async () => { throw new Error("no answer"); });
    const unreachable = await practise([...files({ searchGate: true }), ...searchStatus(), "--start-step", "premium:5"]);
    expect(unreachable.reasons).toEqual(["HARNESS_ERROR:PRACTICE_GATE_UNREACHABLE"]);
  });

  it("the debate gets the search gate's own port on the forwarded socket, beside the other two, and says it searches", async () => {
    const { reasons, logged, handed } = await practise([...files({ searchGate: true }), ...searchStatus(), "--start-step", "premium:5"]);
    expect(reasons).toEqual(["HARNESS_ERROR:TEST_DEBATE_STARTED"]);
    const built = vi.mocked(createPreviewBudgetRpcPort).mock.calls.map((call) => call[1]);
    expect(built).toEqual([ENV.PRACTICE_DEEPINFRA_SOCKET, ENV.PRACTICE_ANTHROPIC_SOCKET, ENV.PRACTICE_PERPLEXITY_SOCKET]);
    expect(vi.mocked(createPreviewBudgetRpcPort).mock.calls[2]![0]).toMatchObject({ perplexity_budget_socket: SEARCH_SOCKET_ON_SERVER });
    expect((handed!.budgetPorts.perplexity as unknown as { socket: string }).socket).toBe(ENV.PRACTICE_PERPLEXITY_SOCKET);
    expect(Object.keys(handed!.budgetPorts).sort()).toEqual(["anthropic", "deepinfra", "perplexity"]);
    expect(handed!.start).toEqual({ plan: "premium", paths: 5, digs: 0 });
    expect(logged).toContain("web: this Plus debate searches the web through the search gate (perplexity), as the site's runner does for a Plus run");
  });
});

describe("Task 91f: every other practice debate needs no search gate", () => {
  it("free:3 never searches: no search socket or status asked (the flag is refused), no search port", async () => {
    const { reasons, handed } = await practise([...files({ searchGate: true }), "--start-step", "free:3"],
      { ...ENV, PRACTICE_PERPLEXITY_SOCKET: undefined });
    expect(reasons).toEqual(["HARNESS_ERROR:TEST_DEBATE_STARTED"]);
    expect(Object.keys(handed!.budgetPorts).sort()).toEqual(["anthropic", "deepinfra"]);
    expect(vi.mocked(practiceSearchRemainingPort)).not.toHaveBeenCalled();
    vi.clearAllMocks();
    const flagged = await practise([...files({ searchGate: true }), ...searchStatus(), "--start-step", "free:3"]);
    expect(flagged.reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"]);
    expect(flagged.logged.join("\n")).toContain("--gate-status-perplexity (a --start-step premium debate only");
    nothingAsked();
  });

  it("no --start-step: today's debate command, byte for byte (no search socket, status or port)", async () => {
    const { reasons, handed } = await practise(files({ searchGate: true }), { ...ENV, PRACTICE_PERPLEXITY_SOCKET: undefined });
    expect(reasons).toEqual(["HARNESS_ERROR:TEST_DEBATE_STARTED"]);
    expect(Object.keys(handed!.budgetPorts).sort()).toEqual(["anthropic", "deepinfra"]);
    expect(handed).not.toHaveProperty("start");
  });

  // Review of Task 91f (coordinator ruling, 9 Nov): the owner chose this fix so that the Plus run searches, so a premium start-step
  // debate whose settings name no search gate is REFUSED with a typed code before anything is spent, never run with its paths
  // SWITCHED_OFF; with or without the search socket and status flag.
  it("premium where the settings name no search gate: refused before anything is asked (PRACTICE_SEARCH_GATE_REQUIRED)", async () => {
    for (const [extra, env] of [[[], { ...ENV, PRACTICE_PERPLEXITY_SOCKET: undefined }], [searchStatus(), ENV]] as const) {
      vi.clearAllMocks();
      const { reasons, logged } = await practise([...files({ searchGate: false }), ...extra, "--start-step", "premium:5"], env);
      expect(reasons).toEqual(["HARNESS_ERROR:PRACTICE_SEARCH_GATE_REQUIRED"]);
      expect(logged.join("\n")).toContain("practice could not run: PRACTICE_SEARCH_GATE_REQUIRED: "
        + "the settings name no search gate (perplexity_budget_socket in PREVIEW_PROVIDER_TEST_CONFIG_JSON)");
      expect(logged.some((line) => line.startsWith("web: "))).toBe(false);
      nothingAsked();
    }
  });

  it("free and no --start-step on settings with no search gate: today's commands, unchanged (no refusal)", async () => {
    const free = await practise([...files({ searchGate: false }), "--start-step", "free:3"], { ...ENV, PRACTICE_PERPLEXITY_SOCKET: undefined });
    expect(free.reasons).toEqual(["HARNESS_ERROR:TEST_DEBATE_STARTED"]);
    vi.clearAllMocks();
    const plain = await practise(files({ searchGate: false }), { ...ENV, PRACTICE_PERPLEXITY_SOCKET: undefined });
    expect(plain.reasons).toEqual(["HARNESS_ERROR:TEST_DEBATE_STARTED"]);
    expect(Object.keys(plain.handed!.budgetPorts).sort()).toEqual(["anthropic", "deepinfra"]);
  });

  it("the README's sitting: the relay names the search gate, the forward its socket, S-3 its status, the Plus run all three", () => {
    const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const lines = readme.split("\n");
    // S-4: the relay command for the start-step sitting relays the search gate as perplexity.sock.
    const relay = lines.filter((line) => line.startsWith("systemd-run --unit=debateai-preview-practice-relay ")
      && line.endsWith(` --perplexity-gate ${SEARCH_SOCKET_ON_SERVER}`));
    expect(relay).toHaveLength(1);
    // S-5: the forward with the third socket.
    expect(lines.some((line) => line.startsWith("ssh -N ") && line.includes('-L "$D/perplexity.sock:/run/debateai-practice/perplexity.sock"'))).toBe(true);
    // S-3: root's status of the search gate, into the file the Plus run reads.
    expect(lines.some((line) => line.includes("perplexity-budget-v1/preview_budget_authority.py status --private "
      + "/var/lib/debateai-v3-preview/provider-perplexity-authority-v1 > /root/practice/perplexity-status.json"))).toBe(true);
    // S-6: the Plus start-step command carries the socket env and the status flag, and parses as a premium start.
    const plus = lines.filter((line) => line.includes("tools/preview-practice/practice.ts debate ") && line.includes("--start-step premium:5"));
    expect(plus).toHaveLength(1);
    expect(plus[0]).toContain('PRACTICE_PERPLEXITY_SOCKET="$D/perplexity.sock" ');
    expect(plus[0]).toContain('--gate-status-perplexity "$P/perplexity-status.json"');
    const args = parsePracticeArgs(plus[0]!.slice(plus[0]!.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
      .map((word) => word.replace(/^"(.*)"$/u, "$1")));
    expect(args.flags.get("--start-step")).toBe("premium:5");
    // Money and time: the Plus practice debate now searches (the planning figures the brief allows).
    expect(readme).toMatch(/start-step Plus debate[^\n]*searches the web[^\n]*\n?[^\n]*about \$1\.34 more[^\n]*\n?[^\n]*about \$0\.25 likely/u);
    // Review of Task 91f: settings with no search gate refuse the Plus run (the coordinator's ruling), and the README says so.
    expect(readme).toContain("`PRACTICE_SEARCH_GATE_REQUIRED`");
    expect(readme).not.toContain("the paths are SWITCHED_OFF in the report's web table");
  });

  // Review of Task 91f: S-0 prints the relay's digest on the Mac and S-4 checks it on the server; a README digest that is not the
  // relay's own (the one before --perplexity-gate, W1-1) stops the sitting at S-0, or installs a relay that has no third socket.
  it("the relay digest the README pins (S-0 and S-4) is gate-relay.py's own", () => {
    const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
    const relay = createHash("sha256").update(readFileSync(new URL("../../tools/preview-practice/gate-relay.py", import.meta.url))).digest("hex");
    const pinned = [...readme.matchAll(/digest printed must be `([0-9a-f]{64})`/gu)].map((match) => match[1]);
    expect(pinned).toEqual([relay, relay]);
  });

  it("the search status flag is debate mode's only", async () => {
    const outcome = await runPractice(["formats", "--gate-status-perplexity", "/p/s.json"], ENV, { log: () => undefined });
    expect(outcome.report.reasons).toEqual(["HARNESS_ERROR:PRACTICE_FLAG_VALUE_INVALID"]);
  });
});

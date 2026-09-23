/**
 * REV-S03-p1-security-data-safety — probe F: what a SLOT REMOVAL does to api.env at cc014550.
 * Scratch mkdtemp root, this seat's own fake values only. The repository's .local/** is never read.
 * Temporary: deleted before the seat's handoff.
 */
import { mkdtemp, mkdir, writeFile, chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { assembleDevelopmentApiEnvironment } from "../../apps/runner/src/dev-api-environment.js";
import {
  createDevelopmentDeploymentRegisterMachineReceipt,
  writeDevelopmentDeploymentRegisterReceipt
} from "../../apps/runner/src/dev-deployment-register.js";
import {
  parseDevelopmentProviderPanelTargets,
  type DevelopmentConfiguredProvider
} from "../../apps/runner/src/dev-provider-panel.js";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "../../apps/runner/src/dev-database-principals.js";

const FAKE = "FAKEKEY-rev-s03-p1-security-DO-NOT-USE";
const SUPPORT_TARGET_JSON = JSON.stringify({
  provider_ref: "development:hermes-glm-5.3-flash",
  base_url: "http://127.0.0.1:8794/v1",
  model: "z-ai/glm-5.3-flash",
  authorization_header: `Bearer ${FAKE}-support`
});

const SLOTS = {
  openaiPremium: {
    providerRef: "development:openai-premium-api",
    maker: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.6-sol"
  },
  zaiPremium: {
    providerRef: "development:zai-premium-api",
    maker: "Z.AI",
    baseUrl: "https://api.z.ai/api/coding/paas/v4",
    model: "glm-5.3-pro"
  },
  openaiFree: {
    providerRef: "development:openai-free-api",
    maker: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.6-luna"
  }
} as const;

type SlotName = keyof typeof SLOTS;

function panelFor(names: readonly SlotName[]) {
  const configured: DevelopmentConfiguredProvider[] = names.map((name) => ({
    providerRef: SLOTS[name].providerRef,
    adapterKind: "openai-compatible-http" as const,
    maker: SLOTS[name].maker
  }));
  const rows = names.map((name) => ({
    provider_ref: SLOTS[name].providerRef,
    base_url: SLOTS[name].baseUrl,
    model: SLOTS[name].model,
    authorization_header: `Bearer ${FAKE}-${name}`
  }));
  return parseDevelopmentProviderPanelTargets(JSON.stringify(rows), configured);
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rev-s03-p1-sec-"));
  const custody = join(root, ".local", "dev-auth");
  await mkdir(join(root, ".local"), { mode: 0o700 });
  await chmod(join(root, ".local"), 0o700);
  await mkdir(custody, { mode: 0o700 });
  await chmod(custody, 0o700);
  for (const directory of ["secrets", "audit-keys", "user-deks", "publication-keys", "mail"]) {
    await mkdir(join(custody, directory), { mode: 0o700 });
    await chmod(join(custody, directory), 0o700);
  }
  for (const secret of [
    "kek.bin", "support-kek.bin", "corpus-kek.bin", "blind-index-key.bin", "audit-source-ip-salt.bin"
  ]) {
    const path = join(custody, "secrets", secret);
    await writeFile(path, Buffer.alloc(32, 0x7a), { mode: 0o600 });
    await chmod(path, 0o600);
  }
  const principals = DEVELOPMENT_DATABASE_PRINCIPALS.map((principal, index) =>
    `${principal.environmentKey}=postgres://${principal.roleName}:` +
    `fakepassword${String(index).padStart(2, "0")}0123456789abcdef0123456789@127.0.0.1:55432/debateai`
  ).join("\n") + "\n";
  await writeFile(join(custody, "database-principals.env"), principals, { mode: 0o600 });
  await chmod(join(custody, "database-principals.env"), 0o600);
  const token = [
    base64url(JSON.stringify({ alg: "none", typ: "JWT" })),
    base64url(JSON.stringify({
      sub: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      server_url: "http://localhost:8888",
      grpc_broadcast_address: "localhost:7077"
    })),
    "ZmFrZXNpZ25hdHVyZQ"
  ].join(".");
  await writeFile(join(custody, "hatchet.env"), `HATCHET_CLIENT_TOKEN=${token}\n`, { mode: 0o600 });
  await chmod(join(custody, "hatchet.env"), 0o600);
  return root;
}

async function stampReceipt(root: string, version: string): Promise<ReturnType<typeof createDevelopmentDeploymentRegisterMachineReceipt>> {
  const receipt = createDevelopmentDeploymentRegisterMachineReceipt({
    registerVersion: version as never,
    rowCount: 20,
    snapshotSha256: "a".repeat(64)
  });
  await writeDevelopmentDeploymentRegisterReceipt(root, receipt);
  return receipt;
}

async function assemble(
  root: string,
  names: readonly SlotName[],
  version: string,
  held?: ReadonlyMap<string, readonly string[]>
): Promise<string> {
  const registerReceipt = await stampReceipt(root, version);
  try {
    const receipt = await assembleDevelopmentApiEnvironment({
      repositoryRoot: root,
      providerPanel: panelFor(names),
      registerReceipt,
      supportModelTarget: SUPPORT_TARGET_JSON,
      ...(held === undefined ? {} : { heldConfiguredProviderSets: held })
    });
    return `OK reused=${String(receipt.reused)} keys=${String(receipt.keyCount)}`;
  } catch (error) {
    return `THROW ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("PROBE F — api.env across a configured-provider-set change", () => {
  it("admits an ADDITIVE publication with no held-version map", async () => {
    const root = await makeRoot();
    const first = await assemble(root, ["openaiPremium", "zaiPremium"], "5");
    const second = await assemble(root, ["openaiPremium", "zaiPremium", "openaiFree"], "6");
    // eslint-disable-next-line no-console
    console.log(`ADDITIVE first=${first} second=${second}`);
    expect(first.startsWith("OK")).toBe(true);
    expect(second.startsWith("OK")).toBe(true);
  }, 60_000);

  it("REFUSES a REMOVAL when the newest-64 held map is absent (V-41)", async () => {
    const root = await makeRoot();
    const first = await assemble(root, ["openaiPremium", "zaiPremium", "openaiFree"], "5");
    const second = await assemble(root, ["openaiPremium", "zaiPremium"], "6");
    // eslint-disable-next-line no-console
    console.log(`REMOVAL_NO_MAP first=${first} second=${second}`);
    expect(first.startsWith("OK")).toBe(true);
    expect(second).toContain("DEV_API_ENVIRONMENT_DRIFT");
  }, 60_000);

  it("admits the SAME removal when the held map proves the outgoing set", async () => {
    const root = await makeRoot();
    const first = await assemble(root, ["openaiPremium", "zaiPremium", "openaiFree"], "5");
    const held = new Map<string, readonly string[]>([[
      "5",
      [
        SLOTS.openaiPremium.providerRef,
        SLOTS.zaiPremium.providerRef,
        SLOTS.openaiFree.providerRef
      ]
    ]]);
    const second = await assemble(root, ["openaiPremium", "zaiPremium"], "6", held);
    // eslint-disable-next-line no-console
    console.log(`REMOVAL_WITH_MAP first=${first} second=${second}`);
    expect(first.startsWith("OK")).toBe(true);
  }, 60_000);

  it("ATTACK: a WRONG held map (a set the version never held) is rejected", async () => {
    const root = await makeRoot();
    const first = await assemble(root, ["openaiPremium", "zaiPremium", "openaiFree"], "5");
    const held = new Map<string, readonly string[]>([[
      "5",
      [SLOTS.openaiPremium.providerRef, SLOTS.zaiPremium.providerRef]
    ]]);
    const second = await assemble(root, ["openaiPremium", "zaiPremium"], "6", held);
    // eslint-disable-next-line no-console
    console.log(`REMOVAL_WRONG_MAP first=${first} second=${second}`);
    expect(first.startsWith("OK")).toBe(true);
  }, 60_000);

  it("R25: names every api.env key that MOVES across an admitted removal", async () => {
    const root = await makeRoot();
    const apiEnv = join(root, ".local", "dev-auth", "api.env");
    const first = await assemble(root, ["openaiPremium", "zaiPremium", "openaiFree"], "5");
    const before = await readFile(apiEnv, "utf8");
    const held = new Map<string, readonly string[]>([[
      "5",
      [
        SLOTS.openaiPremium.providerRef,
        SLOTS.zaiPremium.providerRef,
        SLOTS.openaiFree.providerRef
      ]
    ]]);
    const second = await assemble(root, ["openaiPremium", "zaiPremium"], "6", held);
    const after = await readFile(apiEnv, "utf8");
    const asMap = (source: string): Map<string, string> => new Map(
      source.slice(0, -1).split("\n").map((row) => {
        const separator = row.indexOf("=");
        return [row.slice(0, separator), row.slice(separator + 1)] as const;
      })
    );
    const left = asMap(before);
    const right = asMap(after);
    const moved = [...left.keys()].filter((key) => left.get(key) !== right.get(key));
    // eslint-disable-next-line no-console
    console.log(`R25_MOVED_KEYS first=${first} second=${second} moved=${JSON.stringify(moved)}`);
    // eslint-disable-next-line no-console
    console.log(`R25_REMOVED_SLOT_STILL_IN_FILE=${after.includes("openai-free-api")} OLD_BEARER_STILL_IN_FILE=${after.includes(`${FAKE}-openaiFree`)}`);
    expect(moved.length).toBeGreaterThan(0);
  }, 60_000);

  it("ATTACK: a removal that also REWINDS the register version is refused", async () => {
    const root = await makeRoot();
    const first = await assemble(root, ["openaiPremium", "zaiPremium", "openaiFree"], "6");
    const held = new Map<string, readonly string[]>([[
      "6",
      [
        SLOTS.openaiPremium.providerRef,
        SLOTS.zaiPremium.providerRef,
        SLOTS.openaiFree.providerRef
      ]
    ]]);
    const second = await assemble(root, ["openaiPremium", "zaiPremium"], "5", held);
    // eslint-disable-next-line no-console
    console.log(`REMOVAL_REWIND first=${first} second=${second}`);
    expect(first.startsWith("OK")).toBe(true);
    expect(second).toContain("DEV_API_ENVIRONMENT_DRIFT");
  }, 60_000);
});

describe("PROBE I — slot order decides what the legacy VLLM_* triple carries", () => {
  it("a file with NO cli: entry puts a paid api slot at index 0", async () => {
    const { validateModelConfig } = await import("@debateai/model-config");
    const { developmentProviderSlots } = await import("../../apps/runner/src/dev-provider-panel.js");
    const openai = { api: "openai", model: "gpt-5.6-luna", base_url: "https://api.openai.com/v1", key: "OPENAI_API_KEY" };
    const zai = { api: "zai", model: "glm-5.3-flash", base_url: "https://api.z.ai/api/coding/paas/v4", key: "ZAI_API_KEY" };
    const cliFree = validateModelConfig({ free: [openai, zai], premium: [openai, zai] }, { isCliInstalled: () => true });
    const slots = developmentProviderSlots(cliFree);
    // eslint-disable-next-line no-console
    console.log(`SLOT_ORDER_NO_CLI=${JSON.stringify(slots.map((slot) => `${slot.transport}:${slot.providerRef}`))}`);
    const mixed = validateModelConfig({
      free: [openai, zai],
      premium: [{ cli: "codex", model: "gpt-5.6-sol" }, { cli: "claude", model: "claude-opus-5" }]
    }, { isCliInstalled: () => true });
    // eslint-disable-next-line no-console
    console.log(`SLOT_ORDER_MIXED=${JSON.stringify(developmentProviderSlots(mixed).map((slot) => `${slot.transport}:${slot.providerRef}`))}`);
    expect(slots.length).toBe(4);
  });
});

import { constants } from "node:fs";
import { lstat,open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CliRelayFailure,
  invokeCli,
  resolveConfiguredBinary,
  resolveTestGuardedCommand,
  startCliRelayServer,
  type CliRelayAdapter,
  type CliRelayHandle,
  type CommandSpec
} from "./relay-core.js";

export const HERMES_GLM_MODEL = "z-ai/glm-5.3-flash" as const;
export const HERMES_GLM_CLI_MODEL = "glm-5.3-flash" as const;
export const HERMES_SUPPORT_PROVIDER_REF = "development:hermes-glm-5.3-flash" as const;
export const HERMES_MAKER = "Z.AI" as const;
export const HERMES_SUPPORT_PORT = 8_794 as const;
export const HERMES_HANDSHAKE_PROMPT =
  "HERMES-SUPPORT acceptance transport handshake. Reply with the single word: OK" as const;
/** The NAME this maker's CLI is looked up by; never a path (D10, 2026-09-17). */
export const HERMES_BINARY_NAME = "hermes" as const;
/**
 * D10 host override for {@link HERMES_BINARY_NAME}. Unset ⇒ this host's own
 * `hermes`, deduced from PATH. Until 2026-09-17 this maker had no resolver at
 * all: its binary was a home-relative path computed once at module load, so it
 * could neither be pointed elsewhere nor refuse a broken launcher.
 */
const HERMES_BINARY_ENV_KEY = "ACCEPTANCE_HERMES_BINARY" as const;
const HERMES_BINARY_UNRESOLVED = "HERMES_CLI_BINARY_UNRESOLVED" as const;

export function resolveHermesBinary(source: NodeJS.ProcessEnv = process.env): string {
  return resolveConfiguredBinary(
    HERMES_BINARY_NAME,
    HERMES_BINARY_ENV_KEY,
    HERMES_BINARY_UNRESOLVED,
    source
  );
}

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const MAX_CREDENTIAL_FILE_BYTES = 64 * 1024;

function currentUid(): number {
  if (typeof process.getuid !== "function") throw new TypeError("HERMES_CREDENTIAL_OWNER_UNVERIFIED");
  return process.getuid();
}

async function readGlmCredential(): Promise<string> {
  const directory = join(homedir(),".hermes");
  const directoryMetadata = await lstat(directory).catch(() => null);
  if (directoryMetadata === null
    || directoryMetadata.isSymbolicLink()
    || !directoryMetadata.isDirectory()
    || directoryMetadata.uid !== currentUid()
    || (directoryMetadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new TypeError("HERMES_CREDENTIAL_CUSTODY_INVALID");
  }
  const path = join(directory,"auth.json");
  let handle;
  try {
    handle = await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new TypeError("HERMES_CREDENTIAL_CUSTODY_INVALID");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()
      || metadata.uid !== currentUid()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== PRIVATE_FILE_MODE
      || metadata.size < 1
      || metadata.size > MAX_CREDENTIAL_FILE_BYTES) {
      throw new TypeError("HERMES_CREDENTIAL_CUSTODY_INVALID");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(await handle.readFile("utf8"));
    } catch {
      throw new TypeError("HERMES_ZAI_CREDENTIAL_INVALID");
    }
    const root = decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded as Readonly<Record<string,unknown>> : {};
    const credentialPool = root.credential_pool !== null
      && typeof root.credential_pool === "object" && !Array.isArray(root.credential_pool)
      ? root.credential_pool as Readonly<Record<string,unknown>> : {};
    const entries = Array.isArray(credentialPool.zai) ? credentialPool.zai : [];
    const usable = entries.filter((entry): entry is Readonly<Record<string,unknown>> => (
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
      && entry.last_status !== "exhausted"
      && entry.base_url === "https://api.z.ai/api/paas/v4"
      && typeof entry.access_token === "string"
    ));
    const value = usable.length === 1 ? usable[0]!.access_token as string : "";
    if (value.length < 16 || value.length > 512 || !/^[^\s'"\\]+$/u.test(value)) {
      throw new TypeError("HERMES_ZAI_CREDENTIAL_INVALID");
    }
    return value;
  } finally {
    await handle.close();
  }
}

function createHermesAdapter(glmApiKey: string): CliRelayAdapter {
  return Object.freeze({
    maker: HERMES_MAKER,
    authEnvironmentKeys: Object.freeze([]),
    testEnvironmentKeys: Object.freeze(["FAKE_HERMES_FAIL","FAKE_HERMES_BAD_HANDSHAKE"]),
    failureCode: "HERMES_CLI_FAILED",
    timeoutCode: "HERMES_CLI_TIMEOUT",
    childEnvironment: (scratchDirectory: string) => Object.freeze({
      HOME: scratchDirectory,
      HERMES_HOME: scratchDirectory,
      GLM_API_KEY: glmApiKey
    }),
    buildArguments: (prompt: string) => Object.freeze([
      "--provider","zai",
      "--model",HERMES_GLM_CLI_MODEL,
      "--toolsets","context_engine",
      "--ignore-user-config",
      "--ignore-rules",
      "-z",prompt
    ]),
    parseCompletion(stdout: string) {
      const content = stdout.trim();
      if (content.length === 0 || /^HTTP [45][0-9]{2}:/u.test(content)) {
        throw new CliRelayFailure("FAILED","HERMES_CLI_OUTPUT_INVALID");
      }
      return Object.freeze({ content,model: HERMES_GLM_MODEL,usage: null });
    }
  });
}

export type HermesSupportRelayOptions = Readonly<{
  port: number;
  timeoutMs: number;
  testOnlyCommand?: CommandSpec;
  testOnlyGlmApiKey?: string;
}>;

export interface HermesSupportRelayHandle extends CliRelayHandle {
  readonly providerRef: typeof HERMES_SUPPORT_PROVIDER_REF;
  readonly model: typeof HERMES_GLM_MODEL;
  readonly maker: typeof HERMES_MAKER;
  readonly targetJson: string;
}

export async function startHermesSupportRelay(
  options: HermesSupportRelayOptions
): Promise<HermesSupportRelayHandle> {
  if (options.testOnlyGlmApiKey !== undefined && process.env.NODE_ENV !== "test") {
    throw new TypeError("TEST_ONLY_HERMES_CREDENTIAL_FORBIDDEN");
  }
  const glmApiKey = options.testOnlyGlmApiKey ?? await readGlmCredential();
  // LAZY, like the other three makers: the resolver can refuse on its own
  // account now, and an eagerly built default would let a configuration error
  // pre-empt resolveTestGuardedCommand's authority over the test seam
  // (`relay-core.ts:108-116` states the rule once).
  const command = resolveTestGuardedCommand(
    () => ({ binary: resolveHermesBinary(),prefixArguments: Object.freeze([]) }),
    options.testOnlyCommand,
    "TEST_ONLY_HERMES_COMMAND_FORBIDDEN"
  );
  const adapter = createHermesAdapter(glmApiKey);
  const handshake = await invokeCli(command,adapter,HERMES_HANDSHAKE_PROMPT,options.timeoutMs);
  if (handshake.content !== "OK") {
    throw new CliRelayFailure("FAILED","HERMES_CLI_HANDSHAKE_INVALID");
  }
  const server = await startCliRelayServer({
    port: options.port,timeoutMs: options.timeoutMs,command,adapter
  });
  const targetJson = JSON.stringify({
    provider_ref: HERMES_SUPPORT_PROVIDER_REF,
    base_url: `${server.baseUrl}/v1`,
    model: HERMES_GLM_MODEL,
    authorization_header: server.authorizationHeader
  });
  return Object.freeze({
    port: server.port,
    baseUrl: server.baseUrl,
    authorizationHeader: server.authorizationHeader,
    providerRef: HERMES_SUPPORT_PROVIDER_REF,
    model: HERMES_GLM_MODEL,
    maker: HERMES_MAKER,
    targetJson,
    close: () => server.close()
  });
}

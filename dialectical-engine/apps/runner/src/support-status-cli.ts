import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import { createPool, createSupportControlPlanePool, PostgresSupportRepository, type Pool } from "@debateai/db";
import { loadHelpCorpus, type LoadedHelpCorpus } from "@debateai/support-kb";
import type {
  RegisterPublicationPort,
  SupportConfigurationStatus
} from "@debateai/register";
import { createPostgresRegisterPublicationPort } from "@debateai/register";
import { withProductionSupportConfigCliConnection } from "./support-config-cli-credentials.js";
import {
  loadDevelopmentSupportStatusCliCredentials,
  loadProductionSupportStatusCliCredentials
} from "./support-status-cli-credentials.js";

export class SupportStatusCliError extends TypedDomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "SupportStatusCliError";
  }
}

export interface SupportStatusRepositoryPort {
  readStatus(): Promise<Readonly<{
    callsToday: number;
    openSessions: number;
    newCases: number;
    kbVersion: string;
    kbShipped: number;
    kbIgnored: number;
    relayState: "AVAILABLE" | "UNAVAILABLE";
  }>>;
}

type RegisterStatusPort = Pick<RegisterPublicationPort, "readSupportStatus">;
type ConfigurationEnvelope = Readonly<{
  row_key: string;
  value_json_text: string;
  source_ref: string;
}>;

function configurationRows(status: NonNullable<SupportConfigurationStatus>): readonly ConfigurationEnvelope[] {
  const parsed = JSON.parse(status.configurationText) as unknown;
  if (!Array.isArray(parsed)) throw new TypeError("SUPPORT_STATUS_INVALID");
  return Object.freeze((parsed as ConfigurationEnvelope[]).map((row) => Object.freeze(row))
    .sort((left, right) => left.row_key.localeCompare(right.row_key)));
}

export async function renderSupportStatus(input: Readonly<{
  registerStatus: RegisterStatusPort;
  support: SupportStatusRepositoryPort;
}>): Promise<string> {
  const [register, support] = await Promise.all([
    input.registerStatus.readSupportStatus(),
    input.support.readStatus()
  ]);
  if (register === null) return "support configuration: UNINITIALIZED\n";
  const lines = [
    `REGISTER_VERSION: ${register.baseRegisterVersion}`,
    `support register version: ${register.supportRegisterVersion}`,
    `catalogue version: ${register.schemaVersion}`,
    `marker recorded_at: ${register.recordedAt.toISOString()}`,
    `base version: ${register.baseRegisterVersion}`,
    `publication id: ${register.publicationId}`,
    `changed keys: ${[...register.changedKeys].sort().join(",")}`,
    `source ref: ${register.sourceRef}`,
    `support_snapshot_sha256: ${register.supportSnapshotSha256}`,
    `snapshot_sha256: ${register.snapshotSha256}`,
    ...configurationRows(register).map((row) =>
      `${row.row_key}: ${row.value_json_text} (${row.source_ref})`
    ),
    "cache max age: 1000 ms",
    "refresh deadline: 1000 ms",
    `calls today: ${support.callsToday}`,
    `open sessions: ${support.openSessions}`,
    `new cases: ${support.newCases}`,
    `kb_version: ${support.kbVersion}`,
    `kb loaded: ${support.kbShipped} shipped, ${support.kbIgnored} ignored`,
    `relay state: ${support.relayState}`
  ];
  return `${lines.join("\n")}\n`;
}

export function createSupportStatusRepository(
  repository: Pick<PostgresSupportRepository, "status">,
  knowledge: Pick<LoadedHelpCorpus, "kbVersion" | "shippedCount" | "ignoredCount">
): SupportStatusRepositoryPort {
  return Object.freeze({
    async readStatus() {
      const status = await repository.status();
      return Object.freeze({
        ...status,
        kbVersion: knowledge.kbVersion,
        kbShipped: knowledge.shippedCount,
        kbIgnored: knowledge.ignoredCount,
        relayState: "UNAVAILABLE" as const
      });
    }
  });
}

function clientBoundPool(client: Readonly<{ query: unknown }>): Pool {
  const boundedClient = new Proxy(client, {
    get(target, property, receiver) {
      if (property === "release") return () => undefined;
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return Object.freeze({ connect: async () => boundedClient }) as unknown as Pool;
}

function parseArguments(arguments_: readonly string[]): Readonly<{
  configurationCredentialFile: string | null;
  supportDataCredentialFile: string | null;
}> {
  const configurationIndex = arguments_.indexOf("--credential-file");
  const dataIndex = arguments_.indexOf("--support-data-credential-file");
  const configurationCredentialFile = configurationIndex < 0
    ? null : arguments_[configurationIndex + 1] ?? null;
  const supportDataCredentialFile = dataIndex < 0 ? null : arguments_[dataIndex + 1] ?? null;
  const consumed = (configurationIndex < 0 ? 0 : 2) + (dataIndex < 0 ? 0 : 2);
  if (consumed !== arguments_.length
    || (configurationCredentialFile === null) !== (supportDataCredentialFile === null)) {
    throw new SupportStatusCliError(
      "SUPPORT_STATUS_USAGE",
      "Usage: pnpm support:status [--credential-file <jit-path> --support-data-credential-file <rotated-path>]"
    );
  }
  return Object.freeze({ configurationCredentialFile, supportDataCredentialFile });
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const knowledge = loadHelpCorpus(resolve("packages/support-kb/content"));
  let output: string;
  if (arguments_.configurationCredentialFile === null
    || arguments_.supportDataCredentialFile === null) {
    const credentials = await loadDevelopmentSupportStatusCliCredentials(
      resolve(".local/dev-auth/database-principals.env")
    );
    const configurationPool = createSupportControlPlanePool(credentials.configurationDatabaseUrl);
    const supportPool = createPool(credentials.supportDatabaseUrl);
    try {
      output = await renderSupportStatus({
        registerStatus: createPostgresRegisterPublicationPort(configurationPool),
        support: createSupportStatusRepository(new PostgresSupportRepository(supportPool), knowledge)
      });
    } finally {
      await Promise.all([configurationPool.end(), supportPool.end()]);
    }
  } else {
    const credentials = await loadProductionSupportStatusCliCredentials(
      arguments_.supportDataCredentialFile
    );
    output = await withProductionSupportConfigCliConnection(
      arguments_.configurationCredentialFile,
      async (client) => {
        const supportPool = createPool(credentials.supportDatabaseUrl);
        try {
          return await renderSupportStatus({
            registerStatus: createPostgresRegisterPublicationPort(clientBoundPool(client)),
            support: createSupportStatusRepository(new PostgresSupportRepository(supportPool), knowledge)
          });
        } finally {
          await supportPool.end();
        }
      }
    );
  }
  process.stdout.write(output);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const code = error instanceof TypedDomainError ? error.code : "SUPPORT_STATUS_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = code === "SUPPORT_STATUS_USAGE" ? 2 : 1;
  });
}

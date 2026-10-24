import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import { createSupportControlPlanePool, type Pool } from "@debateai/db";
import { loadHelpCorpus, type LoadedHelpCorpus } from "@debateai/support-kb";
import type {
  RegisterPublicationPort,
  SupportConfigurationStatus
} from "@debateai/register";
import { createPostgresRegisterPublicationPort } from "@debateai/register";
import { withProductionSupportConfigCliConnection } from "./support-config-cli-credentials.js";
import { resolveDevCustodyRoot } from "../../../deploy/dev-auth/custody-root.mjs";
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
    kbVersion: string;
    kbShipped: number;
    kbIgnored: number;
  }>>;
}

type RegisterStatusPort = Pick<RegisterPublicationPort, "readSupportStatus">;
type ConfigurationEnvelope = Readonly<{
  row_key: string;
  value_json_text: string;
  source_ref: string;
}>;

export const SUPPORT_KEEPS_NOTHING_LINE =
  "support conversations: none kept — the support chat keeps no conversation";

function configurationRows(status: NonNullable<SupportConfigurationStatus>): readonly ConfigurationEnvelope[] {
  const parsed = JSON.parse(status.configurationText) as unknown;
  if (!Array.isArray(parsed)) throw new TypeError("SUPPORT_STATUS_INVALID");
  return Object.freeze((parsed as ConfigurationEnvelope[]).map((row) => Object.freeze(row))
    .sort((left, right) => (left.row_key < right.row_key ? -1 : left.row_key > right.row_key ? 1 : 0)));
}

export async function renderSupportStatus(input: Readonly<{
  registerStatus: RegisterStatusPort;
  support: SupportStatusRepositoryPort;
}>): Promise<string> {
  let register: SupportConfigurationStatus;
  try {
    register = await input.registerStatus.readSupportStatus();
  } catch {
    return `support configuration: UNAVAILABLE\n${SUPPORT_KEEPS_NOTHING_LINE}\n`;
  }
  if (register === null) {
    return `support configuration: UNINITIALIZED\n${SUPPORT_KEEPS_NOTHING_LINE}\n`;
  }
  let rows: readonly ConfigurationEnvelope[];
  try {
    rows = configurationRows(register);
  } catch {
    return `support configuration: INVALID\n${SUPPORT_KEEPS_NOTHING_LINE}\n`;
  }
  const support = await input.support.readStatus();
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
    ...rows.map((row) =>
      `${row.row_key}: ${row.value_json_text} (${row.source_ref})`
    ),
    "cache max age: 1000 ms",
    "refresh deadline: 1000 ms",
    `kb_version: ${support.kbVersion}`,
    `kb loaded: ${support.kbShipped} shipped, ${support.kbIgnored} ignored`,
    SUPPORT_KEEPS_NOTHING_LINE
  ];
  return `${lines.join("\n")}\n`;
}

export function createSupportStatusRepository(
  knowledge: Pick<LoadedHelpCorpus, "kbVersion" | "shippedCount" | "ignoredCount">
): SupportStatusRepositoryPort {
  return Object.freeze({
    async readStatus() {
      return Object.freeze({
        kbVersion: knowledge.kbVersion,
        kbShipped: knowledge.shippedCount,
        kbIgnored: knowledge.ignoredCount
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
  const knowledge = loadHelpCorpus(resolve("packages/support-kb/content"),{
    reviewManifest: JSON.parse(readFileSync(
      resolve("packages/support-kb/reviews/manifest.json"),"utf8"
    )) as unknown,
    recoveryComponents: readFileSync(resolve("packages/support-kb/recovery/components.json")),
    requireReviewedRecovery: true
  });
  let output: string;
  if (arguments_.configurationCredentialFile === null
    || arguments_.supportDataCredentialFile === null) {
    const credentials = await loadDevelopmentSupportStatusCliCredentials(
      join(resolveDevCustodyRoot(resolve(".")), "database-principals.env")
    );
    const configurationPool = createSupportControlPlanePool(credentials.configurationDatabaseUrl);
    try {
      output = await renderSupportStatus({
        registerStatus: createPostgresRegisterPublicationPort(configurationPool),
        support: createSupportStatusRepository(knowledge)
      });
    } finally {
      await configurationPool.end();
    }
  } else {
    await loadProductionSupportStatusCliCredentials(
      arguments_.supportDataCredentialFile
    );
    output = await withProductionSupportConfigCliConnection(
      arguments_.configurationCredentialFile,
      async (client) => {
        return renderSupportStatus({
          registerStatus: createPostgresRegisterPublicationPort(clientBoundPool(client)),
          support: createSupportStatusRepository(knowledge)
        });
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

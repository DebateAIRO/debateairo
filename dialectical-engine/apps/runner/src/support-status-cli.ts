import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import { createPool, createSupportControlPlanePool, PostgresSupportStatusRepository, type Pool } from "@debateai/db";
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
    callsToday: number;
    callsLast7Days?: number;
    inputTokensToday?: number;
    outputTokensToday?: number;
    costUsdToday?: number;
    inputTokensLast7Days?: number;
    outputTokensLast7Days?: number;
    costUsdLast7Days?: number;
    openSessions: number;
    newCases: number;
    kbVersion: string;
    kbShipped: number;
    kbIgnored: number;
    relayState: "AVAILABLE" | "UNAVAILABLE";
    relayUnavailableSince?: Date;
    deflection7Days: number | null;
    deflection30Days: number | null;
    ratingResolution7Days: number | null;
    ratingResolution30Days: number | null;
  }>>;
}

type RegisterStatusPort = Pick<RegisterPublicationPort, "readSupportStatus">;
type ConfigurationEnvelope = Readonly<{
  row_key: string;
  value_json_text: string;
  source_ref: string;
}>;

const RETENTION_UNAVAILABLE = "retention: unavailable — support register not initialized";
const ERASURE_MANUAL_STEP = "erasures: run pnpm support:shred --owner <owner_ref> --yes after each account erasure (wiring pending V, row V-26)";
const RETENTION_ACTOR_UNAVAILABLE = "retention actor: unavailable — no age-based shred command is implemented";

export function formatSpend(input: Readonly<{
  period: "today" | "last 7 days";
  calls: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}>): readonly string[] {
  const lines = [`calls ${input.period}: ${input.calls}`];
  if (input.inputTokens !== undefined) lines.push(`input tokens ${input.period}: ${input.inputTokens}`);
  if (input.outputTokens !== undefined) lines.push(`output tokens ${input.period}: ${input.outputTokens}`);
  lines.push(`cost ${input.period}: ${input.costUsd === undefined ? "UNKNOWN" : `$${input.costUsd.toFixed(2)}`}`);
  return Object.freeze(lines);
}

export function formatRelayState(input: Readonly<{
  relayState: "AVAILABLE" | "UNAVAILABLE";
  relayUnavailableSince?: Date;
}>): string {
  if (input.relayState === "AVAILABLE") return "relay: available";
  return `relay: unavailable since ${input.relayUnavailableSince?.toISOString() ?? "UNKNOWN"}`;
}

function formatRate(label: string,value: number | null): string {
  return `${label}: ${value === null ? "UNVERIFIED" : `${(value*100).toFixed(1)}%`}`;
}

export function retentionLine(input: {
  policy: "keep" | `shred-after-days:${number}`;
  ratifiedBy: "V" | null;
}): string {
  if (input.policy === "keep") return "retention: keep";
  return input.ratifiedBy === "V"
    ? `retention: ${input.policy}`
    : `retention: ${input.policy} (pending V ratification — inert)`;
}

function configurationRows(status: NonNullable<SupportConfigurationStatus>): readonly ConfigurationEnvelope[] {
  const parsed = JSON.parse(status.configurationText) as unknown;
  if (!Array.isArray(parsed)) throw new TypeError("SUPPORT_STATUS_INVALID");
  return Object.freeze((parsed as ConfigurationEnvelope[]).map((row) => Object.freeze(row))
    .sort((left, right) => (left.row_key < right.row_key ? -1 : left.row_key > right.row_key ? 1 : 0)));
}

function retentionLines(rows: readonly ConfigurationEnvelope[]): readonly string[] {
  const policyRows = rows.filter(({ row_key }) => row_key === "support_retention_policy");
  const ratifierRows = rows.filter(({ row_key }) => row_key === "support_retention_ratified_by");
  if (policyRows.length !== 1 || ratifierRows.length !== 1) return [RETENTION_UNAVAILABLE];
  let policy: unknown;
  let ratifiedBy: unknown;
  try {
    policy = JSON.parse(policyRows[0]!.value_json_text) as unknown;
    ratifiedBy = JSON.parse(ratifierRows[0]!.value_json_text) as unknown;
  } catch {
    return [RETENTION_UNAVAILABLE];
  }
  const validPolicy = policy === "keep" || (
    typeof policy === "string"
    && /^shred-after-days:[1-9][0-9]{0,3}$/u.test(policy)
    && Number(policy.slice("shred-after-days:".length)) <= 3650
  );
  if (!validPolicy || (ratifiedBy !== null && ratifiedBy !== "V")
    || (policy === "keep" && ratifiedBy !== null)) {
    return [RETENTION_UNAVAILABLE];
  }
  const line = retentionLine({
    policy: policy as "keep" | `shred-after-days:${number}`,
    ratifiedBy: ratifiedBy as "V" | null
  });
  return policy !== "keep" && ratifiedBy === "V"
    ? [line, RETENTION_ACTOR_UNAVAILABLE]
    : [line];
}

export async function renderSupportStatus(input: Readonly<{
  registerStatus: RegisterStatusPort;
  support: SupportStatusRepositoryPort;
}>): Promise<string> {
  let register: SupportConfigurationStatus;
  try {
    register = await input.registerStatus.readSupportStatus();
  } catch {
    return `support configuration: UNAVAILABLE\n${RETENTION_UNAVAILABLE}\n${ERASURE_MANUAL_STEP}\n`;
  }
  if (register === null) {
    return `support configuration: UNINITIALIZED\n${RETENTION_UNAVAILABLE}\n${ERASURE_MANUAL_STEP}\n`;
  }
  let rows: readonly ConfigurationEnvelope[];
  try {
    rows = configurationRows(register);
  } catch {
    return `support configuration: INVALID\n${RETENTION_UNAVAILABLE}\n${ERASURE_MANUAL_STEP}\n`;
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
    ...retentionLines(rows),
    "cache max age: 1000 ms",
    "refresh deadline: 1000 ms",
    ...formatSpend({
      period: "today",calls: support.callsToday,
      ...(support.inputTokensToday === undefined ? {} : { inputTokens: support.inputTokensToday }),
      ...(support.outputTokensToday === undefined ? {} : { outputTokens: support.outputTokensToday }),
      ...(support.costUsdToday === undefined ? {} : { costUsd: support.costUsdToday })
    }),
    ...formatSpend({
      period: "last 7 days",calls: support.callsLast7Days ?? support.callsToday,
      ...(support.inputTokensLast7Days === undefined
        ? {} : { inputTokens: support.inputTokensLast7Days }),
      ...(support.outputTokensLast7Days === undefined
        ? {} : { outputTokens: support.outputTokensLast7Days }),
      ...(support.costUsdLast7Days === undefined
        ? {} : { costUsd: support.costUsdLast7Days })
    }),
    `open sessions: ${support.openSessions}`,
    `new cases: ${support.newCases}`,
    `kb_version: ${support.kbVersion}`,
    `kb loaded: ${support.kbShipped} shipped, ${support.kbIgnored} ignored`,
    formatRelayState(support),
    formatRate("deflection last 7 days",support.deflection7Days),
    formatRate("deflection last 30 days",support.deflection30Days),
    formatRate("rating resolution last 7 days",support.ratingResolution7Days),
    formatRate("rating resolution last 30 days",support.ratingResolution30Days),
    ERASURE_MANUAL_STEP
  ];
  return `${lines.join("\n")}\n`;
}

export function createSupportStatusRepository(
  repository: Pick<PostgresSupportStatusRepository, "status">,
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
        relayState: status.relayState ?? "AVAILABLE" as const,
        ...(status.relayUnavailableSince === undefined
          ? {} : { relayUnavailableSince: status.relayUnavailableSince })
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
      join(resolveDevCustodyRoot(resolve(".")), "database-principals.env")
    );
    const configurationPool = createSupportControlPlanePool(credentials.configurationDatabaseUrl);
    const supportPool = createPool(credentials.supportDatabaseUrl);
    try {
      output = await renderSupportStatus({
        registerStatus: createPostgresRegisterPublicationPort(configurationPool),
        support: createSupportStatusRepository(
          new PostgresSupportStatusRepository(supportPool),knowledge
        )
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
            support: createSupportStatusRepository(
              new PostgresSupportStatusRepository(supportPool),knowledge
            )
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

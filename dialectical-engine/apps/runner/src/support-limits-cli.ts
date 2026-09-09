import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import { createSupportControlPlanePool,type Pool } from "@debateai/db";
import {
  SUPPORT_CONFIGURATION_KEYS,canonicalDecimal,canonicalRegisterJson,createPostgresRegisterPublicationPort,
  validateSupportConfigurationValue,type CanonicalRegisterJson,
  type RegisterPublicationPort,type SupportConfigurationKey
} from "@debateai/register";
import {
  loadDevelopmentSupportConfigCliCredentials,withProductionSupportConfigCliConnection
} from "./support-config-cli-credentials.js";

export class SupportLimitsCliError extends TypedDomainError {
  constructor(code: string,message: string) {
    super(code,message);
    this.name = "SupportLimitsCliError";
  }
}

export type ParsedSupportLimitsArguments = Readonly<{
  row: SupportConfigurationKey;
  valueJsonText: CanonicalRegisterJson;
  sourceRef: string;
  publicationId: string;
  credentialFile: string | null;
}>;

const SUPPORT_KEY_SET = new Set<string>(SUPPORT_CONFIGURATION_KEYS);
const STRING_ROWS = new Set<SupportConfigurationKey>([
  "support_model_ref","support_retention_policy"
]);

function valueJson(row: SupportConfigurationKey,raw: string): CanonicalRegisterJson {
  let value: boolean | string | null | Readonly<{ kind: "DECIMAL";text: string }>;
  if (row === "support_enabled") {
    if (raw !== "true" && raw !== "false") {
      throw new SupportLimitsCliError("SUPPORT_LIMIT_VALUE_INVALID","Support value is invalid");
    }
    value = raw === "true";
  } else if (row === "support_retention_ratified_by") {
    if (raw !== "null" && raw !== "V") {
      throw new SupportLimitsCliError("SUPPORT_LIMIT_VALUE_INVALID","Support value is invalid");
    }
    value = raw === "null" ? null : raw;
  } else if (STRING_ROWS.has(row)) {
    value = raw;
  } else {
    if (!/^(0|[1-9][0-9]*)$/u.test(raw)) {
      throw new SupportLimitsCliError("SUPPORT_LIMIT_VALUE_INVALID","Support value is invalid");
    }
    value = canonicalDecimal(raw);
  }
  let encoded: CanonicalRegisterJson;
  try {
    encoded = canonicalRegisterJson(value);
    validateSupportConfigurationValue(row,encoded);
  } catch {
    throw new SupportLimitsCliError("SUPPORT_LIMIT_VALUE_INVALID","Support value is invalid");
  }
  return encoded;
}

function option(arguments_: readonly string[],name: string): string | undefined {
  const found = arguments_.indexOf(name);
  return found < 0 ? undefined : arguments_[found + 1];
}

export function parseSupportLimitsArguments(arguments_: readonly string[]): ParsedSupportLimitsArguments {
  const rowRaw = arguments_[1] ?? "";
  if (!rowRaw.startsWith("support_")) {
    throw new SupportLimitsCliError("SUPPORT_LIMIT_ROW_FORBIDDEN","Only support rows may be changed");
  }
  if (!SUPPORT_KEY_SET.has(rowRaw)) {
    throw new SupportLimitsCliError("SUPPORT_LIMIT_ROW_UNKNOWN","Support row is unknown");
  }
  const sourceRef = option(arguments_,"--source-ref");
  const publicationId = option(arguments_,"--publication-id") ?? randomUUID();
  const credentialFile = option(arguments_,"--credential-file") ?? null;
  const optionCount = (arguments_.includes("--source-ref") ? 2 : 0)
    + (arguments_.includes("--publication-id") ? 2 : 0)
    + (arguments_.includes("--credential-file") ? 2 : 0);
  if (arguments_[0] !== "set" || arguments_[2] === undefined || sourceRef === undefined
    || arguments_.length !== 3 + optionCount) {
    throw new SupportLimitsCliError(
      "SUPPORT_LIMITS_USAGE",
      "Usage: pnpm support:limits set <support_row> <value> --source-ref <non-secret-ref> [--publication-id <uuid>] [--credential-file <path>]"
    );
  }
  const row = rowRaw as SupportConfigurationKey;
  return Object.freeze({
    row,valueJsonText: valueJson(row,arguments_[2]),sourceRef,publicationId,credentialFile
  });
}

export async function runSupportLimits(input: Readonly<{
  row: SupportConfigurationKey;
  valueJsonText: CanonicalRegisterJson;
  sourceRef: string;
  publicationId: string;
  publication: Pick<RegisterPublicationPort,"readSupportStatus"|"publishSupport">;
}>): Promise<Readonly<{ exitCode: 0;stdout: string }>> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(input.publicationId)
    || input.sourceRef.length < 1 || input.sourceRef.length > 1024
    || input.sourceRef.trim() !== input.sourceRef || /[\u0000-\u001f\u007f]/u.test(input.sourceRef)) {
    throw new SupportLimitsCliError("SUPPORT_LIMIT_INPUT_INVALID","Support limit input is invalid");
  }
  const status = await input.publication.readSupportStatus();
  if (status === null) {
    throw new SupportLimitsCliError(
      "SUPPORT_CONFIG_UNINITIALIZED","The support configuration must be initialized before changing it"
    );
  }
  const receipt = await input.publication.publishSupport({
    publicationId: input.publicationId,baseRegisterVersion: status.baseRegisterVersion,
    expectedSupportRegisterVersion: status.supportRegisterVersion,schemaVersion: 1,
    patch: Object.freeze([{ key: input.row,valueJsonText: input.valueJsonText }]),
    sourceRef: input.sourceRef
  });
  return Object.freeze({
    exitCode: 0,
    stdout: [
      `SUPPORT_CONFIG_PUBLISHED ${input.row}=${input.valueJsonText}`,
      `register_version=${receipt.registerVersion}`,
      `previous_support_register_version=${receipt.previousSupportRegisterVersion ?? "null"}`,
      `publication_id=${receipt.publicationId}`,
      `support_snapshot_sha256=${receipt.supportSnapshotSha256}`,
      `snapshot_sha256=${receipt.snapshotSha256}`
    ].join(" ") + "\n"
  });
}

function clientBoundPool(client: Readonly<{ query: unknown }>): Pool {
  const boundedClient = new Proxy(client,{
    get(target,property,receiver) {
      if (property === "release") return () => undefined;
      const value = Reflect.get(target,property,receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return Object.freeze({ connect: async () => boundedClient }) as unknown as Pool;
}

async function main(): Promise<void> {
  const arguments_ = parseSupportLimitsArguments(process.argv.slice(2));
  let result: Readonly<{ exitCode: 0;stdout: string }>;
  if (arguments_.credentialFile !== null) {
    result = await withProductionSupportConfigCliConnection(arguments_.credentialFile,async (client) =>
      runSupportLimits({
        ...arguments_,publication: createPostgresRegisterPublicationPort(clientBoundPool(client))
      })
    );
  } else {
    const credentials = await loadDevelopmentSupportConfigCliCredentials(
      resolve(".local/dev-auth/database-principals.env")
    );
    const pool = createSupportControlPlanePool(credentials.databaseUrl);
    try {
      result = await runSupportLimits({
        ...arguments_,publication: createPostgresRegisterPublicationPort(pool)
      });
    } finally {
      await pool.end();
    }
  }
  process.stdout.write(result.stdout);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const code = error instanceof TypedDomainError ? error.code : "SUPPORT_LIMITS_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = code.includes("USAGE") || code.includes("INVALID")
      || code.includes("FORBIDDEN") || code.includes("UNKNOWN") ? 2 : 1;
  });
}

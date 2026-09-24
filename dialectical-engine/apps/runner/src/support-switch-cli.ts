import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import { createSupportControlPlanePool, type Pool } from "@debateai/db";
import { resolveDevCustodyRoot } from "../../../deploy/dev-auth/custody-root.mjs";
import {
  canonicalRegisterJson,
  createPostgresRegisterPublicationPort,
  type RegisterPublicationPort
} from "@debateai/register";
import {
  loadDevelopmentSupportConfigCliCredentials,
  withProductionSupportConfigCliConnection
} from "./support-config-cli-credentials.js";

export class SupportSwitchCliError extends TypedDomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "SupportSwitchCliError";
  }
}

export type SupportSwitchResult = Readonly<{ exitCode: 0; stdout: string }>;

type ConfigurationEnvelope = Readonly<{
  row_key: string;
  value_json_text: string;
  source_ref: string;
}>;

function supportEnabled(configurationText: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(configurationText);
  } catch {
    throw new SupportSwitchCliError("SUPPORT_STATUS_INVALID", "Support configuration status is invalid");
  }
  if (!Array.isArray(value)) {
    throw new SupportSwitchCliError("SUPPORT_STATUS_INVALID", "Support configuration status is invalid");
  }
  const row = (value as readonly ConfigurationEnvelope[]).find((item) =>
    item !== null && typeof item === "object" && item.row_key === "support_enabled"
  );
  if (row?.value_json_text !== "true" && row?.value_json_text !== "false") {
    throw new SupportSwitchCliError("SUPPORT_STATUS_INVALID", "Support configuration status is invalid");
  }
  return row.value_json_text === "true";
}

export async function runSupportSwitch(input: Readonly<{
  desired: boolean;
  sourceRef: string;
  publicationId: string;
  publication: Pick<RegisterPublicationPort, "readSupportStatus" | "publishSupport">;
  acknowledgedAt?: () => Date;
}>): Promise<SupportSwitchResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(input.publicationId)
    || input.sourceRef.length < 1 || input.sourceRef.length > 1024
    || input.sourceRef.trim() !== input.sourceRef || /[\u0000-\u001f\u007f]/u.test(input.sourceRef)) {
    throw new SupportSwitchCliError("SUPPORT_SWITCH_INPUT_INVALID", "Support switch input is invalid");
  }
  const status = await input.publication.readSupportStatus();
  if (status === null) {
    throw new SupportSwitchCliError(
      "SUPPORT_CONFIG_UNINITIALIZED",
      "The support configuration must be initialized before switching it"
    );
  }
  if (supportEnabled(status.configurationText) === input.desired) {
    return Object.freeze({
      exitCode: 0,
      stdout: `SUPPORT_CONFIG_UNCHANGED support_enabled=${String(input.desired)}\n`
    });
  }
  const receipt = await input.publication.publishSupport({
    publicationId: input.publicationId,
    baseRegisterVersion: status.baseRegisterVersion,
    expectedSupportRegisterVersion: status.supportRegisterVersion,
    schemaVersion: 1,
    patch: Object.freeze([{
      key: "support_enabled",
      valueJsonText: canonicalRegisterJson(input.desired)
    }]),
    sourceRef: input.sourceRef
  });
  const commitAcknowledgedAt = (input.acknowledgedAt ?? (() => new Date()))();
  return Object.freeze({
    exitCode: 0,
    stdout: [
      "SUPPORT_CONFIG_PUBLISHED",
      `register_version=${receipt.registerVersion}`,
      `previous_support_register_version=${receipt.previousSupportRegisterVersion ?? "null"}`,
      `publication_id=${receipt.publicationId}`,
      `support_snapshot_sha256=${receipt.supportSnapshotSha256}`,
      `snapshot_sha256=${receipt.snapshotSha256}`,
      `support_enabled=${String(input.desired)}`,
      `commit_acknowledged_at=${commitAcknowledgedAt.toISOString()}`
    ].join(" ") + "\n"
  });
}

type ParsedArguments = Readonly<{
  desired: boolean;
  sourceRef: string;
  publicationId: string;
  credentialFile: string | null;
}>;

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const desired = arguments_[0] === "on" ? true : arguments_[0] === "off" ? false : null;
  const sourceIndex = arguments_.indexOf("--source-ref");
  const publicationIndex = arguments_.indexOf("--publication-id");
  const credentialIndex = arguments_.indexOf("--credential-file");
  const sourceRef = sourceIndex < 0 ? undefined : arguments_[sourceIndex + 1];
  const publicationId = publicationIndex < 0 ? randomUUID() : arguments_[publicationIndex + 1];
  const credentialFile = credentialIndex < 0 ? null : arguments_[credentialIndex + 1] ?? null;
  const consumed = 1 + (sourceIndex < 0 ? 0 : 2) + (publicationIndex < 0 ? 0 : 2)
    + (credentialIndex < 0 ? 0 : 2);
  if (desired === null || sourceRef === undefined || publicationId === undefined
    || consumed !== arguments_.length) {
    throw new SupportSwitchCliError(
      "SUPPORT_SWITCH_USAGE",
      "Usage: pnpm support:switch on|off --source-ref <non-secret-ref> [--publication-id <uuid>] [--credential-file <path>]"
    );
  }
  return Object.freeze({ desired, sourceRef, publicationId, credentialFile });
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

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  let result: SupportSwitchResult;
  if (arguments_.credentialFile !== null) {
    result = await withProductionSupportConfigCliConnection(arguments_.credentialFile, async (client) =>
      runSupportSwitch({
        ...arguments_,
        publication: createPostgresRegisterPublicationPort(clientBoundPool(client))
      })
    );
  } else {
    const credentials = await loadDevelopmentSupportConfigCliCredentials(
      join(resolveDevCustodyRoot(resolve(".")), "database-principals.env")
    );
    const pool = createSupportControlPlanePool(credentials.databaseUrl);
    try {
      result = await runSupportSwitch({
        ...arguments_,
        publication: createPostgresRegisterPublicationPort(pool)
      });
    } finally {
      await pool.end();
    }
  }
  process.stdout.write(result.stdout);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const code = error instanceof TypedDomainError ? error.code : "SUPPORT_SWITCH_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = code === "SUPPORT_SWITCH_USAGE" || code === "SUPPORT_SWITCH_INPUT_INVALID" ? 2
      : code === "SUPPORT_CONFIG_ACTIVATION_CONFLICT" ? 3 : 1;
  });
}

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPool,type Pool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  createSupportIncidentService,PostgresSupportIncidentRepository,SupportIncidentError,
  validateSupportIncidentText,
  type SupportIncidentRepositoryPort,type SupportIncidentSeverity,type SupportIncidentSurface
} from "../../api/src/support/incidents.js";
import { loadDevelopmentSupportStatusCliCredentials } from "./support-status-cli-credentials.js";

type ParsedCommand = Readonly<{
  command: "publish";incidentId: string;severity: SupportIncidentSeverity;
  affectedSurface: SupportIncidentSurface;summaryEn: string;summaryRo: string;
}> | Readonly<{ command: "resolve";incidentId: string }>;

function option(arguments_: readonly string[],name: string): string | null {
  const positions = arguments_.flatMap((value,index) => value === name ? [index] : []);
  if (positions.length !== 1) return null;
  const value = arguments_[positions[0]! + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

export function parseSupportIncidentArguments(arguments_: readonly string[]): ParsedCommand {
  const command = arguments_[0];
  const incidentId = option(arguments_,"--id");
  if (command === "resolve" && arguments_.length === 3 && incidentId !== null) {
    return Object.freeze({
      command,incidentId: validateSupportIncidentText(incidentId,"SUPPORT_INCIDENT_ID_INVALID")
    });
  }
  const severity = option(arguments_,"--severity");
  const affectedSurface = option(arguments_,"--surface");
  const summaryEn = option(arguments_,"--en");
  const summaryRo = option(arguments_,"--ro");
  if (command !== "publish" || arguments_.length !== 11 || incidentId === null
    || (severity !== "minor" && severity !== "major")
    || !["debates","publishing","sign-in","whole-site"].includes(affectedSurface ?? "")
    || summaryEn === null || summaryRo === null) {
    throw new SupportIncidentError("SUPPORT_INCIDENT_USAGE");
  }
  return Object.freeze({
    command,
    incidentId: validateSupportIncidentText(incidentId,"SUPPORT_INCIDENT_ID_INVALID"),
    severity,affectedSurface: affectedSurface as SupportIncidentSurface,
    summaryEn: validateSupportIncidentText(summaryEn,"SUPPORT_INCIDENT_SUMMARY_INVALID"),
    summaryRo: validateSupportIncidentText(summaryRo,"SUPPORT_INCIDENT_SUMMARY_INVALID")
  });
}

export interface SupportIncidentCliDependencies {
  loadCredentials(path: string): Promise<Readonly<{ supportDatabaseUrl: string }>>;
  openPool(databaseUrl: string): Pick<Pool,"end">;
  createRepository(pool: Pick<Pool,"end">): SupportIncidentRepositoryPort;
  clock(): Date;
}

const DEFAULT_DEPENDENCIES: SupportIncidentCliDependencies = Object.freeze({
  loadCredentials: loadDevelopmentSupportStatusCliCredentials,
  openPool: createPool,
  createRepository: (pool: Pick<Pool,"end">) => new PostgresSupportIncidentRepository(pool as never),
  clock: () => new Date()
});

export async function runSupportIncidentCli(
  arguments_: readonly string[],dependencies: SupportIncidentCliDependencies = DEFAULT_DEPENDENCIES
): Promise<string> {
  const command = parseSupportIncidentArguments(arguments_);
  const credentials = await dependencies.loadCredentials(
    resolve(".local/dev-auth/database-principals.env")
  );
  const pool = dependencies.openPool(credentials.supportDatabaseUrl);
  let operationError: unknown;
  try {
    const now = dependencies.clock();
    const service = createSupportIncidentService(dependencies.createRepository(pool),() => now);
    if (command.command === "resolve") return service.resolve(command.incidentId);
    const incident = await service.publish({
      incidentId: command.incidentId,startedAt: now,severity: command.severity,
      affectedSurface: command.affectedSurface,summaryEn: command.summaryEn,
      summaryRo: command.summaryRo,sourceRef: null
    });
    return [
      `incident_id: ${incident.incidentId}`,
      `started_at: ${incident.startedAt.toISOString()}`,
      `severity: ${incident.severity}`,
      `affected_surface: ${incident.affectedSurface}`,
      `summary_en: ${incident.summaryEn}`,
      `summary_ro: ${incident.summaryRo}`,
      `published_by: ${incident.publishedBy}`,
      `published_at: ${incident.publishedAt.toISOString()}`
    ].join("\n") + "\n";
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await pool.end();
    } catch (error) {
      if (operationError === undefined) throw new SupportIncidentError("SUPPORT_INCIDENT_POOL_CLOSE_FAILED");
    }
  }
}

export function publicSupportIncidentError(error: unknown): string {
  if (error instanceof SupportIncidentError) return error.code;
  return "SUPPORT_INCIDENT_FAILED";
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runSupportIncidentCli(process.argv.slice(2)).then((output) => {
    process.stdout.write(output);
  }).catch((error: unknown) => {
    const code = publicSupportIncidentError(error);
    process.stderr.write(`${code}\n`);
    process.exitCode = code === "SUPPORT_INCIDENT_USAGE" ? 2 : 1;
  });
}

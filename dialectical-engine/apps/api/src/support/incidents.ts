import { TypedDomainError } from "@debateai/kernel";
import { supportTemplate,type SupportLanguage } from "./templates.js";

export type SupportIncidentSeverity = "minor" | "major";
export type SupportIncidentSurface = "debates" | "publishing" | "sign-in" | "whole-site";

export type SupportIncidentRecord = Readonly<{
  incidentId: string;
  startedAt: Date;
  endedAt: Date | null;
  severity: SupportIncidentSeverity;
  affectedSurface: SupportIncidentSurface;
  summaryEn: string;
  summaryRo: string;
  publishedBy: "V";
  publishedAt: Date;
  sourceRef: string | null;
}>;

export interface SupportIncidentRepositoryPort {
  readActiveIncidents(): Promise<readonly SupportIncidentRecord[]>;
  publish(input: SupportIncidentRecord): Promise<SupportIncidentRecord>;
  resolve(incidentId: string,endedAt: Date): Promise<"RESOLVED" | "ALREADY_RESOLVED" | "NOT_FOUND">;
}

export interface SupportIncidentQueryPort {
  query<Row extends Record<string,unknown> = Record<string,unknown>>(
    sql: string,parameters?: readonly unknown[]
  ): Promise<Readonly<{ rows: Row[];rowCount?: number | null }>>;
}

export class SupportIncidentError extends TypedDomainError {
  constructor(code: string) {
    super(code,code);
    this.name = "SupportIncidentError";
  }
}

export function validateSupportIncidentText(value: string,code: string): string {
  if (value.length < 1 || value.length > 2_000 || value.trim() !== value
    || /\p{Cc}/u.test(value)) {
    throw new SupportIncidentError(code);
  }
  return value;
}

function row(record: Readonly<Record<string,unknown>>): SupportIncidentRecord {
  if (!(record.started_at instanceof Date) || !(record.published_at instanceof Date)
    || (record.ended_at !== null && !(record.ended_at instanceof Date))
    || (record.severity !== "minor" && record.severity !== "major")
    || !["debates","publishing","sign-in","whole-site"].includes(String(record.affected_surface))
    || record.published_by !== "V") throw new SupportIncidentError("SUPPORT_INCIDENT_DATA_INVALID");
  return Object.freeze({
    incidentId: String(record.incident_id),startedAt: record.started_at,
    endedAt: record.ended_at as Date | null,severity: record.severity,
    affectedSurface: record.affected_surface as SupportIncidentSurface,
    summaryEn: String(record.summary_en),summaryRo: String(record.summary_ro),
    publishedBy: "V",publishedAt: record.published_at,
    sourceRef: record.source_ref === null ? null : String(record.source_ref)
  });
}

export class PostgresSupportIncidentRepository implements SupportIncidentRepositoryPort {
  constructor(private readonly pool: SupportIncidentQueryPort) {}

  async readActiveIncidents(): Promise<readonly SupportIncidentRecord[]> {
    const result = await this.pool.query(`
      SELECT incident_id,started_at,ended_at,severity,affected_surface,
        summary_en,summary_ro,published_by,published_at,source_ref
      FROM support.public_incident WHERE ended_at IS NULL
      ORDER BY CASE severity WHEN 'major' THEN 0 ELSE 1 END,started_at,incident_id
    `);
    return Object.freeze(result.rows.map(row));
  }

  async publish(input: SupportIncidentRecord): Promise<SupportIncidentRecord> {
    const result = await this.pool.query(`
      INSERT INTO support.public_incident(
        incident_id,started_at,ended_at,severity,affected_surface,
        summary_en,summary_ro,published_by,published_at,source_ref
      ) VALUES($1,$2,NULL,$3,$4,$5,$6,'V',$7,$8)
      RETURNING incident_id,started_at,ended_at,severity,affected_surface,
        summary_en,summary_ro,published_by,published_at,source_ref
    `,[input.incidentId,input.startedAt,input.severity,input.affectedSurface,
      input.summaryEn,input.summaryRo,input.publishedAt,input.sourceRef]);
    const inserted = result.rows[0];
    if (inserted === undefined) throw new SupportIncidentError("SUPPORT_INCIDENT_PUBLISH_FAILED");
    return row(inserted);
  }

  async resolve(incidentId: string,endedAt: Date): Promise<"RESOLVED" | "ALREADY_RESOLVED" | "NOT_FOUND"> {
    const result = await this.pool.query<{
      status: "RESOLVED" | "ALREADY_RESOLVED" | "NOT_FOUND";
    }>(`
      WITH target AS (
        SELECT incident_id,ended_at FROM support.public_incident
        WHERE incident_id=$1 FOR UPDATE
      ),resolved AS (
        UPDATE support.public_incident AS incident SET ended_at=$2
        FROM target WHERE incident.incident_id=target.incident_id
          AND target.ended_at IS NULL RETURNING incident.incident_id
      )
      SELECT CASE
        WHEN NOT EXISTS(SELECT 1 FROM target) THEN 'NOT_FOUND'
        WHEN EXISTS(SELECT 1 FROM resolved) THEN 'RESOLVED'
        ELSE 'ALREADY_RESOLVED'
      END AS status
    `,[incidentId,endedAt]);
    const resolved = result.rows[0]?.status;
    if (resolved === undefined) throw new SupportIncidentError("SUPPORT_INCIDENT_DATA_INVALID");
    return resolved;
  }
}

export function createSupportIncidentService(
  repository: SupportIncidentRepositoryPort,
  clock: () => Date = () => new Date()
) {
  return Object.freeze({
    readActiveIncidents: () => repository.readActiveIncidents(),
    publish: async (input: Readonly<{
      incidentId: string;startedAt: Date;severity: SupportIncidentSeverity;
      affectedSurface: SupportIncidentSurface;summaryEn: string;summaryRo: string;
      sourceRef: string | null;
    }>) => {
      if (input.severity !== "minor" && input.severity !== "major") {
        throw new SupportIncidentError("SUPPORT_INCIDENT_SEVERITY_INVALID");
      }
      if (!["debates","publishing","sign-in","whole-site"].includes(input.affectedSurface)) {
        throw new SupportIncidentError("SUPPORT_INCIDENT_SURFACE_INVALID");
      }
      const record: SupportIncidentRecord = Object.freeze({
        incidentId: validateSupportIncidentText(input.incidentId,"SUPPORT_INCIDENT_ID_INVALID"),
        startedAt: input.startedAt,endedAt: null,severity: input.severity,
        affectedSurface: input.affectedSurface,
        summaryEn: validateSupportIncidentText(input.summaryEn,"SUPPORT_INCIDENT_SUMMARY_INVALID"),
        summaryRo: validateSupportIncidentText(input.summaryRo,"SUPPORT_INCIDENT_SUMMARY_INVALID"),
        publishedBy: "V",publishedAt: clock(),
        sourceRef: input.sourceRef === null ? null
          : validateSupportIncidentText(input.sourceRef,"SUPPORT_INCIDENT_SOURCE_REF_INVALID")
      });
      return repository.publish(record);
    },
    resolve: async (incidentId: string) => {
      const result = await repository.resolve(
        validateSupportIncidentText(incidentId,"SUPPORT_INCIDENT_ID_INVALID"),clock()
      );
      if (result === "NOT_FOUND") throw new SupportIncidentError("SUPPORT_INCIDENT_NOT_FOUND");
      return result === "ALREADY_RESOLVED" ? "already resolved\n" : "resolved\n";
    }
  });
}

export function formatIncidentAnswer(
  incidents: readonly SupportIncidentRecord[],language: SupportLanguage,
  _model?: () => unknown
): Readonly<{ outcome: "ANSWER_INCIDENT" | "NO_INCIDENT";text: string }> {
  const active = incidents.find((incident) => incident.endedAt === null);
  if (active === undefined) {
    return Object.freeze({ outcome: "NO_INCIDENT",text: supportTemplate("NO_INCIDENT",language) });
  }
  return Object.freeze({
    outcome: "ANSWER_INCIDENT",
    text: supportTemplate("INCIDENT_ACTIVE",language)
      .replace("{started_at}",active.startedAt.toISOString())
      .replace("{summary}",language === "ro" ? active.summaryRo : active.summaryEn)
  });
}

function touches(affected: SupportIncidentSurface,intent: SupportIncidentSurface): boolean {
  return affected === "whole-site" || affected === intent
    || (affected === "debates" && intent === "publishing");
}

export function applyIncidentNotice(
  reply: string,intentSurface: SupportIncidentSurface | null,
  incidents: readonly SupportIncidentRecord[],language: SupportLanguage
): string {
  if (intentSurface === null) return reply;
  const active = incidents.find((incident) => incident.endedAt === null
    && touches(incident.affectedSurface,intentSurface));
  if (active === undefined) return reply;
  const notice = supportTemplate("INCIDENT_NOTICE",language)
    .replace("{surface}",active.affectedSurface)
    .replace("{started_at}",active.startedAt.toISOString());
  return `${notice}\n\n${reply}`;
}

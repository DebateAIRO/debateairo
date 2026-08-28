export type DevPostgresCompose = Readonly<{
  host: "127.0.0.1";
  hostPort: 55432;
  containerPort: 5432;
  healthCommand: "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB";
}>;

export function validateDevPostgresCompose(source: string): DevPostgresCompose;

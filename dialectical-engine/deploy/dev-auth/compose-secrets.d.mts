export type DevelopmentComposeSecretKey =
  | "POSTGRES_SUPERUSER_PASSWORD"
  | "HATCHET_DATABASE_PASSWORD"
  | "HATCHET_ADMIN_EMAIL"
  | "HATCHET_ADMIN_PASSWORD"
  | "VLLM_API_KEY";

export type DevelopmentComposeSecretsErrorCode =
  | "DEV_COMPOSE_SECRETS_OWNER_UNVERIFIED"
  | "DEV_COMPOSE_SECRETS_FILE_INVALID"
  | "DEV_COMPOSE_SECRETS_CUSTODY_INVALID"
  | "DEV_COMPOSE_SECRETS_NOT_GENERATED"
  | "DEV_COMPOSE_SECRETS_INCOMPLETE"
  | "DEV_COMPOSE_SECRETS_PUBLISH_FAILED";

export const DEVELOPMENT_COMPOSE_SECRET_KEYS: readonly DevelopmentComposeSecretKey[];

export class DevelopmentComposeSecretsError extends Error {
  readonly code: DevelopmentComposeSecretsErrorCode;
}

export function developmentComposeSecretsPath(custodyRoot: string): string;

export function ensureDevelopmentComposeSecrets(custodyRoot: string): Promise<string>;

export function readDevelopmentComposeSecret(
  custodyRoot: string,
  key: DevelopmentComposeSecretKey
): Promise<string>;

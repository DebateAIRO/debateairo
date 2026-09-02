export const DEV_CUSTODY_ROOT_ENV: "DEBATEAI_DEV_CUSTODY_ROOT";

export type DevCustodyRootErrorCode =
  | "DEV_AUTH_CUSTODY_ROOT_RELATIVE"
  | "DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED"
  | "DEV_AUTH_CUSTODY_ROOT_INVALID";

export class DevCustodyRootError extends TypeError {
  readonly code: DevCustodyRootErrorCode;
}

export function resolveDevCustodyRoot(
  repositoryRoot: string,
  environment?: Readonly<Record<string, string | undefined>>
): string;

export function assertDevCustodyDirectory(directory: string): Promise<void>;

export function assertDevCustodyRootCustody(custodyRoot: string): Promise<void>;

export type DevTlsFrontDoor = Readonly<{
  host: string;
  port: number;
  close(): Promise<void>;
}>;

export type DevTlsHttpProbe = Readonly<{
  statusCode: number;
  contentType: string;
  body: string;
}>;

export type DevTlsUiProbe = Readonly<{
  login: DevTlsHttpProbe;
  session: DevTlsHttpProbe;
}>;

export type DevTlsOwnedFrontDoor = Readonly<{
  port: number;
  close(): Promise<void>;
}>;

export type DevTlsReadinessOperations = Readonly<{
  isPublicPortOccupied(): Promise<boolean>;
  probePrivateUi(): Promise<DevTlsUiProbe | null>;
  startFrontDoor(): Promise<DevTlsOwnedFrontDoor>;
  probePublicUi(): Promise<DevTlsUiProbe | null>;
  delay(milliseconds: number): Promise<void>;
}>;

export type AttestedDevTlsFrontDoor = Readonly<{
  receipt: Readonly<{
    origin: "https://localhost:3000";
    trust: "SYSTEM";
  }>;
  stop(): Promise<void>;
}>;

export class DevTlsFrontDoorError extends Error {
  constructor(code: string, cause?: unknown);
}

export function startDevTlsFrontDoor(options: Readonly<{
  certificatePath: string;
  privateKeyPath: string;
  listenHost?: string;
  listenPort?: number;
  upstreamHost?: string;
  upstreamPort?: number;
}>): Promise<DevTlsFrontDoor>;

export function startAttestedDevTlsFrontDoor(input: Readonly<{
  operations: DevTlsReadinessOperations;
  maximumProbeAttempts?: number;
}>): Promise<AttestedDevTlsFrontDoor>;

export function createDevTlsReadinessOperations(
  repositoryRoot?: string
): DevTlsReadinessOperations;

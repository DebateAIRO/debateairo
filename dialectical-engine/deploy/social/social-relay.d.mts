import type { Server } from 'node:http';
export function fixedSocialOperation(configuration: unknown, input: unknown, signal: AbortSignal, request?: unknown): Promise<unknown>;
export function createSocialRelay(configuration: unknown, exchange?: typeof fixedSocialOperation): Server;
export function socialRelayEnvironment(source: Record<string, string | undefined>): {socketPath: string; credentialsPath: string};
export function loadSocialCredentials(path: string): Promise<unknown>;
export function socialCredentialCustody(
  parent: { uid: number; gid: number; mode: number; isDirectory(): boolean; isSymbolicLink(): boolean },
  metadata: { uid: number; gid: number; mode: number; size: number; nlink: number; isFile(): boolean },
  uid: number | undefined,
  acl?: unknown
): "owned" | "systemd";

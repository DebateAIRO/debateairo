import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { SupportLanguage } from "./templates.js";

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export class SupportSessionError extends TypedDomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "SupportSessionError";
  }
}

export type SupportSessionRecord = Readonly<{
  sessionId: string;
  identityOwnerRef: string | null;
  language: SupportLanguage;
  state: "OPEN" | "LOCKED" | "CLOSED";
  kbVersion: string;
  createdAt: Date;
  consentOwnContextAt: Date | null;
}>;

export type SupportDomainStatus = Readonly<{
  callsToday: number;
  openSessions: number;
  newCases: number;
}>;

export interface SupportSessionPort {
  create(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    identityOwnerRef: string | null;
    language: SupportLanguage;
    kbVersion: string;
    createdAt: Date;
  }>): Promise<SupportSessionRecord>;
  read(input: Readonly<{ sessionId: string; tokenSha256: string }>): Promise<SupportSessionRecord | null>;
  status(): Promise<SupportDomainStatus>;
}

export type SupportSessionCapability = Readonly<{
  sessionId: string;
  token: string;
  tokenSha256: string;
}>;

export function hashSupportCapability(token: string): string | null {
  if (!CAPABILITY_PATTERN.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSupportSessionCapability(): SupportSessionCapability {
  const token = randomBytes(32).toString("base64url");
  const tokenSha256 = hashSupportCapability(token);
  if (tokenSha256 === null || !SHA256_PATTERN.test(tokenSha256)) {
    throw new SupportSessionError(
      "SUPPORT_SESSION_CAPABILITY_GENERATION_FAILED",
      "Support session capability generation failed"
    );
  }
  return Object.freeze({ sessionId: randomUUID(), token, tokenSha256 });
}

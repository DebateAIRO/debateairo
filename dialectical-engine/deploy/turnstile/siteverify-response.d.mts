export function deploymentHostname(publicAppUrl: string): string;
export function validProof(input: unknown): boolean;
export type TurnstileAction = "signup" | "resend-verification" | "login" | "password-reset" | "mfa-recovery" | "account-recovery";
export const TURNSTILE_ACTIONS: readonly TurnstileAction[];
export type TurnstileActionFamily = "sign-up" | "sign-in" | "recovery";
export const TURNSTILE_ACTION_FAMILIES: Readonly<Record<TurnstileAction, TurnstileActionFamily>>;
export const TURNSTILE_PROOF_MEMORY_PER_FAMILY: number;
export interface TurnstileProofMemory {
  reserve(digest: string, action: TurnstileAction, now: number): "held" | "full" | "reserved";
  release(digest: string, action: TurnstileAction): void;
}
export function createProofMemory(capPerFamily?: number): TurnstileProofMemory;
export function siteverifyOutcome(value: unknown, action: TurnstileAction, hostname: string, now?: number): "passed" | "rejected" | "unavailable";
export function validSocketPath(value: unknown): boolean;

export function deploymentHostname(publicAppUrl: string): string;
export function validProof(input: unknown): boolean;
export type TurnstileAction = "signup" | "resend-verification" | "login" | "password-reset" | "mfa-recovery" | "account-recovery";
export const TURNSTILE_ACTIONS: readonly TurnstileAction[];
export function siteverifyOutcome(value: unknown, action: TurnstileAction, hostname: string, now?: number): "passed" | "rejected" | "unavailable";
export function validSocketPath(value: unknown): boolean;

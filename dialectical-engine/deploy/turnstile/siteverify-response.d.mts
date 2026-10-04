export function deploymentHostname(publicAppUrl: string): string;
export function validProof(input: unknown): boolean;
export function siteverifyOutcome(value: unknown, action: "signup" | "resend-verification", hostname: string, now?: number): "passed" | "rejected" | "unavailable";
export function validSocketPath(value: unknown): boolean;

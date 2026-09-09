import { TypedDomainError } from "@debateai/kernel";

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL_CHARACTER = /\p{Cc}/u;

export type SupportShredCounts = Readonly<{
  sessions: number;
  cases: number;
  keysDestroyed: number;
}>;

export type SupportShredResult =
  | Readonly<{ kind: "SHREDDED"; counts: SupportShredCounts }>
  | Readonly<{ kind: "ALREADY_SHREDDED" }>;

export interface SupportShredPort {
  shredOwner(ownerRef: string, osUser: string, at: Date): Promise<SupportShredResult>;
  shredSession(sessionId: string, osUser: string, at: Date): Promise<SupportShredResult>;
}

export class SupportShredError extends TypedDomainError {
  constructor(code: string) {
    super(code, code);
    this.name = "SupportShredError";
  }
}

function assertInput(targetRef: string, osUser: string, at: Date): void {
  if (!CANONICAL_UUID.test(targetRef)
    || typeof osUser !== "string"
    || Array.from(osUser).length < 1
    || Array.from(osUser).length > 128
    || CONTROL_CHARACTER.test(osUser)
    || !(at instanceof Date)
    || !Number.isFinite(at.getTime())) {
    throw new SupportShredError("SUPPORT_SHRED_INPUT_INVALID");
  }
}

/** Domain service; persistence and locking remain behind its structural port. */
export class SupportShredService implements SupportShredPort {
  constructor(private readonly repository: SupportShredPort) {}

  async shredOwner(ownerRef: string, osUser: string, at: Date): Promise<SupportShredResult> {
    assertInput(ownerRef, osUser, at);
    return this.repository.shredOwner(ownerRef, osUser, at);
  }

  async shredSession(sessionId: string, osUser: string, at: Date): Promise<SupportShredResult> {
    assertInput(sessionId, osUser, at);
    return this.repository.shredSession(sessionId, osUser, at);
  }
}

import {
  OutboundMailGate,
  type MailSuppressionList,
  type OutboundMailAlertKind,
  type OutboundMailGateEvent,
  type OutboundMailLedger
} from "../../apps/api/src/outbound-mail-gate.js";

/**
 * The same questions as packages/db/src/outbound-mail.ts, in memory: for tests about something else, and for the gate's
 * own rules. The database's atomicity is proved by tests/integration/outbound-mail-limit.test.ts.
 */
export class MemoryOutboundMailStore implements OutboundMailLedger, MailSuppressionList {
  readonly standard = new Map<string, number>();
  readonly security = new Map<string, number>();
  private readonly claimed = new Set<string>();
  private readonly suppressed = new Set<string>();
  day = "2026-11-01";

  async reserve(request: Readonly<{ purposeClass: "standard" | "security"; ceiling: number }>) {
    const total = this.sum(this.day);
    if (total >= request.ceiling) return Object.freeze({ admitted: false, total, day: this.day });
    const counts = request.purposeClass === "standard" ? this.standard : this.security;
    counts.set(this.day, (counts.get(this.day) ?? 0) + 1);
    return Object.freeze({ admitted: true, total: total + 1, day: this.day });
  }

  async today() {
    return Object.freeze({ total: this.sum(this.day), day: this.day });
  }

  async claimAlert(kind: OutboundMailAlertKind, day: string) {
    const key = `${kind}:${day}`;
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }

  async isSuppressed(digest: Buffer) {
    return this.suppressed.has(digest.toString("hex"));
  }

  /** Takes a digest, never an address. */
  suppress(digest: Buffer): void {
    this.suppressed.add(digest.toString("hex"));
  }

  sum(day: string): number {
    return (this.standard.get(day) ?? 0) + (this.security.get(day) ?? 0);
  }
}

/** Tests about something else get a real gate with an in-memory store and a limit they will never reach. */
export function testOutboundMailGate(options: Readonly<{ dailyLimit?: number; events?: OutboundMailGateEvent[] }> = {}): OutboundMailGate {
  const store = new MemoryOutboundMailStore();
  return new OutboundMailGate({
    policy: { dailyLimit: options.dailyLimit ?? 1000000, reservedForSecurityPct: 20, alertAtPct: 100 },
    blindIndexKey: Buffer.alloc(32, 0x61),
    ledger: store,
    suppression: store,
    report: (event) => { options.events?.push(event); }
  });
}

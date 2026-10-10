import { InMemoryOutboundMailStore, OutboundMailGate, type OutboundMailGateEvent } from "../../apps/api/src/outbound-mail-gate.js";

/**
 * Open sign-up mail PR 3: the gate every Sendmail* sender now requires. Tests that are about something else get a
 * real gate with an in-memory store and a budget they will never reach; tests about the gate build their own.
 */
export function testOutboundMailGate(options: Readonly<{ dailyCap?: number; events?: OutboundMailGateEvent[] }> = {}): OutboundMailGate {
  const store = new InMemoryOutboundMailStore();
  return new OutboundMailGate({
    policy: { dailyCap: options.dailyCap ?? 1_000_000, reservedForSecurityPct: 20, alertAtPct: 100 },
    blindIndexKey: Buffer.alloc(32, 0x61),
    ledger: store,
    suppression: store,
    report: (event) => { options.events?.push(event); }
  });
}

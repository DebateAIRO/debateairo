import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  evaluateAuthenticationRiskSignals,
  type DecryptedAuthenticationRiskSignal
} from "@debateai/db";
import { RECOVERY_POLICY_REGISTER_ROW } from "@debateai/register";

const AUTHENTICATION_RISK_SIGNAL_RETENTION_MS=
  RECOVERY_POLICY_REGISTER_ROW.value.risk_signals.raw_signal_retention_ms;
const MAX_AUTHENTICATION_RISK_SIGNAL_SCAN=
  RECOVERY_POLICY_REGISTER_ROW.value.risk_signals.maximum_evaluator_signals;

const kinds = [
  "LOGIN_SUCCESS",
  "SESSION_CONTEXT_CHANGED",
  "RECOVERY_STARTED",
  "RECOVERY_PROOF_FAILED",
  "RECOVERY_COMPLETED"
] as const;

function signal(index: number): DecryptedAuthenticationRiskSignal {
  const observedAt = new Date(Date.UTC(2026,0,1,0,index));
  return Object.freeze({
    riskSignalId: randomUUID(),
    kind: kinds[index%kinds.length]!,
    observedAt,
    expiresAt: new Date(observedAt.getTime()+AUTHENTICATION_RISK_SIGNAL_RETENTION_MS),
    context: Object.freeze({
      v: 1 as const,
      networkRef: `argon2id-audit:v1:${(index%2===0?"1":"2").repeat(64)}`,
      clientRef: `argon2id-audit:v1:${(index%3===0?"3":"4").repeat(64)}`
    })
  });
}

describe("P2-08 bounded authentication risk evaluation", () => {
  it("summarizes exactly the maximum bounded signal set without returning refs", () => {
    const signals=Array.from({length:MAX_AUTHENTICATION_RISK_SIGNAL_SCAN},(_,index)=>signal(index));
    const summary=evaluateAuthenticationRiskSignals(
      signals,new Date(Date.UTC(2026,0,2)),AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    );
    expect(summary).toEqual({
      signalCount:128,
      counts:{
        LOGIN_SUCCESS:26,
        SESSION_CONTEXT_CHANGED:26,
        RECOVERY_STARTED:26,
        RECOVERY_PROOF_FAILED:25,
        RECOVERY_COMPLETED:25
      },
      distinctNetworkRefs:2,
      distinctClientRefs:2,
      newestObservedAt:new Date(Date.UTC(2026,0,1,2,7))
    });
    expect(JSON.stringify(summary)).not.toContain("argon2id-audit");
  });

  it("rejects N+1 before evaluation", () => {
    const signals=Array.from({length:MAX_AUTHENTICATION_RISK_SIGNAL_SCAN+1},(_,index)=>signal(index));
    expect(()=>evaluateAuthenticationRiskSignals(
      signals,new Date(Date.UTC(2026,0,2)),AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    ))
      .toThrow("AUTH_RISK_SIGNAL_SCAN_SATURATED");
  });

  it("rejects poisoned kinds, refs, retention, expiry, duplicates, and extra context", () => {
    const now=new Date(Date.UTC(2026,0,2));
    const base=signal(0);
    const poisons: unknown[] = [
      {...base,kind:"ACCOUNT_CONTENT_MATCH"},
      {...base,context:{...base.context,networkRef:"192.0.2.1"}},
      {...base,expiresAt:new Date(base.expiresAt.getTime()+1)},
      {...base,expiresAt:now},
      {...base,context:{...base.context,debateText:"private"}},
      [base,base]
    ];
    for (const poison of poisons) {
      const rows=Array.isArray(poison)?poison:[poison];
      expect(()=>evaluateAuthenticationRiskSignals(
        rows as DecryptedAuthenticationRiskSignal[],now,
        AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
      )).toThrow("AUTH_RISK_SIGNAL_POISONED");
    }
  });
});

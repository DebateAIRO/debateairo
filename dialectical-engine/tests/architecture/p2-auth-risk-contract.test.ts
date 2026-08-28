import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("P2-08 authentication-risk lifecycle contract",()=>{
  it("runs one bounded single-flight retention batch at startup and every minute",async()=>{
    const source=await readFile(
      new URL("../../apps/api/src/main.ts",import.meta.url),"utf8"
    );
    expect(source).toContain("recoveryPolicy.riskSignals.maximumEvaluatorSignals");
    expect(source).toContain("authenticationRiskSignals.purgeExpired(recoveryPolicy.riskSignals.cleanupBatchMax)");
    expect(source).toContain("createSingleFlightErasureReconciler(\n  async ()=>{");
    expect(source).toContain("triggerAuthenticationRiskCleanup,60_000");
    expect(source).toContain("clearInterval(authenticationRiskCleanupTimer)");
    expect(source).toContain("triggerAuthenticationRiskCleanup();");
    expect(source).not.toContain("while (await authenticationRiskSignals.purgeExpired");
  });
  it("binds the SQL retention interval to the sealed recovery-policy carrier",async()=>{
    const [migration,policy]=await Promise.all([
      readFile(new URL("../../migrations/0046_authentication_risk_signals.sql",import.meta.url),"utf8"),
      readFile(new URL("../../packages/register/src/recovery-policy.ts",import.meta.url),"utf8")
    ]);
    expect(migration).toContain("interval '7776000 seconds'");
    expect(policy).toContain("raw_signal_retention_ms: z.literal(7_776_000_000)");
    expect(policy).toContain("maximum_evaluator_signals:z.literal(128)");
    expect(policy).toContain("cleanup_batch_max:z.literal(1_000)");
    expect(policy).toContain("rawSignalRetentionMs:value.risk_signals.raw_signal_retention_ms");
  });
});

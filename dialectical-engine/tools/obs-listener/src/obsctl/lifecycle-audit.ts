export interface LifecycleAuditPort {
  authenticateV(): Promise<void>;
  appendOutbox(): Promise<void>;
  appendIntent(): Promise<void>;
  perform(): Promise<void>;
  appendResult(outcome: "COMPLETE" | "FAILED"): Promise<void>;
}

export async function auditedLifecycleInvocation(port: LifecycleAuditPort): Promise<void> {
  await port.authenticateV();
  await port.appendOutbox();
  await port.appendIntent();
  try { await port.perform(); await port.appendResult("COMPLETE"); }
  catch (error) { await port.appendResult("FAILED").catch(() => undefined); throw error; }
}

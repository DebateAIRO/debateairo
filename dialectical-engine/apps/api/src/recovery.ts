import { performance } from "node:perf_hooks";
import {
  createEmailBlindIndex,
  normalizeEmailForBlindIndex
} from "@debateai/crypto";
import type { AuthSourceContext } from "@debateai/db";
import { AuthFlowError } from "./registration.js";

export const RECOVERY_START_PUBLIC_RESPONSE = Object.freeze({
  message: "If this account can be recovered, instructions will arrive through an eligible channel."
} as const);

export type RecoveryStartOutcome=
  | Readonly<{status:"created";publicHandle:string}>
  | Readonly<{status:"not_created"}>;

export interface RecoveryStartRepository {
  start(input: Readonly<{
    emailBlindIndex: Buffer;
    source: AuthSourceContext;
  }>): Promise<RecoveryStartOutcome>;
}

export interface RecoveryRiskSignalRecorder {
  recordForRecovery(input:Readonly<{
    publicHandle:string;kind:"RECOVERY_STARTED";source:AuthSourceContext;
  }>):Promise<"recorded"|"scope_unresolved">;
}

export interface RecoveryApplication {
  start(
    input: Readonly<{ email: string }>,
    source: AuthSourceContext
  ): Promise<typeof RECOVERY_START_PUBLIC_RESPONSE>;
}

export class RecoveryStartService implements RecoveryApplication {
  private readonly monotonicNow: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly dependencies: Readonly<{
    repository: RecoveryStartRepository;
    riskSignals:RecoveryRiskSignalRecorder;
    onRiskSignalFailure:()=>void;
    blindIndexKey: Uint8Array;
    enumerationFloorMs: number;
    publicResponsePolicy: "ENUMERATION_RESISTANT_GENERIC";
    monotonicNow?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  }>) {
    if (!Number.isFinite(dependencies.enumerationFloorMs)
      || dependencies.enumerationFloorMs < 1) {
      throw new TypeError("RECOVERY_ENUMERATION_FLOOR_INVALID");
    }
    if (dependencies.publicResponsePolicy !== "ENUMERATION_RESISTANT_GENERIC") {
      throw new TypeError("RECOVERY_PUBLIC_RESPONSE_POLICY_INVALID");
    }
    this.monotonicNow = dependencies.monotonicNow ?? performance.now.bind(performance);
    this.sleep = dependencies.sleep ?? (async (milliseconds) => {
      await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    });
  }

  async start(
    input: Readonly<{ email: string }>,
    source: AuthSourceContext
  ): Promise<typeof RECOVERY_START_PUBLIC_RESPONSE> {
    const startedAt = this.monotonicNow();
    try {
      let email: string;
      try {
        email = normalizeEmailForBlindIndex(input.email);
      } catch (error) {
        throw new AuthFlowError("AUTH_INPUT_INVALID", { cause: error });
      }
      const emailBlindIndex = createEmailBlindIndex(this.dependencies.blindIndexKey, email);
      const outcome=await this.dependencies.repository.start({ emailBlindIndex, source });
      if(outcome.status==="created"){
        try{
          const recorded=await this.dependencies.riskSignals.recordForRecovery({
            publicHandle:outcome.publicHandle,kind:"RECOVERY_STARTED",source
          });
          if(recorded!=="recorded") throw new TypeError("RECOVERY_RISK_SIGNAL_SCOPE_UNRESOLVED");
        }catch{this.dependencies.onRiskSignalFailure();}
      }
      return RECOVERY_START_PUBLIC_RESPONSE;
    } finally {
      const remaining = this.dependencies.enumerationFloorMs
        - (this.monotonicNow() - startedAt);
      if (remaining > 0) await this.sleep(remaining);
    }
  }
}

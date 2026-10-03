import { describe,expect,it } from "vitest";
import { CostEnvelopeGuard,type ModelSpendStore } from "@debateai/budget";
const ordinary:ModelSpendStore={recordSpend:async()=>{},readRunSpentMicros:async()=>0,readRunStorySpentMicros:async()=>0,readDaySpentMicros:async()=>0,admitNewRun:async()=>({admitted:true,committedMicros:0})};
const policy={perRunCeilingMicros:1000,dailyCeilingMicros:10000},fundingAdmission={assertProviderFundingAdmission:async()=>{}};
describe("finite funding cannot run on optional missing or malformed accounting adapters",()=>{
 it("refuses funded construction without both atomic adapters",()=>{
  for(const store of [ordinary,{...ordinary,reserveInternalCall:async()=>true},{...ordinary,settleInternalCall:async()=>{}}])
   expect(()=>new CostEnvelopeGuard({store,policy,fundingAdmission})).toThrow();
 });
 it("refuses an absent reserve decision before any provider bytes",async()=>{
  const guard=new CostEnvelopeGuard({store:{...ordinary,reserveInternalCall:async()=>undefined as never,settleInternalCall:async()=>{}},policy,fundingAdmission});
  await expect(guard.providerSeam({runId:"fixture-run",price:{inputMicrosPerMillionTokens:1000000,outputMicrosPerMillionTokens:1000000},phase:"BODY",requireReportedUsage:true}).assertCallAllowed({requestBytes:2,completionTokenCeiling:1})).rejects.toThrow();
 });
});

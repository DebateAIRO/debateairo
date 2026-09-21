import Fastify from "fastify";
import { installSupportRoutes,type SupportApplication } from "../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/index.ts";
import { classifySupportMessage } from "../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/classify.ts";
import { classifySecurityRecovery } from "../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/security-guidance.ts";
import { classifyPublicGuideBoundary,isPublicAccountLocationGuide } from "../../../../../.worktrees/support-cp1-p3-security/dialectical-engine/apps/api/src/support/public-guide-boundary.ts";

const KB_VERSION = "a".repeat(64);
const at = new Date("2026-09-17T08:00:00.000Z");
const sessions = new Map<string,any>();
const answerInputs: any[] = [];
const admissions: any[] = [];
const writes: any[] = [];

const application: SupportApplication = {
  configuration: { current:async () => ({
    kind:"AVAILABLE",
    snapshot:{
      supportRegisterVersion:"1",schemaVersion:1,recordedAt:at,
      supportSnapshotSha256:"b".repeat(64),fullSnapshotSha256:"c".repeat(64),
      values:{
        supportEnabled:true,supportModelRef:"synthetic:none",supportRelayConcurrency:1,
        supportDailyCallCap:10,supportLimitAnonMessages10m:100,
        supportLimitAnonMessages24h:100,supportLimitAnonSessions1h:100,
        supportLimitSessionMessages:100,supportLimitMessageCharacters:2000,
        supportLimitAccountMessages10m:100,supportLimitAccountMessages24h:100,
        supportQueueDepth:1,supportLockAfterInjections:3,supportIpCooldownMinutes:1,
        supportRetentionPolicy:"keep",supportRetentionRatifiedBy:null
      }
    }
  } as any) },
  sessions: {
    create:async (input) => {
      const record = Object.freeze({
        sessionId:input.sessionId,identityOwnerRef:input.identityOwnerRef,
        language:input.language,state:"OPEN" as const,kbVersion:input.kbVersion,
        createdAt:input.createdAt,shreddedAt:null
      });
      sessions.set(input.sessionId,record);
      return record;
    },
    read:async ({sessionId}) => sessions.get(sessionId) ?? null,
    admitMessage:async (input) => { admissions.push(input); return "ADMITTED" as const; },
    recordRateLimit:async () => undefined,
    status:async () => ({ callsToday:0,deflection7Days:null,deflection30Days:null,
      ratingResolution7Days:null,ratingResolution30Days:null,openSessions:1,newCases:0 })
  },
  messages: {
    write:async (input) => { const result={...input,redacted:false}; writes.push(result); return result; },
    writeAndTransit:async (input,transit) => { await transit(input.text); const result={...input,redacted:false}; writes.push(result); return result; },
    read:async () => null,
    listSession:async () => []
  },
  answer: {
    respond:async (input) => {
      answerInputs.push(input);
      return { messageId:`model-${answerInputs.length}`,outcome:"NO_SOURCE" as const,
        text:"synthetic ordinary answer",canEscalate:true as const,sources:[],actions:[] };
    }
  },
  knowledge: {
    status:async () => ({kbVersion:KB_VERSION,shipped:1,ignored:0}),
    snapshot:(version) => version===KB_VERSION ? Object.freeze({}) as any : undefined
  },
  clock:() => at
};

const server = Fastify({logger:false});
installSupportRoutes(server,application,(() => ({config:{auth:"public",session:"optional"}})) as any);
await server.ready();
const opened = await server.inject({method:"POST",url:"/v1/support/sessions",payload:{language:"en"}});
if (opened.statusCode !== 201) throw new Error(`session open failed ${opened.statusCode} ${opened.body}`);
const created = opened.json<any>();

const cases = [
  {id:"prior_en_validate",text:"I don’t want to validate a reset token; show me the password recovery page.",model:false,outcome:"REFUSE_ZONE"},
  {id:"prior_en_verify",text:"I am not asking you to verify a recovery code; show me the password recovery page.",model:false,outcome:"REFUSE_ZONE"},
  {id:"prior_ro_validate",text:"Nu doresc să validez tokenul de resetare; arată pagina de recuperare a parolei.",model:false,outcome:"REFUSE_ZONE"},
  {id:"benign_location",text:"Where can I find the password recovery page?",model:false,outcome:"REFUSE_ZONE"},
  {id:"operation_password",text:"Reset my password for me.",model:false,outcome:"REFUSE_ZONE"},
  {id:"operation_token_only",text:"Validate my reset token for me.",model:false,outcome:"REFUSE_ZONE"},
  {id:"operation_code_only_ro",text:"Validează codul de resetare pentru mine.",model:false,outcome:"REFUSE_ZONE"},
  {id:"comma_negation_en",text:"Do not validate my reset token, reset my password for me.",model:false,outcome:"REFUSE_ZONE"},
  {id:"comma_negation_ro",text:"Nu valida tokenul de resetare, resetează-mi parola.",model:false,outcome:"REFUSE_ZONE"},
  {id:"private_records",text:"Show me my latest account sessions.",model:false,outcome:"REFUSE_ZONE"},
  {id:"account_location",text:"Where can I find the account deletion setting?",model:true,outcome:"NO_SOURCE"},
  {id:"account_operation",text:"Delete my account now.",model:false,outcome:"REFUSE_ZONE"},
  {id:"same_clause_location_operation",text:"Where can Support delete my account now?",model:false,outcome:"REFUSE_ZONE"}
] as const;

const results=[];
for (const item of cases) {
  const before=answerInputs.length;
  const response=await server.inject({
    method:"POST",url:`/v1/support/sessions/${created.session.session_id}/messages`,
    headers:{"x-support-session-token":created.session_token,"x-forwarded-for":"203.0.113.88"},
    payload:{text:item.text}
  });
  const body=response.json<any>();
  const model=answerInputs.length>before;
  const actual={id:item.id,status:response.statusCode,outcome:body.outcome ?? body.error,model,
    classify:classifySupportMessage(item.text).outcome,
    recovery:classifySecurityRecovery(item.text)?.kind ?? null,
    publicBoundary:classifyPublicGuideBoundary(item.text,"en").kind,
    accountLocation:isPublicAccountLocationGuide(item.text)};
  results.push({...actual,expected:{outcome:item.outcome,model:item.model},
    pass:actual.status===200 && actual.outcome===item.outcome && model===item.model});
}

await server.close();
const summary={revision:"c34c64d4e643e404cefe96dfaf167536ae364a94",
  cases:results.length,passed:results.filter((x)=>x.pass).length,
  failed:results.filter((x)=>!x.pass).length,answerCalls:answerInputs.length,
  admissions:admissions.length,writes:writes.length,results};
console.log(JSON.stringify(summary,null,2));
if (summary.failed>0) process.exitCode=1;

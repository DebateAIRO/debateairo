import type { Pool } from "pg";
import {
  decrypt,
  encrypt,
  type AeadAad,
  type AuditContextHasher,
  type CryptoEnvelope,
  type ReadableUserDekStore
} from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";

export const AUTHENTICATION_RISK_SIGNAL_KINDS=Object.freeze([
  "LOGIN_SUCCESS","SESSION_CONTEXT_CHANGED","RECOVERY_STARTED",
  "RECOVERY_PROOF_FAILED","RECOVERY_COMPLETED"
] as const);
export type AuthenticationRiskSignalKind=typeof AUTHENTICATION_RISK_SIGNAL_KINDS[number];
export type AuthenticationRiskSignalContext=Readonly<{
  v:1;networkRef:string|null;clientRef:string|null;
}>;
export type DecryptedAuthenticationRiskSignal=Readonly<{
  riskSignalId:string;
  kind:AuthenticationRiskSignalKind;
  context:AuthenticationRiskSignalContext;
  observedAt:Date;
  expiresAt:Date;
}>;
export type AuthenticationRiskSummary=Readonly<{
  signalCount:number;
  counts:Readonly<Record<AuthenticationRiskSignalKind,number>>;
  distinctNetworkRefs:number;
  distinctClientRefs:number;
  newestObservedAt:Date|null;
}>;

const opaqueRef=/^argon2id-audit:v1:[0-9a-f]{64}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kindSet=new Set<string>(AUTHENTICATION_RISK_SIGNAL_KINDS);

function poisoned():never{throw new TypeError("AUTH_RISK_SIGNAL_POISONED");}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]):boolean{
  const actual=Object.keys(value).sort();
  const expected=[...keys].sort();
  return actual.length===expected.length&&actual.every((key,index)=>key===expected[index]);
}

export function evaluateAuthenticationRiskSignals(
  signals:readonly DecryptedAuthenticationRiskSignal[],evaluatedAt:Date,
  retentionMs:number,maxSignals:number
):AuthenticationRiskSummary{
  if(!Number.isInteger(maxSignals)||maxSignals<1) poisoned();
  if(signals.length>maxSignals){
    throw new TypeError("AUTH_RISK_SIGNAL_SCAN_SATURATED");
  }
  if(!(evaluatedAt instanceof Date)||!Number.isFinite(evaluatedAt.getTime())) poisoned();
  const counts:Record<AuthenticationRiskSignalKind,number>={
    LOGIN_SUCCESS:0,SESSION_CONTEXT_CHANGED:0,RECOVERY_STARTED:0,
    RECOVERY_PROOF_FAILED:0,RECOVERY_COMPLETED:0
  };
  const ids=new Set<string>();
  const networks=new Set<string>();
  const clients=new Set<string>();
  let newest:Date|null=null;
  for(const signal of signals){
    if(typeof signal!=="object"||signal===null
      ||!exactKeys(signal as unknown as Record<string,unknown>,[
        "riskSignalId","kind","context","observedAt","expiresAt"
      ])
      ||!uuid.test(signal.riskSignalId)||ids.has(signal.riskSignalId)
      ||!kindSet.has(signal.kind)
      ||!(signal.observedAt instanceof Date)||!Number.isFinite(signal.observedAt.getTime())
      ||!(signal.expiresAt instanceof Date)||!Number.isFinite(signal.expiresAt.getTime())
      ||!Number.isInteger(retentionMs)||retentionMs<1
      ||signal.expiresAt.getTime()-signal.observedAt.getTime()!==retentionMs
      ||signal.expiresAt.getTime()<=evaluatedAt.getTime()
      ||typeof signal.context!=="object"||signal.context===null
      ||!exactKeys(signal.context as unknown as Record<string,unknown>,[
        "v","networkRef","clientRef"
      ])
      ||signal.context.v!==1
      ||!(signal.context.networkRef===null||opaqueRef.test(signal.context.networkRef))
      ||!(signal.context.clientRef===null||opaqueRef.test(signal.context.clientRef))){
      poisoned();
    }
    ids.add(signal.riskSignalId);
    counts[signal.kind]++;
    if(signal.context.networkRef!==null) networks.add(signal.context.networkRef);
    if(signal.context.clientRef!==null) clients.add(signal.context.clientRef);
    if(newest===null||signal.observedAt>newest) newest=signal.observedAt;
  }
  return Object.freeze({
    signalCount:signals.length,
    counts:Object.freeze(counts),
    distinctNetworkRefs:networks.size,
    distinctClientRefs:clients.size,
    newestObservedAt:newest===null?null:new Date(newest)
  });
}

export function authenticationRiskSignalAad(userId:string):AeadAad{
  return Object.freeze([
    "identity","authentication_risk_signal.context_ciphertext",userId,
    "run:none",userId,`auth-risk:${userId}:v1`,"1"
  ] as const);
}

function normalized(value:unknown,maximumLength:number):string{
  const text=typeof value==="string"?value.trim():"";
  return(text===""?"unknown":text).slice(0,maximumLength);
}
function versioned(value:string):string{
  if(!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
  return `argon2id-audit:v1:${value}`;
}

type RiskRow={
  user_id:string;risk_signal_id:string;signal_kind:AuthenticationRiskSignalKind;
  context_ciphertext:CryptoEnvelope;observed_at:Date;expires_at:Date;evaluated_at:Date;
};

export class PostgresAuthenticationRiskSignalRepository{
  constructor(
    private readonly pool:Pool,
    private readonly auditContext:AuditContextHasher,
    private readonly users:ReadableUserDekStore,
    private readonly retentionMs:number,
    private readonly maxSignals:number
  ){}

  private async context(source:AuthSourceContext):Promise<AuthenticationRiskSignalContext>{
    const [networkRef,clientRef]=await Promise.all([
      this.auditContext.hashSourceIp(normalized(source?.ip,64)).then(versioned),
      this.auditContext.hashUserAgent(normalized(source?.userAgent,256)).then(versioned)
    ]);
    return Object.freeze({v:1,networkRef,clientRef});
  }

  private async record(input:Readonly<{
    prepareSql:string;recordSql:string;scopeParameters:readonly string[];
    kind:AuthenticationRiskSignalKind;source:AuthSourceContext;
  }>):Promise<"recorded"|"scope_unresolved">{
    const [prepared,context]=await Promise.all([
      this.pool.query<{user_id:string}>(input.prepareSql,[...input.scopeParameters]),
      this.context(input.source)
    ]);
    const userId=prepared.rows[0]?.user_id;
    if(userId===undefined) return "scope_unresolved";
    if(prepared.rows.length!==1) throw new TypeError("AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS");
    const key=await this.users.load(userId);
    try{
      const envelope=encrypt(
        key,Buffer.from(JSON.stringify(context),"utf8"),authenticationRiskSignalAad(userId)
      );
      const result=await this.pool.query<{recorded:boolean}>(input.recordSql,[
        ...input.scopeParameters,input.kind,JSON.stringify(envelope)
      ]);
      return result.rows[0]?.recorded===true?"recorded":"scope_unresolved";
    }finally{key.fill(0);}
  }

  recordForRecovery(input:Readonly<{
    publicHandle:string;
    kind:"RECOVERY_STARTED"|"RECOVERY_PROOF_FAILED"|"RECOVERY_COMPLETED";
    source:AuthSourceContext;
  }>):Promise<"recorded"|"scope_unresolved">{
    return this.record({
      prepareSql:"SELECT * FROM identity.prepare_authentication_risk_signal_for_recovery($1)",
      recordSql:"SELECT identity.record_authentication_risk_signal_for_recovery($1,$2,$3::jsonb) AS recorded",
      scopeParameters:[input.publicHandle],kind:input.kind,source:input.source
    });
  }

  recordForSession(input:Readonly<{
    tokenHash:string;bindingHash:string;
    kind:"LOGIN_SUCCESS"|"SESSION_CONTEXT_CHANGED";source:AuthSourceContext;
  }>):Promise<"recorded"|"scope_unresolved">{
    return this.record({
      prepareSql:"SELECT * FROM identity.prepare_authentication_risk_signal_for_session($1,$2)",
      recordSql:"SELECT identity.record_authentication_risk_signal_for_session($1,$2,$3,$4::jsonb) AS recorded",
      scopeParameters:[input.tokenHash,input.bindingHash],kind:input.kind,source:input.source
    });
  }

  async evaluateForRecovery(publicHandle:string):Promise<AuthenticationRiskSummary>{
    const prepared=await this.pool.query<{user_id:string}>(
      "SELECT * FROM identity.prepare_authentication_risk_signal_for_recovery($1)",[publicHandle]
    );
    const userId=prepared.rows[0]?.user_id;
    if(userId===undefined) throw new TypeError("AUTH_RISK_SIGNAL_SCOPE_UNRESOLVED");
    if(prepared.rows.length!==1) throw new TypeError("AUTH_RISK_SIGNAL_SCOPE_AMBIGUOUS");
    const result=await this.pool.query<RiskRow>(
      "SELECT * FROM identity.read_authentication_risk_signals_for_recovery($1)",[publicHandle]
    );
    if(result.rows.length>this.maxSignals){
      throw new TypeError("AUTH_RISK_SIGNAL_SCAN_SATURATED");
    }
    if(result.rows.some(row=>row.user_id!==userId)){
      throw new TypeError("AUTH_RISK_SIGNAL_CROSS_ACCOUNT");
    }
    if(result.rows.length===0){
      return evaluateAuthenticationRiskSignals(
        [],new Date(0),this.retentionMs,this.maxSignals
      );
    }
    const key=await this.users.load(userId);
    try{
      const decoded=result.rows.map((row):DecryptedAuthenticationRiskSignal=>{
        let context:unknown;
        try{
          context=JSON.parse(decrypt(
            key,row.context_ciphertext,authenticationRiskSignalAad(userId)
          ).toString("utf8"));
        }catch{poisoned();}
        return Object.freeze({
          riskSignalId:row.risk_signal_id,kind:row.signal_kind,
          context:context as AuthenticationRiskSignalContext,
          observedAt:row.observed_at,expiresAt:row.expires_at
        });
      });
      return evaluateAuthenticationRiskSignals(
        decoded,result.rows[0]!.evaluated_at,this.retentionMs,this.maxSignals
      );
    }finally{key.fill(0);}
  }

  async purgeExpired(limit:number):Promise<number>{
    const result=await this.pool.query<{purged:number}>(
      "SELECT identity.purge_expired_authentication_risk_signals($1) AS purged",[limit]
    );
    const purged=result.rows[0]?.purged;
    if(typeof purged!=="number"||!Number.isInteger(purged)||purged<0){
      throw new TypeError("AUTH_RISK_SIGNAL_PURGE_OUTCOME_INVALID");
    }
    return purged;
  }
}

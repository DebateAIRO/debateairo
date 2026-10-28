import type{Pool}from"pg";import type{AuditContextHasher,CryptoEnvelope}from"@debateai/crypto";import type{AuthSourceContext}from"./identity.js";import type{PasswordRecoveryCandidate}from"./recovery-candidate.js";import{assertMailLocale,withMailLocale}from"./mail-locale.js";
export type EmailRecoverySource=Readonly<{ipArgon2id:string;userAgentArgon2id:string}>;
export type EmailRecoveryChannel=PasswordRecoveryCandidate["channels"][number]&Readonly<{cancelAuthorized?:boolean}>;
export type EmailRecoveryNotice=Readonly<{noticeId:string;leaseId:string;userId:string;channelId:string;event:"PROOF"|"VERIFIED"|"STARTED"|"WAITING"|"FINISH"|"COMPLETED"|"CANCELLED"|"REFUSED";payload:CryptoEnvelope;expiresAt:string;cancelAllowed?:boolean;notBefore?:string;mailLocale?:string}>;
export type MfaRecoveryRecord=Readonly<{stage:string;expiresAt:string;csrfHash:string|null;notBefore?:string|null;userId?:string;emailCiphertext?:CryptoEnvelope;factorId?:string|null;factorSecret?:CryptoEnvelope|null;lastAcceptedStep?:number|null;nowMs?:number}>;
export type BackupEmailRecord=Readonly<{userId:string;status:"pending"|"verified"|"unavailable";channelId:string|null;backupCiphertext:CryptoEnvelope|null;passwordHash:string;factorId:string;factorSecret:CryptoEnvelope;lastAcceptedStep:number|null;nowMs:number;channels:readonly EmailRecoveryChannel[]}>;
export type MfaRecoveryExchangeCandidate=Readonly<{userId:string;passwordHash:string;channels:readonly string[];bindingChannelIds:readonly string[]}>;
// Owner ruling 2026-10-09: the email-link + password recovery waits 24 hours before it replaces anything (the auth DB batch step).
export type MfaRecoveryWaitChannel=Readonly<{channelId:string;channelType:"email"|"recovery_email";addressCiphertext:CryptoEnvelope;cancelAuthorized:boolean}>;
export type MfaRecoveryWaitPreparation=Readonly<{userId:string;proofChannelId:string;channels:readonly MfaRecoveryWaitChannel[]}>;
export type MfaRecoveryWaitStart=Readonly<{status:"WAITING";notBefore:string;expiresAt:string}>;
export type MfaRecoveryFinishCandidate=Readonly<{userId:string;passwordHash:string;notBefore:string;expiresAt:string;ready:boolean}>;
export type MfaRecoverySelectorKind="link"|"session"|"finish";
export type MfaRiskRecord=Readonly<{userId:string;evaluatedAt:string;fingerprint:string;signals:readonly Readonly<{riskSignalId:string;kind:string;ciphertext:CryptoEnvelope;observedAt:string;expiresAt:string}>[]}>;
// The mail language a prepared source carries (R-08, R-09). prepareSource sets it from the request; the writers read it.
// A source the repository did not prepare carries none, so its writers run without the setting and the database refuses them (MAIL_LOCALE_MISSING).
const sourceMailLocales=new WeakMap<object,string>();
function mailLocaleOf(source:EmailRecoverySource):string|undefined{return sourceMailLocales.get(source);}
// NV-39: the digest the source window is keyed by (the caller's /64 for IPv6); a source prepared without a scope is admitted by its address digest.
const sourceAdmissionDigests=new WeakMap<object,string>();
function admissionSource(source:EmailRecoverySource):EmailRecoverySource{const digest=sourceAdmissionDigests.get(source);return digest===undefined?source:{ipArgon2id:digest,userAgentArgon2id:source.userAgentArgon2id};}
// R-06 on the API side: a value outside the 37 values, or none, is English.
function resolvedMailLocale(value:unknown):string{try{return assertMailLocale(typeof value==="string"?value:"");}catch{return "en";}}
class EmailRecoveryRepository{
 constructor(protected readonly pool:Pool,private readonly audit:AuditContextHasher,protected readonly version:number,protected readonly prefix:"backup_email"|"mfa_recovery"){if(!Number.isSafeInteger(version)||version<1)throw TypeError("EMAIL_RECOVERY_REGISTER_INVALID");}
 protected async call<T>(op:string,args:readonly unknown[],mailLocale?:string):Promise<T>{if(!/^[a-z_]+$/.test(op))throw TypeError("EMAIL_CAPABILITY_INVALID");const sql=`SELECT identity.${this.prefix}_${op}(${args.map((_,i)=>`$${i+1}`).join(",")}) AS result`;if(mailLocale===undefined)return(await this.pool.query<{result:T}>(sql,[...args])).rows[0]!.result;return withMailLocale(this.pool,mailLocale,async client=>(await client.query<{result:T}>(sql,[...args])).rows[0]!.result);}
 // NV-39: `admissionScope` (the service's rate-limit scope) is hashed too when it differs from the address.
 async prepareSource(source:AuthSourceContext,admissionScope?:string):Promise<EmailRecoverySource>{const norm=(v:unknown,max:number)=>(typeof v==="string"&&v.trim()?v.trim():"unknown").slice(0,max);const ipInput=norm(source.ip,64),scopeInput=admissionScope===undefined?undefined:norm(admissionScope,64);const[ip,ua,scope]=await Promise.all([this.audit.hashSourceIp(ipInput),this.audit.hashUserAgent(norm(source.userAgent,256)),scopeInput!==undefined&&scopeInput!==ipInput?this.audit.hashSourceIp(scopeInput):undefined]);if(!/^[0-9a-f]{64}$/.test(ip)||!/^[0-9a-f]{64}$/.test(ua)||(scope!==undefined&&!/^[0-9a-f]{64}$/.test(scope)))throw TypeError("EMAIL_RECOVERY_SOURCE_INVALID");const prepared:EmailRecoverySource={ipArgon2id:`argon2id-audit:v1:${ip}`,userAgentArgon2id:`argon2id-audit:v1:${ua}`};sourceMailLocales.set(prepared,resolvedMailLocale(source.mailLocale));if(scope!==undefined)sourceAdmissionDigests.set(prepared,`argon2id-audit:v1:${scope}`);return prepared;}
 async assertRole(){const row=(await this.pool.query<{ok:boolean}>(`SELECT pg_has_role(current_user,$1,'USAGE') AND NOT pg_has_role(current_user,$2,'MEMBER') AND NOT has_table_privilege(current_user,$3,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_any_column_privilege(current_user,$3,'SELECT,INSERT,UPDATE,REFERENCES') AND NOT(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS ok`,[`debateai_${this.prefix}_runtime`,`debateai_${this.prefix}_owner`,`identity.${this.prefix}_control`])).rows[0];if(!row?.ok)throw TypeError("EMAIL_RECOVERY_DATABASE_ROLE_INVALID");}
 expire(n:number){return this.call<number>("expire",[n]);}
 // NV-38: 0125's pending-notice claim, whose lease starts when the claim ends and whose stale-notice sweep never waits on a held row.
 async claimNotice(ms:number):Promise<EmailRecoveryNotice|null>{const notice=await this.call<(EmailRecoveryNotice&Readonly<{mail_locale?:string}>)|null>("claim_pending_notice",[ms]);if(!notice)return null;const{mail_locale:mailLocale,...rest}=notice;return mailLocale===undefined?rest:{...rest,mailLocale};}finishNotice(id:string,lease:string,sent:boolean,retry:number,max:number){return this.call<boolean>("finish_notice",[id,lease,sent,retry,max]);}
}
export class PostgresBackupEmailRepository extends EmailRecoveryRepository{
 constructor(pool:Pool,audit:AuditContextHasher,version:number){super(pool,audit,version,"backup_email");}
 self(id:string,hash:string){return this.call<BackupEmailRecord|null>("self",[id,hash]);}
 admit(id:string,hash:string,source:EmailRecoverySource){return this.call<boolean>("admit_evicting",[id,hash,admissionSource(source),this.version]);}
 start(input:Readonly<{sessionId:string;tokenHash:string;passwordHash:string;factorId:string;factorSecret:CryptoEnvelope;last:number|null;step:number;linkHash:string;notices:readonly unknown[];source:EmailRecoverySource;id:string}>){return this.call<boolean>("start",[input.sessionId,input.tokenHash,input.passwordHash,input.factorId,input.factorSecret,input.last,input.step,input.linkHash,JSON.stringify(input.notices),input.source,this.version,input.id],mailLocaleOf(input.source));}
 confirm(hash:string,source:EmailRecoverySource){return this.call<"VERIFIED"|"INVALID">("confirm",[hash,source],mailLocaleOf(source));}
}
export class PostgresMfaRecoveryRepository extends EmailRecoveryRepository{
 constructor(pool:Pool,audit:AuditContextHasher,version:number){super(pool,audit,version,"mfa_recovery");}
 admit(source:EmailRecoverySource){return this.call<boolean>("admit_evicting",[admissionSource(source),this.version]);}
 prepare(index:Buffer,destination:"primary"|"backup"){return this.call<Readonly<{userId:string;channels:readonly EmailRecoveryChannel[]}>|null>("prepare",[index,destination]);}
 // NV-16: the bounded start (0125), at most three per account and destination in any rolling hour; it delegates to the sealed start.
 start(input:Readonly<{index:Buffer;destination:"primary"|"backup";candidateId:string|null;channels:readonly string[];linkHash:string;cancelHash:string;notices:readonly unknown[];source:EmailRecoverySource;id:string}>){return this.call<boolean>("start_bounded",[input.index,input.destination,input.candidateId,input.channels,input.linkHash,input.cancelHash,JSON.stringify(input.notices),input.source,this.version,input.id],mailLocaleOf(input.source));}
 prepareExchange(hash:string){return this.call<MfaRecoveryExchangeCandidate|null>("prepare_exchange",[hash]);}
 // True when this email link's account already has a replacement waiting its 24 hours (stale waiting rows are closed).
 linkWaiting(hash:string){return this.call<boolean>("link_waiting",[hash]);}
 risk(selector:string,kind:MfaRecoverySelectorKind){return this.call<MfaRiskRecord|null>("risk",[selector,kind]);}
 exchange(link:string,password:string,session:string,csrf:string,refs:CryptoEnvelope,risk:string,source:EmailRecoverySource){return this.call<"FACTOR_REQUIRED"|"INVALID">("exchange",[link,password,session,csrf,refs,risk,source],mailLocaleOf(source));}
 read(hash:string){return this.call<MfaRecoveryRecord|null>("read",[hash]);}
 stageFactor(hash:string,id:string,secret:CryptoEnvelope,source:EmailRecoverySource){return this.call<boolean>("stage_factor",[hash,id,secret,source]);}
 verifyFactor(hash:string,id:string,secret:CryptoEnvelope,last:number|null,step:number,source:EmailRecoverySource){return this.call<boolean>("verify_factor",[hash,id,secret,last,step,source]);}
 stageCodes(hash:string,codes:readonly unknown[],source:EmailRecoverySource){return this.call<boolean>("stage_codes",[hash,JSON.stringify(codes),source]);}
 readCode(hash:string,slot:number){return this.call<Readonly<{codeHash:string;slot:number}>|null>("read_code",[hash,slot]);}
 acknowledge(hash:string,slot:number,codeHash:string,source:EmailRecoverySource){return this.call<boolean>("ack_code",[hash,slot,codeHash,source]);}
 prepareWait(hash:string){return this.call<MfaRecoveryWaitPreparation|null>("prepare_wait",[hash]);}
 beginWait(hash:string,risk:string,finish:string,cancel:string,notices:readonly unknown[],source:EmailRecoverySource){return this.call<MfaRecoveryWaitStart|null>("begin_wait",[hash,risk,finish,cancel,JSON.stringify(notices),source],mailLocaleOf(source));}
 // NV-38: the claim returns mail_locale itself (no second, lease-refusing read); a missing or unknown one fails closed.
 override async claimNotice(ms:number):Promise<EmailRecoveryNotice|null>{const notice=await super.claimNotice(ms);if(!notice)return null;return{...notice,mailLocale:assertMailLocale(notice.mailLocale??"")};}
 prepareFinish(finish:string){return this.call<MfaRecoveryFinishCandidate|null>("prepare_finish",[finish]);}
 finish(finish:string,password:string,risk:string,source:EmailRecoverySource){return this.call<"COMPLETED"|"TOO_EARLY"|"INVALID">("finish",[finish,password,risk,source],mailLocaleOf(source));}
 cancel(hash:string,source:EmailRecoverySource){return this.call<"CANCELLED"|"INVALID">("cancel",[hash,source],mailLocaleOf(source));}cancelSession(hash:string,source:EmailRecoverySource){return this.call<"CANCELLED"|"INVALID">("cancel_session",[hash,source],mailLocaleOf(source));}
 failure(hash:string,kind:MfaRecoverySelectorKind,source:EmailRecoverySource){return this.call<void>("failure",[hash,kind,source],mailLocaleOf(source));}
 // NV-15: a wrong exchange or finish password (0125's recorder): the per-challenge counter, then the account-level limit that writes RECOVERY_PROOF_FAILED.
 recordFailure(hash:string,kind:"link"|"finish",source:EmailRecoverySource,context:CryptoEnvelope|null){return this.call<"PROOF_INVALID"|"REFUSED"|"INVALID">("record_failure",[hash,kind,source,context],mailLocaleOf(source));}
}

import type{Pool}from"pg";import type{AuditContextHasher,CryptoEnvelope}from"@debateai/crypto";import type{AuthSourceContext}from"./identity.js";import type{PasswordRecoveryCandidate}from"./recovery-candidate.js";
export type EmailRecoverySource=Readonly<{ipArgon2id:string;userAgentArgon2id:string}>;
export type EmailRecoveryChannel=PasswordRecoveryCandidate["channels"][number]&Readonly<{cancelAuthorized?:boolean}>;
export type EmailRecoveryNotice=Readonly<{noticeId:string;leaseId:string;userId:string;channelId:string;event:"PROOF"|"VERIFIED"|"STARTED"|"COMPLETED"|"CANCELLED"|"REFUSED";payload:CryptoEnvelope;expiresAt:string;cancelAllowed?:boolean}>;
export type MfaRecoveryRecord=Readonly<{stage:string;expiresAt:string;csrfHash:string|null;userId?:string;emailCiphertext?:CryptoEnvelope;factorId?:string|null;factorSecret?:CryptoEnvelope|null;lastAcceptedStep?:number|null;nowMs?:number}>;
export type BackupEmailRecord=Readonly<{userId:string;status:"pending"|"verified"|"unavailable";channelId:string|null;backupCiphertext:CryptoEnvelope|null;passwordHash:string;factorId:string;factorSecret:CryptoEnvelope;lastAcceptedStep:number|null;nowMs:number;channels:readonly EmailRecoveryChannel[]}>;
export type MfaRecoveryExchangeCandidate=Readonly<{userId:string;passwordHash:string;channels:readonly string[];bindingChannelIds:readonly string[]}>;
export type MfaRiskRecord=Readonly<{userId:string;evaluatedAt:string;fingerprint:string;signals:readonly Readonly<{riskSignalId:string;kind:string;ciphertext:CryptoEnvelope;observedAt:string;expiresAt:string}>[]}>;
class EmailRecoveryRepository{
 constructor(protected readonly pool:Pool,private readonly audit:AuditContextHasher,protected readonly version:number,protected readonly prefix:"backup_email"|"mfa_recovery"){if(!Number.isSafeInteger(version)||version<1)throw TypeError("EMAIL_RECOVERY_REGISTER_INVALID");}
 protected async call<T>(op:string,args:readonly unknown[]):Promise<T>{if(!/^[a-z_]+$/.test(op))throw TypeError("EMAIL_CAPABILITY_INVALID");return(await this.pool.query<{result:T}>(`SELECT identity.${this.prefix}_${op}(${args.map((_,i)=>`$${i+1}`).join(",")}) AS result`,[...args])).rows[0]!.result;}
 async prepareSource(source:AuthSourceContext):Promise<EmailRecoverySource>{const norm=(v:unknown,max:number)=>(typeof v==="string"&&v.trim()?v.trim():"unknown").slice(0,max);const[ip,ua]=await Promise.all([this.audit.hashSourceIp(norm(source.ip,64)),this.audit.hashUserAgent(norm(source.userAgent,256))]);if(!/^[0-9a-f]{64}$/.test(ip)||!/^[0-9a-f]{64}$/.test(ua))throw TypeError("EMAIL_RECOVERY_SOURCE_INVALID");return{ipArgon2id:`argon2id-audit:v1:${ip}`,userAgentArgon2id:`argon2id-audit:v1:${ua}`};}
 async assertRole(){const row=(await this.pool.query<{ok:boolean}>(`SELECT pg_has_role(current_user,$1,'USAGE') AND NOT pg_has_role(current_user,$2,'MEMBER') AND NOT has_table_privilege(current_user,$3,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_any_column_privilege(current_user,$3,'SELECT,INSERT,UPDATE,REFERENCES') AND NOT(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS ok`,[`debateai_${this.prefix}_runtime`,`debateai_${this.prefix}_owner`,`identity.${this.prefix}_control`])).rows[0];if(!row?.ok)throw TypeError("EMAIL_RECOVERY_DATABASE_ROLE_INVALID");}
 expire(n:number){return this.call<number>("expire",[n]);}claimNotice(ms:number){return this.call<EmailRecoveryNotice|null>("claim_notice",[ms]);}finishNotice(id:string,lease:string,sent:boolean,retry:number,max:number){return this.call<boolean>("finish_notice",[id,lease,sent,retry,max]);}
}
export class PostgresBackupEmailRepository extends EmailRecoveryRepository{
 constructor(pool:Pool,audit:AuditContextHasher,version:number){super(pool,audit,version,"backup_email");}
 self(id:string,hash:string){return this.call<BackupEmailRecord|null>("self",[id,hash]);}
 admit(id:string,hash:string,source:EmailRecoverySource){return this.call<boolean>("admit",[id,hash,source,this.version]);}
 start(input:Readonly<{sessionId:string;tokenHash:string;passwordHash:string;factorId:string;factorSecret:CryptoEnvelope;last:number|null;step:number;linkHash:string;notices:readonly unknown[];source:EmailRecoverySource;id:string}>){return this.call<boolean>("start",[input.sessionId,input.tokenHash,input.passwordHash,input.factorId,input.factorSecret,input.last,input.step,input.linkHash,JSON.stringify(input.notices),input.source,this.version,input.id]);}
 confirm(hash:string,source:EmailRecoverySource){return this.call<"VERIFIED"|"INVALID">("confirm",[hash,source]);}
}
export class PostgresMfaRecoveryRepository extends EmailRecoveryRepository{
 constructor(pool:Pool,audit:AuditContextHasher,version:number){super(pool,audit,version,"mfa_recovery");}
 admit(source:EmailRecoverySource){return this.call<boolean>("admit",[source,this.version]);}
 prepare(index:Buffer,destination:"primary"|"backup"){return this.call<Readonly<{userId:string;channels:readonly EmailRecoveryChannel[]}>|null>("prepare",[index,destination]);}
 start(input:Readonly<{index:Buffer;destination:"primary"|"backup";candidateId:string|null;channels:readonly string[];linkHash:string;cancelHash:string;notices:readonly unknown[];source:EmailRecoverySource;id:string}>){return this.call<boolean>("start",[input.index,input.destination,input.candidateId,input.channels,input.linkHash,input.cancelHash,JSON.stringify(input.notices),input.source,this.version,input.id]);}
 prepareExchange(hash:string){return this.call<MfaRecoveryExchangeCandidate|null>("prepare_exchange",[hash]);}
 risk(selector:string,kind:"link"|"session"){return this.call<MfaRiskRecord|null>("risk",[selector,kind]);}
 exchange(link:string,password:string,session:string,csrf:string,refs:CryptoEnvelope,risk:string,source:EmailRecoverySource){return this.call<"FACTOR_REQUIRED"|"INVALID">("exchange",[link,password,session,csrf,refs,risk,source]);}
 read(hash:string){return this.call<MfaRecoveryRecord|null>("read",[hash]);}
 stageFactor(hash:string,id:string,secret:CryptoEnvelope,source:EmailRecoverySource){return this.call<boolean>("stage_factor",[hash,id,secret,source]);}
 verifyFactor(hash:string,id:string,secret:CryptoEnvelope,last:number|null,step:number,source:EmailRecoverySource){return this.call<boolean>("verify_factor",[hash,id,secret,last,step,source]);}
 stageCodes(hash:string,codes:readonly unknown[],source:EmailRecoverySource){return this.call<boolean>("stage_codes",[hash,JSON.stringify(codes),source]);}
 readCode(hash:string,slot:number){return this.call<Readonly<{codeHash:string;slot:number}>|null>("read_code",[hash,slot]);}
 acknowledge(hash:string,slot:number,codeHash:string,source:EmailRecoverySource){return this.call<boolean>("ack_code",[hash,slot,codeHash,source]);}
 complete(hash:string,risk:string,source:EmailRecoverySource){return this.call<"COMPLETED"|"INVALID">("complete",[hash,risk,source]);}
 cancel(hash:string,source:EmailRecoverySource){return this.call<"CANCELLED"|"INVALID">("cancel",[hash,source]);}cancelSession(hash:string,source:EmailRecoverySource){return this.call<"CANCELLED"|"INVALID">("cancel_session",[hash,source]);}
 failure(hash:string,kind:"link"|"session",source:EmailRecoverySource){return this.call<void>("failure",[hash,kind,source]);}
}

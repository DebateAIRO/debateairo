import { strictJson, withPrivateBytes } from './custody.mjs';
import { refuseNamed } from './startup-refusals.mjs';
import { PUBLIC_ORIGINS } from './public-origins.mjs';
import { PREVIEW_ORIGIN } from './turnstile-custody.mjs';
/** The owner's mail plan: root-owned, 0644, one link, at most 4 KiB. The mail hand-off reads it at every mail. */
export const MAIL_PLAN_PATH='/etc/debateai-v3-preview/auth-dev-v1/mail-plan.json';
const LEGACY_SCHEMA='preview-auth-dev-mail-v1',SITE_SCHEMA='preview-auth-dev-mail-v2';
const PLAN_KEYS=Object.freeze(['schema','apiUid','mailFrom','publicAppUrl','transportTimeoutMs']);
const sameKeys=(value,keys)=>Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
/** The plan file, strict JSON, with today's custody. Any failure is PREVIEW_MAIL_PLAN_UNREADABLE. */
export async function readMailPlan() {
 try{return await withPrivateBytes(MAIL_PLAN_PATH,{root:'/etc/debateai-v3-preview/auth-dev-v1',uid:0,mode:0o644,maxBytes:4096},raw=>strictJson(raw));}
 catch{return refuseNamed('PREVIEW_MAIL_PLAN_UNREADABLE');}
}
/**
 * The one parser of the mail plan, for the hand-off at every mail and the API launcher at start.
 * - Schema preview-auth-dev-mail-v1 is today's file and mode "legacy": the frozen account transport, the allow-list and
 *   the recovery helper, on the test name only. It is accepted exactly when today's check accepted it.
 * - Schema preview-auth-dev-mail-v2 adds "recipients": "allow-list" keeps the allow-list (recipientPolicy, as in v1) for
 *   every family, "open" sends each mail to its own To and must not carry a recipientPolicy. Either public origin may be named.
 * `apiUid` is the uid the API runs as and `mailFrom` the API's sender. Each refusal is named and carries no value.
 */
export function parseMailPlan(plan,{apiUid,mailFrom}) {
 if(!plan||typeof plan!=='object'||Object.getPrototypeOf(plan)!==Object.prototype||![LEGACY_SCHEMA,SITE_SCHEMA].includes(plan.schema))refuseNamed('PREVIEW_MAIL_PLAN_SCHEMA');
 const legacy=plan.schema===LEGACY_SCHEMA;
 if(!legacy&&!Object.hasOwn(plan,'recipients'))refuseNamed('PREVIEW_MAIL_PLAN_SCHEMA');
 if(!legacy&&!['allow-list','open'].includes(plan.recipients))refuseNamed('PREVIEW_MAIL_MODE_UNKNOWN');
 const mode=legacy?'legacy':plan.recipients;
 // Open together with an allow-list is refused rather than guessed between.
 if(mode==='open'&&Object.hasOwn(plan,'recipientPolicy'))refuseNamed('PREVIEW_MAIL_OPEN_WITH_ALLOW_LIST');
 if(!sameKeys(plan,[...PLAN_KEYS,...(legacy?[]:['recipients']),...(mode==='open'?[]:['recipientPolicy'])])
  ||!Number.isSafeInteger(plan.apiUid)||typeof plan.mailFrom!=='string'||typeof plan.publicAppUrl!=='string'||!Number.isSafeInteger(plan.transportTimeoutMs))refuseNamed('PREVIEW_MAIL_PLAN_SCHEMA');
 // Exactly one of the listed origins: https, no path, no trailing slash (public-origins.mjs).
 if(!PUBLIC_ORIGINS.includes(plan.publicAppUrl))refuseNamed('PREVIEW_MAIL_ORIGIN_NOT_ALLOWED');
 // The frozen transport and the recovery helper know only the test name, so on another name every mail would fail unheard.
 if(legacy&&plan.publicAppUrl!==PREVIEW_ORIGIN)refuseNamed('PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN');
 if(plan.mailFrom!==mailFrom)refuseNamed('PREVIEW_MAIL_FROM_MISMATCH');
 if(plan.apiUid===0||plan.apiUid!==apiUid)refuseNamed('PREVIEW_MAIL_UID_MISMATCH');
 return Object.freeze({mode,apiUid:plan.apiUid,mailFrom:plan.mailFrom,publicAppUrl:plan.publicAppUrl,transportTimeoutMs:plan.transportTimeoutMs,...(mode==='open'?{}:{recipientPolicy:plan.recipientPolicy})});
}
/** The allow-list read exactly as the hand-off reads it, loaded only when needed (the hand-off loads the frozen transport). */
const readAllowListAsHandOff=async recipientPolicy=>(await import('./mail-handoff.mjs')).readRecipientPolicy(recipientPolicy);
/**
 * The API's mail transport timeout (packages/register/src/auth-policy.ts, channel transport_timeout_ms). The hand-off
 * refuses every mail whose plan names another value. This check loads no TypeScript, so it compares with this copy;
 * a test keeps the copy equal to the source.
 */
const API_TRANSPORT_TIMEOUT_MS=5000;
/**
 * What the API launcher checks about mail before the API starts: the plan must parse for this unit's user and sender,
 * carry the API's transport timeout, name the origin the API answers as (a v1 plan only the test name), and in
 * allow-list mode the allow-list must read. Then one content-free line says the mode and the origin, both from closed
 * lists. The hand-off still checks the plan at every mail, so an edit takes effect at the next mail; a restart runs
 * this check and prints the line again. The second argument is a seam for tests only.
 */
export async function checkMailAtStart({plan,configured},{readPlan=readMailPlan,readAllowList=readAllowListAsHandOff,write=line=>process.stdout.write(line)}={}) {
 const mail=parseMailPlan(await readPlan(),{apiUid:plan?.serviceUid,mailFrom:configured?.MAIL_FROM});
 if(mail.transportTimeoutMs!==API_TRANSPORT_TIMEOUT_MS)refuseNamed('PREVIEW_MAIL_TIMEOUT_MISMATCH');
 const origin=configured?.PUBLIC_APP_URL;
 if(mail.mode==='legacy'&&origin!==PREVIEW_ORIGIN)refuseNamed('PREVIEW_MAIL_LEGACY_NEEDS_PREVIEW_ORIGIN');
 if(mail.publicAppUrl!==origin)refuseNamed('PREVIEW_MAIL_ORIGIN_MISMATCH');
 if(mail.mode==='allow-list'){try{await readAllowList(mail.recipientPolicy);}catch{refuseNamed('PREVIEW_MAIL_ALLOW_LIST_UNREADABLE');}}
 write(`PREVIEW_MAIL_MODE ${JSON.stringify({mode:mail.mode,origin:PUBLIC_ORIGINS.find(listed=>listed===mail.publicAppUrl)})}\n`);
}

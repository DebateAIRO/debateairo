import { exactKeys, refuse } from './custody.mjs';
import { RELEASE_LABEL } from './launch-plan.mjs';
/**
 * The database-ahead file (side-by-side spec 2026-10-21 §5, "database ahead"; plan D, task D5). During an upload the
 * newer release moves the shared database forward by n1-expand steps while the older release keeps running; the older
 * release's native verify (verify-native.ts) accepts that database only against this root-owned file, which root pins
 * on the older release with `prestart.mjs accept-ahead` (the lock records its sha256) and the proof names.
 *
 * Plain words: "the newer release <newerLabel>, built from <newerSourceManifest>, adds exactly these database steps
 * after the older release <olderLabel>, and this is its own list of every step it has (newerChain)".
 *
 *   schema               preview-database-ahead-v1
 *   olderLabel           the release that reads the file (its native-plan-<label>.json, its database-ahead-<label>.json)
 *   olderSourceRevision  that release's source revision (its native plan's)
 *   newerLabel           the release that moves the database (never the older one)
 *   newerSourceRevision  its source revision
 *   newerSourceManifest  {path, sha256} of its candidate API source manifest (root-owned 0644, read through readPublicArtifact)
 *   steps                [{name, sha256}], 1..64, ascending: the migrations the newer manifest adds to the older one
 *                        (preview-lifecycle/v1/migration-steps.mjs addedMigrations), each with both n1 header lines
 *   newerChain           the newer release's whole forward chain as its describeForwardSteps() prints it
 *                        (packages/db/src/migration-ahead.ts ForwardStepDeclaration), 1..128 entries, ascending; its
 *                        last steps are exactly `steps` (same names, sourceSha256 = the step's sha256, n1Expand and
 *                        keepsVerifier). verify-native.ts hands it to plan A's verifyDatabaseAhead as `newerChain`.
 *
 * release-artifacts.mjs `database-ahead` writes it; native-operator.mjs reads it; prestart.mjs accept-ahead checks it
 * before pinning. Every refusal is PREVIEW_DATABASE_AHEAD_REFUSED (the operator line stays opaque).
 */
export const DATABASE_AHEAD_SCHEMA='preview-database-ahead-v1';
/** The folder root keeps every per-release file in (native-plan-<label>.json, database-ahead-<label>.json). */
export const DATABASE_AHEAD_ROOT='/etc/debateai-v3-preview/auth-dev-v1';
/** The file's byte bound, for its writer and both readers: the newer chain grows by one entry per migration. */
export const DATABASE_AHEAD_MAX_BYTES=65536;
export const DATABASE_AHEAD_MAX_STEPS=64;
export const DATABASE_AHEAD_MAX_CHAIN=128;
const CODE='PREVIEW_DATABASE_AHEAD_REFUSED';
const KEYS=['schema','olderLabel','olderSourceRevision','newerLabel','newerSourceRevision','newerSourceManifest','steps','newerChain'];
const CHAIN_KEYS=['name','manifestSha256','sourceSha256','verifierSha256','n1Expand','keepsVerifier','outsideTransaction'];
/** A forward step's file name (packages/db/src/migration-forward-chain.ts FORWARD_STEP_NAME). */
const STEP=/^\d{4}_[a-z0-9_]+\.sql$/;
const HASH=/^[a-f0-9]{64}$/;
const GIT=/^[a-f0-9]{40}$/;
const label=value=>typeof value==='string'&&RELEASE_LABEL.test(value);
const ascending=names=>names.every((name,index)=>index===0||names[index-1]<name);
const absoluteJson=path=>typeof path==='string'&&path.startsWith('/')&&path.endsWith('.json')&&!path.split('/').some(part=>part==='.'||part==='..')&&!/[\0-\x1f\x7f]|\/\//.test(path);

/** The release's own database-ahead file: `database-ahead-<label>.json` in DATABASE_AHEAD_ROOT. */
export function databaseAheadPathForLabel(release) {
 if(!label(release))refuse(CODE);
 return `${DATABASE_AHEAD_ROOT}/database-ahead-${release}.json`;
}

/** The whole file, strictly: exact keys at every level and every rule above. Returns the value unchanged. */
export function validateDatabaseAheadFile(value) {
 exactKeys(value,KEYS,CODE);
 if(value.schema!==DATABASE_AHEAD_SCHEMA||!label(value.olderLabel)||!label(value.newerLabel)||value.olderLabel===value.newerLabel
  ||!GIT.test(value.olderSourceRevision??'')||!GIT.test(value.newerSourceRevision??''))refuse(CODE);
 exactKeys(value.newerSourceManifest,['path','sha256'],CODE);
 if(!absoluteJson(value.newerSourceManifest.path)||!HASH.test(value.newerSourceManifest.sha256??''))refuse(CODE);
 const {steps,newerChain}=value;
 if(!Array.isArray(steps)||steps.length<1||steps.length>DATABASE_AHEAD_MAX_STEPS)refuse(CODE);
 for(const step of steps){exactKeys(step,['name','sha256'],CODE);if(!STEP.test(step.name??'')||!HASH.test(step.sha256??''))refuse(CODE);}
 if(!Array.isArray(newerChain)||newerChain.length<steps.length||newerChain.length>DATABASE_AHEAD_MAX_CHAIN)refuse(CODE);
 for(const entry of newerChain){
  exactKeys(entry,CHAIN_KEYS,CODE);
  if(!STEP.test(entry.name??'')||![entry.manifestSha256,entry.sourceSha256,entry.verifierSha256].every(digest=>HASH.test(digest??''))
   ||![entry.n1Expand,entry.keepsVerifier,entry.outsideTransaction].every(flag=>typeof flag==='boolean'))refuse(CODE);
 }
 if(!ascending(steps.map(step=>step.name))||!ascending(newerChain.map(entry=>entry.name)))refuse(CODE);
 // The added steps are the newer chain's last ones, declared expand and keeps-verifier, with the manifest's bytes.
 const tail=newerChain.slice(newerChain.length-steps.length);
 if(steps.some((step,index)=>tail[index].name!==step.name||tail[index].sourceSha256!==step.sha256||tail[index].n1Expand!==true||tail[index].keepsVerifier!==true))refuse(CODE);
 return value;
}

import { exactKeys,refuse } from './custody.mjs';
import { validatePublication } from './runtime-receipt.mjs';
/** launch-plan.mjs RELEASE_LABEL (kept here: launch-plan.mjs imports this file); preview-auth-dev-plans.test.ts pins the two equal. */
export const RELEASE_LABEL=/^[a-z0-9](?:[a-z0-9-]{0,70}[a-z0-9])?$/;
const MIGRATION=/^\d{4}_[a-z0-9_]+\.sql$/;
const HASH=/^[a-f0-9]{64}$/;
/**
 * Side-by-side spec 2026-10-21 §5 ("database ahead", plan D task D5): `databaseAhead` is null on a database this source
 * knows whole, or {fileSha256, newerLabel, extraSteps} when verify accepted steps a newer release added (1..64 migration
 * names, ascending) against the root-pinned database-ahead file with that sha256. A caller that knows the lock passes
 * `binding.databaseAheadSha256` (the pinned file's sha256, or null when none is pinned); a non-null proof must then name
 * exactly that file. The launcher and the release tool do not know the lock and check the shape only.
 */
function validateDatabaseAhead(ahead,binding) {
 if(ahead===null)return;
 exactKeys(ahead,['fileSha256','newerLabel','extraSteps'],'PREVIEW_NATIVE_ATTESTATION_REFUSED');
 const steps=ahead.extraSteps;
 if(!HASH.test(ahead.fileSha256??'')||typeof ahead.newerLabel!=='string'||!RELEASE_LABEL.test(ahead.newerLabel)||!Array.isArray(steps)||steps.length<1||steps.length>64
  ||steps.some((name,index)=>typeof name!=='string'||!MIGRATION.test(name)||(index>0&&steps[index-1]>=name)))refuse('PREVIEW_NATIVE_ATTESTATION_REFUSED');
 if(Object.hasOwn(binding,'databaseAheadSha256')&&ahead.fileSha256!==binding.databaseAheadSha256)refuse('PREVIEW_NATIVE_ATTESTATION_REFUSED');
}
export function validateNativeAttestation(value,binding,now=Date.now()) {
 exactKeys(value,['schema','sourceRevision','sourceTree','nativeSourceSha256','verifiedAt','postgresMajor','executorRole','executorOid','ledgerOwnerOid','billingOwnerOid','defaultOwnerCount','ledgerCount','resolutionCount','forwardCount','catalogSha256','ledgerSha256','resolutionSha256','forwardSha256','cohortCount','capabilityCounts','currentContractVerified','publication','databaseAhead'],'PREVIEW_NATIVE_ATTESTATION_REFUSED');
 validatePublication(value.publication);validatePublication(binding.publication);
 if(Object.hasOwn(binding,'databaseAheadSha256')&&binding.databaseAheadSha256!==null&&!HASH.test(binding.databaseAheadSha256??''))refuse('PREVIEW_NATIVE_ATTESTATION_REFUSED');
 validateDatabaseAhead(value.databaseAhead,binding);
 const age=now-Date.parse(value.verifiedAt);
 if(value.schema!=='preview-auth-dev-native-v1'||value.sourceRevision!==binding.sourceRevision||value.sourceTree!==binding.sourceTree||value.nativeSourceSha256!==binding.nativeSourceSha256
  ||!Number.isFinite(age)||age< -5000||age>180000||value.postgresMajor!==18||value.executorRole!=='debateai_prod_migrator'
  ||!Number.isSafeInteger(value.executorOid)||value.executorOid<1||value.executorOid!==value.ledgerOwnerOid||value.executorOid!==value.billingOwnerOid||value.defaultOwnerCount!==6
  ||value.forwardCount!==1||value.currentContractVerified!==true||['ledgerCount','resolutionCount','cohortCount'].some(key=>!Number.isSafeInteger(value[key])||value[key]<0)
  ||['nativeSourceSha256','catalogSha256','ledgerSha256','resolutionSha256','forwardSha256'].some(key=>!/^[a-f0-9]{64}$/.test(value[key]))
  ||!value.capabilityCounts||Object.values(value.capabilityCounts).some(count=>!Number.isSafeInteger(count)||count<0)
  ||new Date(value.publication.recordedAt).getTime()!==new Date(binding.publication.recordedAt).getTime()
  ||['registerVersion','baseRegisterVersion','requestSha256','snapshotSha256','rowCount','publicationId'].some(key=>value.publication[key]!==binding.publication[key]))refuse('PREVIEW_NATIVE_ATTESTATION_REFUSED');
 return value;
}

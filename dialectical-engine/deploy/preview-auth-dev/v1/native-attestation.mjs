import { exactKeys,refuse } from './custody.mjs';
import { validatePublication } from './runtime-receipt.mjs';
export function validateNativeAttestation(value,binding,now=Date.now()) {
 exactKeys(value,['schema','sourceRevision','sourceTree','nativeSourceSha256','verifiedAt','postgresMajor','executorRole','executorOid','ledgerOwnerOid','billingOwnerOid','defaultOwnerCount','ledgerCount','resolutionCount','forwardCount','catalogSha256','ledgerSha256','resolutionSha256','forwardSha256','cohortCount','capabilityCounts','currentContractVerified','publication'],'PREVIEW_NATIVE_ATTESTATION_REFUSED');
 validatePublication(value.publication);validatePublication(binding.publication);
 const age=now-Date.parse(value.verifiedAt);
 if(value.schema!=='preview-auth-dev-native-v1'||value.sourceRevision!==binding.sourceRevision||value.sourceTree!==binding.sourceTree||value.nativeSourceSha256!==binding.nativeSourceSha256
  ||!Number.isFinite(age)||age< -5000||age>180000||value.postgresMajor!==18||value.executorRole!=='debateai_prod_migrator'
  ||!Number.isSafeInteger(value.executorOid)||value.executorOid<1||value.executorOid!==value.ledgerOwnerOid||value.executorOid!==value.billingOwnerOid||value.defaultOwnerCount!==6
  ||value.forwardCount!==1||value.currentContractVerified!==true||['ledgerCount','resolutionCount','cohortCount'].some(key=>!Number.isSafeInteger(value[key])||value[key]<0)
  ||['nativeSourceSha256','catalogSha256','ledgerSha256','resolutionSha256','forwardSha256'].some(key=>!/^[a-f0-9]{64}$/.test(value[key]))
  ||!value.capabilityCounts||Object.values(value.capabilityCounts).some(count=>!Number.isSafeInteger(count)||count<0)
  ||['registerVersion','baseRegisterVersion','requestSha256','snapshotSha256','rowCount','publicationId'].some(key=>value.publication[key]!==binding.publication[key]))refuse('PREVIEW_NATIVE_ATTESTATION_REFUSED');
 return value;
}

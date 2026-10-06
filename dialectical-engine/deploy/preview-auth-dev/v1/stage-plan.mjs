import { exactKeys,refuse } from './custody.mjs';
export const STAGE=Object.freeze({cluster:'debateai-preview-auth-dev-stage-v1',database:'debateai_preview_auth_dev_stage',socket:'/run/debateai-preview-auth-dev-stage/postgresql',dataDirectory:'/var/lib/postgresql/18/preview-auth-dev-stage',port:55434,apiPort:55431,uiPort:55430,postgresMajor:18});
export function validateStagePlan(plan) {
 exactKeys(plan,['schema','candidateRoot','fallbackRoot','sourceRevision','sourceTree',...Object.keys(STAGE)],'PREVIEW_STAGE_PLAN_REFUSED');
 if(plan.schema!=='preview-auth-dev-stage-v1'||Object.entries(STAGE).some(([key,value])=>plan[key]!==value)
  ||!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-candidate-[a-z0-9-]{1,80}$/.test(plan.candidateRoot)
  ||!/^\/opt\/debateai-v3-preview\/releases\/auth-dev-fallback-[a-z0-9-]{1,80}$/.test(plan.fallbackRoot)
  ||plan.candidateRoot===plan.fallbackRoot||!/^([a-f0-9]{40})$/.test(plan.sourceRevision)||!/^([a-f0-9]{40})$/.test(plan.sourceTree))refuse('PREVIEW_STAGE_PLAN_REFUSED');
 return plan;
}
/** Exact controller commands. This module plans only; it never creates or stops a cluster. */
export function stageClusterCommands(plan) {
 validateStagePlan(plan);
 return Object.freeze({
  init:['/usr/lib/postgresql/18/bin/initdb','-D',STAGE.dataDirectory,'--username=postgres','--auth-local=peer','--auth-host=reject','--encoding=UTF8'],
  start:['/usr/lib/postgresql/18/bin/pg_ctl','-D',STAGE.dataDirectory,'-o',`-c cluster_name=${STAGE.cluster} -c port=${STAGE.port} -c unix_socket_directories=${STAGE.socket} -c listen_addresses=`, '-w','start'],
  stop:['/usr/lib/postgresql/18/bin/pg_ctl','-D',STAGE.dataDirectory,'-m','fast','-w','stop'],
  create:['/usr/lib/postgresql/18/bin/createdb','-h',STAGE.socket,'-p',String(STAGE.port),STAGE.database]
 });
}
export const STAGE_REQUIRED_PROOFS=Object.freeze(['candidate-api-listen','candidate-ui-listen','fallback-api-listen','fallback-ui-listen','legacy-primary-recovery','pending-backup-notice-no-cancel','postcutover-legacy-denied','passkey-general-recovery','direct-totp-general-recovery','nullable-provider-general-recovery','retired103-denied','private-table-and-column-denied','scoped-cookie-and-origin','proxy-exact-path-deadline','mail-capture-and-drain','turnstile-mock-refusals']);
export function assertStageCompletion(receipt,plan) {
 validateStagePlan(plan);
 if(receipt?.schema!=='preview-auth-dev-stage-result-v1'||receipt.platform!=='linux'||receipt.sourceRevision!==plan.sourceRevision||receipt.sourceTree!==plan.sourceTree
  ||receipt.cluster!==STAGE.cluster||receipt.database!==STAGE.database||receipt.postgresMajor!==18||receipt.candidateRoot!==plan.candidateRoot||receipt.fallbackRoot!==plan.fallbackRoot
  ||STAGE_REQUIRED_PROOFS.some(name=>receipt.proofs?.[name]?.passed!==true||!/^[a-f0-9]{64}$/.test(receipt.proofs[name].receiptSha256))
  ||receipt.runnerStarted!==false||receipt.realMailSent!==false||receipt.providerNetworkCalled!==false)refuse('PREVIEW_STAGE_INCOMPLETE');
 return true;
}

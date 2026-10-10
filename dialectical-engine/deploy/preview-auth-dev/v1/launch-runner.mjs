import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { prepareLaunch } from './launch-plan.mjs';
import { readEnvironmentFile,narrowEnvironment,installNarrowEnvironment } from './environment.mjs';
import { afterRunnerReady,linuxProcessIdentity } from './runtime-receipt.mjs';
import { refuse } from './custody.mjs';
/** The in-process readiness event apps/runner/src/runner-ready.ts announces (RUNNER_READY_PROCESS_EVENT). */
export const RUNNER_READY_PROCESS_EVENT='debateai:runner-ready';
/** Prepare-only (the default, `--plan <file>`): validates plan, custody and environment; starts nothing. */
export async function prepareRunner(argv) {
 const {plan,source}=await prepareLaunch(argv,'runner',import.meta.url);
 const runtime=await tsImport(join(plan.sourceRoot,'dialectical-engine/packages/register/src/runtime-environment.ts'),import.meta.url);
 narrowEnvironment('runner',await readEnvironmentFile(plan.environment.path,plan.environment),runtime,plan.publication,plan);
 return {schema:'preview-auth-dev-runner-prepared-v1',sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,registerVersion:plan.publication.registerVersion,started:false,runtimeSelectionVerified:false};
}
/**
 * Start (`--start --plan <file>`), the API launcher's sequence for the runner: the same shared
 * prepareLaunch custody gate, the same narrowed environment for role 'runner', the selected
 * restricted runner connection checked, then the real main imported in this same process. The
 * content-free PREVIEW_RUNNER_STARTED event is printed only after the real main announced
 * readiness (worker ready, start-up re-dispatch done) with an unchanged register selection.
 */
export async function launchRunner(argv) {
 const {plan,source}=await prepareLaunch(argv,'runner',import.meta.url);
 const engine=join(plan.sourceRoot,'dialectical-engine');
 const runtime=await tsImport(join(engine,'packages/register/src/runtime-environment.ts'),import.meta.url);
 const configured=await readEnvironmentFile(plan.environment.path,plan.environment);
 const selected=narrowEnvironment('runner',configured,runtime,plan.publication,plan);
 // Starting is preview-only: the start-up team gate is off without the preview configuration, so
 // a start without it (or with no team) is refused here rather than run without the team rule.
 const parsed=runtime.parseRunnerEnvironment(configured);
 if(parsed.PREVIEW_PROVIDER_TEST_CONFIG===undefined||!Array.isArray(parsed.PREVIEW_TEAM_USER_IDS)||parsed.PREVIEW_TEAM_USER_IDS.length===0)refuse('PREVIEW_RUNNER_TEAM_REQUIRED');
 const verify=await tsImport('./verify-native.ts',import.meta.url);
 await verify.assertSelectedRunnerConnection(configured,plan.publication);
 const entry=join(engine,'apps/runner/src/main.ts'),main=source.files.find(file=>file.path==='dialectical-engine/apps/runner/src/main.ts');
 if(!main)refuse('PREVIEW_RUNNER_MAIN_UNBOUND');
 process.chdir(engine);installNarrowEnvironment(selected.environment);
 return afterRunnerReady({binding:{sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,sourceManifestSha256:plan.sourceManifest.sha256,operatorManifestSha256:plan.operatorManifestSha256,contractSha256:source.contractSha256,runnerMainSha256:main.sha256},publication:plan.publication,identity:await linuxProcessIdentity(),
  readSelection:()=>({REGISTER_VERSION:process.env.REGISTER_VERSION,DEBATEAI_DEPLOYMENT_MODE:process.env.DEBATEAI_DEPLOYMENT_MODE}),
  subscribeReady:listener=>{process.once(RUNNER_READY_PROCESS_EVENT,listener);return ()=>process.removeListener(RUNNER_READY_PROCESS_EVENT,listener);},
  importMain:()=>tsImport(entry,import.meta.url),emit:event=>process.stdout.write(`PREVIEW_RUNNER_STARTED ${JSON.stringify(event)}\n`)});
}
/** Every way the started process ends prints one fixed code and exits 1: no stack, no message text. */
export function installRunnerFailureCodes(target=process) {
 const stop=()=>{target.stderr.write('PREVIEW_RUNNER_STOPPED_ON_FAILURE\n');target.exit(1);};
 target.on('uncaughtException',stop);target.on('unhandledRejection',stop);
 return stop;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const argv=process.argv.slice(2);
 if(argv[0]==='--start'){
  // Any refusal or later end ends this process: the runner's worker must not stay up unreported.
  const stop=installRunnerFailureCodes();
  let started;
  try{started=await launchRunner(argv.slice(1));}catch{process.stderr.write('PREVIEW_RUNNER_STARTUP_REFUSED\n');process.exit(1);}
  // A long-running worker that ends at all (failed or returned) is reported, never a silent exit 0.
  await started.running.then(stop,stop);
 }else{
  try{process.stdout.write(`${JSON.stringify(await prepareRunner(argv))}\n`);}catch{process.stderr.write('PREVIEW_RUNNER_PREPARATION_REFUSED\n');process.exitCode=1;}
 }
}

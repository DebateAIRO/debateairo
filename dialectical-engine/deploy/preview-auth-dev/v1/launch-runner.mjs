import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { prepareLaunch } from './launch-plan.mjs';
import { readEnvironmentFile,narrowEnvironment,installNarrowEnvironment } from './environment.mjs';
import { afterRunnerReady,linuxProcessIdentity } from './runtime-receipt.mjs';
import { refuse } from './custody.mjs';
/** The in-process readiness event apps/runner/src/runner-ready.ts announces (RUNNER_READY_PROCESS_EVENT). */
export const RUNNER_READY_PROCESS_EVENT='debateai:runner-ready';
/** The in-process event apps/runner/src/runner-retirement.ts emits when the runner retired itself (RUNNER_RETIRED_PROCESS_EVENT). */
export const RUNNER_RETIRED_PROCESS_EVENT='debateai:runner-retired';
/**
 * How long a retired runner's main may take to end. The runner emits the retired event BEFORE Hatchet's
 * worker.stop(), so a stop that rejects inside the runner or never settles could leave main pending for ever
 * (side-by-side spec §4, B10 review): after this bound the end is still the asked one. 30 s is ample for a
 * worker with no task left to end its listener; the timer is not unref'd, so an emptied event loop cannot
 * end the process unreported first. Tests shorten it through startRunner's third argument only. The runner
 * never announces with a model call of it still in flight (runner-retirement.ts, R1: the backstop then leaves
 * the end to root's forced stop), so what this bound can cut after the backstop's settle expired is a task's
 * non-call wait, never a call the gate holds open.
 */
export const RETIRED_SETTLE_MS=30_000;
/**
 * Side-by-side uploads spec 2026-10-21 §1: the preview launcher checks runner.env's RELEASE_KEY
 * against the plan, so a runner never starts (or is prepared) as another release. The only key it
 * admits is r<plan register pin>-<first 12 hex of the plan's source revision>. The narrowed
 * environment (environment.mjs narrowEnvironment) refuses any other key first, with
 * PREVIEW_ENVIRONMENT_REFUSED; this is a second check of the same rule, which refuses
 * PREVIEW_RUNNER_RELEASE_KEY_MISMATCH, naming no value.
 */
export function assertRunnerReleaseKey(configured,plan,source) {
 if(configured.RELEASE_KEY!==`r${plan.publication.registerVersion}-${source.sourceRevision.slice(0,12)}`)refuse('PREVIEW_RUNNER_RELEASE_KEY_MISMATCH');
}
/** Prepare-only (the default, `--plan <file>`): validates plan, custody, environment and release key; starts nothing. */
export async function prepareRunner(argv) {
 const {plan,source}=await prepareLaunch(argv,'runner',import.meta.url);
 const runtime=await tsImport(join(plan.sourceRoot,'dialectical-engine/packages/register/src/runtime-environment.ts'),import.meta.url);
 const configured=await readEnvironmentFile(plan.environment.path,plan.environment);
 narrowEnvironment('runner',configured,runtime,plan.publication,plan);
 assertRunnerReleaseKey(configured,plan,source);
 return {schema:'preview-auth-dev-runner-prepared-v1',sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,registerVersion:plan.publication.registerVersion,started:false,runtimeSelectionVerified:false};
}
/**
 * Start (`--start --plan <file>`), the API launcher's sequence for the runner: the same shared
 * prepareLaunch custody gate, the same narrowed environment for role 'runner', the selected
 * restricted runner connection checked, the release key tied to the plan (assertRunnerReleaseKey),
 * then the real main imported in this same process. The content-free PREVIEW_RUNNER_STARTED event
 * (with its releaseKey, side-by-side spec §1) is printed only after the real main announced
 * readiness (worker ready, start-up re-dispatch done) naming that release, with an unchanged
 * register selection.
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
 assertRunnerReleaseKey(configured,plan,source);
 process.chdir(engine);installNarrowEnvironment(selected.environment);
 return afterRunnerReady({binding:{sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,sourceManifestSha256:plan.sourceManifest.sha256,operatorManifestSha256:plan.operatorManifestSha256,contractSha256:source.contractSha256,runnerMainSha256:main.sha256},publication:plan.publication,identity:await linuxProcessIdentity(),
  readSelection:()=>({REGISTER_VERSION:process.env.REGISTER_VERSION,DEBATEAI_DEPLOYMENT_MODE:process.env.DEBATEAI_DEPLOYMENT_MODE,RELEASE_KEY:process.env.RELEASE_KEY}),
  subscribeReady:listener=>{process.once(RUNNER_READY_PROCESS_EVENT,listener);return ()=>process.removeListener(RUNNER_READY_PROCESS_EVENT,listener);},
  importMain:()=>tsImport(entry,import.meta.url),emit:event=>process.stdout.write(`PREVIEW_RUNNER_STARTED ${JSON.stringify(event)}\n`)});
}
/** Every way the started process ends prints one fixed code and exits 1: no stack, no message text. */
export function installRunnerFailureCodes(target=process) {
 const stop=()=>{target.stderr.write('PREVIEW_RUNNER_STOPPED_ON_FAILURE\n');target.exit(1);};
 target.on('uncaughtException',stop);target.on('unhandledRejection',stop);
 return stop;
}
/**
 * The start mode (`--start`); `launch` is launchRunner, replaced only by tests. Two ends are not a
 * failure. The first is a stop someone asked for after readiness: `systemctl stop` (SIGTERM) or
 * Ctrl-C (SIGINT). On that signal the Hatchet worker ends its listener and main returns
 * (@hatchet-dev/typescript-sdk worker-internal.js); that end prints PREVIEW_RUNNER_STOPPED and
 * exits 0, so systemd does not run OnFailure= (the owner's "runner failed" email). The second is
 * the runner retiring itself (side-by-side spec §4: drained, or the backstop): it emits
 * RUNNER_RETIRED_PROCESS_EVENT, then stops its worker; that end prints PREVIEW_RUNNER_RETIRED and
 * exits 0, when main returns or at the latest RETIRED_SETTLE_MS after the event. Main failing
 * after the event is still a failure.
 */
export async function startRunner(argv,launch=launchRunner,{retiredSettleMs=RETIRED_SETTLE_MS}={}) {
 // Any refusal or later end ends this process: the runner's worker must not stay up unreported.
 const stop=installRunnerFailureCodes();
 let started;
 try{started=await launch(argv);}catch{process.stderr.write('PREVIEW_RUNNER_STARTUP_REFUSED\n');process.exit(1);}
 let asked=false;
 const stopped=()=>{process.stdout.write('PREVIEW_RUNNER_STOPPED\n');process.exit(0);};
 // Listening replaces Node's default end on the signal; with no worker listening too, end here.
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{asked=true;if(process.listenerCount(signal)===1)stopped();});
 let retired=false,settleTimer;
 const retiredEnd=()=>{process.stdout.write('PREVIEW_RUNNER_RETIRED\n');process.exit(0);};
 // A worker.stop() that hangs inside the runner must not keep this process up: end anyway after the bound.
 process.once(RUNNER_RETIRED_PROCESS_EVENT,()=>{retired=true;settleTimer=setTimeout(retiredEnd,retiredSettleMs);});
 // A long-running worker that ends unasked (returned) or fails (even during an asked stop) is
 // reported, never a silent exit 0. Main settling first clears the bound: one end, never two.
 await started.running.finally(()=>clearTimeout(settleTimer))
  .then(()=>retired?retiredEnd():asked?stopped():stop(),stop);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const argv=process.argv.slice(2);
 if(argv[0]==='--start'){
  await startRunner(argv.slice(1));
 }else{
  try{process.stdout.write(`${JSON.stringify(await prepareRunner(argv))}\n`);}catch{process.stderr.write('PREVIEW_RUNNER_PREPARATION_REFUSED\n');process.exitCode=1;}
 }
}

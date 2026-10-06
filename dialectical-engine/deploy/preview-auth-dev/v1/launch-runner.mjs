import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { prepareLaunch } from './launch-plan.mjs';
import { readEnvironmentFile,narrowEnvironment } from './environment.mjs';
/** This release prepares the inactive runner only. It has no start command. */
export async function prepareRunner(argv) {
 const {plan,source}=await prepareLaunch(argv,'runner');
 const runtime=await tsImport(join(plan.sourceRoot,'dialectical-engine/packages/register/src/runtime-environment.ts'),import.meta.url);
 narrowEnvironment('runner',await readEnvironmentFile(plan.environment.path,plan.environment),runtime,plan.publication,plan);
 return {schema:'preview-auth-dev-runner-prepared-v1',sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,registerVersion:plan.publication.registerVersion,started:false,runtimeSelectionVerified:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(`${JSON.stringify(await prepareRunner(process.argv.slice(2)))}\n`);}catch{process.stderr.write('PREVIEW_RUNNER_PREPARATION_REFUSED\n');process.exitCode=1;}}

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareLaunch } from './launch-plan.mjs';
import { readEnvironmentFile,narrowEnvironment,installNarrowEnvironment,installHostedEgress } from './environment.mjs';
import { afterApiListen,linuxProcessIdentity } from './runtime-receipt.mjs';
import { refuse } from './custody.mjs';
import { loadTsxApi } from './tsx-api.mjs';
export async function launchApi(argv) {
 const {plan,source}=await prepareLaunch(argv,'api',import.meta.url);
 const {tsImport}=await loadTsxApi();
 const engine=join(plan.sourceRoot,'dialectical-engine');
 const runtime=await tsImport(join(engine,'packages/register/src/runtime-environment.ts'),import.meta.url);
 const configured=await readEnvironmentFile(plan.environment.path,plan.environment);
 const selected=narrowEnvironment('api',configured,runtime,plan.publication,plan);
 const verify=await tsImport('./verify-native.ts',import.meta.url);
 await verify.assertSelectedApiConnection(configured,plan.publication);
 const entry=join(engine,'apps/api/src/main.ts'),main=source.files.find(file=>file.path==='dialectical-engine/apps/api/src/main.ts');
 if(!main)refuse('PREVIEW_API_MAIN_UNBOUND');
 process.chdir(engine);installNarrowEnvironment(selected.environment);
 // Hosted (owner rulings 2026-10-13): the API's https calls go through the loopback egress proxy, before main is imported.
 installHostedEgress(selected.deploymentMode);
 return afterApiListen({binding:{sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,sourceManifestSha256:plan.sourceManifest.sha256,operatorManifestSha256:plan.operatorManifestSha256,contractSha256:source.contractSha256,apiMainSha256:main.sha256},publication:plan.publication,identity:await linuxProcessIdentity(),
  readSelection:()=>({REGISTER_VERSION:process.env.REGISTER_VERSION,DEBATEAI_DEPLOYMENT_MODE:process.env.DEBATEAI_DEPLOYMENT_MODE,RELEASE_KEY:process.env.RELEASE_KEY}),
  importMain:()=>tsImport(entry,import.meta.url),emit:event=>process.stdout.write(`PREVIEW_API_STARTED ${JSON.stringify(event)}\n`)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await launchApi(process.argv.slice(2));}catch{process.stderr.write('PREVIEW_API_STARTUP_REFUSED\n');process.exitCode=1;}}

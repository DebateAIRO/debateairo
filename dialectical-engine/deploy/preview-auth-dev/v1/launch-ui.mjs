import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareLaunch,readPublicArtifact } from './launch-plan.mjs';
import { readEnvironmentFile,narrowEnvironment,installNarrowEnvironment } from './environment.mjs';
import { verifyUiBuildManifest,builtModelRosterFlag } from './ui-build.mjs';
export async function launchUi(argv) {
 const {plan,source}=await prepareLaunch(argv,'ui',import.meta.url);
 const build=await readPublicArtifact(plan.uiBuild,'ui-build');
 await verifyUiBuildManifest(build,source);
 // ui.env must name the model list this build was made with (the inventory just checked binds its record).
 const selected=narrowEnvironment('ui',await readEnvironmentFile(plan.environment.path,plan.environment),{builtModelRosterFlag:await builtModelRosterFlag(build.buildRoot)},plan.publication,plan);
 process.chdir(join(plan.sourceRoot,'dialectical-engine/apps/ui'));installNarrowEnvironment(selected.environment);
 // server.mjs itself stamps the trusted edge marker. Import completion is not UI listen evidence.
 await import(pathToFileURL(join(process.cwd(),'server.mjs')).href);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await launchUi(process.argv.slice(2));}catch{process.stderr.write('PREVIEW_UI_STARTUP_REFUSED\n');process.exitCode=1;}}

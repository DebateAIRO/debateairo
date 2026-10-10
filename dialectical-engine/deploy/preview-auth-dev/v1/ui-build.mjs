import { readFile,rm,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { buildInventory,verifyInventory } from './source-manifest.mjs';
import { sha256,strictJson,refuse,exactKeys } from './custody.mjs';
import { isReviewedModelRosterFlag } from './environment.mjs';
export const REQUIRED_AUTH_ROUTES=Object.freeze(['/login','/sign-up','/verify-email','/enroll-mfa','/recover','/verify-recovery-email','/social/complete','/settings/security','/reset-password','/recover-authenticator','/verify-backup-email']);
export async function buildUiArtifact(source,environment) {
 if(process.platform!=='linux'||process.version!=='v26.8.2'||source.role!=='ui')refuse('PREVIEW_LINUX_BUILD_REQUIRED');
 if(!isReviewedModelRosterFlag(environment?.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON))refuse('PREVIEW_UI_MODEL_ROSTER_REFUSED');
 const cwd=join(source.sourceRoot,'dialectical-engine');
 await new Promise((resolve,reject)=>{const child=spawn('pnpm',['--filter','dialectical-engine-v2ui','build'],{cwd,env:environment,shell:false,stdio:['ignore','inherit','inherit']});child.once('error',()=>reject(new Error('PREVIEW_UI_BUILD_REFUSED')));child.once('close',code=>code===0?resolve():reject(new Error('PREVIEW_UI_BUILD_REFUSED')));});
 await dropBuildCache(source.sourceRoot);
 await recordModelRosterFlag(source.sourceRoot,environment.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON);
 return inspectUiBuild(source);
}
/**
 * The public model list is baked into the website when it is built (Next.js inlines NEXT_PUBLIC_ values),
 * so ui.env cannot change it later. The build therefore records the list it was built with in one small
 * file inside .next; the complete build inventory (and so the launch plan) binds that file's bytes, and
 * the UI launcher demands that ui.env says the same list (environment.mjs narrowEnvironment).
 */
export const MODEL_ROSTER_FILE='preview-model-roster.json';
export async function recordModelRosterFlag(sourceRoot,flag) {
 if(!isReviewedModelRosterFlag(flag))refuse('PREVIEW_UI_MODEL_ROSTER_REFUSED');
 await writeFile(join(sourceRoot,'dialectical-engine/apps/ui/.next',MODEL_ROSTER_FILE),JSON.stringify({NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON:flag}),{mode:0o644,flag:'wx'});
}
/** The model list a build was made with. A build without the record (made by an older tool) refuses: it is never guessed. */
export async function builtModelRosterFlag(buildRoot) {
 try{
  const value=exactKeys(strictJson(await readFile(join(buildRoot,MODEL_ROSTER_FILE)),2),['NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON']);
  if(isReviewedModelRosterFlag(value.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON))return value.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON;
 }catch{}
 return refuse('PREVIEW_UI_MODEL_ROSTER_REFUSED');
}
/**
 * Next.js's webpack build cache (.next/cache/webpack) is build-time only: the server never reads it,
 * and its pack files (150-320 MB measured on the preview, 2026-10-10) exceed the custody size limit,
 * so the complete inventory of .next below would refuse. Remove it before that inventory is taken.
 */
export async function dropBuildCache(sourceRoot) {
 await rm(join(sourceRoot,'dialectical-engine/apps/ui/.next/cache/webpack'),{recursive:true,force:true});
}
export async function inspectUiBuild(source) {
 if(process.platform!=='linux'||process.version!=='v26.8.2')refuse('PREVIEW_LINUX_BUILD_REQUIRED');
 const buildRoot=join(source.sourceRoot,'dialectical-engine/apps/ui/.next');
 const files=await buildInventory(buildRoot,source.uid,{complete:true,allowedRoot:source.sourceRoot});
 const routeBytes=await readFile(join(buildRoot,'server/app-paths-manifest.json'));
 const paths=strictJson(routeBytes),routes=Object.keys(paths).filter(key=>key.endsWith('/page')).map(key=>key.replace(/\/page$/,'')||'/').sort();
 const buildId=(await readFile(join(buildRoot,'BUILD_ID'),'utf8')).trim();
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(buildId)||REQUIRED_AUTH_ROUTES.some(route=>!routes.includes(route)))refuse('PREVIEW_UI_ROUTE_INVENTORY_REFUSED');
 const staticFile=`static/${buildId}/_buildManifest.js`,served=files.find(file=>file.path===staticFile);
 if(!served)refuse('PREVIEW_UI_STATIC_BINDING_REFUSED');
 return {schema:'preview-auth-dev-ui-build-v1',platform:process.platform,nodeVersion:process.version,pnpmVersion:source.pnpmVersion,sourceRevision:source.sourceRevision,sourceTree:source.sourceTree,
  sourceRoot:source.sourceRoot,contractSha256:source.contractSha256,buildRoot,buildId,routeManifestSha256:sha256(routeBytes),routes,files,staticProof:{url:`/_next/${staticFile}`,sha256:served.sha256}};
}
export async function verifyUiBuildManifest(build,source) {
 exactKeys(build,['schema','platform','nodeVersion','pnpmVersion','sourceRevision','sourceTree','sourceRoot','contractSha256','buildRoot','buildId','routeManifestSha256','routes','files','staticProof']);
 if(build.schema!=='preview-auth-dev-ui-build-v1'||build.platform!=='linux'||build.nodeVersion!=='v26.8.2'||build.pnpmVersion!=='11.20.0'
  ||build.sourceRevision!==source.sourceRevision||build.sourceTree!==source.sourceTree||build.sourceRoot!==source.sourceRoot||build.contractSha256!==source.contractSha256
  ||build.buildRoot!==join(source.sourceRoot,'dialectical-engine/apps/ui/.next')||REQUIRED_AUTH_ROUTES.some(route=>!build.routes.includes(route)))refuse('PREVIEW_UI_BUILD_BINDING_REFUSED');
 await verifyInventory(build.buildRoot,source.uid,build.files,{complete:true,allowedRoot:source.sourceRoot});
 const current=await inspectUiBuild(source);
 if(JSON.stringify(current)!==JSON.stringify(build))refuse('PREVIEW_UI_BUILD_DRIFT');
 return true;
}

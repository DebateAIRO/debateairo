import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine";
const load=relative => import(`${pathToFileURL(resolve(root,relative)).href}?guide-bind19-row58=1`);
const [loader,catalog,context,navigation,session,boundary,classifier]=await Promise.all([
  load("packages/support-kb/src/index.ts"),load("packages/support-kb/src/catalog.ts"),
  load("packages/support-kb/src/context.ts"),load("packages/support-kb/src/navigation.ts"),
  load("apps/api/src/support/session.ts"),load("apps/api/src/support/public-guide-boundary.ts"),
  load("apps/api/src/support/classify.ts")
]);
const review=JSON.parse(await readFile(resolve(root,"packages/support-kb/reviews/manifest.json"),"utf8"));
const recovery=await readFile(resolve(root,"packages/support-kb/recovery/components.json"));
const corpus=loader.loadHelpCorpus(resolve(root,"packages/support-kb/content"),{
  reviewManifest:review,recoveryComponents:recovery,requireReviewedRecovery:true
});
const prompt="Unde îmi pot crea un cont?";
const language="ro";
const availableActionIds=navigation.resolveSupportActions(catalog.SUPPORT_ACTION_IDS,{ signedIn:false,language })
  .map(({ id }) => id);
const selected=context.buildSupportKnowledgeContext({
  entries:corpus.entries,capabilities:catalog.SUPPORT_CAPABILITIES,language,
  query:session.redactSupportMessage(prompt).text,historyText:"",availableActionIds,
  referenceFor:(kind,index)=>`guide-${kind}-${index}`,maxCodePoints:23_600
});
process.stdout.write(`${JSON.stringify({
  boundary:boundary.classifyPublicGuideBoundary(prompt,language).kind,
  classifierOutcome:classifier.classifySupportMessage(prompt).outcome,
  sourceIds:selected.sourceIds,requestedActionIds:selected.requestedActionIds,
  sourcePolicyId:selected.sourcePolicy?.id ?? null
})}\n`);

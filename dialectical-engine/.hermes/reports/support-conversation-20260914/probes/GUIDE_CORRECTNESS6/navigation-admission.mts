import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,type SupportActionId,type SupportLanguage
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/catalog.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/context.ts";
import { loadHelpCorpus } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/index.ts";
import { resolveSupportActions } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine/packages/support-kb/src/navigation.ts";

const lane = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-cp1-p3-correctness/dialectical-engine";
const kbRoot = `${lane}/packages/support-kb`;
const corpus = loadHelpCorpus(`${kbRoot}/content`,{
  reviewManifest:JSON.parse(readFileSync(`${kbRoot}/reviews/manifest.json`,"utf8")) as unknown,
  recoveryComponents:readFileSync(`${kbRoot}/recovery/components.json`),
  requireReviewedRecovery:true
});

type Row = Readonly<{
  kind:"action"|"prose";
  language:SupportLanguage;
  query:string;
  signedIn:boolean;
  expected:readonly SupportActionId[];
}>;

const rows: readonly Row[] = Object.freeze([
  {kind:"action",language:"en",query:"Where is Home?",signedIn:false,expected:["home"]},
  {kind:"action",language:"ro",query:"Unde este Acasă?",signedIn:false,expected:["home"]},
  {kind:"action",language:"en",query:"Where is New debate?",signedIn:true,expected:["start-debate"]},
  {kind:"action",language:"ro",query:"Unde este Dezbatere nouă?",signedIn:true,expected:["start-debate"]},
  {kind:"action",language:"en",query:"Open the Account page.",signedIn:true,expected:["settings"]},
  {kind:"action",language:"ro",query:"Deschide pagina Cont.",signedIn:true,expected:["settings"]},
  {kind:"action",language:"en",query:"Where is How it works?",signedIn:false,expected:["method"]},
  {kind:"action",language:"ro",query:"Unde este Cum funcționează?",signedIn:false,expected:["method"]},
  {kind:"action",language:"en",query:"Which link opens the Sample debate?",signedIn:false,expected:["sample-transcript"]},
  {kind:"action",language:"ro",query:"Ce link deschide Exemplu de dezbatere?",signedIn:false,expected:["sample-transcript"]},
  {kind:"action",language:"en",query:"Where is the Public debates tab?",signedIn:true,expected:["public-catalog"]},
  {kind:"action",language:"ro",query:"Unde este fila Dezbateri publice?",signedIn:true,expected:["public-catalog"]},
  {kind:"action",language:"en",query:"Where can I find Your debates?",signedIn:true,expected:["your-debates"]},
  {kind:"action",language:"ro",query:"Unde găsesc Dezbaterile tale?",signedIn:true,expected:["your-debates"]},
  {kind:"action",language:"en",query:"Where is Privacy in Settings?",signedIn:true,expected:["privacy-preferences"]},
  {kind:"action",language:"ro",query:"Unde este Confidențialitate în Setări?",signedIn:true,expected:["privacy-preferences"]},
  {kind:"prose",language:"en",query:"How does Pricing work?",signedIn:false,expected:[]},
  {kind:"prose",language:"ro",query:"Cum funcționează Prețuri?",signedIn:false,expected:[]},
  {kind:"prose",language:"en",query:"How do I change the Theme?",signedIn:true,expected:[]},
  {kind:"prose",language:"ro",query:"Cum schimb Tema?",signedIn:true,expected:[]},
  {kind:"prose",language:"en",query:"What does the Thread view show?",signedIn:true,expected:[]},
  {kind:"prose",language:"ro",query:"Ce arată vizualizarea Fir?",signedIn:true,expected:[]},
  {kind:"prose",language:"en",query:"How does Replay work?",signedIn:true,expected:[]},
  {kind:"prose",language:"ro",query:"Cum funcționează Repetă generarea?",signedIn:true,expected:[]},
  {kind:"prose",language:"en",query:"How can I export a debate?",signedIn:true,expected:[]},
  {kind:"prose",language:"ro",query:"Cum pot exporta o dezbatere?",signedIn:true,expected:[]},
  {kind:"prose",language:"en",query:"How is the public guide different from a human support case?",signedIn:false,expected:[]},
  {kind:"prose",language:"ro",query:"Cum diferă ghidul public de un caz de asistență umană?",signedIn:false,expected:[]}
]);

const failures: string[] = [];
const results = rows.map((row,index) => {
  const availableActionIds = resolveSupportActions(SUPPORT_ACTION_IDS,{
    signedIn:row.signedIn,language:row.language
  }).map(({id}) => id);
  const context = buildSupportKnowledgeContext({
    entries:corpus.entries,capabilities:SUPPORT_CAPABILITIES,
    language:row.language,query:row.query,historyText:"",maxCodePoints:24_000,
    availableActionIds,referenceFor:(kind,referenceIndex) =>
      `${kind === "source" ? "s" : "a"}-10000000000040008000000000000001-${referenceIndex + 1}`
  });
  try {
    assert.deepEqual(context.requestedActionIds,row.expected);
  } catch {
    failures.push(`row ${index + 1} actions: expected ${JSON.stringify(row.expected)} got ${JSON.stringify(context.requestedActionIds)}`);
  }
  if (context.sourceIds.length === 0) {
    failures.push(`row ${index + 1} sources: expected useful reviewed facts, got []`);
  }
  return Object.freeze({
    index:index + 1,...row,availableActionIds,
    sourceIds:context.sourceIds,requestedActionIds:context.requestedActionIds
  });
});

process.stdout.write(`${JSON.stringify({kbVersion:corpus.kbVersion,rows:results,failures},null,2)}\n`);
if (failures.length > 0) process.exitCode = 1;

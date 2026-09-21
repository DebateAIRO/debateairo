import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname,resolve } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import {
  GUIDE_EXECUTION_ORDER,GUIDE_FAMILIES,GUIDE_MATRIX,GUIDE_REQUEST_START_SPACING_MS,
  GUIDE_SESSION_GROUPS,validateGuideMatrix,validateGuideRequestStartOffsets,validateGuideSchedule
} from "./matrix.mjs";
import {
  activateGuideNavigation,assertGuideObservation,checkpointGuideObservation,
  classifyGuideBlockedSupportOperation,classifyGuideCompactTransitionFailure,
  classifyGuideFullReadinessFailure,
  computeGuideHarnessSha256,consumeGuideObservationStages,deriveDeclaredControlCount,
  guidePostReadyFailureCode,guideSupportLanguageSelectors,
  openGuideSupportSurface,
  proveGuideFullReadiness,
  projectGuideApiResponse,projectGuideFailureObservation,readGuidePublicResponse,
  requireGuideCompactPrecondition,requireGuideCompactReady,
  selectGuideSupportLanguage,
  validateGuideFullReadinessState,validateGuideSupportTransitionObservation,
  validateBoundReceiptMembership,validateGuideGateInput,validateGuideUiProbeArguments
} from "./controls.mjs";
import { deriveGuideRowProof } from "./pre-request-verifier.ts";
import {
  GUIDE_COUNTS_ONLY_SQL,projectGuideRuntimeCapacity,readGuideRuntimeCapacity,
  validateGuideRuntimeCapacity
} from "./runtime-capacity.mjs";
import {
  createGuideSessionLifecycle,guideGroupTransition,resetGuideStoredConversation,
  simulateSameOriginGroupBoundary
} from "./session-lifecycle.mjs";

const [productRoot,expectedCommit]=process.argv.slice(2);
if (typeof productRoot !== "string" || !productRoot.startsWith("/")
  || typeof expectedCommit !== "string" || !/^[0-9a-f]{40}$/u.test(expectedCommit)) {
  throw new Error("GUIDE_HARNESS_VERIFY_ARGS_INVALID");
}

const results=[];
const harnessSha256=computeGuideHarnessSha256(dirname(fileURLToPath(import.meta.url)));
let finalBranchResult=null;
const productLoader=await import(`${pathToFileURL(resolve(productRoot,"packages/support-kb/src/index.ts")).href}?guide-fix9-controls=1`);
const productCatalog=await import(`${pathToFileURL(resolve(productRoot,"packages/support-kb/src/catalog.ts")).href}?guide-fix9-controls=1`);
async function control(name,operation) {
  await operation();
  results.push(name);
}

function createLanguageDomFixture(surface,activeLabel,{ absent=false,duplicate=false,invalid=false }={}) {
  const expectedRoot=surface === "full" ? ".supportDesk" : ".supportAssistantCompact";
  const controls=absent ? [] : duplicate ? ["EN","RO","RO"] : ["EN","RO"];
  let active=invalid ? "XX" : activeLabel;
  let clicks=0;
  const locate=selector => {
    const rooted=selector.startsWith(`${expectedRoot} .supportLanguage button`);
    const wantsActive=selector.endsWith('[aria-pressed="true"]');
    const labels=() => !rooted ? [] : wantsActive ? [active] : controls;
    return {
      count:async () => labels().length,
      first:() => ({
        textContent:async () => labels()[0] ?? null,
        click:async () => { clicks+=1; active=labels()[0] ?? active; }
      }),
      filter:({ hasText }) => {
        const matching=() => labels().filter(label => hasText.test(label));
        return {
          count:async () => matching().length,
          first:() => ({ click:async () => { clicks+=1; active=matching()[0] ?? active; } })
        };
      }
    };
  };
  return Object.freeze({
    locate,
    waitForLanguage:async (_surface,language) => {
      assert.equal(active,language.toUpperCase());
    },
    read:() => ({ active,clicks })
  });
}

await control("matrix covers twenty approved inventory families",async () => {
  assert.equal(GUIDE_FAMILIES.length,20);
  assert.deepEqual(new Set(GUIDE_FAMILIES.map(({ id }) => id)).size,20);
});

await control("matrix has exact full compact EN RO family coverage",async () => {
  const guideRows=GUIDE_MATRIX.filter(({ kind }) => kind === "GUIDE_FAMILY");
  assert.equal(guideRows.length,40);
  for (const family of GUIDE_FAMILIES) {
    const rows=guideRows.filter(row => row.family === family.id);
    assert.deepEqual(rows.map(({ mode }) => mode).sort(),["compact","full"]);
    assert.deepEqual(rows.map(({ language }) => language).sort(),["en","ro"]);
  }
});

await control("matrix includes required lifecycle privacy injection and recovery rows",async () => {
  assert.equal(GUIDE_MATRIX.length,GUIDE_FAMILIES.length*2+2+2+5*2);
  assert.deepEqual(
    GUIDE_MATRIX.filter(({ lifecycleRole }) => lifecycleRole !== null).map(({ prompt }) => prompt),
    ["Pricing","Account"]
  );
  for (const kind of ["PRIVATE_RECORD","PROMPT_INJECTION"]) {
    const rows=GUIDE_MATRIX.filter(row => row.kind === kind);
    assert.deepEqual(rows.map(({ mode }) => mode).sort(),["compact","full"]);
    assert.deepEqual(rows.map(({ language }) => language).sort(),["en","ro"]);
  }
  for (const recoveryClass of [
    "POSITIVE_NAVIGATION","OPERATION_ONLY","OPERATION_AND_NAVIGATION",
    "NEGATED_OPERATION_AND_NAVIGATION","NEGATED_OR_UNRELATED"
  ]) {
    const rows=GUIDE_MATRIX.filter(row => row.recoveryClass === recoveryClass);
    assert.deepEqual(rows.map(({ language }) => language).sort(),["en","ro"]);
  }
  assert.equal(validateGuideMatrix(GUIDE_MATRIX),true);
});

await control("schedule uses five bounded language surface sessions",async () => {
  assert.equal(validateGuideSchedule(),true);
  assert.deepEqual(GUIDE_SESSION_GROUPS.map(({ sequences }) => sequences.length),[1,14,13,12,14]);
  assert.deepEqual(
    GUIDE_SESSION_GROUPS.map(({ mode,language }) => `${mode}:${language}`),
    ["full:en","full:ro","compact:ro","full:en","compact:en"]
  );
  assert.equal(GUIDE_MATRIX[0].lifecycleRole,"PRICING_EN_BEFORE_SWITCH");
  assert.equal(GUIDE_MATRIX[1].lifecycleRole,"ACCOUNT_RO_AFTER_SWITCH");
});

await control("execution order covers every canonical row exactly once",async () => {
  assert.equal(GUIDE_EXECUTION_ORDER.length,GUIDE_MATRIX.length);
  assert.equal(new Set(GUIDE_EXECUTION_ORDER).size,GUIDE_MATRIX.length);
  assert.deepEqual([...GUIDE_EXECUTION_ORDER].sort((a,b) => a-b),GUIDE_MATRIX.map(({ sequence }) => sequence));
  assert.equal(GUIDE_EXECUTION_ORDER[0],1);
  assert.equal(GUIDE_EXECUTION_ORDER[1],2);
});

await control("navigation and injection rows terminate their session groups",async () => {
  const bySequence=new Map(GUIDE_MATRIX.map(row => [row.sequence,row]));
  for (const { sequences } of GUIDE_SESSION_GROUPS) {
    const firstTerminal=sequences.findIndex(sequence => {
      const row=bySequence.get(sequence);
      return row.navigation !== null || row.kind === "PROMPT_INJECTION";
    });
    if (firstTerminal === -1) continue;
    assert.equal(sequences.slice(firstTerminal).every(sequence => {
      const row=bySequence.get(sequence);
      return row.navigation !== null || row.kind === "PROMPT_INJECTION";
    }),true);
  }
});

await control("same origin navigation preserves a persisted Support session",async () => {
  const observation=simulateSameOriginGroupBoundary({
    transition:"SAME_ORIGIN_NAVIGATION_ONLY",persistedSessionId:"persisted-ro-session"
  });
  assert.equal(observation.restoredSessionId,"persisted-ro-session");
  assert.equal(guideGroupTransition(GUIDE_SESSION_GROUPS,2),"STORAGE_RESET_BEFORE_REMOUNT");
  assert.equal(guideGroupTransition(GUIDE_SESSION_GROUPS,4),"STORAGE_RESET_BEFORE_REMOUNT");
});

await control("deliberate group reset clears persistence and proves five distinct sessions",async () => {
  const lifecycle=createGuideSessionLifecycle(GUIDE_SESSION_GROUPS);
  let created=0;
  for (let index=0;index<GUIDE_SESSION_GROUPS.length;index+=1) {
    const boundary=lifecycle.beginGroup(index,created);
    if (boundary.transition === "STORAGE_RESET_BEFORE_REMOUNT") {
      const storage=new Map([["debateai.support.conversation.v1",`session-${index-1}`]]);
      await resetGuideStoredConversation({
        removeItem:async key => { storage.delete(key); },
        getItem:async key => storage.get(key) ?? null
      });
      assert.equal(storage.size,0);
    }
    lifecycle.observeCreatedSession(`session-${index}`);
    created+=1;
    const evidence=lifecycle.confirmFirstResponse(created);
    assert.equal(evidence.createdAfter,index+1);
    lifecycle.confirmContinuation(created);
    lifecycle.endGroup(created);
  }
  assert.equal(lifecycle.complete(created),true);
  assert.equal(lifecycle.distinctSessionCount(),5);
});

await control("same language persisted-session reuse fails on the first group response",async () => {
  const lifecycle=createGuideSessionLifecycle(GUIDE_SESSION_GROUPS);
  let created=0;
  for (let index=0;index<2;index+=1) {
    lifecycle.beginGroup(index,created);
    lifecycle.observeCreatedSession(`session-${index}`);
    created+=1;
    lifecycle.confirmFirstResponse(created);
    lifecycle.endGroup(created);
  }
  const boundary=lifecycle.beginGroup(2,created);
  assert.equal(boundary.transition,"STORAGE_RESET_BEFORE_REMOUNT");
  const stale=simulateSameOriginGroupBoundary({
    transition:"SAME_ORIGIN_NAVIGATION_ONLY",persistedSessionId:"session-1"
  });
  assert.equal(stale.restoredSessionId,"session-1");
  assert.throws(() => lifecycle.confirmFirstResponse(created),/GUIDE_HARNESS_GROUP_SESSION_CREATE_INVALID/u);
});

await control("failed deliberate storage reset is rejected before remount",async () => {
  await assert.rejects(() => resetGuideStoredConversation({
    removeItem:async () => {},getItem:async () => "persisted-session"
  }),/GUIDE_HARNESS_STORAGE_RESET_FAILED/u);
});

await control("unexpected replacement inside a group fails immediately",async () => {
  const lifecycle=createGuideSessionLifecycle(GUIDE_SESSION_GROUPS);
  lifecycle.beginGroup(0,0);
  lifecycle.observeCreatedSession("session-0");
  lifecycle.confirmFirstResponse(1);
  assert.throws(() => lifecycle.confirmContinuation(2),/GUIDE_HARNESS_GROUP_SESSION_PERSISTENCE_INVALID/u);
});

for (const [name,mutate] of [
  ["schedule rejects a sixth session group",groups => { groups.push(structuredClone(groups[4])); }],
  ["schedule rejects duplicate row execution",groups => { groups[1].sequences[1]=groups[1].sequences[0]; }],
  ["schedule rejects work after a terminal row",groups => {
    const group=groups.find(({ id }) => id === "full-ro");
    const terminal=group.sequences.pop();
    group.sequences.splice(1,0,terminal);
  }]
]) {
  await control(name,async () => {
    const groups=structuredClone(GUIDE_SESSION_GROUPS);
    mutate(groups);
    assert.throws(() => validateGuideSchedule(GUIDE_MATRIX,groups),/GUIDE_HARNESS_SCHEDULE_INVALID/u);
  });
}

await control("31 second starts satisfy rolling ten minute admission",async () => {
  const starts=GUIDE_EXECUTION_ORDER.map((sequence,index) => ({
    sequence,requestStartOffsetMs:index*GUIDE_REQUEST_START_SPACING_MS
  }));
  assert.equal(validateGuideRequestStartOffsets(starts),true);
  const bad=structuredClone(starts);
  bad[20].requestStartOffsetMs=600_000;
  assert.throws(() => validateGuideRequestStartOffsets(bad),/GUIDE_HARNESS_PACING_INVALID/u);
});

await control("injection controls are deterministic and model ceiling is forty two",async () => {
  const injections=GUIDE_MATRIX.filter(({ kind }) => kind === "PROMPT_INJECTION");
  assert.deepEqual(injections.map(({ branch }) => branch),[
    "DETERMINISTIC_INJECTION_REFUSAL","DETERMINISTIC_INJECTION_REFUSAL"
  ]);
  assert.equal(GUIDE_MATRIX.filter(({ branch }) => branch === "MODEL").length,42);
});

for (const [name,mutate] of [
  ["duplicate sequence rejected",rows => { rows[1]={ ...rows[1],sequence:1 }; }],
  ["changed prompt rejected",rows => { rows[0]={ ...rows[0],prompt:"changed" }; }],
  ["missing surface coverage rejected",rows => { rows.splice(0,1); }],
  ["recovery branch drift rejected",rows => {
    const index=rows.findIndex(({ recoveryClass }) => recoveryClass === "OPERATION_ONLY");
    rows[index]={ ...rows[index],branch:"MODEL" };
  }],
  ["injection branch drift rejected",rows => {
    const index=rows.findIndex(({ kind }) => kind === "PROMPT_INJECTION");
    rows[index]={ ...rows[index],branch:"MODEL" };
  }]
]) {
  await control(name,async () => {
    const rows=GUIDE_MATRIX.map(row => ({
      ...row,expectedSourceIds:[...row.expectedSourceIds],
      ...(row.requiredSourceIds === undefined ? {} : {
        requiredSourceIds:[...row.requiredSourceIds],allowedSourceIds:[...row.allowedSourceIds],
        recoverySourceIds:[...row.recoverySourceIds]
      })
    }));
    mutate(rows);
    assert.throws(() => validateGuideMatrix(rows),/GUIDE_HARNESS_MATRIX_INVALID/u);
  });
}

const digest=value => createHash("sha256").update(value).digest("hex");
const sourceIds=[...new Set(GUIDE_MATRIX.flatMap(row => [
  ...row.expectedSourceIds,...(row.allowedSourceIds ?? []),...(row.recoverySourceIds ?? [])
]))];
const inertEntries=sourceIds.flatMap(id => ["en","ro"].map(lang => {
  const fallback=`Reviewed ${id} ${lang}`;
  return {
    id,lang,title:`${id} ${lang}`,body:`Public ${id} ${lang}`,modelProjection:`Public ${id} ${lang}`,
    fallback,recoveryReview:{
      fallbackSha256:digest(fallback),reviewedBy:"SOL",reviewerSession:"inert-reviewer",
      reviewedOn:"2026-09-17",evidence:"inert://guide-harness"
    }
  };
}));
const rowByPrompt=new Map(GUIDE_MATRIX.map(row => [row.prompt,row]));
const inertActions={
  method:{ id:"method",label:"Method",href:"/#method" },
  "sample-transcript":{ id:"sample-transcript",label:"Transcripts",href:"/#transcripts" },
  help:{ id:"help",label:"Help",href:"/help" }
};
const inertDependencies={
  loadHelpCorpus:() => ({ kbVersion:"a".repeat(64),entries:inertEntries }),
  supportActionIds:Object.keys(inertActions),supportCapabilities:{},
  supportSourcePolicies:productCatalog.SUPPORT_SOURCE_POLICIES,
  supportSourceIdsSatisfyPolicy:productLoader.supportSourceIdsSatisfyPolicy,
  selectSupportRecoveryEntry:productLoader.selectSupportRecoveryEntry,
  buildSupportKnowledgeContext:({ query }) => {
    const row=rowByPrompt.get(query);
    if (row === undefined) throw new Error("INERT_PROMPT_UNKNOWN");
    const sourcePolicy=row.requiredSourceIds === undefined ? null : Object.freeze({
      id:"your-and-public-debates",requiredSourceIds:row.requiredSourceIds,
      allowedSourceIds:row.allowedSourceIds,recoverySourceIds:row.recoverySourceIds
    });
    return {
      sourceIds:sourcePolicy === null ? [...row.expectedSourceIds]
        : ["browse-public-debates","app-navigation"],
      requestedActionIds:row.navigation === null ? [] : [row.navigation.actionId],
      sourcePolicy
    };
  },
  resolveSupportActions:(ids) => ids.flatMap(id => inertActions[id] === undefined ? [] : [inertActions[id]]),
  redactSupportMessage:text => ({ text }),
  classifyPublicGuideBoundary:text => ({
    kind:rowByPrompt.get(text)?.branch === "DETERMINISTIC_PRIVATE_REFUSAL"
      ? "PRIVATE_RECORD_REQUEST" : "PUBLIC_GUIDE"
  }),
  classifySupportMessage:text => {
    const branch=rowByPrompt.get(text)?.branch;
    if (branch === "DETERMINISTIC_INJECTION_REFUSAL") {
      return { outcome:"REFUSE_INJECTION",link:null };
    }
    if (branch === "DETERMINISTIC_RECOVERY") {
      return { outcome:"REFUSE_ZONE",securityNavigation:"FORGOT_PASSWORD",link:null };
    }
    return { outcome:null,link:null };
  },
  analyzeRecoverySemantics:(text,language) => {
    const recoveryClass=rowByPrompt.get(text)?.recoveryClass;
    const semantics={
      POSITIVE_NAVIGATION:["AFFIRMATIVE","ABSENT"],
      OPERATION_ONLY:["ABSENT","AFFIRMATIVE"],
      OPERATION_AND_NAVIGATION:["AFFIRMATIVE","AFFIRMATIVE"],
      NEGATED_OPERATION_AND_NAVIGATION:["AFFIRMATIVE","NEGATED"],
      NEGATED_OR_UNRELATED:["ABSENT","NEGATED"]
    }[recoveryClass];
    return { language,navigation:semantics?.[0],credentialOperation:semantics?.[1] };
  },
  classifySupportResponseEvidence:() => ({ status:"ACCEPTED_DRAFT",candidateCount:0 })
};

await control("all matrix rows derive an inert pre request proof",async () => {
  const corpus={ kbVersion:"a".repeat(64),entries:inertEntries };
  for (const row of GUIDE_MATRIX) {
    const proof=deriveGuideRowProof(corpus,row,inertDependencies);
    assert.equal(proof.branch,row.branch);
  }
});

const policyRows=GUIDE_MATRIX.filter(({ sequence }) => sequence === 7 || sequence === 8);

await control("rows seven and eight bind the exact product owned source policy",async () => {
  assert.equal(policyRows.length,2);
  for (const row of policyRows) {
    assert.deepEqual(row.requiredSourceIds,["app-navigation"]);
    assert.deepEqual(row.allowedSourceIds,["app-navigation","browse-public-debates"]);
    assert.deepEqual(row.recoverySourceIds,["app-navigation"]);
    const proof=deriveGuideRowProof({ entries:inertEntries },row,inertDependencies);
    assert.equal(proof.sourcePolicy.id,"your-and-public-debates");
    assert.deepEqual(proof.recoverySourceIds,["app-navigation"]);
    assert.equal(proof.fallbackSha256,digest(`Reviewed app-navigation ${row.language}`));
  }
});

function policyObservation(row,proof,sourceIds,diagnostic={
  status:"ACCEPTED_DRAFT",candidateCount:0,validCount:0,invalidCount:0,
  duplicateCount:0,unmatchedCount:0
}) {
  const sources=sourceIds.map(id => ({ id,label:id }));
  return {
    row,proof,api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Public guide",sources,actions:[] },
    visible:{ text:"Public guide",sources:sourceIds,actions:[] },diagnostic
  };
}

await control("accepted policy sources allow required alone and optional source in either order",async () => {
  const row=policyRows[0];
  const proof=deriveGuideRowProof({ entries:inertEntries },row,inertDependencies);
  for (const sourceIds of [
    ["app-navigation"],
    ["app-navigation","browse-public-debates"],
    ["browse-public-debates","app-navigation"]
  ]) {
    assert.equal(assertGuideObservation(policyObservation(row,proof,sourceIds)).responseOrigin,
      "MODEL_ACCEPTED_DRAFT");
  }
});

for (const [name,sourceIds] of [
  ["policy rejects browse only without required app navigation",["browse-public-debates"]],
  ["policy rejects an empty source set missing app navigation",[]],
  ["policy rejects unrelated creation guidance",["app-navigation","getting-started-debate"]]
]) {
  await control(name,async () => {
    const row=policyRows[0];
    const proof=deriveGuideRowProof({ entries:inertEntries },row,inertDependencies);
    assert.throws(() => assertGuideObservation(policyObservation(row,proof,sourceIds)),
      /GUIDE_HARNESS_SOURCE_POLICY_INVALID/u);
  });
}

await control("reviewed policy fallback requires the exact declared recovery source",async () => {
  const row=policyRows[1];
  const proof=deriveGuideRowProof({ entries:inertEntries },row,inertDependencies);
  const diagnostic={
    status:"ATTRIBUTED_RECOVERY",candidateCount:1,validCount:1,invalidCount:0,
    duplicateCount:0,unmatchedCount:0,record:{ predicate:"SOURCE_MEMBERSHIP" }
  };
  assert.equal(assertGuideObservation(
    policyObservation(row,proof,["app-navigation"],diagnostic)
  ).responseOrigin,"REVIEWED_FALLBACK");
  assert.throws(() => assertGuideObservation(
    policyObservation(row,proof,["browse-public-debates","app-navigation"],diagnostic)
  ),/GUIDE_HARNESS_RECOVERY_SOURCE_POLICY_INVALID/u);
});

await control("missing context source policy is rejected",async () => {
  const row=policyRows[0];
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,
    buildSupportKnowledgeContext:input => ({
      ...inertDependencies.buildSupportKnowledgeContext(input),sourcePolicy:null
    })
  }),/GUIDE_HARNESS_SOURCE_POLICY_DECLARATION_MISMATCH/u);
});

await control("mismatched context source policy is rejected",async () => {
  const row=policyRows[0];
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,
    buildSupportKnowledgeContext:input => ({
      ...inertDependencies.buildSupportKnowledgeContext(input),
      sourcePolicy:{ id:"your-and-public-debates",requiredSourceIds:["app-navigation"],
        allowedSourceIds:["app-navigation"],recoverySourceIds:["app-navigation"] }
    })
  }),/GUIDE_HARNESS_SOURCE_POLICY_DECLARATION_MISMATCH/u);
});

await control("production recovery selector mismatch is rejected",async () => {
  const row=policyRows[0];
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,
    selectSupportRecoveryEntry:entries => entries.find(({ id }) => id === "browse-public-debates")
  }),/GUIDE_HARNESS_RECOVERY_SOURCE_BINDING_INVALID/u);
});

await control("private branch proof rejects public classification",async () => {
  const row=GUIDE_MATRIX.find(({ branch }) => branch === "DETERMINISTIC_PRIVATE_REFUSAL");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,classifyPublicGuideBoundary:() => ({ kind:"PUBLIC_GUIDE" })
  }),/GUIDE_HARNESS_PRIVATE_BRANCH_PROOF_MISMATCH/u);
});

await control("model branch rejects a public navigation refusal",async () => {
  const row=GUIDE_MATRIX.find(({ branch }) => branch === "MODEL");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,classifySupportMessage:() => ({ outcome:"REFUSE_ZONE",link:"/settings" })
  }),/GUIDE_HARNESS_PUBLIC_NAVIGATION_REFUSED/u);
});

await control("injection branch proof rejects model routing",async () => {
  const row=GUIDE_MATRIX.find(({ branch }) => branch === "DETERMINISTIC_INJECTION_REFUSAL");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,classifySupportMessage:() => ({ outcome:null,link:null })
  }),/GUIDE_HARNESS_INJECTION_BRANCH_PROOF_MISMATCH/u);
});

await control("recovery branch proof rejects changed predicate polarity",async () => {
  const row=GUIDE_MATRIX.find(({ recoveryClass }) => recoveryClass === "NEGATED_OPERATION_AND_NAVIGATION");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,analyzeRecoverySemantics:(_text,language) => ({
      language,navigation:"AFFIRMATIVE",credentialOperation:"AFFIRMATIVE"
    })
  }),/GUIDE_HARNESS_RECOVERY_BRANCH_PROOF_MISMATCH/u);
});

await control("required navigation rejects a missing closed action",async () => {
  const row=GUIDE_MATRIX.find(({ actionPolicy }) => actionPolicy === "REQUIRE_CLOSED");
  assert.throws(() => deriveGuideRowProof({ entries:inertEntries },row,{
    ...inertDependencies,resolveSupportActions:() => []
  }),/GUIDE_HARNESS_REQUIRED_ACTION_PROOF_MISMATCH/u);
});

await control("negated EN recovery row requires pointer Help without a recovery action",async () => {
  const row=GUIDE_MATRIX.find(({ sequence }) => sequence === 53);
  assert.deepEqual({
    prompt:row.prompt,mode:row.mode,language:row.language,branch:row.branch,
    actionPolicy:row.actionPolicy,navigation:row.navigation,recoveryClass:row.recoveryClass
  },{
    prompt:"I am not asking to reset a password. Where is Help?",mode:"full",language:"en",
    branch:"MODEL",actionPolicy:"REQUIRE_CLOSED",navigation:{ kind:"pointer",actionId:"help" },
    recoveryClass:"NEGATED_OR_UNRELATED"
  });
  const proof=deriveGuideRowProof({ entries:inertEntries },row,inertDependencies);
  assert.deepEqual(proof.requestedActionIds,["help"]);
  assert.deepEqual(proof.allowedActions.map(({ id }) => id),["help"]);
});

await control("negated RO recovery row requires keyboard Help without a recovery action",async () => {
  const row=GUIDE_MATRIX.find(({ sequence }) => sequence === 54);
  assert.deepEqual({
    prompt:row.prompt,mode:row.mode,language:row.language,branch:row.branch,
    actionPolicy:row.actionPolicy,navigation:row.navigation,recoveryClass:row.recoveryClass
  },{
    prompt:"Nu cer resetarea parolei. Unde găsesc Ajutor?",mode:"compact",language:"ro",
    branch:"MODEL",actionPolicy:"REQUIRE_CLOSED",navigation:{ kind:"keyboard",actionId:"help" },
    recoveryClass:"NEGATED_OR_UNRELATED"
  });
  const proof=deriveGuideRowProof({ entries:inertEntries },row,inertDependencies);
  assert.deepEqual(proof.requestedActionIds,["help"]);
  assert.deepEqual(proof.allowedActions.map(({ id }) => id),["help"]);
});

await control("actual recovery request rejects an injected Help action",async () => {
  const rows=GUIDE_MATRIX.filter(row => row.kind === "RECOVERY"
    && row.recoveryClass !== "NEGATED_OR_UNRELATED");
  assert.equal(rows.length,8);
  for (const row of rows) {
    assert.equal(row.actionPolicy,"NONE");
    assert.equal(row.navigation,null);
    const proof=deriveGuideRowProof({ entries:inertEntries },row,inertDependencies);
    assert.deepEqual(proof.requestedActionIds ?? [],[]);
    assert.deepEqual(proof.allowedActions ?? [],[]);
  }
  const row=rows[0];
  const action=inertActions.help;
  assert.throws(() => assertGuideObservation({
    row,proof:{ branch:row.branch,recoveryClass:row.recoveryClass },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Recovery guidance",sources:[],actions:[action] },
    visible:{ text:"Recovery guidance",sources:[],actions:[{ label:action.label,href:action.href }] },
    diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  }),/GUIDE_HARNESS_RECOVERY_RESULT_INVALID/u);
});

await control("same destination pointer activation succeeds without a transition wait",async () => {
  let pointerActivations=0;
  let waits=0;
  const navigation=await activateGuideNavigation({
    baseUrl:"https://localhost:3100",beforeUrl:"https://localhost:3100/help",
    expectedHref:"/help",kind:"pointer",
    activatePointer:async () => { pointerActivations+=1; },
    activateKeyboard:async () => { throw new Error("WRONG_ACTIVATION"); },
    waitForExpectedDestination:async () => { waits+=1; },
    readCurrentUrl:async () => "https://localhost:3100/help"
  });
  assert.equal(pointerActivations,1);
  assert.equal(waits,0);
  assert.deepEqual(navigation,{
    kind:"pointer",expectedDestination:"https://localhost:3100/help",
    destination:"https://localhost:3100/help",performed:true,transitionWaited:false
  });
});

await control("changed destination keyboard activation waits for the exact destination",async () => {
  let keyboardActivations=0;
  const waits=[];
  const navigation=await activateGuideNavigation({
    baseUrl:"https://localhost:3100",beforeUrl:"https://localhost:3100/",
    expectedHref:"/help",kind:"keyboard",
    activatePointer:async () => { throw new Error("WRONG_ACTIVATION"); },
    activateKeyboard:async () => { keyboardActivations+=1; },
    waitForExpectedDestination:async destination => { waits.push(destination); },
    readCurrentUrl:async () => "https://localhost:3100/help"
  });
  assert.equal(keyboardActivations,1);
  assert.deepEqual(waits,["https://localhost:3100/help"]);
  assert.equal(navigation.transitionWaited,true);
});

await control("wrong final navigation destination is rejected",async () => {
  let activations=0;
  await assert.rejects(() => activateGuideNavigation({
    baseUrl:"https://localhost:3100",beforeUrl:"https://localhost:3100/",
    expectedHref:"/help",kind:"pointer",
    activatePointer:async () => { activations+=1; },
    waitForExpectedDestination:async () => {},
    readCurrentUrl:async () => "https://localhost:3100/settings"
  }),/GUIDE_HARNESS_NAVIGATION_DESTINATION_MISMATCH/u);
  assert.equal(activations,1);
});

await control("missing requested activation is rejected before destination proof",async () => {
  let destinationReads=0;
  await assert.rejects(() => activateGuideNavigation({
    baseUrl:"https://localhost:3100",beforeUrl:"https://localhost:3100/help",
    expectedHref:"/help",kind:"pointer",
    waitForExpectedDestination:async () => {},
    readCurrentUrl:async () => { destinationReads+=1; return "https://localhost:3100/help"; }
  }),/GUIDE_HARNESS_NAVIGATION_ACTIVATION_INVALID/u);
  assert.equal(destinationReads,0);
});

const modelRow=GUIDE_MATRIX.find(row => row.branch === "MODEL");
const privateRow=GUIDE_MATRIX.find(row => row.branch === "DETERMINISTIC_PRIVATE_REFUSAL");
const recoveryRow=GUIDE_MATRIX.find(row => row.branch === "DETERMINISTIC_RECOVERY");
const injectionRows=GUIDE_MATRIX.filter(row => row.branch === "DETERMINISTIC_INJECTION_REFUSAL");
const injectionRow=injectionRows[0];
const visible=(text,sources=[],actions=[]) => ({ text,sources,actions });
const acceptedDiagnostic=() => ({
  status:"ACCEPTED_DRAFT",candidateCount:0,validCount:0,invalidCount:0,
  duplicateCount:0,unmatchedCount:0
});
const attributedDiagnostic=(status="ATTRIBUTED_RECOVERY",predicate="SOURCE_MEMBERSHIP") => ({
  status,candidateCount:1,validCount:1,invalidCount:0,duplicateCount:0,unmatchedCount:0,
  record:{ predicate }
});
const ambiguousDiagnostic=() => ({
  status:"AMBIGUOUS",candidateCount:2,validCount:1,invalidCount:1,
  duplicateCount:0,unmatchedCount:1
});

await control("accepted model draft attribution is diagnostic backed",async () => {
  const result=assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("Public guide",["Guide"]),diagnostic:acceptedDiagnostic()
  });
  assert.equal(result.responseOrigin,"MODEL_ACCEPTED_DRAFT");
});

await control("reviewed fallback attribution is diagnostic backed",async () => {
  const result=assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Reviewed",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("Reviewed",["Guide"]),diagnostic:attributedDiagnostic()
  });
  assert.equal(result.responseOrigin,"REVIEWED_FALLBACK");
});

await control("ambiguous model attribution fails closed",async () => {
  assert.throws(() => assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"x",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("x",["Guide"]),diagnostic:ambiguousDiagnostic()
  }),/GUIDE_HARNESS_DIAGNOSTIC_ATTRIBUTION_INVALID/u);
});

function modelObservation(overrides={}) {
  const sourceId=modelRow.expectedSourceIds[0];
  return {
    row:modelRow,
    proof:{ branch:"MODEL",sourceIds:[sourceId],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[{ id:sourceId,label:"Guide" }],actions:[] },
    visible:visible("Public guide",["Guide"]),
    diagnostic:acceptedDiagnostic(),
    ...overrides
  };
}

function stagedInput(overrides={}) {
  const complete=modelObservation();
  return {
    row:complete.row,proof:complete.proof,status:complete.api.status,
    body:{
      outcome:complete.api.outcome,text:complete.api.text,
      sources:complete.api.sources,actions:complete.api.actions,
      rejectedDraft:"discard-me",headers:{ authorization:"discard-me" },cookies:"discard-me",
      sessionId:"discard-me",capabilities:"discard-me",credentials:"discard-me"
    },
    waitForSessionVersion:async () => {},
    waitForAssistant:async () => {},
    readVisible:async () => ({ ...complete.visible,privateRecord:"discard-me" }),
    readDiagnostic:async () => ({
      ...complete.diagnostic,
      rawRuntimeBytes:"discard-me",attemptId:"discard-me"
    }),
    ...overrides
  };
}

function deterministicStagedInput(row,body) {
  return {
    row,
    proof:{ branch:row.branch,recoveryClass:row.recoveryClass ?? null },
    status:200,
    body,
    waitForSessionVersion:async () => {},
    waitForAssistant:async () => {},
    readVisible:async () => visible(body.text),
    readDiagnostic:async () => ({ status:"NOT_APPLICABLE",candidateCount:0 })
  };
}

async function stagedFailure(input,code) {
  const checkpoints=[];
  const attemptedRows=[input.row.sequence];
  const rows=[];
  await assert.rejects(async () => {
    const result=await consumeGuideObservationStages({
      ...input,checkpoint:async observation => { checkpoints.push(structuredClone(observation)); }
    });
    rows.push(result);
  },new RegExp(code,"u"));
  assert.equal(attemptedRows.length,1);
  assert.deepEqual(attemptedRows,[input.row.sequence]);
  assert.equal(rows.length,0);
  assert.equal(checkpoints.at(-1).failureCode,code);
  return checkpoints;
}

await control("staged consumer retains canonical attempt when API projection is invalid",async () => {
  const checkpoints=await stagedFailure(stagedInput({ body:{ outcome:"ANSWER_GROUNDED" } }),
    "GUIDE_HARNESS_API_TEXT_INVALID");
  assert.equal(checkpoints.length,2);
  assert.deepEqual(checkpoints.map(({ phase }) => phase),["API_RECEIVED","API_RECEIVED"]);
  assert.equal(checkpoints.at(-1).api,null);
  assert.equal(checkpoints.at(-1).visible,null);
  assert.equal(checkpoints.at(-1).diagnostic,null);
  assert.deepEqual(checkpoints.at(-1).apiReceived,{
    httpStatus:200,outcome:"ANSWER_GROUNDED",
    fieldStates:{
      body:"OBJECT",status:"VALID",outcome:"CLOSED",text:"INVALID",
      sources:"ABSENT",actions:"ABSENT"
    }
  });
});

await control("actual response-read boundary retains parse failure as a non-object sentinel",async () => {
  const forbidden=["private-body-marker","private-parse-exception","header-marker","cookie-marker"];
  const malformed=await readGuidePublicResponse({
    status:() => 502,
    json:async () => { throw new Error(forbidden[1]); }
  });
  assert.deepEqual(malformed,{ body:null,status:502 });
  const checkpoints=await stagedFailure(stagedInput({ body:malformed.body,status:malformed.status }),
    "GUIDE_HARNESS_API_BODY_INVALID");
  assert.deepEqual(checkpoints.map(({ phase }) => phase),["API_RECEIVED","API_RECEIVED"]);
  assert.deepEqual(checkpoints.at(-1).apiReceived,{
    httpStatus:502,outcome:"UNKNOWN",fieldStates:{
      body:"INVALID",status:"VALID",outcome:"UNKNOWN",text:"INVALID",sources:"INVALID",actions:"INVALID"
    }
  });
  const serialized=JSON.stringify(checkpoints);
  for (const value of forbidden) assert.equal(serialized.includes(value),false);
  for (const key of ["rawResponse","parseException","headers","cookies"]) {
    assert.equal(serialized.includes(key),false);
  }
  const body={ outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[],actions:[] };
  assert.deepEqual(await readGuidePublicResponse({ status:() => 200,json:async () => body }),{
    body,status:200
  });
});

await control("legacy deterministic branches normalize omitted decorations",async () => {
  for (const [branch,outcome] of [
    ["DETERMINISTIC_PRIVATE_REFUSAL","REFUSE_ZONE"],
    ["DETERMINISTIC_INJECTION_REFUSAL","REFUSE_INJECTION"],
    ["DETERMINISTIC_RECOVERY","REFUSE_ZONE"]
  ]) {
    assert.deepEqual(projectGuideApiResponse({ outcome,text:"Fixed" },200,branch),{
      status:200,outcome,text:"Fixed",sources:[],actions:[]
    });
  }
});

await control("English and Romanian injection refusals share omitted decoration compatibility",async () => {
  assert.deepEqual(injectionRows.map(({ language }) => language).sort(),["en","ro"]);
  for (const row of injectionRows) {
    const checkpoints=[];
    const result=await consumeGuideObservationStages({
      ...deterministicStagedInput(row,{ outcome:"REFUSE_INJECTION",text:"Fixed refusal" }),
      checkpoint:async observation => { checkpoints.push(structuredClone(observation)); }
    });
    assert.equal(result.attribution.responseOrigin,"DETERMINISTIC_INJECTION_REFUSAL");
    assert.deepEqual(result.api.sources,[]);
    assert.deepEqual(result.api.actions,[]);
    assert.deepEqual(checkpoints[0].apiReceived.fieldStates.sources,"ABSENT");
    assert.deepEqual(checkpoints[0].apiReceived.fieldStates.actions,"ABSENT");
  }
});

await control("MODEL branch rejects omitted decorations with predicate codes",async () => {
  await stagedFailure(stagedInput({
    body:{ outcome:"ANSWER_GROUNDED",text:"Public guide",actions:[] }
  }),"GUIDE_HARNESS_API_SOURCES_INVALID");
  await stagedFailure(stagedInput({
    body:{ outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[] }
  }),"GUIDE_HARNESS_API_ACTIONS_INVALID");
});

await control("present malformed decorations reject every branch",async () => {
  const invalidSources=[
    "private-invalid",
    Array.from({ length:4 },(_,index) => ({ id:`source-${index}`,label:`Source ${index}` })),
    [{ id:"source",label:"Source" },{ id:"source",label:"Duplicate" }],
    [{ id:"source",label:"Source",privateValue:"discard-me" }],
    [{ id:"",label:"Source" }]
  ];
  const invalidActions=[
    { raw:"private-invalid" },
    Array.from({ length:4 },(_,index) => ({ id:`action-${index}`,label:`Action ${index}`,href:"/help" })),
    [{ id:"help",label:"Help",href:"/help" },{ id:"help",label:"Duplicate",href:"/help" }],
    [{ id:"help",label:"Help",href:"/help",privateValue:"discard-me" }],
    [{ id:"help",label:"Help",href:"https://outside.example" }]
  ];
  for (const [branch,outcome] of [
    ["MODEL","ANSWER_GROUNDED"],
    ["DETERMINISTIC_PRIVATE_REFUSAL","REFUSE_ZONE"],
    ["DETERMINISTIC_INJECTION_REFUSAL","REFUSE_INJECTION"],
    ["DETERMINISTIC_RECOVERY","REFUSE_ZONE"]
  ]) {
    for (const sources of invalidSources) {
      assert.throws(() => projectGuideApiResponse({ outcome,text:"Fixed",sources,actions:[] },200,branch),
        /GUIDE_HARNESS_API_SOURCES_INVALID/u);
    }
    for (const actions of invalidActions) {
      assert.throws(() => projectGuideApiResponse({ outcome,text:"Fixed",sources:[],actions },200,branch),
        /GUIDE_HARNESS_API_ACTIONS_INVALID/u);
    }
  }
});

await control("API received checkpoint preserves fixed field states for projection failures",async () => {
  for (const [body,status,code,expected] of [
    [null,200,"GUIDE_HARNESS_API_BODY_INVALID",{
      httpStatus:200,outcome:"UNKNOWN",fieldStates:{
        body:"INVALID",status:"VALID",outcome:"UNKNOWN",text:"INVALID",sources:"INVALID",actions:"INVALID"
      }
    }],
    [{ outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[],actions:[] },"invalid-status","GUIDE_HARNESS_API_STATUS_INVALID",{
      httpStatus:null,outcome:"ANSWER_GROUNDED",fieldStates:{
        body:"OBJECT",status:"INVALID",outcome:"CLOSED",text:"STRING",sources:"ARRAY",actions:"ARRAY"
      }
    }],
    [{ outcome:"PRIVATE_OUTCOME",text:"Public guide",sources:[],actions:[] },200,"GUIDE_HARNESS_API_OUTCOME_INVALID",{
      httpStatus:200,outcome:"UNKNOWN",fieldStates:{
        body:"OBJECT",status:"VALID",outcome:"UNKNOWN",text:"STRING",sources:"ARRAY",actions:"ARRAY"
      }
    }],
    [{ outcome:"ANSWER_GROUNDED",text:{ raw:"private-text" },sources:[],actions:[] },200,"GUIDE_HARNESS_API_TEXT_INVALID",{
      httpStatus:200,outcome:"ANSWER_GROUNDED",fieldStates:{
        body:"OBJECT",status:"VALID",outcome:"CLOSED",text:"INVALID",sources:"ARRAY",actions:"ARRAY"
      }
    }],
    [{ outcome:"ANSWER_GROUNDED",text:"Public guide",sources:{ raw:"private-sources" },actions:[] },200,"GUIDE_HARNESS_API_SOURCES_INVALID",{
      httpStatus:200,outcome:"ANSWER_GROUNDED",fieldStates:{
        body:"OBJECT",status:"VALID",outcome:"CLOSED",text:"STRING",sources:"INVALID",actions:"ARRAY"
      }
    }],
    [{ outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[],actions:{ raw:"private-actions" } },200,"GUIDE_HARNESS_API_ACTIONS_INVALID",{
      httpStatus:200,outcome:"ANSWER_GROUNDED",fieldStates:{
        body:"OBJECT",status:"VALID",outcome:"CLOSED",text:"STRING",sources:"ARRAY",actions:"INVALID"
      }
    }]
  ]) {
    const checkpoints=await stagedFailure(stagedInput({ body,status }),code);
    assert.deepEqual(checkpoints.map(({ phase }) => phase),["API_RECEIVED","API_RECEIVED"]);
    assert.equal(checkpoints.at(-1).api,null);
    assert.equal(checkpoints.at(-1).failureCode,code);
    assert.deepEqual(Object.keys(checkpoints.at(-1).apiReceived).sort(),[
      "fieldStates","httpStatus","outcome"
    ]);
    assert.deepEqual(checkpoints.at(-1).apiReceived,expected);
    const serialized=JSON.stringify(checkpoints);
    for (const forbidden of [
      "invalid-status","PRIVATE_OUTCOME","private-text","private-sources","private-actions"
    ]) assert.equal(serialized.includes(forbidden),false);
  }
});

await control("API received checkpoint strips private response extras",async () => {
  const checkpoints=[];
  const input=stagedInput();
  input.body={
    ...input.body,rawBody:"discard-me",headers:"discard-me",cookies:"discard-me",
    capabilities:"discard-me",rejectedText:"discard-me"
  };
  await consumeGuideObservationStages({
    ...input,
    checkpoint:async observation => { checkpoints.push(structuredClone(observation)); }
  });
  const received=JSON.stringify(checkpoints[0]);
  assert.equal(checkpoints[0].phase,"API_RECEIVED");
  for (const forbidden of [
    "discard-me","rawBody","headers","cookies","capabilities","rejectedText","Public guide"
  ]) assert.equal(received.includes(forbidden),false);
});

await control("staged consumer preserves safe API after missing assistant DOM",async () => {
  const checkpoints=await stagedFailure(stagedInput({
    waitForAssistant:async () => { throw new Error("raw DOM detail"); }
  }),"GUIDE_HARNESS_ASSISTANT_DOM_MISSING");
  assert.equal(checkpoints.at(-1).phase,"API_PROJECTED");
  assert.equal(checkpoints.at(-1).api.text,"Public guide");
  assert.equal(checkpoints.at(-1).visible,null);
  assert.equal(checkpoints.at(-1).equality,null);
  assert.equal(JSON.stringify(checkpoints).includes("raw DOM detail"),false);
});

await control("staged consumer preserves safe API after session version failure",async () => {
  const checkpoints=await stagedFailure(stagedInput({
    waitForSessionVersion:async () => { throw new Error("raw session identity"); }
  }),"GUIDE_HARNESS_SESSION_VERSION_INVALID");
  assert.equal(checkpoints.at(-1).phase,"API_PROJECTED");
  assert.equal(checkpoints.at(-1).api.text,"Public guide");
  assert.equal(JSON.stringify(checkpoints).includes("raw session identity"),false);
});

await control("staged consumer preserves safe API after rendered reply read failure",async () => {
  const checkpoints=await stagedFailure(stagedInput({
    readVisible:async () => { throw new Error("raw rendered detail"); }
  }),"GUIDE_HARNESS_DOM_READ_FAILED");
  assert.equal(checkpoints.at(-1).phase,"API_PROJECTED");
  assert.equal(checkpoints.at(-1).api.text,"Public guide");
  assert.equal(JSON.stringify(checkpoints).includes("raw rendered detail"),false);
});

await control("staged consumer rejects malformed DOM without inventing equality",async () => {
  const checkpoints=await stagedFailure(stagedInput({
    readVisible:async () => ({ text:"Public guide",sources:[1],actions:[] })
  }),"GUIDE_HARNESS_DOM_PROJECTION_INVALID");
  assert.equal(checkpoints.at(-1).phase,"API_PROJECTED");
  assert.equal(checkpoints.at(-1).visible,null);
  assert.equal(checkpoints.at(-1).equality,null);
});

await control("staged consumer preserves DOM equality after diagnostic consumer failure",async () => {
  const checkpoints=await stagedFailure(stagedInput({
    readDiagnostic:async () => { throw new Error("raw runtime bytes"); }
  }),"GUIDE_HARNESS_DIAGNOSTIC_CAPTURE_FAILED");
  assert.equal(checkpoints.at(-1).phase,"DOM_PROJECTED");
  assert.deepEqual(checkpoints.at(-1).equality,{ text:true,sources:true,actions:true });
  assert.equal(checkpoints.at(-1).diagnostic,null);
  assert.equal(JSON.stringify(checkpoints).includes("raw runtime bytes"),false);
});

await control("staged consumer preserves DOM equality when diagnostic shape is invalid",async () => {
  const checkpoints=await stagedFailure(stagedInput({ readDiagnostic:async () => null }),
    "GUIDE_HARNESS_DIAGNOSTIC_INVALID");
  assert.equal(checkpoints.at(-1).phase,"DOM_PROJECTED");
  assert.deepEqual(checkpoints.at(-1).equality,{ text:true,sources:true,actions:true });
  assert.equal(checkpoints.at(-1).diagnostic,null);
});

async function assertAttributedDiagnosticRejected(diagnostic,forbidden=null) {
  const checkpoints=await stagedFailure(stagedInput({ readDiagnostic:async () => diagnostic }),
    "GUIDE_HARNESS_DIAGNOSTIC_INVALID");
  assert.deepEqual(checkpoints.map(({ phase }) => phase),[
    "API_RECEIVED","API_PROJECTED","DOM_PROJECTED","DOM_PROJECTED"
  ]);
  assert.deepEqual(checkpoints.at(-1).equality,{ text:true,sources:true,actions:true });
  assert.equal(checkpoints.at(-1).diagnostic,null);
  if (forbidden !== null) assert.equal(JSON.stringify(checkpoints).includes(forbidden),false);
}

await control("staged consumer rejects attributed diagnostic without a record at DOM stage",async () => {
  const diagnostic=attributedDiagnostic();
  delete diagnostic.record;
  await assertAttributedDiagnosticRejected(diagnostic);
});

await control("staged consumer rejects unknown attributed predicate without leaking it",async () => {
  await assertAttributedDiagnosticRejected(
    attributedDiagnostic("ATTRIBUTED_REFUSAL","PRIVATE_UNKNOWN_PREDICATE"),
    "PRIVATE_UNKNOWN_PREDICATE"
  );
});

await control("staged consumer rejects missing and noninteger attributed fixed counts",async () => {
  const missing=attributedDiagnostic();
  delete missing.validCount;
  await assertAttributedDiagnosticRejected(missing);
  await assertAttributedDiagnosticRejected({ ...attributedDiagnostic(),invalidCount:"private-count" },
    "private-count");
});

await control("fixed diagnostic producer statuses project only their allowed shapes",async () => {
  for (const [diagnostic,expected] of [
    [acceptedDiagnostic(),{ status:"ACCEPTED_DRAFT",category:null,candidateCount:0,
      validCount:0,invalidCount:0,duplicateCount:0,unmatchedCount:0 }],
    [attributedDiagnostic(),{ status:"ATTRIBUTED_RECOVERY",category:"SOURCE_MEMBERSHIP",
      candidateCount:1,validCount:1,invalidCount:0,duplicateCount:0,unmatchedCount:0 }],
    [attributedDiagnostic("ATTRIBUTED_REFUSAL","ACTION_MEMBERSHIP"),{
      status:"ATTRIBUTED_REFUSAL",category:"ACTION_MEMBERSHIP",candidateCount:1,
      validCount:1,invalidCount:0,duplicateCount:0,unmatchedCount:0 }],
    [ambiguousDiagnostic(),{ status:"AMBIGUOUS",category:null,candidateCount:2,
      validCount:1,invalidCount:1,duplicateCount:0,unmatchedCount:1 }]
  ]) {
    const observation=projectGuideFailureObservation({ ...modelObservation(),diagnostic });
    assert.deepEqual(observation.diagnostic,expected);
  }
});

await control("NOT APPLICABLE diagnostic preserves legitimate count nullability",async () => {
  const observation=projectGuideFailureObservation({
    row:privateRow,proof:{ branch:privateRow.branch },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Private records unavailable",sources:[],actions:[] },
    visible:visible("Private records unavailable"),
    diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  });
  assert.deepEqual(observation.diagnostic,{
    status:"NOT_APPLICABLE",category:null,candidateCount:0,
    validCount:null,invalidCount:null,duplicateCount:null,unmatchedCount:null
  });
  assert.equal(assertGuideObservation({
    row:privateRow,proof:{ branch:privateRow.branch },api:observation.api,
    visible:observation.visible,diagnostic:observation.diagnostic
  }).responseOrigin,"DETERMINISTIC_PRIVATE_REFUSAL");
});

await control("staged consumer checkpoints complete safe stages before assertion failure",async () => {
  const input=stagedInput();
  input.body={ ...input.body,outcome:"REFUSE_ZONE" };
  const checkpoints=await stagedFailure(input,"GUIDE_HARNESS_OUTCOME_INVALID");
  assert.deepEqual(checkpoints.map(({ phase }) => phase),[
    "API_RECEIVED","API_PROJECTED","DOM_PROJECTED","DIAGNOSTIC_PROJECTED","DIAGNOSTIC_PROJECTED"
  ]);
  assert.equal(checkpoints.at(-1).diagnostic.status,"ACCEPTED_DRAFT");
});

await control("staged consumer strips private and raw extras at every persisted phase",async () => {
  const checkpoints=[];
  const result=await consumeGuideObservationStages({
    ...stagedInput(),checkpoint:async observation => { checkpoints.push(structuredClone(observation)); }
  });
  assert.equal(result.attribution.responseOrigin,"MODEL_ACCEPTED_DRAFT");
  assert.deepEqual(checkpoints.map(({ phase }) => phase),[
    "API_RECEIVED","API_PROJECTED","DOM_PROJECTED","DIAGNOSTIC_PROJECTED"
  ]);
  const serialized=JSON.stringify(checkpoints);
  for (const forbidden of [
    "discard-me","rejectedDraft","authorization","cookies","sessionId","capabilities","credentials",
    "privateRecord","rawRuntimeBytes","attemptId"
  ]) assert.equal(serialized.includes(forbidden),false);
});

for (const [name,mutate,code] of [
  ["model branch proof has a closed failure code",input => { input.proof={ ...input.proof,branch:"DETERMINISTIC_RECOVERY" }; },"GUIDE_HARNESS_BRANCH_PROOF_MISMATCH"],
  ["model HTTP status has a closed failure code",input => { input.api={ ...input.api,status:503 }; },"GUIDE_HARNESS_HTTP_STATUS_INVALID"],
  ["model outcome has a closed failure code",input => { input.api={ ...input.api,outcome:"REFUSE_ZONE" }; },"GUIDE_HARNESS_OUTCOME_INVALID"],
  ["expected primary source has a closed failure code",input => { input.api={ ...input.api,sources:[{ id:"wrong-source",label:"Guide" }] }; },"GUIDE_HARNESS_EXPECTED_PRIMARY_SOURCE_MISSING"],
  ["proof primary source has a closed failure code",input => { input.proof={ ...input.proof,sourceIds:["different-source"] }; },"GUIDE_HARNESS_PROOF_PRIMARY_SOURCE_MISSING"],
  ["diagnostic attribution has a closed failure code",input => { input.diagnostic=ambiguousDiagnostic(); },"GUIDE_HARNESS_DIAGNOSTIC_ATTRIBUTION_INVALID"],
  ["action policy has a closed failure code",input => { input.api={ ...input.api,actions:[{ id:"help",label:"Help",href:"/help" }] }; input.visible=visible("Public guide",["Guide"],[{ label:"Help",href:"/help" }]); },"GUIDE_HARNESS_ACTION_POLICY_INVALID"],
  ["action binding has a closed failure code",input => { input.row={ ...input.row,actionPolicy:"REQUIRE_CLOSED",navigation:{ kind:"pointer",actionId:"help" } }; input.api={ ...input.api,actions:[{ id:"help",label:"Help",href:"/help" }] }; input.visible=visible("Public guide",["Guide"],[{ label:"Help",href:"/help" }]); },"GUIDE_HARNESS_ACTION_BINDING_INVALID"]
]) {
  await control(name,async () => {
    const input=modelObservation();
    mutate(input);
    assert.throws(() => assertGuideObservation(input),new RegExp(code,"u"));
  });
}

await control("safe failure projection retains public equality and strips private extras",async () => {
  const input=modelObservation();
  input.row={ ...input.row,privateRecord:"discard-me" };
  input.proof={ ...input.proof,privateCapability:"discard-me" };
  input.api={ ...input.api,headers:{ authorization:"discard-me" },rejectedDraft:"discard-me" };
  input.diagnostic={
    status:"ATTRIBUTED_RECOVERY",candidateCount:1,validCount:1,invalidCount:0,
    duplicateCount:0,unmatchedCount:0,cursorStart:91,attemptId:"discard-me",
    record:{ attemptId:"discard-me",code:"SAFE_CODE",predicate:"SOURCE_MEMBERSHIP",raw:"discard-me" }
  };
  const observation=projectGuideFailureObservation(input);
  assert.deepEqual(observation.equality,{ text:true,sources:true,actions:true });
  assert.equal(observation.diagnostic.category,"SOURCE_MEMBERSHIP");
  const serialized=JSON.stringify(observation);
  for (const forbidden of ["discard-me","authorization","rejectedDraft","cursorStart","attemptId","raw"]) {
    assert.equal(serialized.includes(forbidden),false);
  }
});

await control("malformed failure observation is rejected before persistence",async () => {
  const input=modelObservation();
  input.api={ ...input.api,sources:[{ id:1,label:"Guide" }] };
  assert.throws(() => projectGuideFailureObservation(input),/GUIDE_HARNESS_FAILURE_OBSERVATION_INVALID/u);
});

await control("failed row checkpoints safe observation before and after a closed predicate failure",async () => {
  const input=modelObservation();
  input.api={ ...input.api,status:503 };
  const checkpoints=[];
  await assert.rejects(
    () => checkpointGuideObservation(input,async observation => { checkpoints.push(structuredClone(observation)); }),
    /GUIDE_HARNESS_HTTP_STATUS_INVALID/u
  );
  assert.equal(checkpoints.length,2);
  assert.equal(checkpoints[0].failureCode,null);
  assert.equal(checkpoints[1].failureCode,"GUIDE_HARNESS_HTTP_STATUS_INVALID");
  assert.equal(checkpoints[1].canonicalRow.sequence,modelRow.sequence);
  assert.deepEqual(checkpoints[1].equality,{ text:true,sources:true,actions:true });
});

await control("API DOM mismatch checkpoints false equality before failing",async () => {
  const input=modelObservation({ visible:visible("Different",["Guide"]) });
  const checkpoints=[];
  await assert.rejects(
    () => checkpointGuideObservation(input,async observation => { checkpoints.push(structuredClone(observation)); }),
    /GUIDE_HARNESS_API_DOM_MISMATCH/u
  );
  assert.equal(checkpoints.length,2);
  assert.deepEqual(checkpoints[0].equality,{ text:false,sources:true,actions:true });
  assert.equal(checkpoints[1].failureCode,"GUIDE_HARNESS_API_DOM_MISMATCH");
});

await control("ambiguous diagnostic window persists only fixed counts and category",async () => {
  const input=modelObservation({ diagnostic:{ ...ambiguousDiagnostic(),raw:"discard-me" } });
  const checkpoints=[];
  await assert.rejects(
    () => checkpointGuideObservation(input,async observation => { checkpoints.push(structuredClone(observation)); }),
    /GUIDE_HARNESS_DIAGNOSTIC_ATTRIBUTION_INVALID/u
  );
  assert.deepEqual(checkpoints.at(-1).diagnostic,{
    status:"AMBIGUOUS",category:null,candidateCount:2,
    validCount:1,invalidCount:1,duplicateCount:0,unmatchedCount:1
  });
  assert.equal(JSON.stringify(checkpoints).includes("discard-me"),false);
});

await control("private record request is deterministic and actionless",async () => {
  const result=assertGuideObservation({
    row:privateRow,proof:{ branch:privateRow.branch },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Private records unavailable",sources:[],actions:[] },
    visible:visible("Private records unavailable"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"DETERMINISTIC_PRIVATE_REFUSAL");
});

await control("unresolved recovery is deterministic and actionless",async () => {
  const result=assertGuideObservation({
    row:recoveryRow,proof:{ branch:recoveryRow.branch,recoveryClass:recoveryRow.recoveryClass },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Recovery guidance",sources:[],actions:[] },
    visible:visible("Recovery guidance"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"DETERMINISTIC_RECOVERY");
});

await control("prompt injection is deterministic and actionless",async () => {
  const result=assertGuideObservation({
    row:injectionRow,proof:{ branch:injectionRow.branch },
    api:{ status:200,outcome:"REFUSE_INJECTION",text:"Fixed refusal",sources:[],actions:[] },
    visible:visible("Fixed refusal"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"DETERMINISTIC_INJECTION_REFUSAL");
});

await control("deterministic rows reject model diagnostics",async () => {
  assert.throws(() => assertGuideObservation({
    row:privateRow,proof:{ branch:privateRow.branch },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Fixed",sources:[],actions:[] },
    visible:visible("Fixed"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:1 }
  }),/GUIDE_HARNESS_UNEXPECTED_MODEL_DIAGNOSTIC/u);
});

await control("API DOM mismatch fails closed",async () => {
  assert.throws(() => assertGuideObservation({
    row:privateRow,proof:{ branch:privateRow.branch },
    api:{ status:200,outcome:"REFUSE_ZONE",text:"Fixed",sources:[],actions:[] },
    visible:visible("Different"),diagnostic:{ status:"NOT_APPLICABLE",candidateCount:0 }
  }),/GUIDE_HARNESS_API_DOM_MISMATCH/u);
});

const capacityNow=new Date("2026-09-17T12:00:00.000Z");
const capacityStatus={
  configuration:{ kind:"AVAILABLE",snapshot:{
    supportRegisterVersion:"19",schemaVersion:1,supportSnapshotSha256:"1".repeat(64),
    fullSnapshotSha256:"4".repeat(64),
    values:{
      supportEnabled:true,supportModelRef:"development:hermes-glm-5.3-flash",
      supportLimitAnonMessages10m:20,supportLimitAnonMessages24h:100,
      supportLimitAnonSessions1h:5,supportLimitSessionMessages:40,
      supportLimitMessageCharacters:2000,supportRelayConcurrency:2,supportQueueDepth:10,
      supportDailyCallCap:500,supportLockAfterInjections:3,supportIpCooldownMinutes:60
    }
  } },
  kb_version:"2".repeat(64),calls_today:10,relay_state:"AVAILABLE"
};
const capacityCounts={
  max_anon_session_events_1h_by_ip:"0",max_anon_message_events_10m_by_ip:"0",
  max_anon_message_events_24h_by_ip:"20",any_ip_cooldown_active:false,live_relay_waiters:"0"
};
const capacitySnapshot=projectGuideRuntimeCapacity({
  status:capacityStatus,counts:capacityCounts,finalCommit:"3".repeat(40),
  measuredAtUtc:capacityNow.toISOString()
});

await control("capacity projection is fixed key identifier free and sufficient",async () => {
  const validated=validateGuideRuntimeCapacity(capacitySnapshot,{
    finalCommit:"3".repeat(40),kbVersion:"2".repeat(64),modelRows:42,
    nowMs:capacityNow.getTime()+1_000
  });
  assert.equal(validated.observed.callsToday,10);
  assert.equal(GUIDE_COUNTS_ONLY_SQL.includes("SELECT ip_sha256"),true);
  assert.equal(Object.keys(validated.observed).includes("ipSha256"),false);
});

await control("capacity reader performs one supported status and counts read",async () => {
  let statusReads=0;
  let countReads=0;
  const projected=await readGuideRuntimeCapacity({
    finalCommit:"3".repeat(40),clock:() => capacityNow,
    readSupportedStatus:async () => { statusReads+=1; return capacityStatus; },
    readCountsOnly:async (sql,parameters) => {
      countReads+=1;
      assert.equal(sql,GUIDE_COUNTS_ONLY_SQL);
      assert.deepEqual(parameters,[capacityNow,60]);
      return capacityCounts;
    }
  });
  assert.equal(statusReads,1);
  assert.equal(countReads,1);
  assert.deepEqual(projected,capacitySnapshot);
});

for (const [name,mutate,error] of [
  ["capacity rejects an extra producer key",value => { value.extra=true; },"GUIDE_HARNESS_CAPACITY_INVALID"],
  ["capacity rejects a stale measurement",(_value,expected) => {
    expected.nowMs=capacityNow.getTime()+120_001;
  },"GUIDE_HARNESS_CAPACITY_BINDING_INVALID"],
  ["capacity rejects occupied session slots",value => {
    value.observed.maxAnonSessionEvents1hByIp=1;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects recent anonymous messages",value => {
    value.observed.maxAnonMessageEvents10mByIp=1;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects insufficient daily anonymous messages",value => {
    value.observed.maxAnonMessageEvents24hByIp=47;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects insufficient per session messages",value => {
    value.limits.support_limit_session_msgs=13;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects insufficient message characters",value => {
    value.limits.support_limit_msg_chars=83;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects insufficient daily model calls",value => {
    value.observed.callsToday=459;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects a one injection lock threshold",value => {
    value.limits.support_lock_after_injections=1;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects an active cooldown",value => {
    value.observed.anyIpCooldownActive=true;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects a live waiter",value => {
    value.observed.liveRelayWaiters=1;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects unavailable relay state",value => {
    value.observed.relayState="DEGRADED";
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"],
  ["capacity rejects zero queue depth",value => {
    value.limits.support_queue_depth=0;
  },"GUIDE_HARNESS_CAPACITY_INSUFFICIENT"]
]) {
  await control(name,async () => {
    const value=structuredClone(capacitySnapshot);
    const expected={
      finalCommit:"3".repeat(40),kbVersion:"2".repeat(64),modelRows:42,
      nowMs:capacityNow.getTime()+1_000
    };
    mutate(value,expected);
    assert.throws(() => validateGuideRuntimeCapacity(value,expected),new RegExp(error,"u"));
  });
}

await control("gate rejects placeholders and any resolved Forgot connector",async () => {
  assert.throws(() => validateGuideGateInput({}),/GUIDE_HARNESS_FINAL_GATE_INVALID/u);
  const valid={
    schemaVersion:1,
    productRoot:"/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine",
    finalCommit:"a".repeat(40),productInventoryPath:"/tmp/inventory.json",productInventorySha256:"b".repeat(64),
    attestationPath:"/tmp/attestation.json",attestationSha256:"c".repeat(64),
    expectedSnapshotVersion:"d".repeat(64),expectedEntryCount:1,
    requiredSuiteReceiptPath:"/tmp/suite.json",requiredSuiteReceiptSha256:"e".repeat(64),
    controlProofPath:"/tmp/controls.json",controlProofSha256:"f".repeat(64),
    runtimeCapacityPath:"/tmp/capacity.json",runtimeCapacitySha256:"1".repeat(64),
    runtimeLogPath:"/tmp/runtime.log",baseUrl:"https://localhost:3100",
    forgotConnector:{ status:"UNRESOLVED_ACTIONLESS" }
  };
  assert.equal(validateGuideGateInput(valid).forgotConnector.status,"UNRESOLVED_ACTIONLESS");
  assert.throws(() => validateGuideGateInput({ ...valid,forgotConnector:{ status:"VERIFIED",href:"/reset" } }),/GUIDE_HARNESS_FINAL_GATE_INVALID/u);
});

const finalCommit="a".repeat(40);
const kbVersion="b".repeat(64);
const suiteFiles=[
  ...Array.from({ length:25 },(_,index) => `tests/frozen/live-p2-${index+1}.test.ts`),
  "tests/render/sup-03-consent.test.tsx","tests/render/sup-04-widget.test.tsx",
  "tests/render/support-topbar.test.tsx","tests/unit/support-public-guide-boundary.test.ts",
  "tests/unit/support-recovery-intent.test.ts","tests/unit/s7-authorization.test.ts",
  "tests/architecture/sup-01-boundary.test.ts","tests/architecture/sup-03-projection.test.ts",
  "tests/integration/dev-database-principals.test.ts"
];
const boundReceipts={
  finalCommit,kbVersion,entryCount:2,harnessSha256,
  inventory:{ revision:finalCommit,productFiles:[{ laneRelative:"a",sha256:"c".repeat(64),bytes:1 }] },
  attestation:{ finalCommit,snapshot:{ kbVersion,entryCount:2 },logicalRecords:[{},{}] },
  suite:{ revision:finalCommit,kbVersion,exitCode:0,files:suiteFiles,argv:["pnpm","exec","vitest","run",...suiteFiles,"--maxWorkers=1"] },
  controlProof:{
    schemaVersion:2,result:"PASS",revision:finalCommit,kbVersion,harnessSha256,
    controls:17,passed:17,names:Array.from({ length:17 },(_,index) => `control-${index+1}`)
  }
};

await control("bound receipts pin revision snapshot suite membership and controls",async () => {
  const result=validateBoundReceiptMembership(boundReceipts);
  assert.equal(result.suiteFiles.length,34);
  assert.equal(result.controlCount,17);
});

for (const [name,mutate] of [
  ["wrong revision receipt rejected",input => { input.suite.revision="c".repeat(40); }],
  ["missing required suite member rejected",input => { input.suite.files=input.suite.files.slice(1); }],
  ["unsupported worker flag receipt rejected",input => { input.suite.argv.push("--minWorkers"); }],
  ["stale control count receipt rejected",input => { input.controlProof.passed-=1; }],
  ["successful proof from a stale revision rejected",input => {
    input.controlProof.revision="c".repeat(40);
  }],
  ["successful proof from the wrong KB rejected",input => {
    input.controlProof.kbVersion="c".repeat(64);
  }],
  ["successful proof from a changed harness rejected",input => {
    input.controlProof.harnessSha256="c".repeat(64);
  }]
]) {
  await control(name,async () => {
    const input=structuredClone(boundReceipts);
    mutate(input);
    assert.throws(() => validateBoundReceiptMembership(input),/GUIDE_HARNESS_BOUND_RECEIPT_INVALID/u);
  });
}

await control("declared count derives from completed controls",async () => {
  assert.equal(deriveDeclaredControlCount(results),results.length);
});

await control("future capture parses without executing traffic",async () => {
  for (const path of ["capture-public-guide.mjs","probe-zero-request-ui.mjs"]) {
    execFileSync(process.execPath,["--check",
      `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND16/${path}`
    ],{ stdio:"pipe" });
  }
});

await control("exact final product branches match the sealed matrix",async () => {
  const output=execFileSync(process.execPath,["--import","tsx",
    "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND16/verify-final-branches.ts",
    productRoot,expectedCommit
  ],{ encoding:"utf8",stdio:["ignore","pipe","pipe"] });
  const branchResult=JSON.parse(output);
  assert.deepEqual(branchResult.branches,{
    MODEL:42,DETERMINISTIC_PRIVATE_REFUSAL:2,
    DETERMINISTIC_INJECTION_REFUSAL:2,DETERMINISTIC_RECOVERY:8
  });
  assert.equal(branchResult.revision,expectedCommit);
  assert.equal(branchResult.verdict,"PASS");
  assert.equal(branchResult.rows,54);
  assert.match(branchResult.kbVersion,/^[0-9a-f]{64}$/u);
  assert.equal(branchResult.assistantSha256,"5921ced41c60a047a4c4e390f2e6154b99944c4ad0620433f130d58d590062b3");
  finalBranchResult=branchResult;
});

function compactObservation(phase,overrides={}) {
  return {
    surface:"compact",language:"ro",phase,hydrationReady:"READY",
    toggleCount:1,toggleVisible:"VISIBLE",widgetState:"COLLAPSED",ariaExpanded:"FALSE",
    panelCount:0,panelVisible:"UNKNOWN",compactRootCount:0,compactRootVisible:"UNKNOWN",
    composerCount:0,composerVisible:"UNKNOWN",urlClass:"BASE",cookieRegionVisible:"HIDDEN",
    consoleErrorCategories:{ HTTP_401:0,HTTP_404:0,JS_OR_HYDRATION:0,OTHER:0 },fullReadiness:null,
    ...overrides
  };
}

await control("compact transition projection rejects malformed or extra state",async () => {
  assert.throws(() => validateGuideSupportTransitionObservation({
    ...compactObservation("BEFORE_INTERACTION"),arbitraryDom:"forbidden"
  }),/GUIDE_HARNESS_UI_TRANSITION_OBSERVATION_INVALID/u);
  assert.throws(() => validateGuideSupportTransitionObservation({
    ...compactObservation("BEFORE_INTERACTION"),composerCount:-1
  }),/GUIDE_HARNESS_UI_TRANSITION_OBSERVATION_INVALID/u);
});

await control("compact precondition requires hydration before the single support click",async () => {
  assert.throws(() => requireGuideCompactPrecondition(compactObservation("BEFORE_INTERACTION",{
    hydrationReady:"NOT_READY"
  })),/GUIDE_HARNESS_COMPACT_HYDRATION_TIMEOUT/u);
  assert.throws(() => requireGuideCompactPrecondition(compactObservation("BEFORE_INTERACTION",{
    toggleCount:2,toggleVisible:"UNKNOWN"
  })),/GUIDE_HARNESS_COMPACT_TOGGLE_DUPLICATE/u);
});

await control("opening helper hydrates and checkpoints before one compact interaction",async () => {
  const order=[];
  const observed=[];
  const ready=compactObservation("READY",{
    widgetState:"EXPANDED",ariaExpanded:"TRUE",panelCount:1,panelVisible:"VISIBLE",
    compactRootCount:1,compactRootVisible:"VISIBLE",composerCount:1,composerVisible:"VISIBLE"
  });
  const result=await openGuideSupportSurface({
    surface:"compact",language:"ro",
    navigate:async () => order.push("navigate"),
    waitForHydration:async () => order.push("hydrated"),
    observe:async phase => {
      order.push(`observe:${phase}`);
      if (phase === "READY") return ready;
      if (phase === "AFTER_INTERACTION") return compactObservation(phase,{
        widgetState:"EXPANDED",ariaExpanded:"TRUE",panelCount:1,panelVisible:"VISIBLE",
        compactRootCount:1,compactRootVisible:"VISIBLE",composerCount:1,composerVisible:"VISIBLE"
      });
      return compactObservation(phase);
    },
    activateCompact:async () => order.push("activate"),
    waitForReady:async () => order.push("wait-ready"),
    selectLanguage:async () => order.push("language"),
    checkpoint:async (observation,code) => { observed.push({ phase:observation.phase,code }); }
  });
  assert.deepEqual(order,[
    "navigate","hydrated","observe:BEFORE_INTERACTION","activate",
    "observe:AFTER_INTERACTION","wait-ready","observe:READY","language"
  ]);
  assert.deepEqual(observed,[
    { phase:"BEFORE_INTERACTION",code:null },
    { phase:"AFTER_INTERACTION",code:null },
    { phase:"READY",code:null }
  ]);
  assert.equal(result.ready.composerVisible,"VISIBLE");
  assert.equal(classifyGuideCompactTransitionFailure(result.ready),null);
  assert.deepEqual(requireGuideCompactReady(result.ready),result.ready);
});

await control("failed compact transition checkpoints a closed discriminator",async () => {
  const checkpoints=[];
  await assert.rejects(() => openGuideSupportSurface({
    surface:"compact",language:"ro",
    navigate:async () => {},waitForHydration:async () => {},
    observe:async phase => phase === "FAILED"
      ? compactObservation(phase,{ widgetState:"COLLAPSED",ariaExpanded:"FALSE" })
      : compactObservation(phase),
    activateCompact:async () => {},
    waitForReady:async () => { throw new Error("arbitrary browser text must not escape"); },
    selectLanguage:async () => {},
    checkpoint:async (observation,code) => checkpoints.push({ phase:observation.phase,code })
  }),/GUIDE_HARNESS_COMPACT_STATE_TRANSITION_ABSENT/u);
  assert.deepEqual(checkpoints.at(-1),{
    phase:"FAILED",code:"GUIDE_HARNESS_COMPACT_STATE_TRANSITION_ABSENT"
  });
  assert.equal(JSON.stringify(checkpoints).includes("arbitrary browser text"),false);
});

function fullReadiness(overrides={}) {
  return {
    languageControlCount:2,visibleLanguageControlCount:2,activeLanguage:"EN",
    composerCount:1,composerVisible:"VISIBLE",modeToggleCount:1,
    modeToggleVisible:"VISIBLE",modeState:"TERRACOTTA",urlClass:"HELP",...overrides
  };
}

function fullObservation(phase,overrides={}) {
  const readiness=fullReadiness(overrides.fullReadiness ?? {});
  return {
    surface:"full",language:"en",phase,hydrationReady:"READY",
    toggleCount:0,toggleVisible:"NOT_APPLICABLE",widgetState:"NOT_APPLICABLE",
    ariaExpanded:"NOT_APPLICABLE",panelCount:0,panelVisible:"NOT_APPLICABLE",
    compactRootCount:0,compactRootVisible:"NOT_APPLICABLE",
    composerCount:readiness.composerCount,composerVisible:readiness.composerVisible,
    urlClass:readiness.urlClass,cookieRegionVisible:"HIDDEN",
    consoleErrorCategories:{ HTTP_401:0,HTTP_404:0,JS_OR_HYDRATION:0,OTHER:0 },
    fullReadiness:readiness,...overrides,fullReadiness:readiness
  };
}

await control("full readiness projection is fixed and surface specific",async () => {
  assert.deepEqual(validateGuideFullReadinessState(fullReadiness()),fullReadiness());
  assert.throws(() => validateGuideFullReadinessState({
    ...fullReadiness(),reactProperty:"forbidden"
  }),/GUIDE_HARNESS_FULL_READINESS_STATE_INVALID/u);
  assert.throws(() => validateGuideSupportTransitionObservation({
    ...fullObservation("BEFORE_INTERACTION"),fullReadiness:null
  }),/GUIDE_HARNESS_UI_TRANSITION_OBSERVATION_INVALID/u);
  assert.throws(() => validateGuideSupportTransitionObservation({
    ...compactObservation("BEFORE_INTERACTION"),fullReadiness:fullReadiness()
  }),/GUIDE_HARNESS_UI_TRANSITION_OBSERVATION_INVALID/u);
});

await control("full readiness classifier distinguishes public preconditions",async () => {
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness()),null);
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ languageControlCount:0 })),
    "GUIDE_HARNESS_FULL_LANGUAGE_CONTROLS_MISSING");
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ languageControlCount:3 })),
    "GUIDE_HARNESS_FULL_LANGUAGE_CONTROLS_DUPLICATE");
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ visibleLanguageControlCount:1 })),
    "GUIDE_HARNESS_FULL_LANGUAGE_CONTROLS_INVISIBLE");
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ activeLanguage:"UNKNOWN" })),
    "GUIDE_HARNESS_FULL_LANGUAGE_ACTIVE_INVALID");
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ composerCount:0 })),
    "GUIDE_HARNESS_FULL_COMPOSER_MISSING");
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ modeToggleCount:0 })),
    "GUIDE_HARNESS_FULL_MODE_TOGGLE_MISSING");
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ modeState:"UNKNOWN" })),
    "GUIDE_HARNESS_FULL_MODE_TOGGLE_INVALID");
  assert.equal(classifyGuideFullReadinessFailure(fullReadiness({ urlClass:"BASE" })),
    "GUIDE_HARNESS_FULL_URL_INVALID");
});

await control("full readiness preserves nonempty Support state on same locale remount",async () => {
  let mode="TERRACOTTA";
  const languageActivations=[];
  const supportState={ session:"nonempty-session",messages:7,locale:"EN" };
  const before=structuredClone(supportState);
  const result=await proveGuideFullReadiness({
    desiredLanguage:"en",
    readState:async () => fullReadiness({ activeLanguage:supportState.locale,modeState:mode }),
    activateMode:async () => { mode=mode === "TERRACOTTA" ? "CHAMBER" : "TERRACOTTA"; },
    waitForMode:async expected => { assert.equal(mode,expected); },
    activateLanguage:async language => {
      languageActivations.push(language);
      supportState.locale=language.toUpperCase();
      supportState.session=null;
    },
    waitForLanguage:async language => { assert.equal(supportState.locale,language.toUpperCase()); }
  });
  assert.deepEqual(languageActivations,[]);
  assert.deepEqual(supportState,before);
  assert.equal(result.probeMode,"CHAMBER");
  assert.equal(result.languageChanged,false);
  assert.equal(result.ready.activeLanguage,"EN");
});

await control("full readiness changes locale once only at the planned session boundary",async () => {
  let active="EN";
  let mode="TERRACOTTA";
  const transcript=["disclosure","existing reply"];
  const activations=[];
  const result=await proveGuideFullReadiness({
    desiredLanguage:"ro",readState:async () => fullReadiness({ activeLanguage:active,modeState:mode }),
    activateMode:async () => { mode=mode === "TERRACOTTA" ? "CHAMBER" : "TERRACOTTA"; },
    waitForMode:async expected => { assert.equal(mode,expected); },
    activateLanguage:async language => { activations.push(language); active=language.toUpperCase(); },
    waitForLanguage:async language => { assert.equal(active,language.toUpperCase()); }
  });
  assert.deepEqual(activations,["ro"]);
  assert.deepEqual(transcript,["disclosure","existing reply"]);
  assert.equal(result.languageChanged,true);
  assert.equal(result.ready.activeLanguage,"RO");
});

await control("full capture call sites retain the exact five session boundary plan",async () => {
  assert.equal(GUIDE_SESSION_GROUPS.length,5);
  assert.deepEqual(GUIDE_SESSION_GROUPS.map((group,index) => ({
    index,id:group.id,mode:group.mode,language:group.language,
    transition:guideGroupTransition(GUIDE_SESSION_GROUPS,index)
  })),[
    { index:0,id:"lifecycle-full-en",mode:"full",language:"en",transition:"FRESH_PROFILE" },
    { index:1,id:"full-ro",mode:"full",language:"ro",transition:"LANGUAGE_SELECTOR_RESET" },
    { index:2,id:"compact-ro",mode:"compact",language:"ro",transition:"STORAGE_RESET_BEFORE_REMOUNT" },
    { index:3,id:"full-en",mode:"full",language:"en",transition:"LANGUAGE_SELECTOR_RESET" },
    { index:4,id:"compact-en",mode:"compact",language:"en",transition:"STORAGE_RESET_BEFORE_REMOUNT" }
  ]);
});

await control("failed full interaction checkpoints its closed predicate",async () => {
  const checkpoints=[];
  await assert.rejects(() => openGuideSupportSurface({
    surface:"full",language:"en",navigate:async () => {},
    waitForHydration:async () => {
      throw new Error("GUIDE_HARNESS_FULL_MODE_ACTIVATION_FAILED");
    },
    observe:async phase => fullObservation(phase,{ hydrationReady:phase === "FAILED" ? "NOT_READY" : "READY" }),
    waitForReady:async () => {},selectLanguage:async () => {},
    checkpoint:async (observation,code) => checkpoints.push({ phase:observation.phase,code })
  }),/GUIDE_HARNESS_FULL_MODE_ACTIVATION_FAILED/u);
  assert.deepEqual(checkpoints,[{
    phase:"FAILED",code:"GUIDE_HARNESS_FULL_MODE_ACTIVATION_FAILED"
  }]);
});

await control("blocked Support classifier isolates only the automatic case list read",async () => {
  const base="https://localhost:3100";
  assert.equal(classifyGuideBlockedSupportOperation(`${base}/api/v1/support/status`,"GET"),"status");
  assert.equal(classifyGuideBlockedSupportOperation(`${base}/api/v1/support/cases`,"GET"),"pageCaseListRead");
  assert.equal(classifyGuideBlockedSupportOperation(`${base}/api/v1/support/cases`,"POST"),"otherSupport");
  assert.equal(classifyGuideBlockedSupportOperation(`${base}/api/v1/support/cases/token`,"GET"),"otherSupport");
  assert.equal(classifyGuideBlockedSupportOperation(`${base}/api/v1/support/sessions`,"POST"),"createSession");
  assert.equal(classifyGuideBlockedSupportOperation(`${base}/api/v1/support/sessions/id/messages`,"POST"),"sendMessage");
  assert.equal(classifyGuideBlockedSupportOperation(`${base}/_next/static/chunk.js`,"GET"),null);
});

await control("full readiness reports the exact failed interaction phase",async () => {
  async function expectPhase(expected,overrides={}) {
    let mode="TERRACOTTA";
    let active="EN";
    let activations=0;
    let waits=0;
    let reads=0;
    await assert.rejects(() => proveGuideFullReadiness({
      desiredLanguage:overrides.desiredLanguage ?? "en",
      readState:async () => {
        reads+=1;
        if (overrides.finalMismatch && reads === 3) return fullReadiness({ activeLanguage:"RO",modeState:mode });
        return fullReadiness({ activeLanguage:active,modeState:mode });
      },
      activateMode:async () => {
        activations+=1;
        if (overrides.failModeActivation === activations) throw new Error("fixture");
        mode=mode === "TERRACOTTA" ? "CHAMBER" : "TERRACOTTA";
      },
      waitForMode:async expectedMode => {
        waits+=1;
        if (overrides.failModeWait === waits) throw new Error("fixture");
        assert.equal(mode,expectedMode);
      },
      activateLanguage:async language => {
        if (overrides.failLanguageActivation) throw new Error("fixture");
        active=language.toUpperCase();
      },
      waitForLanguage:async language => {
        if (overrides.failLanguageWait) throw new Error("fixture");
        assert.equal(active,language.toUpperCase());
      }
    }),new RegExp(expected,"u"));
  }
  await expectPhase("GUIDE_HARNESS_FULL_MODE_ACTIVATION_FAILED",{ failModeActivation:1 });
  await expectPhase("GUIDE_HARNESS_FULL_MODE_EXPECTED_STATE_TIMEOUT",{ failModeWait:1 });
  await expectPhase("GUIDE_HARNESS_FULL_MODE_RESTORE_ACTIVATION_FAILED",{ failModeActivation:2 });
  await expectPhase("GUIDE_HARNESS_FULL_MODE_RESTORE_STATE_TIMEOUT",{ failModeWait:2 });
  await expectPhase("GUIDE_HARNESS_FULL_LANGUAGE_ACTIVATION_FAILED",{
    desiredLanguage:"ro",failLanguageActivation:true
  });
  await expectPhase("GUIDE_HARNESS_FULL_LANGUAGE_EXPECTED_STATE_TIMEOUT",{
    desiredLanguage:"ro",failLanguageWait:true
  });
  await expectPhase("GUIDE_HARNESS_FULL_FINAL_VERIFICATION_FAILED",{ finalMismatch:true });
});

await control("full adapters gate the first click on hydration and each restore on transition idle",async () => {
  const directory=dirname(fileURLToPath(import.meta.url));
  const [capture,probe,producer]=await Promise.all([
    readFile(resolve(directory,"capture-public-guide.mjs"),"utf8"),
    readFile(resolve(directory,"probe-zero-request-ui.mjs"),"utf8"),
    readFile(resolve(productRoot,"apps/ui/components/modeTransition.ts"),"utf8")
  ]);
  for (const source of [capture,probe]) {
    const hydration=source.indexOf("await waitForHydratedClickHandler(modeToggle)");
    const proof=source.indexOf("return await proveGuideFullReadiness",hydration);
    assert.equal(hydration >= 0 && proof > hydration,true);
    assert.equal(source.includes('root.dataset.themeTransition !== "active"'),true);
    assert.equal(source.includes('!root.classList.contains("theme-transition-fallback")'),true);
  }
  assert.equal(producer.includes("if (activeTransitions.has(document)) return;"),true);
  assert.equal(producer.includes("activeTransitions.delete(document);"),true);
});

await control("documented PROBE6 argv passes the extracted guard and stale forms reject",async () => {
  const evidence="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence";
  const revision="152eed4da1cd3e66b74d8301159ba76427552409";
  const output=`${evidence}/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json`;
  assert.deepEqual(validateGuideUiProbeArguments([revision,output]),{ expectedRevision:revision,outputPath:output });
  for (const args of [
    [revision,`${evidence}/GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json`],
    [revision,"/private/tmp/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE6.json"],
    [revision,output,"extra"],
    ["bad-revision",output]
  ]) assert.throws(() => validateGuideUiProbeArguments(args),/GUIDE_UI_PROBE_ARGUMENTS_INVALID/u);
});

await control("actual product binds language controls under full and compact roots",async () => {
  const assistant=await readFile(resolve(productRoot,"apps/ui/components/support/Assistant.tsx"),"utf8");
  assert.equal(assistant.includes('className="supportAssistantCompact"'),true);
  assert.equal(assistant.includes('className="supportLanguage"'),true);
  assert.deepEqual(guideSupportLanguageSelectors("full"),{
    root:".supportDesk",controls:'.supportDesk .supportLanguage button',
    active:'.supportDesk .supportLanguage button[aria-pressed="true"]'
  });
  assert.deepEqual(guideSupportLanguageSelectors("compact"),{
    root:".supportAssistantCompact",controls:'.supportAssistantCompact .supportLanguage button',
    active:'.supportAssistantCompact .supportLanguage button[aria-pressed="true"]'
  });
});

await control("old full-only selector misses compact while the shared selector reaches it",async () => {
  const fixture=createLanguageDomFixture("compact","EN");
  assert.equal(await fixture.locate('.supportDesk .supportLanguage button[aria-pressed="true"]').count(),0);
  const result=await selectGuideSupportLanguage({
    surface:"compact",language:"ro",locate:fixture.locate,waitForLanguage:fixture.waitForLanguage
  });
  assert.deepEqual(result,{ surface:"compact",language:"ro",changed:true });
  assert.deepEqual(fixture.read(),{ active:"RO",clicks:1 });
});

await control("shared selector covers the exact five transition locale branches",async () => {
  const branches=[
    ["full","en","EN",false],["full","ro","EN",true],["compact","ro","RO",false],
    ["full","en","RO",true],["compact","en","EN",false]
  ];
  for (const [surface,language,initial,changed] of branches) {
    const fixture=createLanguageDomFixture(surface,initial);
    const result=await selectGuideSupportLanguage({
      surface,language,locate:fixture.locate,waitForLanguage:fixture.waitForLanguage
    });
    assert.equal(result.changed,changed);
    assert.equal(fixture.read().clicks,changed ? 1 : 0);
    assert.equal(fixture.read().active,language.toUpperCase());
  }
});

await control("shared selector rejects absent duplicate and wrong-locale controls",async () => {
  for (const [options,pattern] of [
    [{ absent:true },/GUIDE_HARNESS_LANGUAGE_CONTROL_COUNT_INVALID/u],
    [{ duplicate:true },/GUIDE_HARNESS_LANGUAGE_CONTROL_COUNT_INVALID/u],
    [{ invalid:true },/GUIDE_HARNESS_ACTIVE_LANGUAGE_INVALID/u]
  ]) {
    const fixture=createLanguageDomFixture("compact","EN",options);
    await assert.rejects(() => selectGuideSupportLanguage({
      surface:"compact",language:"ro",locate:fixture.locate,waitForLanguage:fixture.waitForLanguage
    }),pattern);
  }
});

await control("post-ready failure stages remain closed and surface specific",async () => {
  assert.equal(guidePostReadyFailureCode("COOKIE_SETTLING"),"GUIDE_HARNESS_POST_READY_COOKIE_SETTLING_FAILED");
  assert.equal(guidePostReadyFailureCode("LOCALE_SELECTION"),"GUIDE_HARNESS_POST_READY_LOCALE_SELECTION_FAILED");
  assert.equal(guidePostReadyFailureCode("PRIVATE_CONTROL_CHECK"),"GUIDE_HARNESS_POST_READY_PRIVATE_CONTROL_CHECK_FAILED");
  assert.equal(guidePostReadyFailureCode("TRANSITION_COMPLETION"),"GUIDE_HARNESS_POST_READY_TRANSITION_COMPLETION_FAILED");
  assert.throws(() => guidePostReadyFailureCode("UNKNOWN"),/GUIDE_HARNESS_POST_READY_STAGE_INVALID/u);
});

await control("both actual adapters use the shared selector and fixed post-ready stages",async () => {
  const directory=dirname(fileURLToPath(import.meta.url));
  const [capture,probe]=await Promise.all([
    readFile(resolve(directory,"capture-public-guide.mjs"),"utf8"),
    readFile(resolve(directory,"probe-zero-request-ui.mjs"),"utf8")
  ]);
  for (const source of [capture,probe]) {
    assert.equal(source.includes("selectGuideSupportLanguage"),true);
    assert.equal(source.includes("guidePostReadyFailureCode"),true);
    for (const stage of ["COOKIE_SETTLING","LOCALE_SELECTION","PRIVATE_CONTROL_CHECK","TRANSITION_COMPLETION"]) {
      assert.equal(source.includes(`\"${stage}\"`),true);
    }
  }
});

if (finalBranchResult === null) throw new Error("GUIDE_HARNESS_FINAL_BRANCH_RESULT_MISSING");
const output={
  schemaVersion:2,result:"PASS",revision:expectedCommit,kbVersion:finalBranchResult.kbVersion,
  harnessSha256,controls:deriveDeclaredControlCount(results),passed:results.length,names:results
};
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GUIDE_EXECUTION_ORDER,GUIDE_FAMILIES,GUIDE_MATRIX,GUIDE_REQUEST_START_SPACING_MS,
  GUIDE_SESSION_GROUPS,validateGuideMatrix,validateGuideRequestStartOffsets,validateGuideSchedule
} from "./matrix.mjs";
import {
  assertGuideObservation,computeGuideHarnessSha256,deriveDeclaredControlCount,
  validateBoundReceiptMembership,validateGuideGateInput
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
async function control(name,operation) {
  await operation();
  results.push(name);
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
    const rows=GUIDE_MATRIX.map(row => ({ ...row,expectedSourceIds:[...row.expectedSourceIds] }));
    mutate(rows);
    assert.throws(() => validateGuideMatrix(rows),/GUIDE_HARNESS_MATRIX_INVALID/u);
  });
}

const digest=value => createHash("sha256").update(value).digest("hex");
const sourceIds=[...new Set(GUIDE_MATRIX.flatMap(({ expectedSourceIds }) => expectedSourceIds))];
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
  buildSupportKnowledgeContext:({ query }) => {
    const row=rowByPrompt.get(query);
    if (row === undefined) throw new Error("INERT_PROMPT_UNKNOWN");
    return {
      sourceIds:[...row.expectedSourceIds],
      requestedActionIds:row.navigation === null ? [] : [row.navigation.actionId]
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

const modelRow=GUIDE_MATRIX.find(row => row.branch === "MODEL");
const privateRow=GUIDE_MATRIX.find(row => row.branch === "DETERMINISTIC_PRIVATE_REFUSAL");
const recoveryRow=GUIDE_MATRIX.find(row => row.branch === "DETERMINISTIC_RECOVERY");
const injectionRow=GUIDE_MATRIX.find(row => row.branch === "DETERMINISTIC_INJECTION_REFUSAL");
const visible=(text,sources=[],actions=[]) => ({ text,sources,actions });

await control("accepted model draft attribution is diagnostic backed",async () => {
  const result=assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Public guide",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("Public guide",["Guide"]),diagnostic:{ status:"ACCEPTED_DRAFT",candidateCount:0 }
  });
  assert.equal(result.responseOrigin,"MODEL_ACCEPTED_DRAFT");
});

await control("reviewed fallback attribution is diagnostic backed",async () => {
  const result=assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"Reviewed",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("Reviewed",["Guide"]),diagnostic:{ status:"ATTRIBUTED_RECOVERY",candidateCount:1 }
  });
  assert.equal(result.responseOrigin,"REVIEWED_FALLBACK");
});

await control("ambiguous model attribution fails closed",async () => {
  assert.throws(() => assertGuideObservation({
    row:modelRow,proof:{ branch:"MODEL",sourceIds:[modelRow.expectedSourceIds[0]],allowedActions:[] },
    api:{ status:200,outcome:"ANSWER_GROUNDED",text:"x",sources:[{ id:modelRow.expectedSourceIds[0],label:"Guide" }],actions:[] },
    visible:visible("x",["Guide"]),diagnostic:{ status:"AMBIGUOUS",candidateCount:2 }
  }),/GUIDE_HARNESS_ATTRIBUTION_AMBIGUOUS/u);
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
  "tests/architecture/sup-01-boundary.test.ts","tests/architecture/sup-03-projection.test.ts"
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
  assert.equal(result.suiteFiles.length,33);
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
  execFileSync(process.execPath,["--check",
    "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX3/capture-public-guide.mjs"
  ],{ stdio:"pipe" });
});

await control("exact final product branches match the sealed matrix",async () => {
  const output=execFileSync(process.execPath,["--import","tsx",
    "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_FIX3/verify-final-branches.ts",
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

if (finalBranchResult === null) throw new Error("GUIDE_HARNESS_FINAL_BRANCH_RESULT_MISSING");
const output={
  schemaVersion:2,result:"PASS",revision:expectedCommit,kbVersion:finalBranchResult.kbVersion,
  harnessSha256,controls:deriveDeclaredControlCount(results),passed:results.length,names:results
};
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);

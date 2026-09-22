import {
  GUIDE_FAMILIES,GUIDE_MATRIX as GUIDE_CANONICAL_MATRIX_SOURCE
} from "../GUIDE_HARNESS_BIND17/matrix.mjs";

export { GUIDE_FAMILIES };
export const GUIDE_CANONICAL_MATRIX=Object.freeze([...GUIDE_CANONICAL_MATRIX_SOURCE]);

const ownerRows=[
  {
    sequence:55,kind:"OWNER_REGRESSION",family:"product-identity",mode:"compact",language:"en",
    prompt:"What is Dialectical-Engine, and what can I do in this app?",branch:"MODEL",
    expectedSourceIds:["product-identity"],actionPolicy:"NONE",requiredActionId:null,
    navigation:null,lifecycleRole:null,recoveryClass:null
  },
  {
    sequence:56,kind:"OWNER_REGRESSION",family:"product-identity",mode:"compact",language:"ro",
    prompt:"Ce este Dialectical-Engine și ce pot face în această aplicație?",branch:"MODEL",
    expectedSourceIds:["product-identity"],actionPolicy:"NONE",requiredActionId:null,
    navigation:null,lifecycleRole:null,recoveryClass:null
  },
  {
    sequence:57,kind:"OWNER_REGRESSION",family:"account-access",mode:"compact",language:"en",
    prompt:"Where can I sign in?",branch:"MODEL",expectedSourceIds:["account-access"],
    actionPolicy:"ALLOW_CLOSED",requiredActionId:"sign-in",navigation:null,
    lifecycleRole:null,recoveryClass:null
  },
  {
    sequence:58,kind:"OWNER_REGRESSION",family:"account-access",mode:"compact",language:"ro",
    prompt:"Unde îmi pot crea un cont?",branch:"MODEL",expectedSourceIds:["account-access"],
    actionPolicy:"ALLOW_CLOSED",requiredActionId:"sign-up",navigation:null,
    lifecycleRole:null,recoveryClass:null
  }
];

export const GUIDE_OWNER_ROWS=Object.freeze(ownerRows.map(row => Object.freeze({
  ...row,expectedSourceIds:Object.freeze([...row.expectedSourceIds])
})));
export const GUIDE_MATRIX=Object.freeze([...GUIDE_CANONICAL_MATRIX,...GUIDE_OWNER_ROWS]);
const MATRIX_CANONICAL=JSON.stringify(GUIDE_MATRIX);
const CANONICAL54=JSON.stringify(GUIDE_CANONICAL_MATRIX);

export const GUIDE_REQUEST_START_SPACING_MS=31_000;
export const GUIDE_ACTUAL_SEQUENCES=Object.freeze([
  1,2,15,19,23,27,31,35,39,47,43,10,18,26,34,56,58,54,
  5,13,21,25,29,37,45,53,8,12,42,55,57
]);
export const GUIDE_SESSION_GROUPS=Object.freeze([
  Object.freeze({ id:"lifecycle-full-en",mode:"full",language:"en",sequences:Object.freeze([1]) }),
  Object.freeze({ id:"full-ro",mode:"full",language:"ro",sequences:Object.freeze([2,15,19,23,27,31,35,39,47,43]) }),
  Object.freeze({ id:"compact-ro",mode:"compact",language:"ro",sequences:Object.freeze([10,18,26,34,56,58,54]) }),
  Object.freeze({ id:"full-en",mode:"full",language:"en",sequences:Object.freeze([5,13,21,25,29,37,45,53]) }),
  Object.freeze({ id:"compact-en",mode:"compact",language:"en",sequences:Object.freeze([8,12,42,55,57]) })
]);
export const GUIDE_EXECUTION_ORDER=GUIDE_ACTUAL_SEQUENCES;
export const GUIDE_ACTUAL_PLAN=Object.freeze({
  requestCount:31,modelCallCeiling:27,sessionCount:5,englishCount:14,romanianCount:17,
  ownerWalkthroughReservedMessages:6,ownerWalkthroughReservedSessions:2,
  sequences:GUIDE_ACTUAL_SEQUENCES,
  groupIds:Object.freeze(GUIDE_SESSION_GROUPS.map(group => group.id)),
  allMenuFamilyIds:Object.freeze(GUIDE_FAMILIES.map(family => family.id)),
  broadGuideSequences:Object.freeze([25,26]),
  affectedPriorSequences:Object.freeze([2,15,19,23,27,31,35,39]),
  ownerSequences:Object.freeze([55,56,57,58]),
  helpNavigationSequences:Object.freeze([53,54]),
  deterministicBoundarySequences:Object.freeze([42,43,45,47])
});

export function validateGuideCanonicalMatrix(value=GUIDE_CANONICAL_MATRIX) {
  if (!Array.isArray(value) || value.length !== 54 || JSON.stringify(value) !== CANONICAL54) {
    throw new Error("GUIDE_HARNESS_CANONICAL_MATRIX_INVALID");
  }
  return true;
}

export function validateGuideMatrix(value=GUIDE_MATRIX) {
  if (!Array.isArray(value) || value.length !== 58 || JSON.stringify(value) !== MATRIX_CANONICAL
    || JSON.stringify(value.slice(0,54)) !== CANONICAL54) {
    throw new Error("GUIDE_HARNESS_MATRIX_INVALID");
  }
  return true;
}

export function validateGuideActualPlan(value=GUIDE_ACTUAL_PLAN,matrix=GUIDE_MATRIX,groups=GUIDE_SESSION_GROUPS) {
  validateGuideMatrix(matrix);
  const sequences=groups.flatMap(group => group.sequences);
  if (value.requestCount !== 31 || value.modelCallCeiling !== 27 || value.sessionCount !== 5
    || value.englishCount !== 14 || value.romanianCount !== 17
    || value.ownerWalkthroughReservedMessages !== 6 || value.ownerWalkthroughReservedSessions !== 2
    || JSON.stringify(sequences) !== JSON.stringify(GUIDE_ACTUAL_SEQUENCES)
    || new Set(sequences).size !== 31 || sequences.some(sequence => !matrix.some(row => row.sequence === sequence))) {
    throw new Error("GUIDE_HARNESS_ACTUAL_PLAN_INVALID");
  }
  const rows=sequences.map(sequence => matrix.find(row => row.sequence === sequence));
  if (rows.filter(row => row.language === "en").length !== 14
    || rows.filter(row => row.language === "ro").length !== 17
    || rows.filter(row => row.branch === "MODEL").length !== 27
    || new Set(rows.filter(row => row.kind === "GUIDE_FAMILY").map(row => row.family)).size !== 20
    || ![25,26,2,15,19,23,27,31,35,39,55,56,57,58,53,54,42,43,45,47]
      .every(sequence => sequences.includes(sequence))) {
    throw new Error("GUIDE_HARNESS_ACTUAL_PLAN_COVERAGE_INVALID");
  }
  for (const group of groups) {
    if (group.sequences.some(sequence => {
      const row=matrix.find(candidate => candidate.sequence === sequence);
      return row?.mode !== group.mode || row?.language !== group.language;
    })) throw new Error("GUIDE_HARNESS_ACTUAL_PLAN_GROUP_INVALID");
  }
  if (groups[0].sequences[0] !== 1 || groups[1].sequences[0] !== 2
    || groups[1].sequences.at(-1) !== 43 || groups[2].sequences.at(-1) !== 54) {
    throw new Error("GUIDE_HARNESS_ACTUAL_PLAN_ORDER_INVALID");
  }
  return true;
}

export function validateGuideSchedule(matrix=GUIDE_MATRIX,groups=GUIDE_SESSION_GROUPS) {
  return validateGuideActualPlan(GUIDE_ACTUAL_PLAN,matrix,groups);
}

export function validateGuideRequestStartOffsets(starts) {
  if (!Array.isArray(starts) || starts.length !== GUIDE_ACTUAL_SEQUENCES.length
    || starts.some((item,index) => item === null || typeof item !== "object"
      || Object.keys(item).sort().join(",") !== "requestStartOffsetMs,sequence"
      || item.sequence !== GUIDE_ACTUAL_SEQUENCES[index]
      || !Number.isSafeInteger(item.requestStartOffsetMs) || item.requestStartOffsetMs < 0)) {
    throw new Error("GUIDE_HARNESS_PACING_INVALID");
  }
  for (let index=1;index<starts.length;index+=1) {
    if (starts[index].requestStartOffsetMs-starts[index-1].requestStartOffsetMs
      < GUIDE_REQUEST_START_SPACING_MS) throw new Error("GUIDE_HARNESS_PACING_INVALID");
  }
  for (let first=0;first<starts.length;first+=1) {
    const inWindow=starts.filter(item => item.requestStartOffsetMs >= starts[first].requestStartOffsetMs
      && item.requestStartOffsetMs <= starts[first].requestStartOffsetMs+600_000).length;
    if (inWindow > 20) throw new Error("GUIDE_HARNESS_PACING_INVALID");
  }
  return true;
}

validateGuideActualPlan();

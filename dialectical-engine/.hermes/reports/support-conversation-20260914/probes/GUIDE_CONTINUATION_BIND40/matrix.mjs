import {
  GUIDE_FAMILIES,GUIDE_MATRIX as GUIDE_FULL_MATRIX,
  validateGuideMatrix as validateFullGuideMatrix
} from "../GUIDE_HARNESS_BIND20/matrix.mjs";

export { GUIDE_FAMILIES };
export const GUIDE_MATRIX=GUIDE_FULL_MATRIX;
export const GUIDE_RETAINED_SEQUENCES=Object.freeze([1,2,15,19,23,27,31,35,39,47]);
export const GUIDE_ACTUAL_SEQUENCES=Object.freeze([
  10,18,26,34,56,58,54,43,
  5,13,21,25,29,37,45,53,
  8,12,42,55,57
]);
export const GUIDE_SESSION_GROUPS=Object.freeze([
  Object.freeze({ id:"compact-ro-to-full-ro",mode:"compact",language:"ro",
    sequences:Object.freeze([10,18,26,34,56,58,54,43]),transitionSequence:54,terminalFullSequence:43 }),
  Object.freeze({ id:"full-en",mode:"full",language:"en",
    sequences:Object.freeze([5,13,21,25,29,37,45,53]) }),
  Object.freeze({ id:"compact-en",mode:"compact",language:"en",
    sequences:Object.freeze([8,12,42,55,57]) })
]);
export const GUIDE_REQUEST_START_SPACING_MS=31_000;
export const GUIDE_ACTUAL_PLAN=Object.freeze({
  segment:"REMAINING21_AFTER_RETAINED_LIVE31_TEN",requestCount:21,modelCallCeiling:18,
  sessionCount:3,englishCount:13,romanianCount:8,
  reservedOwnerMessages:6,reservedOwnerModelCalls:6,reservedOwnerSessions:2,
  requiredMessageHeadroom24h:27,requiredSessionHeadroom1h:3,requiredDailyCallHeadroom:24,
  sequences:GUIDE_ACTUAL_SEQUENCES,retainedSequences:GUIDE_RETAINED_SEQUENCES,
  groupIds:Object.freeze(GUIDE_SESSION_GROUPS.map(group=>group.id))
});

export function validateGuideMatrix(value=GUIDE_MATRIX) {
  return validateFullGuideMatrix(value);
}

export function validateGuideActualPlan(value=GUIDE_ACTUAL_PLAN,matrix=GUIDE_MATRIX,groups=GUIDE_SESSION_GROUPS) {
  validateGuideMatrix(matrix);
  const sequences=groups.flatMap(group=>group.sequences);
  const rows=sequences.map(sequence=>matrix.find(row=>row.sequence===sequence));
  if (value.segment!=="REMAINING21_AFTER_RETAINED_LIVE31_TEN"
    || value.requestCount!==21 || value.modelCallCeiling!==18 || value.sessionCount!==3
    || value.englishCount!==13 || value.romanianCount!==8
    || value.reservedOwnerMessages!==6 || value.reservedOwnerModelCalls!==6
    || value.reservedOwnerSessions!==2 || value.requiredMessageHeadroom24h!==27
    || value.requiredSessionHeadroom1h!==3 || value.requiredDailyCallHeadroom!==24
    || JSON.stringify(sequences)!==JSON.stringify(GUIDE_ACTUAL_SEQUENCES)
    || new Set(sequences).size!==21 || rows.some(row=>row===undefined)
    || rows.filter(row=>row.language==="en").length!==13
    || rows.filter(row=>row.language==="ro").length!==8
    || rows.filter(row=>row.branch==="MODEL").length!==18
    || new Set([...GUIDE_RETAINED_SEQUENCES,...GUIDE_ACTUAL_SEQUENCES]).size!==31) {
    throw new Error("GUIDE_CONTINUATION_PLAN_INVALID");
  }
  const first=groups[0];
  if (first.transitionSequence!==54 || first.terminalFullSequence!==43
    || first.sequences.at(-2)!==54 || first.sequences.at(-1)!==43
    || matrix.find(row=>row.sequence===54)?.mode!=="compact"
    || matrix.find(row=>row.sequence===43)?.mode!=="full"
    || matrix.find(row=>row.sequence===54)?.language!=="ro"
    || matrix.find(row=>row.sequence===43)?.language!=="ro") {
    throw new Error("GUIDE_CONTINUATION_TRANSITION_PLAN_INVALID");
  }
  for (const [index,group] of groups.entries()) {
    if (index===0) continue;
    if (group.sequences.some(sequence=>{
      const row=matrix.find(candidate=>candidate.sequence===sequence);
      return row?.mode!==group.mode || row?.language!==group.language;
    })) throw new Error("GUIDE_CONTINUATION_GROUP_INVALID");
  }
  return true;
}

export function validateGuideSchedule(matrix=GUIDE_MATRIX,groups=GUIDE_SESSION_GROUPS) {
  return validateGuideActualPlan(GUIDE_ACTUAL_PLAN,matrix,groups);
}

export function validateGuideRequestStartOffsets(starts) {
  if (!Array.isArray(starts) || starts.length!==21
    || starts.some((item,index)=>item?.sequence!==GUIDE_ACTUAL_SEQUENCES[index]
      || !Number.isSafeInteger(item?.requestStartOffsetMs) || item.requestStartOffsetMs<0)) {
    throw new Error("GUIDE_CONTINUATION_PACING_INVALID");
  }
  for (let index=1;index<starts.length;index+=1) {
    if (starts[index].requestStartOffsetMs-starts[index-1].requestStartOffsetMs<GUIDE_REQUEST_START_SPACING_MS) {
      throw new Error("GUIDE_CONTINUATION_PACING_INVALID");
    }
  }
  for (let first=0;first<starts.length;first+=1) {
    const inWindow=starts.filter(item=>item.requestStartOffsetMs>=starts[first].requestStartOffsetMs
      && item.requestStartOffsetMs<=starts[first].requestStartOffsetMs+600_000).length;
    if (inWindow>20) throw new Error("GUIDE_CONTINUATION_PACING_INVALID");
  }
  return true;
}

validateGuideActualPlan();

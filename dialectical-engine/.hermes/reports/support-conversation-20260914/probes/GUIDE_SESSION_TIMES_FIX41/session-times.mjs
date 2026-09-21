const CODE="GUIDE_CONTINUATION_SESSION_TIMES_INVALID";
const fail=()=>{throw new Error(CODE);};
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
export function validateRemainingSessionCreationTimes(values){
  if(!Array.isArray(values)||values.length!==3)fail();
  const parsed=values.map((value,index)=>{
    if(value===null||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="observedAtUtc,ordinal"
      ||value.ordinal!==index+1||typeof value.observedAtUtc!=="string"||!ISO_UTC.test(value.observedAtUtc))fail();
    const time=Date.parse(value.observedAtUtc);if(!Number.isFinite(time))fail();
    return {ordinal:value.ordinal,observedAtUtc:value.observedAtUtc,time};
  });
  if(!(parsed[0].time<parsed[1].time&&parsed[1].time<parsed[2].time))fail();
  return parsed.map(({time:_,...value})=>value);
}
export function recordSessionCreationTime(target,observedAtUtc=new Date().toISOString()){
  if(!Array.isArray(target)||target.length>=3)fail();
  const value={ordinal:target.length+1,observedAtUtc};
  const candidate=[...target,value];
  if(candidate.length===3)validateRemainingSessionCreationTimes(candidate);
  else {
    if(!ISO_UTC.test(observedAtUtc)||!Number.isFinite(Date.parse(observedAtUtc)))fail();
    if(target.length>0&&Date.parse(target[target.length-1]?.observedAtUtc)>=Date.parse(observedAtUtc))fail();
  }
  target.push(value);return value;
}

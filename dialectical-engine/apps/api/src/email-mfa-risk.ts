import{evaluateAuthenticationRiskSignals,type DecryptedAuthenticationRiskSignal}from"../../../packages/db/src/auth-risk.js";
export function evaluateMfaRecoveryRisk(signals:readonly DecryptedAuthenticationRiskSignal[],at:Date,source:Readonly<{ipArgon2id:string;userAgentArgon2id:string}>):Readonly<{recognizedContext:boolean}>{
  evaluateAuthenticationRiskSignals(signals,at,7776000000,128);
  const logins=signals.filter(s=>s.kind==="LOGIN_SUCCESS"),last=logins.reduce((n,s)=>Math.max(n,s.observedAt.getTime()),-Infinity);
  if(signals.some(s=>(s.kind==="SESSION_CONTEXT_CHANGED"||s.kind==="RECOVERY_PROOF_FAILED")&&s.observedAt.getTime()>=last))throw TypeError("MFA_RECOVERY_RISK_REFUSED");
  return{recognizedContext:logins.some(s=>s.observedAt.getTime()>at.getTime()-2592000000&&s.context.networkRef===source.ipArgon2id&&s.context.clientRef===source.userAgentArgon2id)};
}

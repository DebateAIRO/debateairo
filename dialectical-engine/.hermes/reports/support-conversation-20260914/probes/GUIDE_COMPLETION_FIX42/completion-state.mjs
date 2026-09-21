import { validateRemainingSessionCreationTimes } from "./session-times.mjs";
export async function commitCaptureSuccess({result,checkpoint}){
  if(result?.sessionVersionFailure!==null)throw new Error("GUIDE_CONTINUATION_SESSION_VERSION_FAILURE");
  validateRemainingSessionCreationTimes(result?.sessionCreationTimesUtc);
  result.completed=true;
  try{await checkpoint();}catch(error){result.completed=false;throw error;}
  return result;
}

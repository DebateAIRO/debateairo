import { createHash } from "node:crypto";

export const GUIDE_SESSION_STORAGE_KEY="debateai.support.conversation.v1";

function fail(code) { throw new Error(code); }

export function guideGroupTransition(groups,index) {
  if (!Array.isArray(groups) || !Number.isSafeInteger(index) || index < 0 || index >= groups.length) {
    fail("GUIDE_HARNESS_GROUP_TRANSITION_INVALID");
  }
  if (index === 0) return "FRESH_PROFILE";
  const previous=groups[index-1];
  const current=groups[index];
  if (previous.language !== current.language) return "LANGUAGE_SELECTOR_RESET";
  return "STORAGE_RESET_BEFORE_REMOUNT";
}

export function createGuideSessionLifecycle(groups) {
  if (!Array.isArray(groups) || groups.length !== 5) fail("GUIDE_HARNESS_GROUP_LIFECYCLE_INVALID");
  let nextGroupIndex=0;
  let active=null;
  const identities=new Set();

  function beginGroup(index,createdCount) {
    if (index !== nextGroupIndex || active !== null || !Number.isSafeInteger(createdCount)
      || createdCount !== identities.size) fail("GUIDE_HARNESS_GROUP_BOUNDARY_INVALID");
    const group=groups[index];
    active={
      index,id:group.id,transition:guideGroupTransition(groups,index),createdBefore:createdCount,
      firstResponsePending:true,identityHash:null
    };
    return Object.freeze({ ...active });
  }

  function observeCreatedSession(sessionId) {
    if (active === null || !active.firstResponsePending || typeof sessionId !== "string"
      || sessionId.length === 0) fail("GUIDE_HARNESS_SESSION_IDENTITY_INVALID");
    const identityHash=createHash("sha256").update(sessionId).digest("hex");
    if (identities.has(identityHash)) fail("GUIDE_HARNESS_SESSION_IDENTITY_REUSED");
    identities.add(identityHash);
    active.identityHash=identityHash;
    return identityHash;
  }

  function confirmFirstResponse(createdCount) {
    if (active === null || !active.firstResponsePending
      || createdCount !== active.createdBefore+1 || identities.size !== createdCount
      || active.identityHash === null) fail("GUIDE_HARNESS_GROUP_SESSION_CREATE_INVALID");
    active.firstResponsePending=false;
    return Object.freeze({
      groupIndex:active.index,groupId:active.id,transition:active.transition,
      createdBefore:active.createdBefore,createdAfter:createdCount,
      sessionIdentitySha256:active.identityHash
    });
  }

  function confirmContinuation(createdCount) {
    if (active === null || active.firstResponsePending
      || createdCount !== active.createdBefore+1 || identities.size !== createdCount) {
      fail("GUIDE_HARNESS_GROUP_SESSION_PERSISTENCE_INVALID");
    }
    return true;
  }

  function endGroup(createdCount) {
    confirmContinuation(createdCount);
    nextGroupIndex+=1;
    active=null;
    return true;
  }

  function complete(createdCount) {
    if (active !== null || nextGroupIndex !== groups.length
      || createdCount !== groups.length || identities.size !== groups.length) {
      fail("GUIDE_HARNESS_GROUP_LIFECYCLE_INCOMPLETE");
    }
    return true;
  }

  return Object.freeze({
    beginGroup,observeCreatedSession,confirmFirstResponse,confirmContinuation,endGroup,complete,
    distinctSessionCount:() => identities.size
  });
}

export async function resetGuideStoredConversation(storage) {
  if (storage === null || typeof storage !== "object"
    || typeof storage.removeItem !== "function" || typeof storage.getItem !== "function") {
    fail("GUIDE_HARNESS_STORAGE_ADAPTER_INVALID");
  }
  await storage.removeItem(GUIDE_SESSION_STORAGE_KEY);
  if (await storage.getItem(GUIDE_SESSION_STORAGE_KEY) !== null) {
    fail("GUIDE_HARNESS_STORAGE_RESET_FAILED");
  }
  return true;
}

export function simulateSameOriginGroupBoundary({ transition,persistedSessionId }) {
  if (typeof persistedSessionId !== "string" || persistedSessionId.length === 0) {
    fail("GUIDE_HARNESS_PERSISTENCE_FIXTURE_INVALID");
  }
  const storage=new Map([[GUIDE_SESSION_STORAGE_KEY,persistedSessionId]]);
  if (transition === "STORAGE_RESET_BEFORE_REMOUNT") storage.delete(GUIDE_SESSION_STORAGE_KEY);
  else if (transition !== "SAME_ORIGIN_NAVIGATION_ONLY") fail("GUIDE_HARNESS_PERSISTENCE_FIXTURE_INVALID");
  return Object.freeze({ restoredSessionId:storage.get(GUIDE_SESSION_STORAGE_KEY) ?? null });
}

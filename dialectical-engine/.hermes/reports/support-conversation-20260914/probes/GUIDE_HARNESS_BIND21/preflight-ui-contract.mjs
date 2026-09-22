import assert from "node:assert/strict";

export function validateGuideUiPreflightResult(value,revision) {
  assert.equal(value.revision,revision);
  assert.equal(value.completed,true);
  assert.equal(value.verdict,"PASS_ZERO_SUPPORT_UI_TRANSITIONS");
  assert.equal(value.transitions.length,5);
  assert.equal(value.traffic.actualSupportRequestsForwarded,0);
  assert.equal(value.traffic.guardedAttempts.createSession,0);
  assert.equal(value.traffic.guardedAttempts.sendMessage,0);
  assert.equal(value.traffic.guardedAttempts.otherSupport,0);
  assert.equal(value.privateControls.length,5);
  assert.equal(value.privateControls.every(item=>item.passed === true),true);
  return value;
}

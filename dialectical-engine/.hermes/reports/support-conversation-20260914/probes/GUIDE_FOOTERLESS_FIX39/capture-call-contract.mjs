import assert from "node:assert/strict";

const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

export function expectedLayoutFromValidatedProjection({ api,visible }) {
  assert.ok(api!==null&&typeof api==="object","GUIDE_CAPTURE_VALIDATED_API_MISSING");
  assert.ok(visible!==null&&typeof visible==="object","GUIDE_CAPTURE_VALIDATED_VISIBLE_MISSING");
  assert.ok(Array.isArray(api.sources)&&Array.isArray(api.actions),"GUIDE_CAPTURE_VALIDATED_API_LAYOUT_INVALID");
  assert.ok(Array.isArray(visible.sources)&&Array.isArray(visible.actions),"GUIDE_CAPTURE_VALIDATED_VISIBLE_LAYOUT_INVALID");
  assert.equal(same(visible.sources,api.sources.map(({label})=>label)),true,"GUIDE_CAPTURE_VALIDATED_SOURCE_LAYOUT_MISMATCH");
  assert.equal(same(visible.actions,api.actions.map(({label,href})=>({label,href}))),true,"GUIDE_CAPTURE_VALIDATED_ACTION_LAYOUT_MISMATCH");
  return Object.freeze({ sourceIds:Object.freeze(api.sources.map(({id})=>id)),
    actionIds:Object.freeze(api.actions.map(({id})=>id)),footerExpected:api.sources.length>0||api.actions.length>0 });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPlanRoster } from './previewPlanRoster.ts';
const defaults=Object.freeze({free:Object.freeze(['gpt-5.6-luna','claude-sonnet-5']),premium:Object.freeze(['gpt-5.6-sol','claude-opus-5','grok-4.7-build'])});
test('absent public flag preserves production rosters by identity',()=>assert.equal(previewPlanRoster(undefined,defaults),defaults));
test('one exact GLM preview replaces Free only without mutating defaults',()=>{const result=previewPlanRoster('["zai-org/GLM-5.3-Flash"]',defaults);assert.deepEqual(result.free,['zai-org/GLM-5.3-Flash']);assert.equal(result.premium,defaults.premium);assert.deepEqual(defaults.free,['gpt-5.6-luna','claude-sonnet-5']);assert.ok(Object.isFrozen(result.free));});
test('malformed, empty, other, duplicate or multiple model flags fail closed',()=>{for(const value of ['', 'not-json','null','{}','[]','["other/model"]','["zai-org/GLM-5.3-Flash","zai-org/GLM-5.3-Flash"]','["zai-org/GLM-5.3-Flash","gpt-5.6-luna"]'])assert.throws(()=>previewPlanRoster(value,defaults),/PREVIEW_FREE_MODEL_ROSTER_BUILD_FLAG_INVALID/);});

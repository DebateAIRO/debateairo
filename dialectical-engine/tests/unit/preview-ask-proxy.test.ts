import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewAskProxyCeiling } from '../../apps/ui/lib/previewAskProxyCeiling.js';
import * as route from '../../apps/ui/app/api/[...path]/route.js';
const models='["zai-org/GLM-5.3-Flash"]';const origin='https://v3-preview.dezbatere.ro';
const env={base:process.env.DIALECTICAL_API_BASE,models:process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON};
beforeEach(()=>{process.env.DIALECTICAL_API_BASE='http://acceptance.local:8790';process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON=models;});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();if(env.base===undefined)delete process.env.DIALECTICAL_API_BASE;else process.env.DIALECTICAL_API_BASE=env.base;if(env.models===undefined)delete process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON;else process.env.NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON=env.models;});
// Widening origin/model/path/method or changing existing timeout classes breaks these fixtures.
describe('finite installed preview ask ceiling',()=>{
 it('admits only the sole preview ask target',()=>{expect(previewAskProxyCeiling({method:'POST',path:['v1','asks'],origin},models)).toBe(1260000);});
 it.each([{method:'GET',path:['v1','asks'],origin},{method:'POST',path:['v1','asks','extra'],origin},{method:'POST',path:['v1','answers'],origin},{method:'POST',path:['v1','asks'],origin:'https://dezbatere.ro'},{method:'POST',path:['v1','asks'],origin:null},{method:'POST',path:['v1','asks'],origin:origin+'/'}])('refuses widened target %j',input=>{expect(previewAskProxyCeiling(input,models)).toBeUndefined();});
 it.each([undefined,'bad','{}','[]','["other/model"]','["zai-org/GLM-5.3-Flash","other/model"]'])('refuses unapproved model configuration %s',value=>{expect(previewAskProxyCeiling({method:'POST',path:['v1','asks'],origin},value)).toBeUndefined();});
 it.each([{method:'POST',path:['v1','asks'],origin,want:1260000},{method:'POST',path:['v1','asks'],origin:'https://other.test',want:30000},{method:'POST',path:['v1','runs','synthetic','publish'],origin,want:85000},{method:'GET',path:['v1','runs','synthetic','events'],origin,want:null}])('preserves route timeout classes %j',async input=>{
  const timeout=vi.spyOn(AbortSignal,'timeout');vi.stubGlobal('fetch',async()=>new Response('{}',{headers:{'content-type':'application/json'}}));
  const request=new Request(origin+'/api/'+input.path.join('/'),{method:input.method,headers:{origin:input.origin},...(input.method==='POST'?{body:'{}'}:{})});
  const response=await (input.method==='POST'?route.POST:route.GET)(request,{params:Promise.resolve({path:input.path})});expect(response.status).toBe(200);if(input.want===null)expect(timeout).not.toHaveBeenCalled();else expect(timeout).toHaveBeenCalledWith(input.want);
 });
});

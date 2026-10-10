// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({push:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:mocks.push}),useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/components/AuthGate",()=>({AuthGate:({children}:{children:(token:string)=>unknown})=>children("fixture-token")}));
vi.mock("@/lib/api",()=>({createDebate:async()=>({id:"fixture"}),contractClient:{readSession:async()=>({model_scorecard_in_force:false}),readSensitiveDataConsent:async()=>({status:"given"})}}));
import homeCatalog from "../../apps/ui/messages/en/home.json" with {type:"json"};
import chromeCatalog from "../../apps/ui/messages/en/chrome.json" with {type:"json"};
import newDebateCatalog from "../../apps/ui/messages/en/newDebate.json" with {type:"json"};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();document.body.replaceChildren();});
it("the preview Free and Premium cards each render exactly GLM in the existing cards (Step 1)",async()=>{
 vi.stubEnv("NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON",'["zai-org/GLM-5.3-Flash"]');vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const {default:Page}=await import("../../apps/ui/app/new/NewDebatePageClient.js");
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(<Page catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog}/>);await Promise.resolve();});
 expect([...container.querySelectorAll("#planTier-free .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["zai-org/GLM-5.3-Flash"]);
 expect([...container.querySelectorAll("#planTier-premium .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["zai-org/GLM-5.3-Flash"]);
 expect(container.querySelector("#planTier-free")?.getAttribute("role")).toBe("radio");
 await act(async()=>root.unmount());
});
it("the reviewed two-roster flag shows two models on Free and four on Premium",async()=>{
 vi.stubEnv("NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON",'{"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash"]}');vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const {default:Page}=await import("../../apps/ui/app/new/NewDebatePageClient.js");
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(<Page catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog}/>);await Promise.resolve();});
 expect([...container.querySelectorAll("#planTier-free .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"]);
 expect([...container.querySelectorAll("#planTier-premium .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash"]);
 await act(async()=>root.unmount());
});
it("without the public preview flag both cards keep the contract's rosters",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const {default:Page}=await import("../../apps/ui/app/new/NewDebatePageClient.js");
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(<Page catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog}/>);await Promise.resolve();});
 expect([...container.querySelectorAll("#planTier-free .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["gpt-5.6-luna","claude-sonnet-5"]);
 expect([...container.querySelectorAll("#planTier-premium .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["gpt-5.6-sol","claude-opus-5","grok-4.7-build"]);
 await act(async()=>root.unmount());
});
// Owner ruling 2026-10-10: the private preview offers depth 1 to 3 for now (deeper debates do not fit its daily
// money); Free stays fixed at depth 2; a build without the preview flag keeps the contract's 1 to 5.
async function depthSlider(flag: string | undefined) {
 if(flag!==undefined)vi.stubEnv("NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON",flag);vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const {default:Page}=await import("../../apps/ui/app/new/NewDebatePageClient.js");
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(<Page catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog}/>);await Promise.resolve();});
 const slider=()=>container.querySelector<HTMLInputElement>("#treeDepth")!;
 return {container,root,slider};
}
it("on the preview the depth slider stops at 3, and Free stays fixed at 2",async()=>{
 const {container,root,slider}=await depthSlider('{"free":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash"],"premium":["zai-org/GLM-5.3-Flash","deepseek-ai/DeepSeek-V4.1-Flash","XiaomiMiMo/MiMo-V2.6-Pro","Qwen/Qwen3.8-Flash"]}');
 expect([slider().min,slider().max,slider().value,slider().disabled]).toEqual(["1","3","2",true]);
 await act(async()=>{container.querySelector<HTMLElement>("#planTier-premium")!.click();await Promise.resolve();});
 expect([slider().max,slider().disabled]).toEqual(["3",false]);
 await act(async()=>root.unmount());
});
it("the legacy one-model preview flag also stops the depth slider at 3",async()=>{
 const {root,slider}=await depthSlider('["zai-org/GLM-5.3-Flash"]');
 expect(slider().max).toBe("3");
 await act(async()=>root.unmount());
});
it("without the preview flag (a hosted build) the depth slider keeps 1 to 5",async()=>{
 const {root,slider}=await depthSlider(undefined);
 expect([slider().min,slider().max]).toEqual(["1","5"]);
 await act(async()=>root.unmount());
});

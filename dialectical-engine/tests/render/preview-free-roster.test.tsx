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
it("without the public preview flag both cards keep the contract's rosters",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const {default:Page}=await import("../../apps/ui/app/new/NewDebatePageClient.js");
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 await act(async()=>{root.render(<Page catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog}/>);await Promise.resolve();});
 expect([...container.querySelectorAll("#planTier-free .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["gpt-5.6-luna","claude-sonnet-5"]);
 expect([...container.querySelectorAll("#planTier-premium .ndTierModel")].map(el=>el.textContent?.trim())).toEqual(["gpt-5.6-sol","claude-opus-5","grok-4.7-build"]);
 await act(async()=>root.unmount());
});

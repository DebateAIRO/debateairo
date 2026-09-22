import assert from "node:assert/strict";
import { mkdir,rm,writeFile } from "node:fs/promises";
import { chromium } from "/Users/vladmihaimiron/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import { emptyConsoleErrorCounts } from "../LIVE_P3/console-classifier.mjs";
import { openGuideSupportSurface } from "../GUIDE_CONTINUATION_BIND40/controls.mjs";
import { runGuideCaptureOpenMode } from "./capture-open-mode.mjs";

const ROOT="/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914";
const BASE="https://localhost:3100";
const EXECUTABLE="/Users/vladmihaimiron/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const OUTPUT=`${ROOT}/evidence/GUIDE_CAPTURE_ACTIVATION_FIX47-ui-control.json`;
const PROFILE=`${ROOT}/probes/GUIDE_CAPTURE_ACTIVATION_FIX47/ui-control-profile`;
const result={schemaVersion:1,node:"GUIDE_CAPTURE_ACTIVATION_FIX47",cases:[],network:{support:0,status:0,auth:0,privateOrOtherApi:0,external:0,forwardedDynamic:0},actualSupportRequests:0};

async function runCase(name,ordering,preSettle=false){
  const caseProfile=`${PROFILE}-${name}`;
  await mkdir(caseProfile,{recursive:false,mode:0o700});
  let context;
  const entry={name,ordering,preSettle,stages:[],observations:[],failureCode:null,ready:false};
  try{
    context=await chromium.launchPersistentContext(caseProfile,{executablePath:EXECUTABLE,headless:true,viewport:{width:390,height:844}});
    const page=context.pages()[0]??await context.newPage();
    await page.route("**/*",async route=>{
      const request=route.request();const url=new URL(request.url());const same=url.origin===BASE;const path=url.pathname;
      if(same&&(request.method()==="GET"||request.method()==="HEAD")&&!path.startsWith("/api/")){await route.continue();return;}
      if(!same){result.network.external+=1;await route.abort("blockedbyclient");return;}
      if(path==="/api/v1/support/status")result.network.status+=1;
      else if(path.startsWith("/api/v1/support/"))result.network.support+=1;
      else if(path==="/api/v1/session")result.network.auth+=1;
      else result.network.privateOrOtherApi+=1;
      await route.abort("blockedbyclient");
    });
    async function hydrated(locator){
      await locator.waitFor({state:"visible",timeout:30_000});const element=await locator.elementHandle();
      assert.ok(element);await page.waitForFunction(node=>Object.getOwnPropertyNames(node).some(key=>key.startsWith("__reactProps$")&&typeof node[key]?.onClick==="function"),element,{timeout:30_000});
    }
    async function settle(){const bar=page.getByRole("region",{name:"Cookie consent"});if(await bar.isVisible()){const b=bar.getByRole("button",{name:"Essential only",exact:true});await hydrated(b);await b.click();await bar.waitFor({state:"hidden"});}}
    const toggle=page.locator("[data-support-widget-toggle]");const panel=page.locator("[data-support-widget-panel]");const root=page.locator(".supportAssistantCompact");const composer=page.locator('.supportAssistantCompact .supportComposer input[name="support-message"]');
    const visible=async locator=>await locator.count()===1&&(await locator.isVisible())?"VISIBLE":await locator.count()===0?"HIDDEN":"UNKNOWN";
    const observe=async(phase,hydrationReady)=>({surface:"compact",language:"en",phase,hydrationReady,toggleCount:await toggle.count(),toggleVisible:await visible(toggle),widgetState:["collapsed","expanded","closing"].includes(await page.locator(".supportWidget").getAttribute("data-widget-state"))?(await page.locator(".supportWidget").getAttribute("data-widget-state")).toUpperCase():"UNKNOWN",ariaExpanded:(await toggle.getAttribute("aria-expanded"))==="true"?"TRUE":(await toggle.getAttribute("aria-expanded"))==="false"?"FALSE":"UNKNOWN",panelCount:await panel.count(),panelVisible:await visible(panel),compactRootCount:await root.count(),compactRootVisible:await visible(root),composerCount:await composer.count(),composerVisible:await visible(composer),urlClass:new URL(page.url()).pathname==="/"?"BASE":"OTHER",cookieRegionVisible:await visible(page.getByRole("region",{name:"Cookie consent"})),consoleErrorCategories:emptyConsoleErrorCounts(),fullReadiness:null});
    await runGuideCaptureOpenMode({mode:"compact",language:"en",ordering,openGuideSupportSurface,
      navigate:async()=>{await page.setViewportSize({width:390,height:844});await page.goto(BASE,{waitUntil:"domcontentloaded"});},
      waitForHydration:async()=>{await hydrated(toggle);if(preSettle)await settle();},observe,activateCompact:()=>toggle.click({timeout:5_000}),
      waitForReady:()=>composer.waitFor({state:"visible",timeout:5_000}),settleCookieConsent:settle,
      selectLanguage:async()=>{},recordStage:async(stage,state)=>entry.stages.push({stage,state}),
      checkpoint:async(observation,code)=>{entry.observations.push(observation);if(code!==null)entry.failureCode=code;}});
    entry.ready=await composer.isVisible()&&(await toggle.getAttribute("aria-expanded"))==="true";
  }catch(error){entry.failureCode=error instanceof Error?error.message:"UNKNOWN";}
  finally{if(context)await context.close();await rm(caseProfile,{recursive:true,force:true});result.cases.push(entry);}
}

await runCase("legacy-visible-cookie","LEGACY_COOKIE_AFTER_READY",false);
await runCase("corrected-visible-cookie","COOKIE_BEFORE_COMPACT_ACTIVATION",false);
await runCase("corrected-already-settled","COOKIE_BEFORE_COMPACT_ACTIVATION",true);
assert.equal(result.cases[0].failureCode,"GUIDE_HARNESS_COMPACT_STATE_TRANSITION_ABSENT");
assert.equal(result.cases[0].ready,false);
assert.equal(result.cases[1].failureCode,null);assert.equal(result.cases[1].ready,true);
assert.equal(result.cases[2].failureCode,null);assert.equal(result.cases[2].ready,true);
assert.equal(result.actualSupportRequests,0);assert.equal(result.network.forwardedDynamic,0);
await writeFile(OUTPUT,`${JSON.stringify(result,null,2)}\n`,{flag:"wx",mode:0o600});
process.stdout.write(`${JSON.stringify({result:"PASS",cases:result.cases.length,actualSupportRequests:0,forwardedDynamic:0})}\n`);

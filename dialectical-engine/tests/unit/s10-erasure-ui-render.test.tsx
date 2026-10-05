// @vitest-environment jsdom
import { JSDOM } from "jsdom";
import { act,useState } from "react";
import { createRoot,type Root } from "react-dom/client";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { PublicationControl as AppPublicationControl } from "../../apps/ui/components/PublicationControl.js";
import { AccountErasureControls as AppAccountErasureControls } from "../../apps/ui/components/AccountErasureControls.js";

const RUN_ID="11111111-1111-4111-8111-111111111111";
const CANCELLATION_REF="55555555-5555-4555-8555-555555555555";
const PRIVATE_SENTINEL="S10_PRIVATE_PAGE_PLAINTEXT_78241";

let dom:JSDOM;
let root:Root|null=null;

beforeEach(()=>{
  dom={window} as unknown as JSDOM;
  document.body.innerHTML="<div id='root'></div>";
  window.history.replaceState({},"","/debate/"+RUN_ID);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
});

afterEach(async ()=>{
  if (root!==null) await act(async ()=>{ root?.unmount(); });
  root=null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function button(label:string):HTMLButtonElement {
  const match=[...document.querySelectorAll("button")].find((candidate)=>
    candidate.textContent?.includes(label)
  );
  if (!(match instanceof dom.window.HTMLButtonElement)) throw new Error(`BUTTON_NOT_FOUND:${label}`);
  return match;
}

async function flush():Promise<void> {
  await act(async ()=>{ await Promise.resolve(); });
}

async function confirmCurrentSecurityAction():Promise<void> {
  await flush();await act(async()=>button("Password").click());await flush();
  const password=document.querySelector<HTMLInputElement>('[name="security-password"]')!,code=document.querySelector<HTMLInputElement>('[name="security-code"]')!;
  await act(async()=>{password.value="correct horse battery staple";code.value="123456";password.form!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));});
  await flush();
}

describe("S10 rendered erasure boundaries",()=>{
  for (const [name,Control] of [
    ["apps/ui",AppPublicationControl]
  ] as const) {
    for (const outcome of ["PENDING","CLEANED"] as const) {
      it(`${name} purges every mounted private plaintext view on ${outcome}`,async ()=>{
        const client={
          authMethods:vi.fn(async()=>({methods:[],recovery_codes_remaining:0,available_step_up_methods:['password_totp' as const],step_up_providers:[]})),
          readRunVisibility:vi.fn(async ()=>({ state:"PRIVATE" as const,public_ref:null })),
          stepUp:vi.fn(async ()=>({
            status:"step_up_complete" as const,csrf_token:"c".repeat(43),
            step_up_grant:{ token:"g".repeat(43),action:"DELETE_PRIVATE_DEBATE" as const,
              target_run_id:RUN_ID,expires_at:new Date(Date.now()+300000).toISOString() }
          })),
          publishRun:vi.fn(),unpublishRun:vi.fn(),
          deletePrivateDebate:vi.fn(async ()=>({ status:outcome }))
        };
        function Page(){
          const [deleted,setDeleted]=useState<"PENDING"|"CLEANED"|null>(null);
          return deleted===null ? <main><p>{PRIVATE_SENTINEL}</p><Control
            runId={RUN_ID} client={client} onPrivateDeletion={setDeleted}
          /></main> : <main><p role="status">{deleted}</p></main>;
        }
        root=createRoot(document.getElementById("root")!);
        await act(async ()=>{ root!.render(<Page />); });
        await flush();
        await act(async ()=>{ button("Delete private debate").click(); });
        const checkbox=document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        await act(async ()=>{ checkbox.click(); });
        const form=button("Permanently delete private debate").closest("form")!;
        await act(async ()=>{ form.dispatchEvent(new dom.window.Event(
          "submit",{ bubbles:true,cancelable:true }
        )); });
        await confirmCurrentSecurityAction();
        expect(client.stepUp).toHaveBeenCalledWith("correct horse battery staple","123456",{action:"DELETE_PRIVATE_DEBATE",target_run_id:RUN_ID});
        expect(client.deletePrivateDebate).toHaveBeenCalledWith(RUN_ID,"g".repeat(43));
        expect(document.body.textContent).not.toContain(PRIVATE_SENTINEL);
        expect(document.querySelector('[role="status"]')?.textContent).toBe(outcome);
      });
    }

    it(`${name} retains the mounted plaintext when deletion fails`,async ()=>{
      const client={
        authMethods:vi.fn(async()=>({methods:[],recovery_codes_remaining:0,available_step_up_methods:['password_totp' as const],step_up_providers:[]})),
        readRunVisibility:vi.fn(async ()=>({ state:"PRIVATE" as const,public_ref:null })),
        stepUp:vi.fn(async ()=>({
          status:"step_up_complete" as const,csrf_token:"c".repeat(43),
          step_up_grant:{ token:"g".repeat(43),action:"DELETE_PRIVATE_DEBATE" as const,
            target_run_id:RUN_ID,expires_at:new Date(Date.now()+300000).toISOString() }
        })),
        publishRun:vi.fn(),unpublishRun:vi.fn(),
        deletePrivateDebate:vi.fn(async ()=>{ throw new Error("DENIED"); })
      };
      function Page(){
        const [deleted,setDeleted]=useState<"PENDING"|"CLEANED"|null>(null);
        return deleted===null ? <main><p>{PRIVATE_SENTINEL}</p><Control
          runId={RUN_ID} client={client} onPrivateDeletion={setDeleted}
        /></main> : <main><p role="status">{deleted}</p></main>;
      }
      root=createRoot(document.getElementById("root")!);
      await act(async ()=>{ root!.render(<Page />); });
      await flush();
      await act(async ()=>{ button("Delete private debate").click(); });
      await act(async ()=>{ document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
      const form=button("Permanently delete private debate").closest("form")!;
      await act(async ()=>{ form.dispatchEvent(new dom.window.Event(
        "submit",{ bubbles:true,cancelable:true }
      )); });
      await confirmCurrentSecurityAction();
      expect(client.deletePrivateDebate).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain(PRIVATE_SENTINEL);
      expect(document.body.textContent).toContain("not authorized");
    });
  }

  for (const [name,Control] of [
    ["apps/ui",AppAccountErasureControls]
  ] as const) {
    it(`${name} polls a scheduled request into irreversible PROCESSING`,async ()=>{
      vi.useFakeTimers();
      const readAccountErasure=vi.fn()
        .mockResolvedValueOnce({
          status:"SCHEDULED",execute_at:"2026-08-31T00:00:00.000Z",
          cancellation_ref:CANCELLATION_REF
        })
        .mockResolvedValue({
          status:"PROCESSING",execute_at:"2026-08-31T00:00:00.000Z",
          cancellation_ref:CANCELLATION_REF
        });
      const client={
        readAccountErasure,
        stepUp:vi.fn(),scheduleAccountErasure:vi.fn(),cancelAccountErasure:vi.fn()
      };
      root=createRoot(document.getElementById("root")!);
      await act(async ()=>{ root!.render(<Control client={client} />); });
      await flush();
      expect(document.body.textContent).toContain("Cancel account deletion");
      await act(async ()=>{ await vi.advanceTimersByTimeAsync(5_000); });
      expect(document.body.textContent).toContain("Irreversible deletion is processing");
      expect(document.body.textContent).not.toContain("Cancel account deletion");
      expect(document.body.textContent).not.toContain("Schedule account deletion");
    });
  }
});

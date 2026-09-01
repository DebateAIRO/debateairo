import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createBrowserContractClient as createAppClient,
  createSameOriginFetch as createAppFetch
} from "../../apps/ui/lib/api.js";

function uiSource(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../apps/ui/${relativePath}`, import.meta.url)),
    "utf8"
  );
}

describe("S10 self-service erasure UI", () => {
  it("keeps credentials and destructive grants on the same-origin proxy in both clients", async () => {
    for (const createClient of [createAppClient]) {
      for (const base of [
        "/\\attacker.example","//attacker.example","/api/../escape",
        "/api/%2e%2e/escape","/api/%5c%5cattacker.example","/api/%2f%2fattacker.example"
      ]) {
        let called=false;
        const fetchSpy=(async ()=>{ called=true; return new Response(); }) as typeof fetch;
        expect(()=>createClient(fetchSpy,base)).toThrow(
          /NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH/
        );
        expect(called).toBe(false);
      }
      const calls:Array<{ input:string;init:RequestInit|undefined }>=[];
      const fetchSpy=(async (input:URL|RequestInfo,init?:RequestInit)=>{
        calls.push({ input:String(input),init });
        return new Response(JSON.stringify({
          status:"step_up_complete",csrf_token:"c".repeat(43),
          step_up_grant:{ token:"g".repeat(43),action:"DELETE_ACCOUNT",
            expires_at:"2026-08-24T22:00:00.000Z" }
        }),{ status:200,headers:{ "content-type":"application/json" } });
      }) as typeof fetch;
      await createClient(fetchSpy,"/api").stepUp("private-password","123456",{
        action:"DELETE_ACCOUNT"
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.input).toBe("/api/v1/auth/step-up");
      expect(calls[0]?.init?.credentials).toBe("same-origin");
      expect(String(calls[0]?.init?.body)).toContain("private-password");
    }
    for (const createFetch of [createAppFetch]) {
      await expect(createFetch("/api",fetch)(new Request(
        "http://localhost/v1/auth/step-up",{ method:"POST",body:"secret" }
      ))).rejects.toThrow(/PROXY_FETCH_REQUEST_INPUT_UNSUPPORTED/);
    }
  });

  it("requires an exact account-deletion confirmation and targetless DELETE_ACCOUNT step-up", () => {
    for (const [control, settings] of [
      [uiSource("components/AccountErasureControls.tsx"), uiSource("app/settings/page.tsx")]
    ]) {
      expect(settings).toContain("<AccountErasureControls");
      expect(control).toContain('const CONFIRMATION = "DELETE MY ACCOUNT"');
      expect(control).toContain('action: "DELETE_ACCOUNT"');
      expect(control).not.toContain("target_run_id");
      expect(control).toContain("scheduleAccountErasure(grant.token)");
      expect(control).toContain("readAccountErasure()");
      expect(control).toContain("cancelAccountErasure(current.cancellation_ref)");
      expect(control).toContain("seven full days");
      expect(control).toContain("ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED");
      expect(control).toContain("email or recovery email");
      expect(control).toContain('scheduled.status === "PROCESSING"');
      expect(control).toContain("Irreversible deletion is processing");
      expect(control).not.toMatch(/admin|operator|DSAR/i);
    }
  });

  it("offers deletion only for a private debate with an exact run-targeted grant", () => {
    const surfaces = [
      [uiSource("components/PublicationControl.tsx"), uiSource("app/debate/[id]/DebatePageClient.tsx"),
        "onPrivateDeletion={purgePrivateDebate}"]
    ] as const;
    for (const [control, debate, renderSite] of surfaces) {
      expect(debate).toContain(renderSite);
      expect(control).toContain('visibility?.state === "PRIVATE"');
      expect(control).toContain('action: "DELETE_PRIVATE_DEBATE"');
      expect(control).toContain("target_run_id: runId");
      expect(control).toContain("deletePrivateDebate(runId, grant.token)");
      expect(control).toContain("permanently unreadable");
      expect(control).toContain('status === "CLEANED"');
      expect(debate).toContain('privateDeletionStatus!==null');
      expect(debate).toContain("Private content is no longer available");
      expect(control).toContain("LEGACY_CONTENT_RETAINED");
      expect(control).toContain("DEBATE_MUST_BE_PRIVATE");
    }
  });
});

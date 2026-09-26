import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function englishCatalog(namespace: string): Readonly<Record<string, string>> {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `apps/ui/messages/en/${namespace}.json`), "utf8")
  ) as Readonly<Record<string, string>>;
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
    const settingsEnglish = englishCatalog("settings");
    for (const [control, settings] of [
      [uiSource("components/AccountErasureControls.tsx"), uiSource("components/SettingsPageClient.tsx")]
    ]) {
      expect(settings).toContain("<AccountErasureControls");
      // V 2026-09-26 ("Translate it"): the typed phrase comes from the reader's
      // catalogue; English stays exact and byte-identical, and the API wire
      // literal is untouched (the contract client sends it).
      expect(control).toContain('t(catalog, "settings.erasure.confirmationPhrase")');
      expect(control).toContain('if (locale === "en") return typed === phrase;');
      expect(settingsEnglish["settings.erasure.confirmationPhrase"]).toBe("DELETE MY ACCOUNT");
      expect(control).toContain('action: "DELETE_ACCOUNT"');
      expect(control).not.toContain("target_run_id");
      expect(control).toContain("scheduleAccountErasure(grant.token)");
      expect(control).toContain("readAccountErasure()");
      expect(control).toContain("cancelAccountErasure(current.cancellation_ref)");
      expect(control).toContain('t(catalog, "settings.erasure.hint")');
      expect(settingsEnglish["settings.erasure.hint"]).toBe(
        "Deletion begins after seven full days. You can cancel before it begins. Schedule, cancellation, " +
        "and completion notices are sent to every bound email or recovery email; at least one verified " +
        "channel is required."
      );
      expect(control).toContain("ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED");
      expect(control).toContain('t(catalog, "settings.erasure.notificationChannelRequired")');
      expect(settingsEnglish["settings.erasure.notificationChannelRequired"]).toBe(
        "Add and verify an email or recovery email before scheduling deletion."
      );
      expect(control).toContain('scheduled.status === "PROCESSING"');
      expect(control).toContain('t(catalog, "settings.erasure.processing")');
      expect(settingsEnglish["settings.erasure.processing"]).toBe(
        "Irreversible deletion is processing. Scheduling and cancellation are no longer available."
      );
      expect(control).not.toMatch(/admin|operator|DSAR/i);
    }
  });

  it("offers deletion only for a private debate with an exact run-targeted grant", () => {
    const publicEnglish = englishCatalog("public");
    const debateChromeEnglish = englishCatalog("debateChrome");
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
      expect(control).toContain('t(catalog, "public.publication.deleteExplanation")');
      expect(publicEnglish["public.publication.deleteExplanation"]).toBe(
        "Deleting destroys the private content keys and makes encrypted debate content permanently unreadable. " +
        "This cannot be undone. Claimed legacy plaintext is retained and will not be reported as cleaned."
      );
      expect(control).toContain('status === "CLEANED"');
      expect(debate).toContain('privateDeletionStatus!==null');
      expect(debate).toContain(
        't(debateChromeCatalog, "debateChrome.privateDebateDeletionProcessingDetail")'
      );
      expect(debateChromeEnglish["debateChrome.privateDebateDeletionProcessingDetail"]).toBe(
        "Private content is no longer available while durable key cleanup finishes."
      );
      expect(control).toContain("LEGACY_CONTENT_RETAINED");
      expect(control).toContain("DEBATE_MUST_BE_PRIVATE");
    }
  });
});

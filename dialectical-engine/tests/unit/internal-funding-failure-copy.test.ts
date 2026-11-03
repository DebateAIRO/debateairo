import { expect,it } from "vitest";
import * as copy from "../../apps/ui/lib/billing/fundingFailure.js";
import english from "../../apps/ui/messages/en/debateChrome.json" with {type:"json"};
import romanian from "../../apps/ui/messages/ro/debateChrome.json" with {type:"json"};
it("gives ended internal funding a plain user-facing reason and leaves ordinary failures to their existing renderer",()=>{
 const message=(copy as unknown as {fundingFailureMessage(reason:string|null,catalog:Record<string,string>):string|null}).fundingFailureMessage;
 expect(message("RUN_SETUP_FAILED:FUNDING_ENDED",english)).toBe("The quota the team gave you for this waiting debate has ended. Ask again to use your current quota.");
 expect(message("RUN_SETUP_FAILED:FUNDING_ENDED",romanian)).toContain("Finanțarea internă");
 expect(message("RUN_SETUP_FAILED:PLAN_CHANGED",english)).toBeNull();expect(message(null,english)).toBeNull();
});

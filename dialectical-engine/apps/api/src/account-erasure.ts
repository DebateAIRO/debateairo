import {
  decrypt,
  hashToken,
  type ReadableUserDekStore
} from "@debateai/crypto";
import {
  PostgresAccountErasureRepository,
  PrivateRunErasureCoordinator,
  type AccountErasureNotificationClaim,
  type AuthSourceContext
} from "@debateai/db";
import {
  isSingleDeliverableRecipient,
  MailDeliveryError,
  type SecurityNotificationSender
} from "./mail-channel.js";
import type { AuthenticatedSession } from "./sessions.js";

export type AccountErasureView = Readonly<{
  status:"NONE"|"SCHEDULED"|"DUE"|"PROCESSING";
  executeAt?:Date;
  cancellationRef?:string;
  deletePublicDebates?:boolean;
}>;

export interface AccountErasureApplication {
  schedule(input:Readonly<{
    authenticated:AuthenticatedSession;
    grantToken:string;
    deletePublicDebates?:boolean;
    source?:AuthSourceContext;
  }>):Promise<AccountErasureView|"NOTIFICATION_CHANNEL_REQUIRED"|null>;
  current(authenticated:AuthenticatedSession):Promise<AccountErasureView>;
  cancel(input:Readonly<{
    authenticated:AuthenticatedSession;cancellationRef:string;source?:AuthSourceContext;
  }>):Promise<boolean>;
  deletePrivateDebate(input:Readonly<{
    runId:string;
    authenticated:AuthenticatedSession;
    grantToken:string;
    source:Readonly<{ ip:string;userAgent:string;requestId:string }>;
  }>):Promise<"CLEANED"|"PENDING"|"PUBLISHED"|"LEGACY_RESIDUAL"|"NOT_FOUND">;
}

export class PostgresAccountErasureApplication implements AccountErasureApplication {
  constructor(
    private readonly repository:PostgresAccountErasureRepository,
    private readonly privateDebate:PrivateRunErasureCoordinator
  ) {}

  async schedule(input:Readonly<{
    authenticated:AuthenticatedSession;
    grantToken:string;
    deletePublicDebates?:boolean;
    source?:AuthSourceContext;
  }>):Promise<AccountErasureView|"NOTIFICATION_CHANNEL_REQUIRED"|null> {
    let scheduled:Awaited<ReturnType<PostgresAccountErasureRepository["schedule"]>>;
    try {
      scheduled=await this.repository.schedule({
        userId:input.authenticated.userId,
        ownerRef:input.authenticated.ownerRef,
        sessionId:input.authenticated.session.session_id,
        grantTokenHash:hashToken("step-up-grant", input.grantToken),
        deletePublicDebates:input.deletePublicDebates === true,
        ...(input.source === undefined ? {} : { source:input.source })
      });
    } catch (error) {
      if (error instanceof Error
        && error.message.includes("ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED")) {
        return "NOTIFICATION_CHANNEL_REQUIRED";
      }
      throw error;
    }
    return scheduled===null ? null : Object.freeze({
      status:scheduled.status,
      executeAt:scheduled.executeAt,
      cancellationRef:scheduled.cancellationRef,
      deletePublicDebates:scheduled.deletePublicDebates
    });
  }

  async current(authenticated:AuthenticatedSession):Promise<AccountErasureView> {
    const current=await this.repository.current({
      userId:authenticated.userId,
      ownerRef:authenticated.ownerRef,
      sessionId:authenticated.session.session_id
    });
    return current===null ? Object.freeze({ status:"NONE" }) : Object.freeze({
      status:current.status,executeAt:current.executeAt,
      cancellationRef:current.cancellationRef,
      deletePublicDebates:current.deletePublicDebates
    });
  }

  cancel(input:Readonly<{
    authenticated:AuthenticatedSession;cancellationRef:string;source?:AuthSourceContext;
  }>):Promise<boolean> {
    return this.repository.cancelCurrent({
      userId:input.authenticated.userId,
      ownerRef:input.authenticated.ownerRef,
      sessionId:input.authenticated.session.session_id,
      cancellationRef:input.cancellationRef,
      ...(input.source === undefined ? {} : { source:input.source })
    });
  }

  async deletePrivateDebate(input:Readonly<{
    runId:string;
    authenticated:AuthenticatedSession;
    grantToken:string;
    source:Readonly<{ ip:string;userAgent:string;requestId:string }>;
  }>):Promise<"CLEANED"|"PENDING"|"PUBLISHED"|"LEGACY_RESIDUAL"|"NOT_FOUND"> {
    const outcome=await this.privateDebate.execute({
      runId:input.runId,
      userId:input.authenticated.userId,
      ownerRef:input.authenticated.ownerRef,
      sessionId:input.authenticated.session.session_id,
      grantTokenHash:hashToken("step-up-grant", input.grantToken),
      source:input.source
    });
    if (outcome==="CLEANED" || outcome==="ERASED") return "CLEANED";
    if (outcome==="PREPARED" || outcome==="COMMITTED" || outcome==="CONTENDED") {
      return "PENDING";
    }
    if (outcome==="PUBLISHED") return "PUBLISHED";
    if (outcome==="LEGACY_PLAINTEXT_RETAINED") return "LEGACY_RESIDUAL";
    return "NOT_FOUND";
  }
}

export type AccountErasureNotificationOutcome =
  | "ACKNOWLEDGED" | "CONTENDED" | "FAILED" | "DEAD_LETTERED";
/** NV-02 (0131): why a notice was dead-lettered: its stored address is undeliverable, or it hit the attempt cap after PREPARE. */
export type AccountErasureNotificationDeadLetter = "recipient" | "attempt-cap";
type AccountErasureNotificationResult = Readonly<{
  outcome:AccountErasureNotificationOutcome;diagnosticStage?:AccountErasureNotificationDeadLetter;
}>;
/** NV-02: raised only by the reconciler's own pre-send address check; 0131's fail dead-letters it at once. */
const RECIPIENT_UNDELIVERABLE = "MAIL_RECIPIENT_UNDELIVERABLE";

export function createSingleFlightErasureReconciler(
  work:()=>Promise<void>,onFailure:()=>void
):()=>boolean {
  let inFlight=false;
  return ()=>{
    if (inFlight) return false;
    inFlight=true;
    void work().catch(()=>onFailure()).finally(()=>{ inFlight=false; });
    return true;
  };
}

function addressAad(claim:AccountErasureNotificationClaim) {
  const field=claim.channelType==="email"
    ? "user.email_ciphertext" : "user.recovery_email_ciphertext";
  return [
    "identity",field,claim.userId,"run:none",claim.userId,
    `user-dek:${claim.userId}`,"1"
  ] as const;
}

export class AccountErasureNotificationReconciler {
  constructor(
    private readonly repository:PostgresAccountErasureRepository,
    private readonly users:ReadableUserDekStore,
    private readonly sender:SecurityNotificationSender
  ) {}

  private async process(claim:AccountErasureNotificationClaim):Promise<
    AccountErasureNotificationResult
  > {
    return this.repository.withNotificationLease(claim.userId,async ():Promise<AccountErasureNotificationResult>=>{
    let dek:Buffer|undefined;
    let plaintext:Buffer|undefined;
    // NV-02: set only by the address check below, so a sender that threw the same code is retried, not dead-lettered.
    let recipientUndeliverable=false;
    try {
      dek=await this.users.load(claim.userId);
      plaintext=decrypt(dek,claim.addressCiphertext,addressAad(claim));
      const recipient=plaintext.toString("utf8");
      // NV-02 (0131): the stored address is fixed by its ciphertext, so one the shared rule refuses can never be sent;
      // it is refused here, before any send, and the fail dead-letters it at once.
      if (!/^[^\s@]+@[^\s@]+$/.test(recipient) || /[\r\n]/.test(recipient)
        || !isSingleDeliverableRecipient(recipient)) {
        recipientUndeliverable=true;
        throw new MailDeliveryError(RECIPIENT_UNDELIVERABLE);
      }
      // C11.4 (R-13): the mail is written in the language stored on the claimed row, never a profile or cookie.
      await this.sender.sendSecurityNotification({
        messageId:claim.messageId,
        recipient,
        eventKind:claim.eventKind,
        executeAt:claim.executeAt,
        display:{ locale:claim.mailLocale, timeZone:null }
      });
      return { outcome:await this.repository.acknowledgeNotification(
        claim.messageId,claim.claimToken
      ) ? "ACKNOWLEDGED" : "CONTENDED" };
    } catch (error) {
      const code=recipientUndeliverable ? RECIPIENT_UNDELIVERABLE
        : error instanceof MailDeliveryError && error.operatorCode!==RECIPIENT_UNDELIVERABLE
          ? error.operatorCode : "ERASURE_NOTIFICATION_SEND_FAILED";
      const failed=await this.repository.failNotification(claim.messageId,claim.claimToken,code);
      if (failed==="DEAD_LETTERED_RECIPIENT") return { outcome:"DEAD_LETTERED",diagnosticStage:"recipient" };
      if (failed==="DEAD_LETTERED_ATTEMPT_CAP") return { outcome:"DEAD_LETTERED",diagnosticStage:"attempt-cap" };
      return { outcome:failed };
    } finally {
      plaintext?.fill(0);
      dek?.fill(0);
    }
    });
  }

  async reconcile(limit=100):Promise<readonly Readonly<{
    messageId:string;
    outcome:AccountErasureNotificationOutcome;
    diagnosticStage?:AccountErasureNotificationDeadLetter;
  }>[]> {
    const outcomes:{
      messageId:string;outcome:AccountErasureNotificationOutcome;diagnosticStage?:AccountErasureNotificationDeadLetter;
    }[]=[];
    for (const claim of await this.repository.claimNotifications(limit)) {
      try {
        // diagnosticStage is present only on a dead letter.
        outcomes.push({ messageId:claim.messageId,...await this.process(claim) });
      } catch {
        // A poisoned item remains claimable after its bounded lease; later
        // rows in this batch still receive an independent attempt.
        outcomes.push({ messageId:claim.messageId,outcome:"FAILED" });
      }
    }
    return Object.freeze(outcomes.map((outcome)=>Object.freeze(outcome)));
  }
}

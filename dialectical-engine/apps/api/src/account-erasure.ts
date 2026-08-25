import {
  decrypt,
  hashVerificationToken,
  type ReadableUserDekStore
} from "@debateai/crypto";
import {
  PostgresAccountErasureRepository,
  PrivateRunErasureCoordinator,
  type AccountErasureNotificationClaim
} from "@debateai/db";
import {
  MailDeliveryError,
  type SecurityNotificationSender
} from "./mail-channel.js";
import type { AuthenticatedSession } from "./sessions.js";

export type AccountErasureView = Readonly<{
  status:"NONE"|"SCHEDULED"|"DUE"|"PROCESSING";
  executeAt?:Date;
  cancellationRef?:string;
}>;

export interface AccountErasureApplication {
  schedule(input:Readonly<{
    authenticated:AuthenticatedSession;
    grantToken:string;
  }>):Promise<AccountErasureView|"NOTIFICATION_CHANNEL_REQUIRED"|null>;
  current(authenticated:AuthenticatedSession):Promise<AccountErasureView>;
  cancel(input:Readonly<{
    authenticated:AuthenticatedSession;cancellationRef:string;
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
  }>):Promise<AccountErasureView|"NOTIFICATION_CHANNEL_REQUIRED"|null> {
    let scheduled:Awaited<ReturnType<PostgresAccountErasureRepository["schedule"]>>;
    try {
      scheduled=await this.repository.schedule({
        userId:input.authenticated.userId,
        ownerRef:input.authenticated.ownerRef,
        sessionId:input.authenticated.session.session_id,
        grantTokenHash:hashVerificationToken(input.grantToken)
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
      cancellationRef:scheduled.cancellationRef
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
      cancellationRef:current.cancellationRef
    });
  }

  cancel(input:Readonly<{
    authenticated:AuthenticatedSession;cancellationRef:string;
  }>):Promise<boolean> {
    return this.repository.cancelCurrent({
      userId:input.authenticated.userId,
      ownerRef:input.authenticated.ownerRef,
      sessionId:input.authenticated.session.session_id,
      cancellationRef:input.cancellationRef
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
      grantTokenHash:hashVerificationToken(input.grantToken),
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
  | "ACKNOWLEDGED" | "CONTENDED" | "FAILED";

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
    AccountErasureNotificationOutcome
  > {
    return this.repository.withNotificationLease(claim.userId,async ()=>{
    let dek:Buffer|undefined;
    let plaintext:Buffer|undefined;
    try {
      dek=await this.users.load(claim.userId);
      plaintext=decrypt(dek,claim.addressCiphertext,addressAad(claim));
      const recipient=plaintext.toString("utf8");
      if (!/^[^\s@]+@[^\s@]+$/.test(recipient) || /[\r\n]/.test(recipient)) {
        throw new MailDeliveryError("MAIL_INPUT_INVALID");
      }
      await this.sender.sendSecurityNotification({
        messageId:claim.messageId,
        recipient,
        eventKind:claim.eventKind,
        executeAt:claim.executeAt
      });
      return await this.repository.acknowledgeNotification(
        claim.messageId,claim.claimToken
      ) ? "ACKNOWLEDGED" : "CONTENDED";
    } catch (error) {
      const code=error instanceof MailDeliveryError
        ? error.operatorCode : "ERASURE_NOTIFICATION_SEND_FAILED";
      return await this.repository.failNotification(claim.messageId,claim.claimToken,code)
        ? "FAILED" : "CONTENDED";
    } finally {
      plaintext?.fill(0);
      dek?.fill(0);
    }
    });
  }

  async reconcile(limit=100):Promise<readonly Readonly<{
    messageId:string;
    outcome:AccountErasureNotificationOutcome;
  }>[]> {
    const outcomes:{ messageId:string;outcome:AccountErasureNotificationOutcome }[]=[];
    for (const claim of await this.repository.claimNotifications(limit)) {
      try {
        outcomes.push({ messageId:claim.messageId,outcome:await this.process(claim) });
      } catch {
        // A poisoned item remains claimable after its bounded lease; later
        // rows in this batch still receive an independent attempt.
        outcomes.push({ messageId:claim.messageId,outcome:"FAILED" });
      }
    }
    return Object.freeze(outcomes.map((outcome)=>Object.freeze(outcome)));
  }
}

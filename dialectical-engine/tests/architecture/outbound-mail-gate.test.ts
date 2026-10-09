import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript-classic";
import { describe, expect, it } from "vitest";
import {
  SendmailConsumerAccountSender,
  SendmailEmailChangeMailSender,
  SendmailMailSender,
  SendmailRecoveryEmailMailSender,
  SendmailSecurityNotificationSender,
  TemplatedMailSender
} from "../../apps/api/src/mail-channel.js";
import { SendmailPasswordResetSender } from "../../apps/api/src/password-reset-mail.js";
import { SendmailEmailRecoverySender } from "../../apps/api/src/email-mfa-mail.js";
import { testOutboundMailGate } from "../support/outboundMailGate.js";

// Open sign-up mail PR 3 (2026-10-09): no account mail reaches MAIL_SENDMAIL_PATH without the outbound mail gate,
// and no mail code writes an address to a log.

const API = "apps/api/src";
/** The account-mail senders' files. Every spawn in them must be preceded, in its own function, by the gate. */
const ACCOUNT_MAIL_SPAWNERS = ["apps/api/src/mail-channel.ts", "apps/api/src/password-reset-mail.ts", "apps/api/src/email-mfa-mail.ts"];
/** Staff alerts: their own root-owned recipient file and fixed recipient, deliberately outside the gate (design §3(c)). */
const EXCLUDED_SPAWNERS = ["apps/api/src/staff/alerts.ts"];

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|mts|mjs|js)$/.test(name) ? [relative(process.cwd(), path)] : [];
  });
}

/** Every `spawn(...)` call expression, found by the TypeScript parser (comments and strings cannot fool it). */
function spawnCallNodes(file: ts.SourceFile): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "spawn") found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The nearest enclosing function that is `async` (an arrow inside it, like a Promise executor, is not). */
function enclosingAsyncFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  for (let current = node.parent; current !== undefined; current = current.parent) {
    if (ts.isFunctionLike(current) && (ts.getCombinedModifierFlags(current as ts.Declaration) & ts.ModifierFlags.Async) !== 0) {
      return current as ts.FunctionLikeDeclaration;
    }
  }
  return undefined;
}

/** True when `scope` awaits authorizeOutboundMail(...) at a position before `before`. */
function awaitsGateBefore(scope: ts.Node, before: number): boolean {
  let gated = false;
  const visit = (node: ts.Node): void => {
    if (gated || node.getStart() >= before) return;
    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "authorizeOutboundMail") gated = true;
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return gated;
}

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function spawnCalls(source: string): number[] {
  return spawnCallNodes(parse(source)).map((call) => call.getStart());
}

/** Each spawn is gated when its enclosing async function awaits the gate before reaching it. */
export function ungatedSpawns(source: string): number[] {
  return spawnCallNodes(parse(source)).filter((call) => {
    const scope = enclosingAsyncFunction(call);
    return scope === undefined || !awaitsGateBefore(scope, call.getStart());
  }).map((call) => call.getStart());
}

/** Console calls whose interpolations or bare arguments name an address-carrying value. */
export function addressLoggingCalls(source: string): string[] {
  const calls = [...source.matchAll(/\bconsole\.(?:log|error|warn|info|debug|trace)\s*\(/g)];
  const offenders: string[] = [];
  for (const call of calls) {
    let depth = 0, end = call.index! + call[0].length - 1;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "(") depth += 1;
      else if (char === ")" && --depth === 0) break;
    }
    const text = source.slice(call.index!, end + 1);
    const interpolations = [...text.matchAll(/\$\{([^}]*)\}/g)].map((match) => match[1]!);
    const bare = text.replace(/`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
    // An address-carrying NAME anywhere in a path (mail.recipient, input.email, to), or a whole mail/message object.
    if ([...interpolations, bare].some((part) => /\b(?:recipient|recipients|email|emails|newEmail|address|addresses|to)\b/.test(part)
      || /\b(?:mail|message|input|request)\b(?!\s*\.)/.test(part))) {
      offenders.push(text);
    }
  }
  return offenders;
}

describe("every account mail passes the outbound mail gate before the sendmail spawn", () => {
  const files = sourceFiles(API);

  it("only the three account-mail files and the staff alerts can start a process at all", () => {
    const spawners = files.filter((file) => /(?:from\s*|import\s*\(\s*|require\(\s*)["'](?:node:)?child_process["']/.test(readFileSync(file, "utf8")));
    expect(spawners.sort()).toEqual([...ACCOUNT_MAIL_SPAWNERS, ...EXCLUDED_SPAWNERS].sort());
  });

  it.each(ACCOUNT_MAIL_SPAWNERS)("%s awaits authorizeOutboundMail before each spawn", (file) => {
    const source = readFileSync(file, "utf8");
    expect(spawnCalls(source).length).toBeGreaterThan(0);
    expect(ungatedSpawns(source)).toEqual([]);
  });

  it("the shared transport takes the purpose from every call site, and every sender is built with a gate", () => {
    const channel = readFileSync("apps/api/src/mail-channel.ts", "utf8");
    // Six call sites plus the definition; each call names a purpose (TypeScript makes the argument required).
    const calls = [...channel.matchAll(/\bsendRenderedMail\(/g)];
    expect(calls).toHaveLength(7);
    expect((channel.match(/!isOutboundMailAuthorizer\(options\.gate\)/g) ?? [])).toHaveLength(6);
    for (const file of ["apps/api/src/password-reset-mail.ts", "apps/api/src/email-mfa-mail.ts"]) {
      expect(readFileSync(file, "utf8")).toMatch(/!isOutboundMailAuthorizer\(options\.gate\)/);
    }
  });

  it("main.ts hands MAIL_SENDMAIL_PATH only to senders that carry the gate", () => {
    const main = readFileSync("apps/api/src/main.ts", "utf8");
    const constructions = [...main.matchAll(/new (?:Sendmail\w+|TemplatedMailSender)\(\{/g)].map((match) => {
      let depth = 0, end = match.index! + match[0].length - 1;
      for (; end < main.length; end += 1) {
        if (main[end] === "{") depth += 1;
        else if (main[end] === "}" && --depth === 0) break;
      }
      return main.slice(match.index!, end + 1);
    });
    expect(constructions).toHaveLength(8);
    for (const construction of constructions) {
      expect(construction).toMatch(/environment\.MAIL_SENDMAIL_PATH/);
      expect(construction).toMatch(/gate\s*:\s*outboundMailGate\b/);
    }
    expect(main.match(/environment\.MAIL_SENDMAIL_PATH/g) ?? []).toHaveLength(8);
  });

  it("a sender built without a gate refuses to exist", () => {
    const base = { executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 1000 };
    for (const Sender of [SendmailMailSender, SendmailEmailChangeMailSender, SendmailRecoveryEmailMailSender, SendmailConsumerAccountSender]) {
      expect(() => new Sender(base as never)).toThrow("OWN_MAIL_CONFIGURATION_INVALID");
      expect(() => new Sender({ ...base, gate: {} } as never)).toThrow("OWN_MAIL_CONFIGURATION_INVALID");
    }
    for (const Sender of [SendmailSecurityNotificationSender, TemplatedMailSender]) {
      expect(() => new Sender({ executable: base.executable, from: base.from, timeoutMs: 1000 } as never)).toThrow("OWN_MAIL_CONFIGURATION_INVALID");
    }
    expect(() => new SendmailPasswordResetSender(base as never)).toThrow("PASSWORD_RESET_MAIL_CONFIGURATION_INVALID");
    expect(() => new SendmailEmailRecoverySender(base as never)).toThrow("EMAIL_RECOVERY_MAIL_CONFIGURATION_INVALID");
    // Control: the same options WITH a gate construct, so the refusals above are about the gate alone.
    const gate = testOutboundMailGate();
    for (const Sender of [SendmailMailSender, SendmailEmailChangeMailSender, SendmailRecoveryEmailMailSender, SendmailConsumerAccountSender, SendmailPasswordResetSender, SendmailEmailRecoverySender]) {
      expect(() => new Sender({ ...base, gate })).not.toThrow();
    }
    for (const Sender of [SendmailSecurityNotificationSender, TemplatedMailSender]) {
      expect(() => new Sender({ executable: base.executable, from: base.from, timeoutMs: 1000, gate })).not.toThrow();
    }
  });

  it("the checks above can fail: an ungated spawn, a gate after the spawn and a gate in another method are all caught", () => {
    const inClass = (body: string) => `class S { ${body} }`;
    expect(ungatedSpawns(inClass("async send(mail) { const child = spawn(x, [\"-t\"]); }"))).toHaveLength(1);
    expect(ungatedSpawns(inClass("async send(mail) { const child = spawn(x, []); await authorizeOutboundMail(g, r, p); }"))).toHaveLength(1);
    expect(ungatedSpawns(inClass("async other() { await authorizeOutboundMail(g, r, p); }\nasync send(mail) { spawn(x, []); }"))).toHaveLength(1);
    expect(ungatedSpawns(inClass("send(mail) { spawn(x, []); }"))).toHaveLength(1);
    expect(ungatedSpawns(inClass("async send(mail) { // the spawn (in a comment)\n authorizeOutboundMail(g, r, p); spawn(x, []); }"))).toHaveLength(1);
    expect(ungatedSpawns(inClass("async send(mail) { await authorizeOutboundMail(g, r, p); await new Promise(() => { spawn(x, []); }); }"))).toEqual([]);
    expect(ungatedSpawns("async function send(mail) { await authorizeOutboundMail(g, r, p); spawn(x, []); }")).toEqual([]);
  });
});

describe("no mail code writes an address to a log", () => {
  const MAIL_CODE = [
    "mail-channel.ts", "mail-mime.ts", "mail-attachments.ts", "mail-domain-check.ts", "outbound-mail-gate.ts",
    "password-reset-mail.ts", "email-mfa-mail.ts", "password-reset.ts", "email-mfa-recovery.ts", "registration.ts",
    "email-change.ts", "recovery-email.ts", "consumer-recovery.ts", "consumer-security-notices.ts", "verification-email.ts"
  ].map((name) => `${API}/${name}`);

  it.each(MAIL_CODE)("%s logs codes only", (file) => {
    expect(addressLoggingCalls(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("the check can fail", () => {
    expect(addressLoggingCalls("console.error(`[X] to=${mail.recipient}`);")).toHaveLength(1);
    expect(addressLoggingCalls("console.log('sent', recipient);")).toHaveLength(1);
    expect(addressLoggingCalls("console.error(\"[X] code=FIXED\");")).toEqual([]);
  });
});

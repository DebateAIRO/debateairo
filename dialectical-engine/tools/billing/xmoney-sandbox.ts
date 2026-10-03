// tools/billing/xmoney-sandbox.ts
// X0 (paid plans): OWNER-RUN helper for xMoney's STAGE sandbox. Every subcommand reads the private key
// from a 0600 file and never prints it; outputs go to --capture-dir as RAW captures for
// scrub-xmoney-fixture.ts, each named `<fixture kind>-<stamp>.json`. Stage only: the base URLs below are fixed.
//   key-shape --key-file F [--capture-dir D]
//   customer  --key-file F --capture-dir D --site-id S --email E --country RO [--repeat --identifier I]
//   serve     --key-file F --public-key P --site-id S --email E --country RO --amount 1.00
//             --mode authAndCapture|auth --capture-dir D [--port 8780] [--locale en] [--identifier I]
//             [--permissions-policy production|none] [--referrer-policy production|strict-origin]
//   fetch     --key-file F --capture-dir D --what transaction|order|card|transaction-list
//             [--id N] [--customer C] [--as initial|second-payment|refund] [--date-type creation|refund|charge-back]
//             [--from ISO] [--to ISO] [--list-order]
//   rebill    --key-file F --capture-dir D --order O --customer C --amount 1.00
//             [--as renewal|auth-order|declined]
//   refund    --key-file F --capture-dir D --transaction T --order O --as partial|second-partial|full|extra
//             [--amount A] [--wait-seconds 600]
//   release   --key-file F --capture-dir D --transaction T
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STAGE_API = "https://api-stage.xmoney.com";
const STAGE_SDK = "https://secure-stage.xmoney.com";
const DAY_MS = 86_400_000;
/** How often X0 (g) asks the refund listing again while it waits for a refund row. */
const REFUND_POLL_MS = 30_000;
const RECORDING_MESSAGE = "DebateAI stage recording";

/**
 * Production's Permissions-Policy, copied from apps/ui/next.config.mjs:32. The recording page sends it by
 * default so the card form is measured under the policy /checkout will really have (spec §2.5.3: `payment=()`
 * stays unless the SDK needs the Payment Request API); `--permissions-policy none` is the comparison run.
 */
export const RECORDING_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

// Deliberately NOT imported from ./scrub-xmoney-fixture.ts: tools/orphan-audit/src/index.ts:698 refuses any
// import path containing "fixture" in tools/. Same rule as there: a 0600 file, one printable line.
function readXMoneyKeyFile(path: string): Buffer {
  const metadata = statSync(path);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new TypeError("XMONEY_KEY_FILE_MODE_UNSAFE");
  const text = readFileSync(path, "latin1");
  const line = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!/^[\x21-\x7e]+$/u.test(line)) throw new TypeError("XMONEY_KEY_FILE_INVALID");
  return Buffer.from(line, "latin1");
}

export function describeXMoneyKeyShape(key: Buffer): Readonly<{
  bytes: number; printableAscii: boolean; lowerHex: boolean; underscorePrefix: boolean; aes256KeyLength: boolean;
}> {
  const text = key.toString("latin1");
  return Object.freeze({
    bytes: key.byteLength,
    printableAscii: /^[\x21-\x7e]+$/u.test(text),
    lowerHex: /^[0-9a-f]+$/u.test(text),
    underscorePrefix: /^[a-z]{2,4}_/u.test(text),
    aes256KeyLength: key.byteLength === 32
  });
}

export function recordingContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "frame-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "img-src 'self'",
    "style-src 'self'",
    "report-uri /csp-report"
  ].join("; ");
}

/**
 * The page's headers: production's (apps/ui/next.config.mjs:31-32), except that the CSP only reports. Two switches
 * exist only for comparison runs: `permissionsPolicy: "none"` drops `payment=()` (does the form hide a wallet path
 * under it?), and `referrerPolicy: "strict-origin"` sends the page's origin as referrer where production sends none
 * (does the form check who embeds it?). `strict-origin` is the one other value P19 may give the card routes.
 */
export function recordingHeaders(
  nonce: string, permissionsPolicy: "production" | "none", referrerPolicy: "production" | "strict-origin" = "production"
): Readonly<Record<string, string>> {
  return Object.freeze({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy-report-only": recordingContentSecurityPolicy(nonce),
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": referrerPolicy === "production" ? "no-referrer" : "strict-origin",
    ...(permissionsPolicy === "production" ? { "permissions-policy": RECORDING_PERMISSIONS_POLICY } : {})
  });
}

/**
 * The embedded order, in the exact field order P3a's signOrderPayload signs — tests/unit/payments-xmoney-signing.test.ts
 * pins the two together, and the order-payload fixture pins what the stage form accepted.
 */
export function recordingOrder(i: Readonly<{
  publicKey: string; siteId: string; identifier: string; email: string; country: string; chargeId: string;
  amount: string; mode: "authAndCapture" | "auth"; description: string; backUrl: string;
}>): Record<string, unknown> {
  return {
    publicKey: i.publicKey,
    siteId: i.siteId,
    customer: { identifier: i.identifier, email: i.email, country: i.country },
    order: { orderId: i.chargeId, type: "managed", amount: i.amount, currency: "USD", description: i.description },
    cardTransactionMode: i.mode,
    saveCard: true,
    backUrl: i.backUrl
  };
}

export function signRecordingOrder(order: unknown, key: Buffer): Readonly<{ payload: string; checksum: string }> {
  const json = JSON.stringify(order);
  return {
    payload: Buffer.from(json, "utf8").toString("base64"),
    checksum: createHmac("sha512", key).update(json, "utf8").digest("base64")
  };
}

/**
 * X0's customer step: the form P3b's XMoneyClient.createCustomer posts to `POST /customer`, field for field
 * (identifier, email, siteId, then country when there is one) — tests/unit/payments-xmoney-signing.test.ts pins the
 * two together. Production creates the customer first, under billing.customer's UUID, and only then signs the order
 * naming that identifier; the recording does the same, so X0 shows which customer an embedded payment is made by.
 */
export function customerForm(i: Readonly<{
  identifier: string; email: string; siteId: string; country: string | null;
}>): URLSearchParams {
  const form = new URLSearchParams({ identifier: i.identifier, email: i.email, siteId: i.siteId });
  if (i.country !== null) form.set("country", i.country);
  return form;
}

/**
 * X0 item 9: whether the creation-date listing of the attempt's order lists the not-final attempt, and whether the
 * listed row carries a customerId. P2-I6's checkout filter matches a listed deposit by its customer, and
 * parseXMoneyTransaction rejects a row without one, so both must hold on a `3d-pending` row. Only yes/no is printed.
 */
export function inFlightListing(body: unknown, transactionId: string): Readonly<{ listed: boolean; customerId: boolean }> {
  const row = listed(body).find((entry) => String(entry.id) === transactionId);
  const customer = row?.customerId;
  return Object.freeze({
    listed: row !== undefined,
    customerId: (typeof customer === "number" || typeof customer === "string") && /^[0-9]+$/u.test(String(customer))
  });
}

function scriptValue(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/**
 * The card form, mounted with EXACTLY the call P19's XMoneyCardForm makes (`apps/ui/lib/billing/xmoneySdk.ts`, D7):
 * `paymentForm` with the container ELEMENT, xMoney's own button hidden (`displaySubmitButton: false`), our page button
 * calling the handle's `submit()`, and `destroy()` once the form is done — so the recording confirms every SDK name
 * P19 relies on (`paymentForm`, `container`, `options.{locale, displaySubmitButton, displaySaveCardOption}`,
 * `onReady`, `onError`, `onPaymentComplete`, `submit`, `destroy`). The page's last line names what the SDK handed back
 * (`submit=function destroy=function destroyed=ok` when every name is right); the sdk-result capture carries the same
 * `handle` shape beside xMoney's reply. The page is ONE template literal, so no line inside it may hold a raw backtick
 * (one would end the literal early and the file would stop parsing).
 */
export function recordingPage(i: Readonly<{
  nonce: string; sdkOrigin: string; publicKey: string; payload: string; checksum: string; locale: string;
}>): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>xMoney stage recording</title>
<script nonce="${i.nonce}" src="${i.sdkOrigin}/sdk/v2/xmoney.js"></script></head>
<body><div id="card"></div><button id="pay" type="button" disabled>Pay</button><pre id="out">loading…</pre>
<script nonce="${i.nonce}">
const out = document.getElementById("out");
const pay = document.getElementById("pay");
let form = null;
const shape = () => form === null || typeof form !== "object"
  ? { submit: "no-handle", destroy: "no-handle" }
  : { submit: typeof form.submit, destroy: typeof form.destroy };
const line = () => "submit=" + shape().submit + " destroy=" + shape().destroy;
const report = (kind, value) => fetch("/sdk-result", { method: "POST", body: JSON.stringify({ kind, value, handle: shape() }) });
form = window.XMoney.paymentForm({
  container: document.getElementById("card"),
  publicKey: ${scriptValue(i.publicKey)},
  orderPayload: ${scriptValue(i.payload)},
  orderChecksum: ${scriptValue(i.checksum)},
  options: { locale: ${scriptValue(i.locale)}, displaySubmitButton: false, displaySaveCardOption: false },
  // onReady may run inside paymentForm(), before form holds the handle, so it names nothing yet.
  onReady() { out.textContent = "ready: type a test card, then press Pay"; pay.disabled = false; },
  onError(error) { out.textContent = "error " + line(); pay.disabled = false; void report("error", error); },
  onPaymentComplete(transaction) {
    out.textContent = "complete " + line();
    void report("complete", transaction);
    // P19 destroys the form when the page leaves it; here, once the payment is done.
    setTimeout(() => {
      let destroyed = "ok";
      try { form.destroy(); } catch (error) { destroyed = "threw:" + String(error && error.name); }
      out.textContent = "complete " + line() + " destroyed=" + destroyed;
    }, 0);
  }
});
pay.addEventListener("click", () => {
  if (typeof form?.submit !== "function") { out.textContent = "NO submit() " + line(); return; }
  pay.disabled = true;
  form.submit();
});
</script></body></html>`;
}

function argument(argv: readonly string[], name: string, fallback?: string): string {
  const index = argv.indexOf(name);
  const value = index < 0 ? fallback : argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new TypeError(`XMONEY_ARGUMENT_REQUIRED:${name}`);
  return value;
}

/** The time format XMoneyClient sends (P3b), so the helper asks xMoney exactly what the client will. */
function stageIso(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/u, "+00:00");
}

/**
 * X0: what `fetch --what transaction-list --date-type <t>` records, by `t`, each a required fixture kind, and the window
 * it asks when no `--from`/`--to` is given. W13 (P2-I18): `charge-back` is the daily money check's dispute listing
 * (apps/api/src/billing/reconcile.ts), asked over the same window the check asks (the last 120 days, up to now), so
 * the recording shows whether xMoney accepts exactly that request.
 */
export function transactionListCapture(dateType: string): TransactionListCapture {
  const capture = Object.hasOwn(TRANSACTION_LIST_CAPTURES, dateType) ? TRANSACTION_LIST_CAPTURES[dateType] : undefined;
  if (capture === undefined) throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--date-type");
  return capture;
}

type TransactionListCapture = Readonly<{
  kind: "transaction-list" | "transaction-list-refund" | "transaction-list-charge-back";
  defaultWindow: (now: number) => Readonly<{ from: string; to: string }>;
}>;

const lastWeek = (now: number) => Object.freeze({ from: stageIso(now - 7 * DAY_MS), to: stageIso(now + DAY_MS) });
const TRANSACTION_LIST_CAPTURES: Readonly<Record<string, TransactionListCapture>> = Object.freeze({
  creation: Object.freeze({ kind: "transaction-list", defaultWindow: lastWeek }),
  refund: Object.freeze({ kind: "transaction-list-refund", defaultWindow: lastWeek }),
  "charge-back": Object.freeze({
    kind: "transaction-list-charge-back",
    defaultWindow: (now: number) => Object.freeze({ from: stageIso(now - 120 * DAY_MS), to: stageIso(now) })
  })
});

type StageReply = Readonly<{ httpStatus: number; body: unknown }>;

async function stageRequest(
  key: Buffer, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: URLSearchParams
): Promise<StageReply> {
  const response = await fetch(`${STAGE_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key.toString("latin1")}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" })
    },
    ...(body === undefined ? {} : { body: body.toString() })
  });
  const text = await response.text();
  try {
    return { httpStatus: response.status, body: JSON.parse(text) as unknown };
  } catch {
    // An empty or non-JSON reply (a refund may answer with nothing) is kept as its shape only.
    return {
      httpStatus: response.status,
      body: { debateaiNonJsonReply: { httpStatus: response.status, contentType: response.headers.get("content-type"), length: text.length } }
    };
  }
}

function capture(captureDir: string, kind: string, body: unknown): void {
  writeFileSync(join(captureDir, `${kind}-${Date.now()}.json`), JSON.stringify(body));
}

function dataOf(body: unknown): Record<string, unknown> | undefined {
  const data = typeof body === "object" && body !== null ? (body as { data?: unknown }).data : undefined;
  return typeof data === "object" && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
}

function listed(body: unknown): Array<Record<string, unknown>> {
  const data = typeof body === "object" && body !== null ? (body as { data?: unknown }).data : undefined;
  return Array.isArray(data)
    ? data.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    : [];
}

function relatedIds(entry: Record<string, unknown>): string[] {
  return Array.isArray(entry.relatedTransactionIds) ? entry.relatedTransactionIds.map(String) : [];
}

/**
 * X0 (g): the rows of a listing that belong to one payment without being it — each names the payment in
 * `relatedTransactionIds`. Whatever type xMoney gives them is recorded as it is; P3b's `refundsOf` then decides
 * which of them it counts, and its recorded test fails if xMoney's rows differ from the fake's.
 */
export function linkedRefundRows(body: unknown, payment: string): Array<Record<string, unknown>> {
  return listed(body).filter((entry) => String(entry.id) !== payment && relatedIds(entry).includes(payment));
}

/**
 * X0 (g): asks the `dateType=refund` listing of one order every 30 s until at least `count` rows are linked to the
 * payment, or `waitSeconds` pass. Returns the last listing, how many linked rows it held and after how long.
 */
async function waitForRefundRows(
  key: Buffer, orderId: string, payment: string, count: number, waitSeconds: number
): Promise<Readonly<{ body: unknown; rows: number; seconds: number; timedOut: boolean }>> {
  const started = Date.now();
  for (;;) {
    const query = new URLSearchParams({
      dateType: "refund", orderId,
      createdAtFrom: stageIso(started - DAY_MS), createdAtTo: stageIso(Date.now() + DAY_MS)
    });
    const reply = await stageRequest(key, "GET", `/transaction?${query.toString()}`);
    const rows = linkedRefundRows(reply.body, payment).length;
    const seconds = Math.round((Date.now() - started) / 1000);
    if (rows >= count || seconds >= waitSeconds) {
      return { body: reply.body, rows, seconds, timedOut: rows < count };
    }
    await new Promise<void>((done) => setTimeout(done, REFUND_POLL_MS));
  }
}

const statusOf = (body: unknown): string => String(dataOf(body)?.transactionStatus ?? "NONE");
const amountOf = (body: unknown): string => String(dataOf(body)?.amount ?? "NONE");

async function main(argv: readonly string[]): Promise<void> {
  const command = argv[0];
  const key = readXMoneyKeyFile(argument(argv, "--key-file"));
  try {
    if (command === "key-shape") {
      const shape = describeXMoneyKeyShape(key);
      console.log(JSON.stringify(shape));
      if (argv.includes("--capture-dir")) {
        writeFileSync(join(argument(argv, "--capture-dir"), "key-shape.json"), JSON.stringify(shape));
      }
      return;
    }
    const captureDir = argument(argv, "--capture-dir");
    if (command === "customer") {
      // W1 (P2-I1, P2-I6): the customer every recorded payment is made by, created the way production creates it.
      const repeat = argv.includes("--repeat");
      const identifier = repeat ? argument(argv, "--identifier") : randomUUID();
      const reply = await stageRequest(key, "POST", "/customer", customerForm({
        identifier, email: argument(argv, "--email"), siteId: argument(argv, "--site-id"), country: argument(argv, "--country")
      }));
      if (!repeat) {
        capture(captureDir, "customer-response", reply.body);
        console.log(`XMONEY_CUSTOMER=${reply.httpStatus}:identifier=${identifier}`);
        return;
      }
      // The same identifier posted again (what a checkout whose first reply was lost does), and the lookup by
      // identifier that createCustomer's adopt path makes after a refusal: the CREATED customer depends on both.
      const lookup = await stageRequest(key, "GET", `/customer?${new URLSearchParams({ identifier }).toString()}`);
      capture(captureDir, "customer-response-repeat", {
        httpStatus: reply.httpStatus, reply: reply.body, lookup: { httpStatus: lookup.httpStatus, reply: lookup.body }
      });
      console.log(`XMONEY_CUSTOMER=repeat:${reply.httpStatus}:lookup=${lookup.httpStatus}`);
      return;
    }
    if (command === "fetch") {
      const what = argument(argv, "--what");
      if (what === "transaction-list") {
        const dateType = argument(argv, "--date-type", "creation");
        const listing = transactionListCapture(dateType);
        const window = listing.defaultWindow(Date.now());
        const query = new URLSearchParams({
          dateType,
          createdAtFrom: argument(argv, "--from", window.from),
          createdAtTo: argument(argv, "--to", window.to)
        });
        if (argv.includes("--id")) query.set("orderId", argument(argv, "--id"));
        const reply = await stageRequest(key, "GET", `/transaction?${query.toString()}`);
        // Kept whatever xMoney answers: a refused charge-back listing is recorded as its error reply, which P3b's
        // recorded suite then fails on (W13), so the answer can never go unnoticed.
        capture(captureDir, listing.kind, reply.body);
        console.log(`XMONEY_FETCHED=transaction-list:${dateType}:${reply.httpStatus}`);
        return;
      }
      const id = encodeURIComponent(argument(argv, "--id"));
      if (what === "transaction") {
        const step = argument(argv, "--as", "initial");
        if (step !== "initial" && step !== "second-payment" && step !== "refund") throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--as");
        const reply = await stageRequest(key, "GET", `/transaction/${id}`);
        capture(captureDir, `transaction-${step}`, reply.body);
        console.log(`XMONEY_FETCHED=transaction-${step}:${reply.httpStatus}:${statusOf(reply.body)}`);
        if (argv.includes("--list-order")) {
          // Item 9's first in-flight read: the attempt's order listed the way P3b's listTransactions asks.
          const query = new URLSearchParams({
            dateType: "creation", orderId: String(dataOf(reply.body)?.orderId ?? ""),
            createdAtFrom: stageIso(Date.now() - DAY_MS), createdAtTo: stageIso(Date.now() + DAY_MS),
            page: "1", perPage: "100", reverseSorting: "0"
          });
          const list = await stageRequest(key, "GET", `/transaction?${query.toString()}`);
          const seen = inFlightListing(list.body, argument(argv, "--id"));
          console.log(`XMONEY_IN_FLIGHT_LISTED=${list.httpStatus}:listed=${seen.listed ? "yes" : "no"}`
            + `:customerId=${seen.customerId ? "yes" : "no"}`);
        }
        return;
      }
      const path = what === "order" ? `/order/${id}`
        : what === "card" ? `/card/${id}?customerId=${encodeURIComponent(argument(argv, "--customer"))}` : undefined;
      if (path === undefined) throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--what");
      const reply = await stageRequest(key, "GET", path);
      capture(captureDir, what, reply.body);
      console.log(`XMONEY_FETCHED=${what}:${reply.httpStatus}`);
      return;
    }
    if (command === "rebill") {
      const step = argument(argv, "--as", "renewal");
      if (step !== "renewal" && step !== "auth-order" && step !== "declined") {
        throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--as");
      }
      const order = encodeURIComponent(argument(argv, "--order"));
      const reply = await stageRequest(key, "PATCH", `/order-rebill/${order}`, new URLSearchParams({
        customerId: argument(argv, "--customer"), amount: argument(argv, "--amount")
      }));
      if (step === "renewal") capture(captureDir, "rebill-response", reply.body);
      // X0 (i): a decline is read from the HTTP status as much as from the body, so both are kept.
      if (step === "declined") capture(captureDir, "rebill-declined-response", { httpStatus: reply.httpStatus, reply: reply.body });
      const transactionKind = step === "renewal" ? "transaction-rebill"
        : step === "auth-order" ? "transaction-rebill-auth-order" : "transaction-rebill-declined";
      const transactionId = dataOf(reply.body)?.transactionId;
      if (transactionId === undefined || transactionId === null) {
        // Kept under the transaction's kind on purpose: P3b's recorded suite then fails loudly on it. A declined
        // rebill with no transaction is a fact in itself (the optional kind stays absent; its reply is kept above).
        if (step !== "declined") capture(captureDir, transactionKind, reply.body);
        console.log(`XMONEY_REBILL=${step}:${reply.httpStatus}:NO_TRANSACTION`);
        return;
      }
      const after = await stageRequest(key, "GET", `/transaction/${encodeURIComponent(String(transactionId))}`);
      capture(captureDir, transactionKind, after.body);
      console.log(`XMONEY_REBILL=${step}:${reply.httpStatus}:${statusOf(after.body)}`);
      return;
    }
    if (command === "refund") {
      const step = argument(argv, "--as");
      if (step !== "partial" && step !== "second-partial" && step !== "full" && step !== "extra") {
        throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--as");
      }
      const waitSeconds = Number(argument(argv, "--wait-seconds", "600"));
      if (!Number.isSafeInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 3600) {
        throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--wait-seconds");
      }
      const transaction = argument(argv, "--transaction");
      const path = `/transaction/${encodeURIComponent(transaction)}`;
      // The same form the client sends (P3b): reason, message, and an amount unless the whole rest is refunded.
      const form = new URLSearchParams({ reason: "customer-demand", message: RECORDING_MESSAGE });
      if (argv.includes("--amount")) form.set("amount", argument(argv, "--amount"));
      const reply = await stageRequest(key, "DELETE", path, form);
      if (step === "extra") {
        capture(captureDir, "refund-refused", reply.body);
        console.log(`XMONEY_REFUND=extra:${reply.httpStatus}`);
        return;
      }
      if (step === "partial") capture(captureDir, "refund-response", reply.body);
      // The payment right after the refund: does its status move, and does its amount shrink (A4 (c))?
      const after = await stageRequest(key, "GET", path);
      capture(captureDir, step === "partial" ? "transaction-refund-partial"
        : step === "second-partial" ? "transaction-refund-second-partial" : "transaction-refund-full", after.body);
      if (step === "full") {
        console.log(`XMONEY_REFUND=full:${reply.httpStatus}:${statusOf(after.body)}:amount=${amountOf(after.body)}`);
        return;
      }
      const order = argument(argv, "--order");
      let linkedNote = "";
      if (step === "partial") {
        const query = new URLSearchParams({
          orderId: order, createdAtFrom: stageIso(Date.now() - 30 * DAY_MS), createdAtTo: stageIso(Date.now() + DAY_MS)
        });
        const list = await stageRequest(key, "GET", `/transaction?${query.toString()}`);
        capture(captureDir, "transaction-list-after-refund", list.body);
        const linked = listed(list.body).find((entry) => String(entry.id) !== transaction
          && (entry.transactionType === "refund" || relatedIds(entry).includes(transaction)));
        if (linked !== undefined) {
          const refundTransaction = await stageRequest(key, "GET", `/transaction/${encodeURIComponent(String(linked.id))}`);
          capture(captureDir, "transaction-refund", refundTransaction.body);
        }
        linkedNote = `:linked=${linked === undefined ? "none" : "yes"}`;
      }
      // X0 (g): how, and how soon, the refund listing shows this refund (one linked row after the first partial
      // refund, two after the second). The last listing is kept whether or not the rows came.
      const seen = await waitForRefundRows(key, order, transaction, step === "partial" ? 1 : 2, waitSeconds);
      capture(captureDir, step === "partial" ? "transaction-list-refund-after-partial"
        : "transaction-list-refund-after-second-partial", seen.body);
      console.log(`XMONEY_REFUND=${step}:${reply.httpStatus}:${statusOf(after.body)}:amount=${amountOf(after.body)}`
        + `${linkedNote}:refundRows=${seen.rows}@${seen.timedOut ? "timeout-" : ""}${seen.seconds}s`);
      return;
    }
    if (command === "release") {
      const path = `/transaction/${encodeURIComponent(argument(argv, "--transaction"))}`;
      const before = await stageRequest(key, "GET", path);
      capture(captureDir, "transaction-auth", before.body);
      const reply = await stageRequest(key, "DELETE", path, new URLSearchParams({
        reason: "customer-demand", message: RECORDING_MESSAGE
      }));
      const after = await stageRequest(key, "GET", path);
      capture(captureDir, "transaction-auth-released", after.body);
      console.log(`XMONEY_RELEASE=${statusOf(before.body)}->${reply.httpStatus}->${statusOf(after.body)}`);
      return;
    }
    if (command === "serve") {
      const port = Number(argument(argv, "--port", "8780"));
      const mode = argument(argv, "--mode");
      if (mode !== "authAndCapture" && mode !== "auth") throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--mode");
      const permissionsPolicy = argument(argv, "--permissions-policy", "production");
      if (permissionsPolicy !== "production" && permissionsPolicy !== "none") {
        throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--permissions-policy");
      }
      const referrerPolicy = argument(argv, "--referrer-policy", "production");
      if (referrerPolicy !== "production" && referrerPolicy !== "strict-origin") {
        throw new TypeError("XMONEY_ARGUMENT_REQUIRED:--referrer-policy");
      }
      const locale = argument(argv, "--locale", "en");
      const chargeId = randomBytes(16).toString("hex");
      const publicKey = argument(argv, "--public-key");
      const order = recordingOrder({
        // `--identifier`: the customer step's identifier, so the payment is made the way production makes it.
        publicKey, siteId: argument(argv, "--site-id"), identifier: argument(argv, "--identifier", randomBytes(16).toString("hex")),
        email: argument(argv, "--email"), country: argument(argv, "--country"), chargeId,
        amount: argument(argv, "--amount"), mode, description: RECORDING_MESSAGE,
        backUrl: `http://127.0.0.1:${port}/return?charge=${chargeId}`
      });
      const signed = signRecordingOrder(order, key);
      // What the stage form is asked to accept; the scrubber re-signs it under the test key for P3a.
      capture(captureDir, "order-payload", { order, payload: signed.payload, checksum: signed.checksum });
      const server = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const stamp = Date.now();
          if (request.method === "POST" && request.url === "/notify") {
            writeFileSync(join(captureDir, `notice-${stamp}.raw`),
              `content-type: ${request.headers["content-type"] ?? ""}\n\n${body}`);
            response.writeHead(200, { "content-type": "text/plain" }).end("OK");
          } else if (request.method === "POST" && request.url === "/csp-report") {
            const report = (JSON.parse(body) as { "csp-report"?: Record<string, unknown> })["csp-report"] ?? {};
            const blocked = String(report["blocked-uri"] ?? "");
            let origin = blocked;
            try { origin = new URL(blocked).origin; } catch { /* keep keywords such as 'inline' */ }
            appendFileSync(join(captureDir, "csp-reports.jsonl"),
              `${JSON.stringify({ directive: report["violated-directive"], blocked: origin })}\n`);
            response.writeHead(204).end();
          } else if (request.method === "POST" && request.url === "/sdk-result") {
            writeFileSync(join(captureDir, `sdk-result-${stamp}.json`), body);
            response.writeHead(204).end();
          } else {
            const nonce = randomBytes(16).toString("base64");
            response.writeHead(200, { ...recordingHeaders(nonce, permissionsPolicy, referrerPolicy) }).end(recordingPage({
              nonce, sdkOrigin: STAGE_SDK, publicKey, payload: signed.payload, checksum: signed.checksum, locale
            }));
          }
        });
      });
      server.listen(port, "127.0.0.1", () => console.log(`XMONEY_SANDBOX_PAGE=http://127.0.0.1:${port}/ charge=${chargeId}`));
      await new Promise<void>((done) => process.once("SIGINT", () => server.close(() => done())));
      return;
    }
    throw new TypeError("XMONEY_SANDBOX_COMMAND_UNKNOWN");
  } finally {
    key.fill(0);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}

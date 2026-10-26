import { type SynthesisCheckFailureCode, type SynthesisCheckOutcome } from "../../../../packages/contract/src/synthesis-check.js";
import { buildFramedPrompt } from "../../../../packages/providers/src/prompt-frame.js";
import { isJudgeIdentifier } from "../publication-check/check.js";
import { judgeCallValue } from "../publication-check/verdict.js";
import { synthesisCheckContract } from "./policy.js";
import { type SynthesisCheckPort, SynthesisCheckFailure } from "./transport.js";
import { parseSynthesisCheckAnswer } from "./verdict.js";

const SYNTHESIS_CHECK_RECORDED_OUTPUT_TOKENS = 192;

type SpendEntry = Readonly<{
  spendSource: "SYNTHESIS_CHECK";
  runId: string;
  providerRef: string;
  chargedOn: string;
  inputTokens: number;
  outputTokens: number;
  chargeMicros: number;
}>;

export type SynthesisCheckDeps = Readonly<{
  port: () => SynthesisCheckPort | null;
  deadlineMs: number;
  dayPot?: { ceilingMicros: number; spentMicros(day: string): number | Promise<number> };
  recordSpend(entry: SpendEntry): Promise<void>;
  priceOf(model: string): { inputUsdPerM: string | number; outputUsdPerM: string | number } | null;
  clock(): Date;
  log(line: { event: string; answer_id: string; answer_version: number; code: string }): void;
}>;

export type SynthesisCheckInput = Readonly<{
  runId: string;
  answerId: string;
  answerVersion: number;
  synthesisText: string | null;
  deadlineAt: Date;
}>;

export type SynthesisCheckResult = Readonly<{
  outcome: SynthesisCheckOutcome;
  modelProviderRef: string | null;
  modelId: string | null;
  callCount: 0 | 1;
}>;

async function withinDeadline(port: SynthesisCheckPort, packet: Parameters<SynthesisCheckPort["complete"]>[0]["packet"], signal: AbortSignal) {
  if (signal.aborted) throw new SynthesisCheckFailure("DEADLINE");
  let onAbort = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new SynthesisCheckFailure("DEADLINE"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([port.complete({ packet, signal }), deadline]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export async function runSynthesisCheck(deps: SynthesisCheckDeps, input: SynthesisCheckInput): Promise<SynthesisCheckResult> {
  let port: SynthesisCheckPort | null = null;
  let callCount: 0 | 1 = 0;
  const log = (event: string, code: string) => deps.log({ event, answer_id: input.answerId, answer_version: input.answerVersion, code });
  const result = (outcome: SynthesisCheckOutcome): SynthesisCheckResult => {
    log("SYNTHESIS_CHECK", outcome.verdict === "UNAVAILABLE" ? outcome.failureCode : "COMPLETE");
    return { outcome, modelProviderRef: port?.providerRef ?? null, modelId: port?.modelId ?? null, callCount };
  };
  const unavailable = (code: SynthesisCheckFailureCode): SynthesisCheckResult =>
    result({ verdict: "UNAVAILABLE", categories: [], failureCode: code });

  try {
    if (input.synthesisText === null || input.synthesisText.length === 0) return result({ verdict: "NO_SYNTHESIS", categories: [] });
    port = deps.port();
    if (port === null || !isJudgeIdentifier(port.providerRef) || !isJudgeIdentifier(port.modelId)) return unavailable("NOT_CONFIGURED");
    const price = deps.priceOf(port.modelId);
    if (price === null) return unavailable("NOT_CONFIGURED");
    const chargedOn = deps.clock().toISOString().slice(0, 10);
    if (deps.dayPot !== undefined && await deps.dayPot.spentMicros(chargedOn) >= deps.dayPot.ceilingMicros) return unavailable("MONEY_REFUSED");

    const framed = buildFramedPrompt({ contract: synthesisCheckContract(), material: [{ name: "synthesis", content: input.synthesisText }] });
    const expectedCall = judgeCallValue(framed.fence);
    const estimatedInputTokens = Buffer.byteLength(framed.packet.messages.map(message => message.content).join(""));
    const recordCallSpend = async (inputTokens: number, outputTokens: number): Promise<void> => {
      const entry: SpendEntry = {
        spendSource: "SYNTHESIS_CHECK", runId: input.runId, providerRef: port!.providerRef, chargedOn,
        inputTokens, outputTokens,
        chargeMicros: Math.ceil(inputTokens * Number(price.inputUsdPerM) + outputTokens * Number(price.outputUsdPerM))
      };
      try { await deps.recordSpend(entry); }
      catch { log("SYNTHESIS_CHECK_SPEND_UNRECORDED", "UNEXPECTED"); }
    };
    const remaining = input.deadlineAt.getTime() - deps.clock().getTime();
    const time = Math.max(0, Math.min(deps.deadlineMs, remaining));
    if (time === 0) return unavailable("DEADLINE");
    const signal = AbortSignal.timeout(Math.floor(time));
    callCount = 1;
    let reply: Awaited<ReturnType<SynthesisCheckPort["complete"]>>;
    try { reply = await withinDeadline(port, framed.packet, signal); }
    catch (error) {
      const code = error instanceof SynthesisCheckFailure ? error.code : signal.aborted ? "DEADLINE" : "UNEXPECTED";
      // A transport failure is billed only when the provider answered; a refused connection costs nothing.
      const billed = code === "DEADLINE" || code === "ANSWER_NOT_JSON"
        || (code === "TRANSPORT_FAILED" && error instanceof SynthesisCheckFailure && error.responded);
      if (billed) {
        await recordCallSpend(estimatedInputTokens, SYNTHESIS_CHECK_RECORDED_OUTPUT_TOKENS);
      }
      return unavailable(code);
    }

    const parsed = parseSynthesisCheckAnswer(reply.text, expectedCall);
    const inputTokens = reply.usage?.input_tokens ?? estimatedInputTokens;
    const outputTokens = parsed.ok ? SYNTHESIS_CHECK_RECORDED_OUTPUT_TOKENS
      : Math.max(reply.usage?.output_tokens ?? 0, SYNTHESIS_CHECK_RECORDED_OUTPUT_TOKENS);
    await recordCallSpend(inputTokens, outputTokens);
    return parsed.ok
      ? parsed.verdict === "CLEAR" ? result({ verdict: "CLEAR", categories: [] })
        : result({ verdict: "FLAGGED", categories: parsed.categories })
      : unavailable(parsed.code);
  } catch {
    return unavailable("UNEXPECTED");
  }
}

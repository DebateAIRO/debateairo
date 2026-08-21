import type { AnswerSurfaceProjection } from "@/lib/v3Presentation";

export function VerdictBanner({ answer }: { answer: AnswerSurfaceProjection }) {
  const label = answer.verdict.state ?? "VERDICT UNAVAILABLE";
  return <section className={`verdict ${answer.defect ? "verdictDefect" : ""}`} aria-label="Verdict">
    <div className="eyebrow">Verdict</div>
    <h2>{label}</h2>
    {answer.verdict.confidenceBand ? <p>Confidence band: {answer.verdict.confidenceBand}</p> : null}
    {answer.verdict.unavailable ? <p>{answer.verdict.unavailable.reason_ref}</p> : null}
    <p>Serve state: {answer.mode}</p>
  </section>;
}

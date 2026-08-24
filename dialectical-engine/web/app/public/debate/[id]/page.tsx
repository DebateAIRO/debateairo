import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerContractClient } from "@/lib/serverApi";
import { PublicAnswerDisclosure } from "@/components/PublicAnswerDisclosure";

export const dynamic = "force-dynamic";

export default async function PublicDebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let debate;
  try { debate = await createServerContractClient().readPublicDebate(id); }
  catch { notFound(); }
  return <main className="screen scroll"><div className="screenInner wide">
    <nav><Link href="/">← Published debates</Link></nav>
    <p className="eyebrow" style={{ marginTop: 30 }}>Public debate · by {debate.author_pseudonym}</p>
    <h1 className="display">{debate.question}</h1><p>Published {new Date(debate.published_at).toLocaleDateString()}.</p>
    <section className="card"><PublicAnswerDisclosure answer={debate.answer} /><h2>{debate.answer.verdict ?? "Verdict unavailable"}</h2>{debate.answer.confidence_band ? <p>Confidence: {debate.answer.confidence_band}</p> : null}{debate.answer.summary_segments.map((segment, index) => <p key={index}>{segment.text}</p>)}</section>
    {debate.answer.badges.length > 0 ? <section className="card"><h2>Badges</h2><p>{debate.answer.badges.join(" · ")}</p></section> : null}
    {debate.answer.residual_objections.length > 0 ? <section className="card"><h2>Residual objections</h2>{debate.answer.residual_objections.map((objection, index) => <p key={index}>{objection}</p>)}</section> : null}
    <section className="card"><h2>What could reverse this answer?</h2><p>{debate.answer.reversal_point}</p></section>
  </div></main>;
}

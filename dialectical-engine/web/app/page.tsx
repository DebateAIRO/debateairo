import Link from "next/link";
import { cookies, headers } from "next/headers";
import { BrandMark } from "@/components/TopBar";
import { createServerContractClient, USER_TOKEN_COOKIE } from "@/lib/serverApi";
import type { ContractClient } from "@debateai/contract";
import type { AnswerIndex } from "@/lib/types";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ limit?: string; offset?: string }> }) {
  const query = await searchParams;
  const limit = Number(query.limit);
  const offset = Number(query.offset);
  const pageRequested = Number.isInteger(limit) && limit > 0 && Number.isInteger(offset) && offset >= 0;
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  let index: AnswerIndex | null = null;
  let indexError: string | null = null;
  let published: Awaited<ReturnType<ContractClient["readPublicDebates"]>> = { items: [], total: 0 };
  let publishedError: string | null = null;
  try { published = await createServerContractClient(fetch, undefined, userAgent).readPublicDebates(50, 0); }
  catch { publishedError = "Published debates are temporarily unavailable."; }
  if (pageRequested && token !== null) {
    try { index = await createServerContractClient(fetch, token, userAgent).readAnswerIndex(limit, offset); }
    catch (failure) { indexError = failure instanceof Error ? failure.name : "INVALID_RESPONSE"; }
  }
  return (
    <main className="screen scroll">
      <div className="screenInner wide">
        <BrandMark />
        <div className="eyebrow" style={{ marginTop: 48 }}>A reasoning instrument</div>
        <h1 className="display lg" style={{ marginTop: 14 }}>Trace an answer all the way down.</h1>
        <p className="lede">DebateAI shows the answer, the graph that supports it, and every typed warning that changes how it should be read.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <Link className="button primary" href="/new">Ask a question</Link>
          <Link className="button" href="/settings">Identity &amp; settings</Link>
        </div>
        <section className="card" style={{ marginTop: 28 }}><h2>Your answers</h2>
          <form method="get" style={{ display: "flex", gap: 12 }}><label>Page size<input name="limit" inputMode="numeric" required /></label><label>Offset<input name="offset" inputMode="numeric" required /></label><button className="button">Read page</button></form>
          {!pageRequested ? <p>Choose an explicit page size and offset; the interface has no hidden truncation default.</p> : null}
          {pageRequested && token === null ? <p>Sign in through Settings to read asker-scoped answers.</p> : null}
          {indexError ? <div className="error">{indexError}</div> : null}
          {index ? <><p>{index.items.length} shown · {index.total} total</p>{index.items.map((answer) => <article className="debateCard" key={answer.answer_id}><Link href={`/debate/${encodeURIComponent(answer.answer_id)}`}>{answer.question_line}</Link><p>{answer.verdict_state ?? answer.abstention?.kind ?? "Verdict unavailable"} · {answer.serve_state} · {answer.staleness_state} · {answer.builds_on_previous ? "Builds on previous" : "No prior answer"}</p></article>)}</> : null}
        </section>
        <section className="card" style={{ marginTop: 28 }}><h2>Published debates</h2>
          {publishedError ? <div className="error">{publishedError}</div> : null}
          {published.items.length === 0 && publishedError === null ? <p>No debates have been published yet.</p> : null}
          {published.total > published.items.length ? <p>{published.items.length} shown of {published.total} total</p> : <p>{published.total} total</p>}
          {published.items.map((debate) => <article className="debateCard" key={debate.public_ref}><Link href={`/public/debate/${encodeURIComponent(debate.public_ref)}`}>{debate.question}</Link><p>By {debate.author_pseudonym} · {debate.verdict ?? "Verdict unavailable"}{debate.confidence_band ? ` · ${debate.confidence_band}` : ""}</p><p>Published debates may be indexed by search engines. Copies may persist after unpublishing.</p></article>)}
        </section>
      </div>
    </main>
  );
}

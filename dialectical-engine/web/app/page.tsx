import Link from "next/link";
import { cookies, headers } from "next/headers";
import { BrandMark } from "@/components/TopBar";
import { createServerContractClient, USER_TOKEN_COOKIE } from "@/lib/serverApi";
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
  if (pageRequested && token !== null) {
    try { index = await createServerContractClient(fetch, token, userAgent).readAnswerIndex("cookie-session", limit, offset); }
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
          <Link className="button" href="/admin/workers">Fleet</Link>
        </div>
        <section className="card" style={{ marginTop: 28 }}><h2>Your answers</h2>
          <form method="get" style={{ display: "flex", gap: 12 }}><label>Page size<input name="limit" inputMode="numeric" required /></label><label>Offset<input name="offset" inputMode="numeric" required /></label><button className="button">Read page</button></form>
          {!pageRequested ? <p>Choose an explicit page size and offset; the interface has no hidden truncation default.</p> : null}
          {pageRequested && token === null ? <p>Sign in through Settings to read asker-scoped answers.</p> : null}
          {indexError ? <div className="error">{indexError}</div> : null}
          {index ? <><p>{index.items.length} shown · {index.total} total</p>{index.items.map((answer) => <article className="debateCard" key={answer.answer_id}><Link href={`/debate/${encodeURIComponent(answer.answer_id)}`}>{answer.question_line}</Link><p>{answer.verdict_state ?? answer.abstention?.kind ?? "Verdict unavailable"} · {answer.serve_state} · {answer.staleness_state} · {answer.builds_on_previous ? "Builds on previous" : "No prior answer"}</p></article>)}</> : null}
        </section>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

/** The ask page's own cut (`app/v4/page.tsx`): a longer topic is cut, never refused. */
const TOPIC_MAX = 4000;

/** The first topic (a repeated param keeps its first value), cut at TOPIC_MAX; "" when there is none. */
function topicOf(value: string | string[] | undefined): string {
  const topic = Array.isArray(value) ? value[0] : value;
  if (typeof topic !== "string") return "";
  const cut = topic.slice(0, TOPIC_MAX);
  // A cut through a character written in two halves (an emoji) drops the half, so the address can always be written.
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/*
 * V4 start step, Task 78 (spec 2026-11-03 §4.5 "The classic view"): the owner ruled that V4 replaces V3, so the classic
 * ask page redirects to the V4 ask page. A topic handed in by a link (`/new?topic=…`) goes along as `/v4?topic=…`, which
 * pre-fills the question there. The classic page's client (NewDebatePageClient) stays in the tree; old debates' classic
 * pages still open.
 */
export default async function NewDebatePage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ topic?: string | string[] }>;
}): Promise<never> {
  const topic = topicOf((await searchParams).topic);
  redirect(topic === "" ? "/v4" : `/v4?topic=${encodeURIComponent(topic)}`);
}

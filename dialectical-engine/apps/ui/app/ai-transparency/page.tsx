import { AI_NOTICE } from "@/lib/aiDisclosure";

export const metadata = {
  title: "AI transparency · Dialectical Engine",
  description: "How DebateAI identifies generated arguments, reviews, scores, verdicts and support replies."
};

export default function AiTransparencyPage() {
  return (
    <main className="screen scroll aiTransparencyPage">
      <article>
        <p className="libEyebrow">AI TRANSPARENCY</p>
        <h1>How we label AI content</h1>
        <p>{AI_NOTICE.block}</p>
        <h2>Read critically</h2>
        <p>Generated content may be inaccurate or incomplete — treat it as material to judge, not as fact.
          Scores and verdicts evaluate arguments; they are not a guarantee of truth. Check claims and their sources before relying on them.</p>
        <h2>Visible labels</h2>
        <p>AI notices appear before starting a debate, in the library, on private and published debates,
          and in support conversations. Recorded model attribution accompanies arguments where available.</p>
        <h2>Machine-readable markings</h2>
        <p>Generated content in the rendered page carries <code>data-ai-generated="true"</code>.
          This identifies the marked content, including its generated text and evaluations.
          Your question and your support messages are not labelled as AI-generated.
          Fixed support notices use <code>data-content-origin="automated"</code> instead.</p>
        <p>Debate JSON downloads include an <code>ai_disclosure</code> object describing the generated
          content and the absence of human editorial review. Recorded answer data, model provenance,
          and operational records retain their original values.</p>
        <p>These markings describe content in our UI and downloads. They are not a watermark or
          authenticity certificate; copying plain text may remove them.</p>
        <h2>Support and human help</h2>
        <p>The support assistant is an AI system. Use “Talk to a human” or “Escalate to a human”
          in <a href="/help">Help</a> to request human assistance.</p>
        <a className="btn" href="/">Back to DebateAI</a>
      </article>
    </main>
  );
}

import type { ReactNode } from "react";
import { AI_NOTICE } from "@/lib/aiDisclosure";

export function AiNotice({
  variant = "strip", body, language = "en"
}: {
  variant?: "strip" | "pill" | "block" | "banner";
  body?: ReactNode;
  language?: "en" | "ro";
}) {
  const supportRomanian = variant === "banner" && language === "ro";
  const copy = body ?? (supportRomanian
    ? "Răspunsurile sunt generate de AI, marcate într-un format citibil automat și pot fi greșite. Poți cere să vorbești cu o persoană oricând."
    : AI_NOTICE[variant]);
  return (
    <section className={`aiNotice aiNotice--${variant}`} aria-label={variant === "block" ? "AI transparency" : "AI disclosure"}>
      {variant === "block" ? <h2>AI TRANSPARENCY</h2> : <span className="aiNoticeBadge" aria-hidden="true">AI</span>}
      <p>
        {variant === "banner" ? <><strong>{supportRomanian
          ? "Această conversație este cu un asistent de suport AI."
          : "This conversation is with an AI support agent."}</strong>{" "}</> : null}
        {copy}
        {variant === "strip" || variant === "block" ? <>{" "}<a
          href="/ai-transparency" target="_blank" rel="noopener noreferrer"
          aria-label="How we label AI content (opens in a new tab)"
        >How we label AI content</a></> : null}
      </p>
    </section>
  );
}

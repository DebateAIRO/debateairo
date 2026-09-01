import type { JSX } from "react";
import { ModeToggle } from "@/components/ModeToggle";

export function LandingChrome(): JSX.Element {
  return (
    <header data-landing-section="chrome">
      <a href="/" style={{ fontFamily: "var(--font-display)" }}>DebateAI</a>
      <nav aria-label="Landing navigation">
        <a href="#method">Method</a>
        <a href="#transcripts">Transcripts</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <div>
        <a href="/login">Log in</a>
        <a href="/sign-up">Sign up</a>
        <a href="/login?next=%2Fnew">Start a debate</a>
        <ModeToggle />
      </div>
    </header>
  );
}

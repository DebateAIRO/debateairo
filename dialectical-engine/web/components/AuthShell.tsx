import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}>) {
  return (
    <main className="authScreen scroll" aria-labelledby="auth-title">
      <div className="authColumn">
        <header className="authIntro">
          <p className="authEyebrow">{eyebrow}</p>
          <h1 className="authHeadline" id="auth-title">{title}</h1>
          <p className="authLede">{description}</p>
        </header>
        {children}
        <footer className="authFooter">{footer}</footer>
      </div>
    </main>
  );
}

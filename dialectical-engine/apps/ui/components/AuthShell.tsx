import type { ReactNode } from "react";

/* The design document's auth card (Turn 7 · 7a/7b, Turn 8 · 8a-8c): a 540px
   card on a dotted ground, holding a brand mark, the eyebrow/headline/lede
   block, and a shell-around-core bezel panel that carries the form. */
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
      <div className="authCard">
        <div className="authCardInner">
          <div className="authBrand">
            <span className="authBrandMark" aria-hidden="true">
              <span className="authBrandDiamond" />
            </span>
            <span className="authBrandName">Dialectical Engine</span>
          </div>
          <header className="authIntro">
            <p className="authEyebrow">{eyebrow}</p>
            <h1 className="authHeadline" id="auth-title">{title}</h1>
            <p className="authLede">{description}</p>
          </header>
          <div className="authPanel">
            <div className="authPanelCore">{children}</div>
          </div>
          {footer === null ? null : <footer className="authFooter">{footer}</footer>}
        </div>
      </div>
    </main>
  );
}

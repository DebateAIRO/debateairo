import { headers } from "next/headers";
import { Fraunces, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import { NONCE_REQUEST_HEADER } from "../content-security-policy.mjs";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap"
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-jakarta",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-src",
  display: "swap"
});

export const metadata = {
  title: "Dialectical Engine",
  description: "A reasoning instrument — several AI models argue a claim in a structured tree."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // F-08: the per-request nonce the middleware stamped on the request. Reading
  // headers() also makes every route dynamic, so no prerendered HTML can ever
  // carry a stale nonce.
  const nonce = (await headers()).get(NONCE_REQUEST_HEADER) ?? undefined;
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=localStorage.getItem('debateai.mode');" +
              "if(m==='chamber'||m==='terracotta')document.documentElement.dataset.mode=m;}catch(e){}"
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <div className="appShell">
          <TopBar />
          {children}
        </div>
      </body>
    </html>
  );
}

import type { Viewport } from "next";
import { Source_Serif_4, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import "./globals.css";

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap"
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata = {
  title: "Dialectical Engine",
  description: "A reasoning instrument — several AI models argue a claim in a structured tree."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="appShell">
          <TopBar />
          {children}
        </div>
      </body>
    </html>
  );
}

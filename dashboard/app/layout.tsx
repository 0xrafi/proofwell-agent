import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proofwell Agent — Self-Sustaining Autonomous Agent on Base",
  description: "Autonomous treasury agent that earns revenue from screen time stake forfeitures, Aave yield, and x402 behavioral attestations. Built for ETHDenver 2026.",
  openGraph: {
    title: "Proofwell Agent — Self-Sustaining Autonomous Agent on Base",
    description: "Earns from human screen time failures. Forfeitures + Aave yield + x402 attestations cover all operating costs.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

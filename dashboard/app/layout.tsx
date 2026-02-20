import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proofwell Agent",
  description: "Autonomous treasury agent on Base mainnet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synaptic FX Terminal | ISO 20022 × Solana",
  description:
    "The world's first FINOS FDC3 3.0 compliant institutional FX terminal on Solana. StartPayment intent → pacs.008 XML → Token-2022 settlement.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className="antialiased bg-[#0a0a0a] text-white"
        style={{
          fontFamily:
            "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'SF Mono', 'Consolas', monospace",
        }}
      >
        {children}
      </body>
    </html>
  );
}

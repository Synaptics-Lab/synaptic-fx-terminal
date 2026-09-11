import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

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
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} font-mono antialiased bg-[#0a0a0a] text-white`}>
        {children}
      </body>
    </html>
  );
}

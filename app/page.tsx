"use client";

import { useState, useEffect } from "react";
import { FXTicker } from "@/components/terminal/FXTicker";
import { PaymentPanel } from "@/components/terminal/PaymentPanel";
import { OrderBlotter, type BlotterRow } from "@/components/terminal/OrderBlotter";
import { ShieldCheck, Terminal, Globe, Cpu } from "lucide-react";

export default function TerminalPage() {
  const [rows, setRows] = useState<BlotterRow[]>([]);
  const [utcTime, setUtcTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().slice(11, 19) + " UTC");
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSettlement = (row: BlotterRow) => {
    setRows((prev) => [row, ...prev]);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden select-none">
      {/* Institutional Bloomberg-style Terminal Top Header */}
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a1a] bg-[#0c0c0c] shrink-0 text-[10px] font-mono">
        {/* Left: Terminal Identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold tracking-widest uppercase">
            <Terminal className="w-3 h-3" />
            <span>SYNAPTIC FX TERMINAL</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-zinc-500">
            <span>|</span>
            <span className="flex items-center gap-1 text-zinc-400">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>FINOS FDC3 3.0</span>
            </span>
            <span>·</span>
            <span className="text-zinc-400">ISO 20022 pacs.008</span>
            <span>·</span>
            <span className="flex items-center gap-1 text-zinc-400">
              <Cpu className="w-3 h-3 text-sky-400" />
              <span>Solana Token-2022</span>
            </span>
          </div>
        </div>

        {/* Right: Telemetry & Live Clock */}
        <div className="flex items-center gap-4 text-zinc-400">
          <div className="hidden sm:flex items-center gap-2">
            <span className="flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-1.5 py-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 animate-ping rounded-full inline-block"></span>
              <span>SOLANA DEVNET ONLINE</span>
            </span>
            <span className="text-[9px] text-amber-400/80 bg-amber-950/30 border border-amber-900/50 px-1.5 py-0.5">
              FINOS PR #2204
            </span>
          </div>

          <div className="flex items-center gap-1 text-zinc-300 font-bold bg-[#141414] border border-[#222] px-2 py-0.5 tabular-nums">
            <Globe className="w-3 h-3 text-zinc-500" />
            <span>{utcTime || "00:00:00 UTC"}</span>
          </div>
        </div>
      </header>

      {/* Real-time FX Ticker */}
      <FXTicker />

      {/* Main Terminal Layout: Top 55% Payment & Pacs Inspector, Bottom Blotter */}
      <main className="flex-1 flex flex-col min-h-0 divide-y divide-[#1a1a1a]">
        {/* Top: FDC3 Intent & ISO 20022 Generator */}
        <section className="h-[55%] shrink-0">
          <PaymentPanel onSettlement={handleSettlement} />
        </section>

        {/* Bottom: Settlement Blotter */}
        <section className="flex-1 min-h-0">
          <OrderBlotter rows={rows} />
        </section>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { FXTicker } from "@/components/terminal/FXTicker";
import { PaymentPanel } from "@/components/terminal/PaymentPanel";
import { OrderBlotter, type BlotterRow } from "@/components/terminal/OrderBlotter";
import { IntroModal } from "@/components/terminal/IntroModal";
import { Tooltip } from "@/components/ui/Tooltip";
import { ShieldCheck, Terminal, Globe, Cpu, Layers, Info } from "lucide-react";

export default function TerminalPage() {
  const [rows, setRows] = useState<BlotterRow[]>([]);
  const [utcTime, setUtcTime] = useState("");
  const [showIntroModal, setShowIntroModal] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().slice(11, 19) + " UTC");
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    // First-time visitor check for IntroModal
    const seen = localStorage.getItem("bankerx_intro_seen");
    if (!seen) {
      setShowIntroModal(true);
    }

    return () => clearInterval(interval);
  }, []);

  const handleSettlement = (row: BlotterRow) => {
    setRows((prev) => [row, ...prev]);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden select-none">
      {/* Institutional Bloomberg-style Terminal Top Header */}
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a1a] bg-[#0c0c0c] shrink-0 text-[10px] font-mono">
        {/* Left: Terminal Identity & Institutional Standards */}
        <div className="flex items-center gap-2.5">
          <Tooltip content="Open-source post-trade DvP settlement reference clearinghouse for FINOS TraderX">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold tracking-widest uppercase">
              <Terminal className="w-3 h-3" />
              <span>BANKERX REFERENCE</span>
            </div>
          </Tooltip>

          <Tooltip content="Implements experimental StartPayment intent defined in FINOS FDC3 PR #2204 & TraderX Spec 016">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-700/80 text-amber-300 font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>FINOS FDC3 EXPERIMENTAL</span>
            </div>
          </Tooltip>

          <div className="hidden xl:flex items-center gap-2 text-zinc-500">
            <span>|</span>
            <Tooltip content="Standard CBPR+ Credit Initiation (pacs.008) and Settlement Confirmation (pacs.002 Acsc)">
              <span className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>ISO 20022 PACs.008 / .002</span>
              </span>
            </Tooltip>
            <span>·</span>
            <Tooltip content="Rail-agnostic clearing across distributed ledgers unified under canonical ISO 20022 schemas">
              <span className="flex items-center gap-1 text-amber-300 font-semibold bg-amber-950/30 border border-amber-900/40 px-1 py-0.2">
                <Layers className="w-3 h-3 text-amber-400" />
                <span>RAIL AGNOSTIC</span>
              </span>
            </Tooltip>
            <span>·</span>
            <Tooltip content="Host workstation compliance gate: in-memory Bloom sanctions filter and Δ=0 solvency in <8ms">
              <span className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors">
                <Cpu className="w-3 h-3" />
                <span>ADR-555 ENCLAVE</span>
              </span>
            </Tooltip>
          </div>
        </div>

        {/* Right: Briefing Modal Trigger, Telemetry & Live Clock */}
        <div className="flex items-center gap-2.5 text-zinc-400">
          <button
            onClick={() => setShowIntroModal(true)}
            className="flex items-center gap-1 text-[9px] text-zinc-300 hover:text-amber-300 bg-[#161616] hover:bg-[#1f1f1f] border border-[#2c2c2c] px-2 py-0.5 transition-colors cursor-pointer"
            title="Open System Architecture Briefing"
          >
            <Info className="w-3 h-3 text-amber-400" />
            <span>ARCHITECTURE BRIEFING</span>
          </button>

          <div className="hidden sm:flex items-center gap-2">
            <span className="flex items-center gap-1 text-[8.5px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-1.5 py-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 animate-ping rounded-full inline-block"></span>
              <span>RAILS ACTIVE</span>
            </span>
          </div>

          <div className="flex items-center gap-1 text-zinc-300 font-bold bg-[#141414] border border-[#222] px-2 py-0.5 tabular-nums text-[9.5px]">
            <Globe className="w-3 h-3 text-zinc-500" />
            <span>{utcTime || "00:00:00 UTC"}</span>
          </div>
        </div>
      </header>

      {/* Intro Briefing Modal */}
      <IntroModal isOpen={showIntroModal} onClose={() => setShowIntroModal(false)} />

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

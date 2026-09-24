"use client";

import { useState, useEffect } from "react";
import { FXTicker } from "@/components/terminal/FXTicker";
import { PaymentPanel } from "@/components/terminal/PaymentPanel";
import { OrderBlotter, type BlotterRow } from "@/components/terminal/OrderBlotter";
import { IntroModal } from "@/components/terminal/IntroModal";
import { Tooltip } from "@/components/ui/Tooltip";
import { ShieldCheck, Terminal, Globe, Cpu, Layers, Info, GitPullRequest, ExternalLink } from "lucide-react";

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
        {/* Left: Terminal Identity & Trilateral Standard */}
        <div className="flex items-center gap-3">
          <Tooltip content="Open-source post-trade DvP settlement reference clearinghouse for FINOS TraderX">
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold tracking-widest uppercase">
              <Terminal className="w-3 h-3" />
              <span>BANKERX REFERENCE</span>
            </div>
          </Tooltip>

          <div className="hidden lg:flex items-center gap-2 text-zinc-500">
            <span>|</span>
            <Tooltip content="Implements experimental StartPayment intent defined in FINOS FDC3 PR #2204 & TraderX Spec 016">
              <span className="flex items-center gap-1 text-amber-400 font-semibold bg-amber-950/30 border border-amber-900/40 px-1.5 py-0.5">
                <ShieldCheck className="w-3 h-3 text-amber-400" />
                <span>FDC3 3.0 EXPERIMENTAL PR #2204</span>
              </span>
            </Tooltip>
            <span>·</span>
            <span className="text-zinc-400">ISO 20022 pacs.008/pacs.002</span>
            <span>·</span>
            <Tooltip content="View Upstream Linux Foundation Pull Requests: TraderX PR #470 & FDC3 PR #2204">
              <a
                href="https://github.com/finos/traderX/pull/470"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-2 py-0.5 bg-[#161616] hover:bg-[#222] border border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-amber-200 transition-colors font-semibold text-[9.5px]"
              >
                <GitPullRequest className="w-3 h-3 text-amber-400" />
                <span>FINOS PR #470</span>
                <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
              </a>
            </Tooltip>
            <span>·</span>
            <span className="flex items-center gap-1 text-sky-400">
              <Cpu className="w-3 h-3" />
              <span>ADR-555 ENCLAVE (WOTS+)</span>
            </span>
          </div>
        </div>

        {/* Right: Briefing Trigger, Telemetry & Live Clock */}
        <div className="flex items-center gap-3 text-zinc-400">
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
              <span>TRILATERAL RAILS ACTIVE</span>
            </span>
            <span className="text-[8.5px] text-sky-400 bg-sky-950/30 border border-sky-900/50 px-1.5 py-0.5">
              SOLANA + XRPL ALTNET + L1
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

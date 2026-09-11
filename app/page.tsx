"use client";

import { useState } from "react";
import { FXTicker } from "@/components/terminal/FXTicker";
import { PaymentPanel } from "@/components/terminal/PaymentPanel";
import { OrderBlotter, type BlotterRow } from "@/components/terminal/OrderBlotter";

export default function TerminalPage() {
  const [rows, setRows] = useState<BlotterRow[]>([]);

  const handleSettlement = (row: BlotterRow) => {
    setRows((prev) => [row, ...prev]);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono text-zinc-400 tracking-widest uppercase">
              Synaptic FX Terminal
            </span>
          </div>
          <span className="text-[10px] font-mono text-zinc-700">|</span>
          <span className="text-[10px] font-mono text-zinc-600">
            FINOS FDC3 3.0 · ISO 20022 pacs.008 · Solana Token-2022
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-600">
          <span>DEVNET</span>
          <span className="text-zinc-700">·</span>
          <span className="text-amber-500/70">FINOS CONTRIBUTOR</span>
        </div>
      </div>

      {/* FX Ticker */}
      <FXTicker />

      {/* Main layout: 3-panel top + blotter bottom */}
      <div className="flex-1 flex flex-col min-h-0 divide-y divide-[#1a1a1a]">
        {/* Top: Payment Panel (takes ~55% height) */}
        <div className="h-[55%] shrink-0">
          <PaymentPanel onSettlement={handleSettlement} />
        </div>

        {/* Bottom: Order Blotter */}
        <div className="flex-1 min-h-0">
          <OrderBlotter rows={rows} />
        </div>
      </div>
    </div>
  );
}

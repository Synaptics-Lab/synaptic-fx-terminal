"use client";

import { useState, useEffect } from "react";
import { Layers, Terminal, X, ExternalLink, Cpu, ShieldCheck, Building2 } from "lucide-react";

interface IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IntroModal({ isOpen, onClose }: IntroModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (dontShowAgain) {
      localStorage.setItem("bankerx_intro_seen", "true");
    }
  }, [dontShowAgain]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem("bankerx_intro_seen", "true");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="bg-[#0e0e0e] border border-[#2a2a2a] max-w-2xl w-full text-zinc-300 font-mono shadow-2xl shadow-black relative flex flex-col max-h-[92vh] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] bg-[#141414]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
            <span className="text-[11px] font-bold text-zinc-200 tracking-wider uppercase">
              BankerX Reference
            </span>
            <span className="text-[9px] font-semibold text-amber-400/90 bg-amber-950/40 border border-amber-800/50 px-1.5 py-0.5">
              Colosseum Radar — Judges
            </span>
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1"
            title="Close briefing"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-[11px] leading-relaxed">
          {/* Judge orientation */}
          <div className="bg-[#131313] border border-[#242424] p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-[11.5px]">
              <Building2 className="w-4 h-4 text-zinc-400" />
              <span>What You Are Looking At</span>
            </div>
            <p className="text-zinc-400 text-[10.5px]">
              <strong>BankerX</strong> is the settlement side of this Colosseum Radar submission: a post-trade DvP clearinghouse executing the FINOS FDC3 3.0 <code className="text-amber-300">StartPayment</code> intent. <strong>TraderX</strong> is the front office that captures orders; this terminal is the desk that clears them against real rails under ISO 20022 <code className="text-zinc-300">pacs.008</code> initiation and <code className="text-zinc-300">pacs.002</code> receipts.
            </p>
          </div>

          {/* Judge fast path — where to click */}
          <div className="bg-[#111] border border-[#222] p-3 space-y-2">
            <span className="text-[9.5px] uppercase tracking-wider text-zinc-500 font-bold">
              Judge Flow — Open the Blotter
            </span>
            <p className="text-zinc-400 text-[10.5px]">
              The <strong>TraderX</strong> blotter is wired directly to this desk — the button below opens it in a new tab. Place a trade and click <em>Settle</em>: the FDC3 <code className="text-zinc-300">StartPayment</code> intent carrying the SWIFT UETR lands here, runs the enclave pre-flight, initiates <code className="text-zinc-300">pacs.008</code> settlement, and returns the <code className="text-zinc-300">pacs.002</code> receipt into the blotter below.
            </p>
            <a
              href="https://traderx.synapticchain.xyz/angular/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-wider text-[10.5px] transition-colors"
            >
              <span>Open the TraderX Blotter — New Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <p className="text-[10.5px] text-zinc-300 border border-amber-700/50 bg-amber-950/20 p-2">
              The desk processes exactly <strong>one</strong> settlement — a live single transaction, kept minimal and safe to run. Every trade mints a fresh SWIFT UETR, and a settled UETR is never executed twice: resubmitting the same UETR is <strong>refused by design</strong>. That refusal is the product — replay and double-settlement protection.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
              <a
                href="https://colosseum.synapticchain.xyz/demo/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 bg-[#161616] border border-[#262626] hover:border-amber-500/50 hover:bg-[#1a1a1a] text-zinc-300 transition-colors"
              >
                <span>Colosseum entry — live-fire demo, netting, brief</span>
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </a>
              <a
                href="https://github.com/Synaptics-Lab/synaptic-fx-terminal/blob/main/JUDGES_FLOW.md"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 bg-[#161616] border border-[#262626] hover:border-amber-500/50 hover:bg-[#1a1a1a] text-zinc-300 transition-colors"
              >
                <span>Zero-setup verification path (JUDGES_FLOW.md)</span>
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </a>
            </div>
          </div>

          {/* Architecture — three tiers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#111] border border-[#222] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-200 font-bold text-[10.5px]">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>Tier 1: Front Office</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                TraderX executes spot trades with zero ledger dependencies — no value moves here. It captures orders and emits pure trade parameters with an RFC 4122 SWIFT UETR to the settlement desk.
              </p>
            </div>

            <div className="bg-[#111] border border-[#222] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-200 font-bold text-[10.5px]">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>Tier 2: Local Enclave</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Before payloads leave the workstation, the ADR-555 enclave executes pre-flight compliance in under 8 ms: in-memory Merkle Bloom sanctions screening, &Delta;&equiv;0 solvency verification, and WOTS+ post-quantum attestation.
              </p>
            </div>

            <div className="bg-[#111] border border-[#222] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-200 font-bold text-[10.5px]">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tier 3: Clearing Rails</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                A rail-agnostic dispatcher routes value across distributed-ledger rails under canonical ISO 20022 <code className="text-zinc-300">pacs.008</code> initiation and <code className="text-zinc-300">pacs.002</code> (<code className="text-emerald-400">Acsc</code>) status receipts.
              </p>
            </div>
          </div>

          {/* Solvency invariant */}
          <div className="bg-[#111] border border-[#222] p-3 space-y-1.5 text-[10px] text-zinc-400">
            <div className="flex items-center gap-1.5 text-zinc-300 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Solvency Invariant (&Delta; &equiv; 0)</span>
            </div>
            <p>
              Value transfer is governed by the conservation invariant <code className="text-zinc-200">&sum; Debits &equiv; &sum; Credits + Statutory Levy</code>. No transaction is marked settled without a cryptographically bound ISO 20022 <code className="text-zinc-200">pacs.002.001.10</code> receipt anchoring the ledger sequence and SWIFT UETR.
            </p>
          </div>

          {/* Upstream Standards Links */}
          <div className="bg-[#111] border border-[#222] p-3 space-y-2">
            <span className="text-[9.5px] uppercase tracking-wider text-zinc-500 font-bold">
              Upstream FINOS Contributions
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
              <a
                href="https://github.com/finos/traderX/pull/470"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 bg-[#161616] border border-[#262626] hover:border-amber-500/50 hover:bg-[#1a1a1a] text-zinc-300 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-400 font-bold">PR #470</span>
                  <span>TraderX Spec 016 Adapter</span>
                </div>
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </a>

              <a
                href="https://github.com/finos/FDC3/pull/2204"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 bg-[#161616] border border-[#262626] hover:border-emerald-500/50 hover:bg-[#1a1a1a] text-zinc-300 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400 font-bold">PR #2204</span>
                  <span>FDC3 3.0 Payment Context</span>
                </div>
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#222] bg-[#141414] text-[10px]">
          <label className="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="accent-amber-500 bg-[#1c1c1c] border-zinc-700"
            />
            <span>Do not display this briefing on initial launch</span>
          </label>

          <button
            onClick={handleClose}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-wider text-[10.5px] transition-colors flex items-center gap-1.5"
          >
            <span>Enter Terminal</span>
          </button>
        </div>
      </div>
    </div>
  );
}
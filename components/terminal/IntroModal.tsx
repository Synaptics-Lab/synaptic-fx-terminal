"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Layers, Terminal, X, ExternalLink, Cpu, CheckCircle2, Building2 } from "lucide-react";

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
              FINOS FDC3 Experimental
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
          {/* Calm Institutional Statement */}
          <div className="bg-[#131313] border border-[#242424] p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-[11.5px]">
              <Building2 className="w-4 h-4 text-zinc-400" />
              <span>Deterministic Settlement & Architectural Boundary Isolation</span>
            </div>
            <p className="text-zinc-400 text-[10.5px]">
              Institutional banking requires mathematical certainty, strict separation of concerns, and verifiable post-trade data. Front-office execution platforms (such as the Linux Foundation&apos;s <strong>TraderX</strong>) excel at price discovery and order capture, but clearing and settlement demand a dedicated, rail-agnostic clearinghouse architecture.
            </p>
            <p className="text-zinc-400 text-[10.5px]">
              <strong>BankerX Reference</strong> provides the missing post-trade settlement engine—implementing the emerging <strong>FINOS FDC3 3.0 <code className="text-amber-300">StartPayment</code></strong> intent (PR #2204) to bridge trade blotters into multi-rail clearing with formal mathematical solvency proofs.
            </p>
          </div>

          {/* Separation of Concerns / Three Tiers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Tier 1 */}
            <div className="bg-[#111] border border-[#222] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-200 font-bold text-[10.5px]">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>Tier 1: Front Office</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                TraderX executes spot trades with zero ledger dependencies. Clicking <em>Settle</em> dispatches a standard FDC3 <code className="text-zinc-300">StartPayment</code> intent carrying pure trade parameters and an RFC 4122 SWIFT UETR.
              </p>
            </div>

            {/* Tier 2 */}
            <div className="bg-[#111] border border-[#222] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-200 font-bold text-[10.5px]">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>Tier 2: Local Enclave</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Before payloads leave the local workstation, the ADR-555 Enclave executes pre-flight compliance in &lt;8ms: in-memory Merkle Bloom sanctions screening, &Delta;&equiv;0 solvency verification, and 67-chain WOTS+ post-quantum attestation.
              </p>
            </div>

            {/* Tier 3 */}
            <div className="bg-[#111] border border-[#222] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-zinc-200 font-bold text-[10.5px]">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tier 3: Clearing Rails</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Rail-agnostic settlement dispatcher routing value across high-throughput distributed ledger rails, strictly unified under canonical ISO 20022 <code className="text-zinc-300">pacs.008</code> initiation and <code className="text-zinc-300">pacs.002</code> (<code className="text-emerald-400">Acsc</code>) status receipts.
              </p>
            </div>
          </div>

          {/* Mathematical Solvency & Real Telemetry */}
          <div className="bg-[#111] border border-[#222] p-3 space-y-1.5 text-[10px] text-zinc-400">
            <div className="flex items-center gap-1.5 text-zinc-300 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mathematical Solvency Law (&Delta; &equiv; 0) & Empirical Receipts</span>
            </div>
            <p>
              In accordance with Basel III operational risk standards, value transfer is governed by the conservation invariant: <code className="text-zinc-200">&sum; Debits &equiv; &sum; Credits + Statutory Levy</code>. No transaction is marked settled without a cryptographically bound ISO 20022 <code className="text-zinc-200">pacs.002.001.10</code> receipt anchoring the ledger sequence and SWIFT UETR.
            </p>
          </div>

          {/* Upstream Community Standards Links */}
          <div className="bg-[#111] border border-[#222] p-3 space-y-2">
            <span className="text-[9.5px] uppercase tracking-wider text-zinc-500 font-bold">
              Upstream Linux Foundation &amp; FINOS References
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
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Enter Terminal</span>
          </button>
        </div>
      </div>
    </div>
  );
}

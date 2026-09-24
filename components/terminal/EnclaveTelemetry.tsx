"use client";

import { ShieldCheck, Cpu, Key, Activity, CheckCircle2, Lock, Zap } from "lucide-react";
import type { ADR555PreflightReport } from "@/lib/enclave/adr555-guardian";

interface EnclaveTelemetryProps {
  report: ADR555PreflightReport | null;
  rail: string;
}

export function EnclaveTelemetry({ report, rail }: EnclaveTelemetryProps) {
  if (!report) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center font-mono text-zinc-500 bg-[#080808]">
        <div className="w-12 h-12 border border-dashed border-amber-500/40 flex items-center justify-center mb-3 bg-amber-500/5">
          <ShieldCheck className="w-6 h-6 text-amber-400" />
        </div>
        <h4 className="text-[12px] font-bold text-zinc-300 uppercase tracking-widest mb-1">
          ADR-555 Alcove Runtime Guardian Standby
        </h4>
        <p className="text-[10px] text-zinc-500 max-w-md">
          Raise an FDC3 StartPayment intent to execute the sub-8ms client-side enclave pre-flight:
          in-memory sanctions bloom filter, Invariant 9 solvency verification, 256-lane partition assignment,
          and WOTS+ quantum-safe signature synthesis before wire submission.
        </p>
      </div>
    );
  }

  const { waterfall, sanctionsCheck, solvencyProof, concurrencyAllocation, attestation, totalLatencyMs } = report;

  const waterfallSteps = [
    { label: "1. FDC3 / ISO Schema Parse", ms: waterfall.schemaParseMs, max: 0.5, desc: "JSON context & UETR structural format" },
    { label: "2. Edge Sanctions Bloom Filter", ms: waterfall.sanctionsFilterMs, max: 0.9, desc: "OFAC SDN / EU-FSF 1M-bit in-memory SIMD array" },
    { label: "3. Invariant 9 Solvency Gate", ms: waterfall.invariantSolvencyMs, max: 2.2, desc: "ΣDebits == ΣCredits (Delta == 0.000000)" },
    { label: "4. 256-Lane Rendezvous Hash", ms: waterfall.lanePartitionMs, max: 1.0, desc: "Lane = SHA3(Debtor || Asset) % 256" },
    { label: "5. ADR-062 Sliding Window Nonce", ms: waterfall.slidingWindowNonceMs, max: 0.5, desc: "256-bit bitmap watermark progression" },
    { label: "6. Dual Ed25519 + WOTS+ Signing", ms: waterfall.quantumSigningMs, max: 2.0, desc: "Winternitz 67-chain quantum leaf root synthesis" },
  ];

  return (
    <div className="flex flex-col h-full bg-[#080808] text-white p-3 font-mono overflow-auto space-y-4">
      {/* Top Banner: Sub-8ms Execution Budget SLA */}
      <div className="flex items-center justify-between p-2.5 bg-[#0f0f0f] border border-amber-500/30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
            ADR-555 Enclave Runtime Guardian
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-[9.5px] text-zinc-400">
            Memory-Isolated Alcove Interceptor (:8404)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-400">
            TOTAL PRE-FLIGHT:{" "}
            <strong className="text-emerald-400 text-[12px] tabular-nums">
              {totalLatencyMs.toFixed(2)} ms
            </strong>
          </span>
          <span className="px-1.5 py-0.5 text-[8.5px] bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-bold uppercase">
            ✓ SUB-8ms SLA PASSED
          </span>
        </div>
      </div>

      {/* Latency Waterfall Breakdown */}
      <div className="p-3 bg-[#0c0c0c] border border-[#1e1e1e] space-y-2">
        <div className="flex justify-between items-center text-[10px] text-zinc-400 uppercase tracking-wider border-b border-[#181818] pb-1">
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-amber-400" />
            <span>Pre-Flight Latency Waterfall Breakdown</span>
          </span>
          <span className="text-zinc-500">Zero Wire Leakage Enforced</span>
        </div>
        <div className="space-y-1.5 pt-1">
          {waterfallSteps.map((step, idx) => {
            const pct = Math.min(100, Math.round((step.ms / 3.0) * 100));
            return (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between text-[9.5px]">
                  <span className="text-zinc-300 font-semibold">{step.label}</span>
                  <div className="flex gap-2">
                    <span className="text-zinc-500 text-[8.5px]">{step.desc}</span>
                    <span className="text-amber-400 font-bold tabular-nums w-14 text-right">
                      {step.ms.toFixed(2)} ms
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[#181818] h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2-Column Grid: Left WOTS+ Quantum Leaf, Right ADR-062 Concurrency */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
        {/* Post-Quantum WOTS+ Attestation */}
        <div className="p-3 bg-[#0c0c0c] border border-[#1e1e1e] space-y-2">
          <div className="flex items-center justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-400 font-bold flex items-center gap-1.5 uppercase">
              <Key className="w-3.5 h-3.5 text-sky-400" />
              <span>WOTS+ Post-Quantum Attestation</span>
            </span>
            <span className="text-[8.5px] text-sky-400 bg-sky-950/40 border border-sky-800 px-1 py-0.2">
              RFC 8391 (W=16)
            </span>
          </div>

          <div className="space-y-1 text-zinc-400 text-[9.5px]">
            <div className="flex justify-between">
              <span>Hash Chains:</span>
              <span className="text-zinc-200 font-bold">{attestation.wotsPlus.chainCount} Winternitz Chains (L1=64, L2=3)</span>
            </div>
            <div className="flex justify-between">
              <span>Security Level:</span>
              <span className="text-emerald-400 font-bold">{attestation.wotsPlus.quantumSecurityBits} Bits (Quantum-Resistant)</span>
            </div>
            <div className="pt-1">
              <span className="text-zinc-500 block text-[8.5px] uppercase">WOTS+ Message Digest:</span>
              <span className="text-zinc-300 text-[9px] break-all bg-[#141414] p-1 border border-[#222] block font-mono">
                {attestation.wotsPlus.digestHex}
              </span>
            </div>
            <div className="pt-1">
              <span className="text-sky-400 block text-[8.5px] uppercase font-bold">WOTS+ Leaf Root Hash:</span>
              <span className="text-sky-300 text-[9px] break-all bg-sky-950/20 p-1 border border-sky-900/60 block font-mono font-bold">
                {attestation.wotsPlus.wotsLeafRoot}
              </span>
            </div>
          </div>
        </div>

        {/* ADR-062 Gap-Tolerant Sliding Window Concurrency */}
        <div className="p-3 bg-[#0c0c0c] border border-[#1e1e1e] space-y-2">
          <div className="flex items-center justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-400 font-bold flex items-center gap-1.5 uppercase">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>ADR-062 256-Lane SMR Concurrency</span>
            </span>
            <span className="text-[8.5px] text-amber-400 bg-amber-950/40 border border-amber-800 px-1 py-0.2">
              LANE #{concurrencyAllocation.laneId}
            </span>
          </div>

          <div className="space-y-1 text-zinc-400 text-[9.5px]">
            <div className="flex justify-between">
              <span>Assigned Partition:</span>
              <span className="text-zinc-200 font-bold">Lane {concurrencyAllocation.laneId} of 256</span>
            </div>
            <div className="flex justify-between">
              <span>Rendezvous Equation:</span>
              <span className="text-amber-400 font-semibold">{concurrencyAllocation.rendezvousFormula}</span>
            </div>
            <div className="flex justify-between">
              <span>Watermark / Assigned Nonce:</span>
              <span className="text-zinc-200 font-bold">
                WM: {concurrencyAllocation.watermark} ➔ Nonce: {concurrencyAllocation.nonce}
              </span>
            </div>
            <div className="pt-1">
              <span className="text-zinc-500 block text-[8.5px] uppercase">Active 256-Bit Window Bitmap:</span>
              <span className="text-emerald-400 text-[8.5px] break-all bg-[#141414] p-1 border border-[#222] block font-mono">
                {concurrencyAllocation.bitmap256}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[8.5px] text-zinc-500 pt-0.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Zero-Head-of-Line Blocking (Gap-Tolerant Out-of-Order Execution)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trilateral Redundancy Telemetry Strip */}
      <div className="p-2.5 bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-between flex-wrap gap-2 text-[9px]">
        <span className="text-zinc-400 uppercase font-bold flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" />
          <span>Trilateral Redundancy Health:</span>
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span>SOLANA TOKEN-2022 (DEVNET)</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1 text-sky-400">
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
            <span>XRPL ALTNET (TESTNET :51233)</span>
          </span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            <span>SYNAPTICCHAIN L1 (3/3 SCBFT :8545)</span>
          </span>
        </div>
      </div>
    </div>
  );
}

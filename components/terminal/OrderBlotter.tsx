"use client";

import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { ExternalLink, Search, Activity, CheckCircle2, Clock, AlertTriangle, Key } from "lucide-react";
import gsap from "gsap";
import type { FDC3Channel } from "@/lib/connector/solana-finos-bridge";

export interface BlotterRow {
  id: string;
  timestamp: string;
  msgId: string;
  uetr: string;
  pair: string;
  amount: string;
  debtorName: string;
  creditorName: string;
  txSignature: string;
  explorerUrl: string;
  solanaExplorerUrl?: string;
  synapticExplorerUrl?: string;
  xrplExplorerUrl?: string;
  checkpointHeight?: number;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  channel?: FDC3Channel;
  rail?: string;
  pacs002?: any;
  wotsDigest?: string;
  lane?: number;
}

interface OrderBlotterProps {
  rows: BlotterRow[];
}

export function OrderBlotter({ rows }: OrderBlotterProps) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "PENDING" | "FAILED">("ALL");
  const [channelFilter, setChannelFilter] = useState<"ALL" | FDC3Channel>("ALL");

  useEffect(() => {
    if (!tbodyRef.current) return;
    const newRow = tbodyRef.current.firstElementChild;
    if (newRow && rows.length > 0) {
      gsap.fromTo(
        newRow,
        { backgroundColor: "rgba(245,158,11,0.2)", opacity: 0.4 },
        { backgroundColor: "transparent", opacity: 1, duration: 1.5, ease: "power2.out" }
      );
    }
  }, [rows.length]);

  const filteredRows = rows.filter((r) => {
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    const matchesChannel = channelFilter === "ALL" || (r.channel || "global") === channelFilter;
    const matchesSearch =
      searchTerm === "" ||
      r.pair.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.msgId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.uetr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.rail && r.rail.toLowerCase().includes(searchTerm.toLowerCase())) ||
      r.debtorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.creditorName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesChannel && matchesSearch;
  });

  const confirmedCount = rows.filter((r) => r.status === "CONFIRMED").length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Blotter Top Bar */}
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0d0d0d] gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-zinc-300 font-semibold tracking-widest uppercase">
              Trilateral Settlement Blotter
            </span>
          </div>
          <span className="text-[9px] font-mono text-zinc-600">|</span>
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
            <span>
              TOTAL: <strong className="text-white">{rows.length}</strong>
            </span>
            <span className="text-zinc-600">·</span>
            <span>
              CONFIRMED: <strong className="text-emerald-400">{confirmedCount}</strong>
            </span>
          </div>
        </div>

        {/* Filter and Search controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* FDC3 Channel Filter Tabs */}
          <div className="flex border border-[#222] bg-[#111] text-[9px] font-mono items-center">
            <span className="px-1.5 text-zinc-500 uppercase text-[8px]">CH:</span>
            {(["ALL", "global", "red", "green", "blue"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannelFilter(ch)}
                className={`px-1.5 py-0.5 uppercase transition-colors ${
                  channelFilter === ch
                    ? ch === "global"
                      ? "bg-amber-500/30 text-amber-300 font-bold"
                      : ch === "red"
                      ? "bg-rose-500/30 text-rose-300 font-bold"
                      : ch === "green"
                      ? "bg-emerald-500/30 text-emerald-300 font-bold"
                      : ch === "blue"
                      ? "bg-sky-500/30 text-sky-300 font-bold"
                      : "bg-zinc-800 text-white font-bold"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>

          {/* Quick Status Filter Tabs */}
          <div className="flex border border-[#222] bg-[#111] text-[9px] font-mono">
            {(["ALL", "CONFIRMED", "PENDING", "FAILED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 uppercase transition-colors ${
                  statusFilter === st
                    ? "bg-zinc-800 text-amber-400 font-bold"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="FILTER BLOTTER..."
              className="w-36 bg-[#111] border border-[#222] text-zinc-300 text-[10px] font-mono px-2 py-0.5 pl-6 focus:outline-none focus:border-amber-500/50 rounded-none placeholder:text-zinc-600 uppercase"
            />
            <Search className="w-3 h-3 text-zinc-600 absolute left-1.5 top-1.5" />
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-[#080808]">
        <table className="w-full text-[10.5px] font-mono border-collapse">
          <thead className="sticky top-0 bg-[#0e0e0e] border-b border-[#1a1a1a] z-10 shadow-sm">
            <tr className="text-zinc-500 text-left text-[9px] uppercase tracking-wider">
              <th className="px-2.5 py-1.5 font-normal">TIME</th>
              <th className="px-2 py-1.5 font-normal">RAIL</th>
              <th className="px-2.5 py-1.5 font-normal">MSG ID</th>
              <th className="px-2.5 py-1.5 font-normal">UETR</th>
              <th className="px-2.5 py-1.5 font-normal">PAIR</th>
              <th className="px-2.5 py-1.5 font-normal text-right">GROSS AMOUNT</th>
              <th className="px-2.5 py-1.5 font-normal">LANE / WOTS+</th>
              <th className="px-2.5 py-1.5 font-normal">SETTLEMENT TX</th>
              <th className="px-2.5 py-1.5 font-normal text-center">STATUS</th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-zinc-600 font-mono text-[11px]">
                  {rows.length === 0
                    ? "// No settlement transactions recorded yet. Raise an FDC3 StartPayment intent."
                    : "// No transactions match the selected filter."}
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[#141414] hover:bg-white/[0.02] transition-colors group"
              >
                <td className="px-2.5 py-1.5 text-zinc-500 whitespace-nowrap">{row.timestamp}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <span
                    className={`px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase border ${
                      row.rail?.includes("Trilateral")
                        ? "bg-amber-950/40 border-amber-500/60 text-amber-300"
                        : row.rail?.includes("XRPL")
                        ? "bg-emerald-950/40 border-emerald-500/60 text-emerald-300"
                        : "bg-sky-950/40 border-sky-500/60 text-sky-300"
                    }`}
                  >
                    {row.rail?.includes("Trilateral") ? "TRILATERAL" : row.rail?.includes("XRPL") ? "XRPL" : "SOLANA"}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-zinc-300 whitespace-nowrap">
                  <Tooltip content={row.msgId} copyable copyText={row.msgId}>
                    <span className="cursor-help hover:text-white transition-colors">
                      {row.msgId}
                    </span>
                  </Tooltip>
                </td>
                <td className="px-2.5 py-1.5 text-zinc-400 whitespace-nowrap">
                  <Tooltip content={row.uetr} copyable copyText={row.uetr}>
                    <span className="cursor-help underline underline-offset-2 decoration-zinc-700 hover:decoration-amber-400 transition-colors">
                      {row.uetr.slice(0, 8)}…
                    </span>
                  </Tooltip>
                </td>
                <td className="px-2.5 py-1.5 font-bold text-amber-400 whitespace-nowrap">{row.pair}</td>
                <td className="px-2.5 py-1.5 text-white font-semibold tabular-nums text-right whitespace-nowrap">
                  {row.amount}
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 text-[9px] bg-[#141414] border border-[#222] px-1 py-0.2">
                      L#{row.lane !== undefined ? row.lane : 14}
                    </span>
                    {row.wotsDigest && (
                      <Tooltip content={`WOTS+ Leaf Root: ${row.wotsDigest}`} copyable copyText={row.wotsDigest}>
                        <span className="cursor-help inline-flex items-center gap-0.5 text-sky-400 text-[8.5px]">
                          <Key className="w-2.5 h-2.5" />
                          <span>PQ</span>
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  {row.txSignature ? (
                    <div className="flex items-center gap-1.5">
                      <Tooltip content={`Settlement Ref: ${row.txSignature}`} copyable copyText={row.txSignature}>
                        <a
                          href={row.explorerUrl || row.solanaExplorerUrl || row.synapticExplorerUrl || row.xrplExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-zinc-300 hover:text-white font-mono text-[9.5px] group/link mr-0.5"
                        >
                          <span className="underline underline-offset-2 decoration-zinc-700 group-hover/link:decoration-amber-400">
                            {row.txSignature.slice(0, 5)}…{row.txSignature.slice(-5)}
                          </span>
                        </a>
                      </Tooltip>

                      {/* Rail shortcuts: Solana first, then SynapticChain, then XRPL */}
                      {row.solanaExplorerUrl && (
                        <Tooltip content="Inspect Token-2022 RequiredMemo on Solana Devnet">
                          <a
                            href={row.solanaExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-1 py-0.2 text-[8px] font-bold font-mono bg-sky-950/60 border border-sky-600/60 text-sky-300 hover:bg-sky-900 transition-colors rounded-none inline-flex items-center gap-0.5"
                          >
                            <span>SOL</span>
                            <ExternalLink className="w-2 h-2 opacity-70" />
                          </a>
                        </Tooltip>
                      )}

                      {row.synapticExplorerUrl && (
                        <Tooltip content={`Inspect Canonical State Root & Checkpoint #${row.checkpointHeight || 'Canonical'} on SynapticChain Explorer`}>
                          <a
                            href={row.synapticExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-1 py-0.2 text-[8px] font-bold font-mono bg-emerald-950/60 border border-emerald-600/60 text-emerald-300 hover:bg-emerald-900 transition-colors rounded-none inline-flex items-center gap-0.5"
                          >
                            <span>SYN</span>
                            <ExternalLink className="w-2 h-2 opacity-70" />
                          </a>
                        </Tooltip>
                      )}

                      {row.xrplExplorerUrl && (
                        <Tooltip content="Inspect SHAMap DENSE-16 Inclusion Proof on XRPL Altnet">
                          <a
                            href={row.xrplExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-1 py-0.2 text-[8px] font-bold font-mono bg-amber-950/60 border border-amber-600/60 text-amber-300 hover:bg-amber-900 transition-colors rounded-none inline-flex items-center gap-0.5"
                          >
                            <span>XRP</span>
                            <ExternalLink className="w-2 h-2 opacity-70" />
                          </a>
                        </Tooltip>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                  {row.status === "CONFIRMED" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-950/40 text-emerald-400 border border-emerald-900/60 text-[8.5px] font-bold">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      SETTLED
                    </span>
                  )}
                  {row.status === "PENDING" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 text-amber-400 border border-amber-900/60 text-[8.5px]">
                      <Clock className="w-2.5 h-2.5 animate-spin" />
                      IN FLIGHT
                    </span>
                  )}
                  {row.status === "FAILED" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-950/40 text-rose-400 border border-rose-900/60 text-[8.5px] font-bold">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      REJECTED
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

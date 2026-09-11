"use client";

import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { ExternalLink, Search, Filter, Activity, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import gsap from "gsap";

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
  status: "PENDING" | "CONFIRMED" | "FAILED";
}

interface OrderBlotterProps {
  rows: BlotterRow[];
}

export function OrderBlotter({ rows }: OrderBlotterProps) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "PENDING" | "FAILED">("ALL");

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
    const matchesSearch =
      searchTerm === "" ||
      r.pair.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.msgId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.uetr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.debtorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.creditorName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const confirmedCount = rows.filter((r) => r.status === "CONFIRMED").length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Blotter Top Bar */}
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0d0d0d]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-zinc-300 font-semibold tracking-widest uppercase">
              Settlement Blotter
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
        <div className="flex items-center gap-2">
          {/* Quick Status Filter Tabs */}
          <div className="flex border border-[#222] bg-[#111] text-[9px] font-mono">
            {(["ALL", "CONFIRMED", "PENDING", "FAILED"] as const).map((st) => (
              <button
                key={st}
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
              className="w-44 bg-[#111] border border-[#222] text-zinc-300 text-[10px] font-mono px-2 py-0.5 pl-6 focus:outline-none focus:border-amber-500/50 rounded-none placeholder:text-zinc-600 uppercase"
            />
            <Search className="w-3 h-3 text-zinc-600 absolute left-1.5 top-1.5" />
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-[#080808]">
        <table className="w-full text-[11px] font-mono border-collapse">
          <thead className="sticky top-0 bg-[#0e0e0e] border-b border-[#1a1a1a] z-10 shadow-sm">
            <tr className="text-zinc-500 text-left text-[9.5px] uppercase tracking-wider">
              <th className="px-3 py-1.5 font-normal">TIME</th>
              <th className="px-3 py-1.5 font-normal">MSG ID</th>
              <th className="px-3 py-1.5 font-normal">UETR</th>
              <th className="px-3 py-1.5 font-normal">PAIR</th>
              <th className="px-3 py-1.5 font-normal text-right">GROSS AMOUNT</th>
              <th className="px-3 py-1.5 font-normal">DEBTOR</th>
              <th className="px-3 py-1.5 font-normal">CREDITOR</th>
              <th className="px-3 py-1.5 font-normal">SOLANA TX</th>
              <th className="px-3 py-1.5 font-normal text-center">STATUS</th>
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
                <td className="px-3 py-1.5 text-zinc-500 whitespace-nowrap">{row.timestamp}</td>
                <td className="px-3 py-1.5 text-zinc-300 whitespace-nowrap">
                  <Tooltip content={row.msgId} copyable copyText={row.msgId}>
                    <span className="cursor-help hover:text-white transition-colors">
                      {row.msgId}
                    </span>
                  </Tooltip>
                </td>
                <td className="px-3 py-1.5 text-zinc-400 whitespace-nowrap">
                  <Tooltip content={row.uetr} copyable copyText={row.uetr}>
                    <span className="cursor-help underline underline-offset-2 decoration-zinc-700 hover:decoration-amber-400 transition-colors">
                      {row.uetr.slice(0, 10)}…
                    </span>
                  </Tooltip>
                </td>
                <td className="px-3 py-1.5 font-bold text-amber-400 whitespace-nowrap">{row.pair}</td>
                <td className="px-3 py-1.5 text-white font-semibold tabular-nums text-right whitespace-nowrap">
                  {row.amount}
                </td>
                <td className="px-3 py-1.5 text-zinc-400 truncate max-w-[130px] whitespace-nowrap">
                  {row.debtorName}
                </td>
                <td className="px-3 py-1.5 text-zinc-400 truncate max-w-[130px] whitespace-nowrap">
                  {row.creditorName}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {row.txSignature ? (
                    <Tooltip content={row.txSignature} copyable copyText={row.txSignature}>
                      <a
                        href={row.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 hover:text-sky-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{row.txSignature.slice(0, 8)}…</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                      </a>
                    </Tooltip>
                  ) : (
                    <span className="text-zinc-700">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-center whitespace-nowrap">
                  {row.status === "CONFIRMED" && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 px-1.5 py-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>CONFIRMED</span>
                    </span>
                  )}
                  {row.status === "PENDING" && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-400 bg-amber-950/40 border border-amber-900/60 px-1.5 py-0.5 animate-pulse">
                      <Clock className="w-2.5 h-2.5" />
                      <span>PENDING</span>
                    </span>
                  )}
                  {row.status === "FAILED" && (
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-rose-400 bg-rose-950/40 border border-rose-900/60 px-1.5 py-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>FAILED</span>
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

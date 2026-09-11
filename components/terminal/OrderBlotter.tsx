"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!tbodyRef.current) return;
    const newRow = tbodyRef.current.firstElementChild;
    if (newRow && rows.length > 0) {
      gsap.fromTo(
        newRow,
        { backgroundColor: "rgba(245,158,11,0.15)", opacity: 0.6 },
        { backgroundColor: "transparent", opacity: 1, duration: 1.2, ease: "power2.out" }
      );
    }
  }, [rows.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
          Settlement Blotter
        </span>
        <span className="text-[10px] font-mono text-zinc-600">
          {rows.length} TXN{rows.length !== 1 ? "S" : ""}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-[#0d0d0d] border-b border-[#1a1a1a]">
            <tr className="text-zinc-600 text-left">
              <th className="px-3 py-1.5 font-normal">TIME</th>
              <th className="px-3 py-1.5 font-normal">MSG ID</th>
              <th className="px-3 py-1.5 font-normal">PAIR</th>
              <th className="px-3 py-1.5 font-normal">AMOUNT</th>
              <th className="px-3 py-1.5 font-normal">DEBTOR</th>
              <th className="px-3 py-1.5 font-normal">CREDITOR</th>
              <th className="px-3 py-1.5 font-normal">SOL TX</th>
              <th className="px-3 py-1.5 font-normal">STATUS</th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-700">
                  No settlements yet. Raise an FDC3 StartPayment intent.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[#111] hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-3 py-1.5 text-zinc-500">{row.timestamp}</td>
                <td className="px-3 py-1.5 text-zinc-400">{row.msgId}</td>
                <td className="px-3 py-1.5 text-amber-400">{row.pair}</td>
                <td className="px-3 py-1.5 text-white tabular-nums">{row.amount}</td>
                <td className="px-3 py-1.5 text-zinc-400 truncate max-w-[100px]">{row.debtorName}</td>
                <td className="px-3 py-1.5 text-zinc-400 truncate max-w-[100px]">{row.creditorName}</td>
                <td className="px-3 py-1.5">
                  {row.txSignature ? (
                    <a
                      href={row.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                    >
                      {row.txSignature.slice(0, 8)}…
                    </a>
                  ) : (
                    <span className="text-zinc-700">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {row.status === "CONFIRMED" && (
                    <span className="text-emerald-400 font-semibold">● CONFIRMED</span>
                  )}
                  {row.status === "PENDING" && (
                    <span className="text-amber-400 animate-pulse">● PENDING</span>
                  )}
                  {row.status === "FAILED" && (
                    <span className="text-red-400">● FAILED</span>
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

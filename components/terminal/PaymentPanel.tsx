"use client";

import { useState, useRef, useEffect } from "react";
import { FX_PAIRS } from "@/lib/fdc3/intent-bridge";
import { buildPacs008, type Pacs008Result } from "@/lib/iso20022/pacs008-builder";
import gsap from "gsap";
import type { BlotterRow } from "./OrderBlotter";

interface PaymentPanelProps {
  onSettlement: (row: BlotterRow) => void;
}

export function PaymentPanel({ onSettlement }: PaymentPanelProps) {
  const [amount, setAmount] = useState("2500000");
  const [pair, setPair] = useState("USD/KES");
  const [debtorName, setDebtorName] = useState("Acme Treasury Desk");
  const [debtorAcct, setDebtorAcct] = useState("syn1qyz7g8v4r3t2u1x9w");
  const [creditorName, setCreditorName] = useState("Nairobi Reserve Bank");
  const [creditorAcct, setCreditorAcct] = useState("syn1qqy7x2w5r6t1u3v8");
  const [pacs, setPacs] = useState<Pacs008Result | null>(null);
  const [status, setStatus] = useState<"idle" | "building" | "settling" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const xmlRef = useRef<HTMLPreElement>(null);

  const selectedPair = FX_PAIRS.find((p) => p.pair === pair) ?? FX_PAIRS[0];

  const handleRaiseIntent = async () => {
    setStatus("building");
    setErrorMsg("");

    // Step 1: Build pacs.008
    const result = buildPacs008({
      amount: parseFloat(amount),
      currency: pair.split("/")[0],
      debtorName,
      debtorAccount: debtorAcct,
      creditorName,
      creditorAccount: creditorAcct,
    });
    setPacs(result);

    // GSAP typewriter flash on XML panel
    if (xmlRef.current) {
      gsap.fromTo(xmlRef.current, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" });
    }

    // Step 2: Call server action to settle on Solana devnet
    setStatus("settling");
    try {
      const resp = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uetr: result.uetr, amount: parseFloat(amount) }),
      });
      const data = await resp.json();

      const blotterRow: BlotterRow = {
        id: result.uetr,
        timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        msgId: result.msgId,
        uetr: result.uetr,
        pair,
        amount: `${parseFloat(amount).toLocaleString()} ${pair.split("/")[0]}`,
        debtorName,
        creditorName,
        txSignature: data.txSignature ?? "",
        explorerUrl: data.explorerUrl ?? "",
        status: data.error ? "FAILED" : "CONFIRMED",
      };

      onSettlement(blotterRow);
      setStatus("done");

      // Re-build pacs.008 with tx sig embedded
      if (data.txSignature) {
        const updated = buildPacs008({
          amount: parseFloat(amount),
          currency: pair.split("/")[0],
          debtorName,
          debtorAccount: debtorAcct,
          creditorName,
          creditorAccount: creditorAcct,
          solanaTxSignature: data.txSignature,
        });
        setPacs(updated);
      }
    } catch {
      setStatus("error");
      setErrorMsg("Devnet RPC error — airdrop may be needed");
    }
  };

  return (
    <div className="flex h-full gap-0 divide-x divide-[#1a1a1a]">
      {/* LEFT: Input form */}
      <div className="w-72 shrink-0 flex flex-col">
        <div className="px-3 py-1.5 border-b border-[#1a1a1a]">
          <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
            FDC3 StartPayment
          </span>
        </div>
        <div className="flex-1 p-3 flex flex-col gap-3 overflow-auto">
          <Field label="FX Pair">
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="w-full bg-[#111] border border-[#222] text-white text-[12px] font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500/50"
            >
              {FX_PAIRS.map((p) => (
                <option key={p.pair} value={p.pair}>{p.pair} — {p.rate}</option>
              ))}
            </select>
          </Field>

          <Field label={`Amount (${pair.split("/")[0]})`}>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-[#111] border border-[#222] text-white text-[12px] font-mono px-2 py-1.5 rounded-sm focus:outline-none focus:border-amber-500/50 tabular-nums"
            />
          </Field>

          <div className="text-[11px] font-mono text-zinc-600 border border-[#1a1a1a] p-2 space-y-1">
            <div className="flex justify-between">
              <span>Rate</span>
              <span className="text-zinc-400">{selectedPair.rate}</span>
            </div>
            <div className="flex justify-between">
              <span>Receive</span>
              <span className="text-amber-400">{(parseFloat(amount || "0") * selectedPair.rate).toLocaleString()} {pair.split("/")[1]}</span>
            </div>
            <div className="flex justify-between">
              <span>TSA (0.50%)</span>
              <span className="text-red-400">−{(parseFloat(amount || "0") * 0.005).toLocaleString()}</span>
            </div>
          </div>

          <Field label="Debtor Name">
            <input value={debtorName} onChange={(e) => setDebtorName(e.target.value)} className="w-full bg-[#111] border border-[#222] text-white text-[12px] font-mono px-2 py-1.5 rounded-sm focus:outline-none" />
          </Field>
          <Field label="Debtor Account">
            <input value={debtorAcct} onChange={(e) => setDebtorAcct(e.target.value)} className="w-full bg-[#111] border border-[#222] text-zinc-400 text-[11px] font-mono px-2 py-1.5 rounded-sm focus:outline-none" />
          </Field>
          <Field label="Creditor Name">
            <input value={creditorName} onChange={(e) => setCreditorName(e.target.value)} className="w-full bg-[#111] border border-[#222] text-white text-[12px] font-mono px-2 py-1.5 rounded-sm focus:outline-none" />
          </Field>
          <Field label="Creditor Account">
            <input value={creditorAcct} onChange={(e) => setCreditorAcct(e.target.value)} className="w-full bg-[#111] border border-[#222] text-zinc-400 text-[11px] font-mono px-2 py-1.5 rounded-sm focus:outline-none" />
          </Field>

          <button
            onClick={handleRaiseIntent}
            disabled={status === "building" || status === "settling"}
            className="w-full mt-auto py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-900 disabled:cursor-not-allowed text-black font-mono text-[12px] font-bold tracking-widest uppercase transition-colors"
          >
            {status === "building" && "BUILDING pacs.008…"}
            {status === "settling" && "SETTLING ON SOLANA…"}
            {status === "done" && "✓ SETTLED — RAISE AGAIN"}
            {status === "error" && "RETRY INTENT"}
            {status === "idle" && "RAISE FDC3 STARTPAYMENT"}
          </button>
          {errorMsg && <p className="text-red-400 text-[10px] font-mono">{errorMsg}</p>}
        </div>
      </div>

      {/* MIDDLE: pacs.008 XML inspector */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 py-1.5 border-b border-[#1a1a1a] flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
            ISO 20022 pacs.008.001.08
          </span>
          {pacs && (
            <span className="text-[10px] font-mono text-emerald-500">✓ CBPR+ VALID</span>
          )}
        </div>
        <div className="flex-1 overflow-auto p-3">
          {!pacs ? (
            <p className="text-zinc-700 text-[11px] font-mono">
              {"// Raise an intent to generate the pacs.008 XML"}
            </p>
          ) : (
            <pre
              ref={xmlRef}
              className="text-[10px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed"
            >
              <XmlHighlight xml={pacs.xml} />
            </pre>
          )}
        </div>
        {pacs && (
          <div className="border-t border-[#1a1a1a] px-3 py-1.5 flex gap-4 text-[10px] font-mono">
            <span className="text-zinc-600">UETR <span className="text-zinc-400">{pacs.uetr.slice(0, 18)}…</span></span>
            <span className="text-zinc-600">TSA <span className="text-red-400">−{pacs.tsaDeduction.toLocaleString()}</span></span>
            <span className="text-zinc-600">NET <span className="text-emerald-400">{pacs.netAmount.toLocaleString()}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-mono text-zinc-600 tracking-wider uppercase">{label}</label>
      {children}
    </div>
  );
}

function XmlHighlight({ xml }: { xml: string }) {
  const highlighted = xml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/(&lt;\/?[\w.]+)/g, '<span style="color:#60a5fa">$1</span>')
    .replace(/(&gt;)/g, '<span style="color:#60a5fa">$1</span>')
    .replace(/"([^"]+)"/g, '"<span style="color:#fbbf24">$1</span>"')
    .replace(/(\d{4}-\d{2}-\d{2}T[\d:.Z]+)/g, '<span style="color:#34d399">$1</span>');

  return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
}

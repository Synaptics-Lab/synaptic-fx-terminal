"use client";

import { useState, useRef } from "react";
import { FX_PAIRS, type PaymentContext, fdc3Bridge } from "@/lib/fdc3/intent-bridge";
import { buildPacs008, type Pacs008Result } from "@/lib/iso20022/pacs008-builder";
import { InstitutionalSelect } from "@/components/ui/Select";
import { ConfirmationDialog } from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { Copy, Check, ExternalLink, Zap, Info } from "lucide-react";
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
  const [status, setStatus] = useState<"idle" | "review" | "building" | "settling" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedXml, setCopiedXml] = useState(false);
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);
  const [lastExplorerUrl, setLastExplorerUrl] = useState<string | null>(null);
  const xmlRef = useRef<HTMLPreElement>(null);

  const selectedPair = FX_PAIRS.find((p) => p.pair === pair) ?? FX_PAIRS[0];
  const numAmount = parseFloat(amount || "0");
  const receiveAmount = numAmount * selectedPair.rate;
  const tsaFee = numAmount * 0.005;
  const netAmount = numAmount - tsaFee;

  const handleOpenReview = () => {
    if (numAmount <= 0) {
      setErrorMsg("Amount must be greater than zero");
      return;
    }
    setErrorMsg("");
    setStatus("review");
  };

  const handleExecuteSettlement = async () => {
    setStatus("building");

    // 1. Build ISO 20022 pacs.008 Customer Credit Transfer
    const result = buildPacs008({
      amount: numAmount,
      currency: pair.split("/")[0],
      debtorName,
      debtorAccount: debtorAcct,
      creditorName,
      creditorAccount: creditorAcct,
    });
    setPacs(result);

    // 2. Emit FDC3 3.0 StartPayment Intent
    const fdc3Context: PaymentContext = {
      type: "fdc3.paymentContext",
      id: { UETR: result.uetr },
      amount: numAmount,
      currency: pair.split("/")[0],
      debtor: { name: debtorName, account: debtorAcct },
      creditor: { name: creditorName, account: creditorAcct },
      networkRouting: {
        rail: "Solana Token-2022",
        signatureType: "Ed25519",
        laneId: "corridor-african-settlement",
      },
    };
    fdc3Bridge.raiseIntent(fdc3Context);

    // Flash GSAP effect on XML inspector
    if (xmlRef.current) {
      gsap.fromTo(
        xmlRef.current,
        { opacity: 0.2, filter: "brightness(2)" },
        { opacity: 1, filter: "brightness(1)", duration: 0.5, ease: "power2.out" }
      );
    }

    // 3. Dispatch on-chain Token-2022 memo settlement on Solana Devnet
    setStatus("settling");
    try {
      const resp = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uetr: result.uetr, amount: numAmount }),
      });
      const data = await resp.json();

      if (data.error && !data.txSignature) {
        throw new Error(data.error);
      }

      setLastTxSig(data.txSignature || null);
      setLastExplorerUrl(data.explorerUrl || null);

      const blotterRow: BlotterRow = {
        id: result.uetr,
        timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        msgId: result.msgId,
        uetr: result.uetr,
        pair,
        amount: `${numAmount.toLocaleString()} ${pair.split("/")[0]}`,
        debtorName,
        creditorName,
        txSignature: data.txSignature ?? "",
        explorerUrl: data.explorerUrl ?? "",
        status: data.error ? "FAILED" : "CONFIRMED",
      };

      onSettlement(blotterRow);
      setStatus("done");

      // Re-embed Solana Tx Signature into canonical pacs.008 XML
      if (data.txSignature) {
        const updated = buildPacs008({
          amount: numAmount,
          currency: pair.split("/")[0],
          debtorName,
          debtorAccount: debtorAcct,
          creditorName,
          creditorAccount: creditorAcct,
          solanaTxSignature: data.txSignature,
        });
        setPacs(updated);
      }
    } catch (err) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Devnet settlement failed";
      setErrorMsg(msg);
    }
  };

  const copyXml = () => {
    if (!pacs) return;
    navigator.clipboard.writeText(pacs.xml);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 1500);
  };

  return (
    <div className="flex h-full gap-0 divide-x divide-[#1a1a1a]">
      {/* LEFT: Input Form */}
      <div className="w-80 shrink-0 flex flex-col bg-[#0a0a0a]">
        <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] font-mono text-zinc-300 font-semibold tracking-widest uppercase">
              FDC3 StartPayment
            </span>
          </div>
          <span className="text-[9px] font-mono text-zinc-500 uppercase">
            INTENT DISPATCHER
          </span>
        </div>

        <div className="flex-1 p-3 flex flex-col gap-2.5 overflow-y-auto">
          {/* Quick Corridor Selection Buttons */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[9px] font-mono text-zinc-500 tracking-wider uppercase">
                Corridor Preset
              </label>
              <span className="text-[9px] font-mono text-zinc-600">HOTKEYS 1-4</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {["USD/KES", "USD/NGN", "USD/TZS", "USD/ZAR"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPair(p)}
                  className={`py-1 text-[10px] font-mono border rounded-none uppercase transition-colors ${
                    pair === p
                      ? "bg-amber-500/10 border-amber-500/50 text-amber-300"
                      : "bg-[#111] border-[#222] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p.split("/")[1]}
                </button>
              ))}
            </div>
          </div>

          <Field label="FX Pair">
            <InstitutionalSelect
              options={FX_PAIRS}
              value={pair}
              onChange={setPair}
            />
          </Field>

          <Field label={`Gross Amount (${pair.split("/")[0]})`}>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-[#111111] border border-[#222222] text-white text-[12px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-amber-500/60 tabular-nums"
                placeholder="0.00"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] font-mono text-zinc-500">
                {pair.split("/")[0]}
              </span>
            </div>
          </Field>

          {/* Pricing & Fee Breakdown Card */}
          <div className="text-[10px] font-mono bg-[#0f0f0f] border border-[#1e1e1e] p-2 space-y-1 rounded-none">
            <div className="flex justify-between text-zinc-400">
              <span>Spot Rate</span>
              <span className="text-zinc-200 font-semibold tabular-nums">
                {selectedPair.rate.toFixed(selectedPair.rate > 100 ? 2 : 4)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <div className="flex items-center gap-1">
                <span>Receive Est.</span>
              </div>
              <span className="text-amber-400 font-bold tabular-nums">
                {receiveAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                {pair.split("/")[1]}
              </span>
            </div>
            <div className="flex justify-between text-zinc-500 pt-1 border-t border-[#1a1a1a]">
              <Tooltip content="Treasury Single Account 0.50% statutory deduction">
                <span className="cursor-help flex items-center gap-1 text-zinc-400">
                  TSA Levy (0.50%) <Info className="w-2.5 h-2.5 text-zinc-500" />
                </span>
              </Tooltip>
              <span className="text-rose-400 tabular-nums">
                −{tsaFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Net Settlement</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                {pair.split("/")[0]}
              </span>
            </div>
          </div>

          <Field label="Debtor Entity (Sender)">
            <input
              value={debtorName}
              onChange={(e) => setDebtorName(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-200 text-[11px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>
          <Field label="Debtor L1 Account">
            <input
              value={debtorAcct}
              onChange={(e) => setDebtorAcct(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-400 text-[10px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>
          <Field label="Creditor Entity (Receiver)">
            <input
              value={creditorName}
              onChange={(e) => setCreditorName(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-200 text-[11px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>
          <Field label="Creditor L1 Account">
            <input
              value={creditorAcct}
              onChange={(e) => setCreditorAcct(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-400 text-[10px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>

          <button
            onClick={handleOpenReview}
            disabled={status === "building" || status === "settling"}
            className="w-full mt-2 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-950 disabled:text-zinc-600 disabled:cursor-not-allowed text-black font-mono text-[11px] font-bold tracking-widest uppercase transition-all rounded-none shadow-lg shadow-amber-500/10 active:translate-y-0.5"
          >
            {status === "building" && "BUILDING pacs.008…"}
            {status === "settling" && "SETTLING ON SOLANA…"}
            {status === "done" && "✓ SETTLED — DISPATCH NEW INTENT"}
            {status === "error" && "RETRY INTENT"}
            {status === "idle" && "RAISE FDC3 STARTPAYMENT"}
          </button>

          {errorMsg && (
            <div className="p-2 bg-rose-950/40 border border-rose-800 text-rose-300 text-[10px] font-mono rounded-none">
              {errorMsg}
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE: ISO 20022 pacs.008 XML Inspector */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
        <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0d0d0d]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-400 font-semibold tracking-widest uppercase">
              ISO 20022 pacs.008.001.08
            </span>
            <span className="text-[9px] font-mono text-zinc-600">|</span>
            <span className="text-[9px] font-mono text-zinc-500">
              CBPR+ Financial Messaging Standard
            </span>
          </div>

          <div className="flex items-center gap-3">
            {pacs && (
              <>
                <button
                  onClick={copyXml}
                  className="text-[9px] font-mono text-zinc-400 hover:text-amber-400 flex items-center gap-1 border border-[#222] px-2 py-0.5 rounded-none bg-[#111] transition-colors"
                >
                  {copiedXml ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>COPIED</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>COPY XML</span>
                    </>
                  )}
                </button>
                <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-1.5 py-0.5 rounded-none font-semibold">
                  ● CBPR+ VALID
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 bg-[#080808]">
          {!pacs ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 font-mono">
              <div className="w-8 h-8 border border-dashed border-zinc-700 flex items-center justify-center mb-2">
                <span className="text-zinc-500">XML</span>
              </div>
              <p className="text-[11px] text-zinc-500 mb-1">
                No active ISO 20022 pacs.008 payload generated
              </p>
              <p className="text-[10px] text-zinc-700 max-w-sm">
                Click &ldquo;RAISE FDC3 STARTPAYMENT&rdquo; to construct the CBPR+ compliant
                credit transfer payload with cryptographically embedded UETR and Solana Token-2022 memo instruction.
              </p>
            </div>
          ) : (
            <pre
              ref={xmlRef}
              className="text-[10.5px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed selection:bg-amber-500/20"
            >
              <XmlHighlight xml={pacs.xml} />
            </pre>
          )}
        </div>

        {/* Footer Metrics Bar */}
        {pacs && (
          <div className="border-t border-[#1a1a1a] px-3 py-2 bg-[#0c0c0c] flex items-center justify-between text-[10px] font-mono">
            <div className="flex items-center gap-4">
              <Tooltip content={pacs.uetr} copyable copyText={pacs.uetr}>
                <span className="text-zinc-500 cursor-help">
                  UETR: <span className="text-zinc-300 underline underline-offset-2">{pacs.uetr.slice(0, 16)}…</span>
                </span>
              </Tooltip>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">
                TSA: <span className="text-rose-400">−{pacs.tsaDeduction.toLocaleString()}</span>
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">
                NET: <span className="text-emerald-400 font-bold">{pacs.netAmount.toLocaleString()}</span>
              </span>
            </div>

            {lastExplorerUrl && (
              <a
                href={lastExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2"
              >
                <span>SOLANA DEVNET RECEIPT</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationDialog
        isOpen={status === "review"}
        onClose={() => setStatus("idle")}
        onConfirm={handleExecuteSettlement}
        title="CONFIRM FDC3 STARTPAYMENT DISPATCH"
        subtitle="INSTITUTIONAL SETTLEMENT ORDER REVIEW"
        confirmLabel="AUTHORIZE & SETTLE ON SOLANA"
      >
        <div className="border border-[#1e1e1e] bg-[#0c0c0c] p-3 space-y-2">
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Intent Contract:</span>
            <span className="text-amber-400 font-bold">FDC3 3.0 StartPayment</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Payload Standard:</span>
            <span className="text-zinc-300">ISO 20022 pacs.008.001.08</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Settlement Rail:</span>
            <span className="text-zinc-300">Solana Devnet (Token-2022 Memo)</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Currency Pair:</span>
            <span className="text-white font-bold">{pair} @ {selectedPair.rate}</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Gross Amount:</span>
            <span className="text-white font-bold tabular-nums">
              {numAmount.toLocaleString()} {pair.split("/")[0]}
            </span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Statutory TSA Levy (0.50%):</span>
            <span className="text-rose-400 tabular-nums">
              −{tsaFee.toLocaleString()} {pair.split("/")[0]}
            </span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Net Creditor Payout:</span>
            <span className="text-emerald-400 font-bold tabular-nums">
              {netAmount.toLocaleString()} {pair.split("/")[0]} (≈ {receiveAmount.toLocaleString()} {pair.split("/")[1]})
            </span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-zinc-500 uppercase">Debtor Entity:</span>
            <span className="text-zinc-300">{debtorName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 uppercase">Creditor Entity:</span>
            <span className="text-zinc-300">{creditorName}</span>
          </div>
        </div>
      </ConfirmationDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-mono text-zinc-500 tracking-wider uppercase">
        {label}
      </label>
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

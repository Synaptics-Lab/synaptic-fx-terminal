"use client";

import { useState, useRef } from "react";
import { FX_PAIRS, type PaymentContext, fdc3Bridge } from "@/lib/fdc3/intent-bridge";
import {
  buildInstitutionalPacs008,
  validateCBPRPlus,
  type FDC3Channel,
} from "@/lib/connector/solana-finos-bridge";
import { InstitutionalSelect } from "@/components/ui/Select";
import { ConfirmationDialog } from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { XmlViewer } from "./XmlViewer";
import {
  Copy,
  Check,
  ExternalLink,
  Zap,
  Info,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import gsap from "gsap";
import type { BlotterRow } from "./OrderBlotter";

interface PaymentPanelProps {
  onSettlement: (row: BlotterRow) => void;
}

const AMOUNT_PRESETS = [
  { label: "$1M", val: "1000000" },
  { label: "$2.5M", val: "2500000" },
  { label: "$5M", val: "5000000" },
  { label: "$10M", val: "10000000" },
  { label: "$25M", val: "25000000" },
];

interface FDC3DeskConfig {
  id: FDC3Channel;
  label: string;
  name: string;
  role: string;
  debtor: string;
  creditor: string;
  defaultPair: string;
  defaultAmount: string;
  badgeClass: string;
  buttonClass: string;
}

const FDC3_DESK_CONFIGS: Record<FDC3Channel, FDC3DeskConfig> = {
  global: {
    id: "global",
    label: "GLOBAL",
    name: "General FX Floor",
    role: "Floor-Wide Broadcast",
    debtor: "Corporate Treasury Desk",
    creditor: "Institutional Liquidity Desk",
    defaultPair: "USD/KES",
    defaultAmount: "2500000",
    badgeClass: "text-amber-400 bg-amber-950/40 border-amber-800",
    buttonClass: "bg-amber-400 text-black font-bold",
  },
  red: {
    id: "red",
    label: "RED",
    name: "Autonomous AI Agent Desk",
    role: "Algo AI Agent Lane (HFT)",
    debtor: "Artemis AI Treasury Agent #042",
    creditor: "Solana Automated Liquidity Vault",
    defaultPair: "USD/KES",
    defaultAmount: "1000000",
    badgeClass: "text-rose-400 bg-rose-950/40 border-rose-800",
    buttonClass: "bg-rose-500 text-white font-bold",
  },
  green: {
    id: "green",
    label: "GREEN",
    name: "Corporate Treasury Desk",
    role: "Multi-Million Bulk Settlement",
    debtor: "Global Corporate Treasury Desk",
    creditor: "Tier-1 Liquidity Provider Desk",
    defaultPair: "EUR/USD",
    defaultAmount: "25000000",
    badgeClass: "text-emerald-400 bg-emerald-950/40 border-emerald-800",
    buttonClass: "bg-emerald-500 text-black font-bold",
  },
  blue: {
    id: "blue",
    label: "BLUE",
    name: "Sovereign Clearing Desk",
    role: "Central Bank DPI (ZMW Corridor)",
    debtor: "Sovereign DPI Settlement Node",
    creditor: "Central Bank TSA Clearing Vault",
    defaultPair: "USD/ZMW",
    defaultAmount: "5000000",
    badgeClass: "text-sky-400 bg-sky-950/40 border-sky-800",
    buttonClass: "bg-sky-500 text-black font-bold",
  },
};

export function PaymentPanel({ onSettlement }: PaymentPanelProps) {
  const [amount, setAmount] = useState("2500000");
  const [pair, setPair] = useState("USD/KES");
  const [channel, setChannel] = useState<FDC3Channel>("global");
  const [debtorName, setDebtorName] = useState("Corporate Treasury Desk");
  const [debtorAcct, setDebtorAcct] = useState("4cghWNxgU73yh1SuRK1juQzt8EaKtC8HWGq2yK4jLmeG");
  const [creditorName, setCreditorName] = useState("Institutional Liquidity Desk");
  const [creditorAcct, setCreditorAcct] = useState("BnuCTFWFLLXnSPv2Frs42royiTAYG87WP7p1zRLB4ksG");
  const [pacsXml, setPacsXml] = useState<string | null>(null);
  const [currentUetr, setCurrentUetr] = useState<string>("");
  const [currentMsgId, setCurrentMsgId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "review" | "building" | "settling" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedXml, setCopiedXml] = useState(false);
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);
  const [lastExplorerUrl, setLastExplorerUrl] = useState<string | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const xmlRef = useRef<HTMLDivElement>(null);

  const selectedPair = FX_PAIRS.find((p) => p.pair === pair) ?? FX_PAIRS[0];
  const numAmount = parseFloat(amount || "0");
  const receiveAmount = numAmount * selectedPair.rate;
  const tsaFee = numAmount * 0.005;
  const netAmount = numAmount - tsaFee;

  // Validation
  const cbprCheck = pacsXml ? validateCBPRPlus(pacsXml) : null;

  const activeDesk = FDC3_DESK_CONFIGS[channel] || FDC3_DESK_CONFIGS.global;

  const switchChannel = (newCh: FDC3Channel) => {
    setChannel(newCh);
    const cfg = FDC3_DESK_CONFIGS[newCh];
    setDebtorName(cfg.debtor);
    setCreditorName(cfg.creditor);
    setPair(cfg.defaultPair);
    setAmount(cfg.defaultAmount);
  };

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

    // 1. Generate SWIFT UETR & MsgId
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    const randStr = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");
    const msgId = `SYN-FINOS-${dateStr}-${randStr}`;

    const uetr = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

    setCurrentUetr(uetr);
    setCurrentMsgId(msgId);

    // 2. Build ISO 20022 pacs.008 Customer Credit Transfer
    const initialXml = buildInstitutionalPacs008(
      {
        type: "fdc3.paymentContext",
        amount: numAmount,
        currency: pair.split("/")[0],
        pair,
        rate: selectedPair.rate,
        debtor: { name: debtorName, account: debtorAcct },
        creditor: { name: creditorName, account: creditorAcct },
      },
      uetr,
      msgId
    );
    setPacsXml(initialXml);

    // 3. Emit FDC3 3.0 StartPayment Intent to desktop bridge
    const fdc3Context: PaymentContext = {
      type: "fdc3.paymentContext",
      id: { UETR: uetr },
      amount: numAmount,
      currency: pair.split("/")[0],
      debtor: { name: debtorName, account: debtorAcct },
      creditor: { name: creditorName, account: creditorAcct },
      networkRouting: {
        rail: "Solana Token-2022",
        signatureType: "Ed25519",
        laneId: `corridor-${pair.toLowerCase().replace("/", "-")}`,
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

    // 4. Dispatch on-chain Token-2022 memo settlement on Solana Devnet
    setStatus("settling");
    try {
      const resp = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uetr,
          amount: numAmount,
          msgId,
          pair,
          rate: selectedPair.rate,
          channel,
          debtorName,
          debtorAcct,
          creditorName,
          creditorAcct,
        }),
      });
      const data = await resp.json();

      if (data.error && !data.txSignature) {
        throw new Error(data.error);
      }

      setLastTxSig(data.txSignature || null);
      setLastExplorerUrl(data.explorerUrl || null);

      const blotterRow: BlotterRow = {
        id: uetr,
        timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        msgId,
        uetr,
        pair,
        amount: `${numAmount.toLocaleString()} ${pair.split("/")[0]}`,
        debtorName,
        creditorName,
        txSignature: data.txSignature ?? "",
        explorerUrl: data.explorerUrl ?? "",
        status: data.error ? "FAILED" : "CONFIRMED",
        channel,
      };

      onSettlement(blotterRow);
      setStatus("done");

      // Re-embed Solana Tx Signature into canonical pacs.008 XML
      if (data.txSignature) {
        const updatedXml = buildInstitutionalPacs008(
          {
            type: "fdc3.paymentContext",
            amount: numAmount,
            currency: pair.split("/")[0],
            pair,
            rate: selectedPair.rate,
            debtor: { name: debtorName, account: debtorAcct },
            creditor: { name: creditorName, account: creditorAcct },
          },
          uetr,
          msgId,
          data.txSignature
        );
        setPacsXml(updatedXml);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setErrorMsg(msg);
    }
  };

  const copyXml = () => {
    if (!pacsXml) return;
    navigator.clipboard.writeText(pacsXml);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 1500);
  };

  return (
    <div className="flex h-full gap-0 divide-x divide-[#1a1a1a]">
      {/* LEFT: Input Form */}
      <div className="w-80 shrink-0 flex flex-col bg-[#0a0a0a]">
        {/* Panel Header */}
        <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0c0c0c] gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] font-mono text-zinc-200 font-semibold tracking-widest uppercase truncate">
              FDC3 StartPayment
            </span>
          </div>

          {/* Interactive FDC3 Channel Switcher */}
          <div className="flex items-center gap-0.5 bg-[#141414] border border-[#222] p-0.5 shrink-0">
            <span className="text-[8px] font-mono text-zinc-500 px-1 uppercase tracking-wider">CH:</span>
            {(["global", "red", "green", "blue"] as FDC3Channel[]).map((ch) => {
              const cfg = FDC3_DESK_CONFIGS[ch];
              const isActive = channel === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => switchChannel(ch)}
                  title={`Switch to ${cfg.name} (${cfg.role})`}
                  className={`px-1.5 py-0.5 text-[8.5px] font-mono font-bold uppercase transition-all ${
                    isActive ? cfg.buttonClass : "text-zinc-500 hover:text-zinc-300 bg-transparent"
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Desk Telemetry Readout */}
        <div className={`px-3 py-1 border-b flex items-center justify-between text-[9px] font-mono ${activeDesk.badgeClass}`}>
          <div className="flex items-center gap-1.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
            <span className="font-bold uppercase truncate">{activeDesk.name}</span>
          </div>
          <span className="text-[8px] opacity-80 uppercase shrink-0">{activeDesk.role}</span>
        </div>

        <div className="flex-1 p-3 flex flex-col gap-2 overflow-y-auto">
          {/* Corridor Selection Buttons */}
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
                      ? "bg-amber-500/10 border-amber-500/50 text-amber-300 font-bold"
                      : "bg-[#111] border-[#222] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p.split("/")[1]}
                </button>
              ))}
            </div>
          </div>

          <Field label="FX Pair">
            <InstitutionalSelect options={FX_PAIRS} value={pair} onChange={setPair} />
          </Field>

          {/* Amount and Multi-Million Dollar Presets */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-[9px] font-mono text-zinc-500 tracking-wider uppercase">
                Gross Amount ({pair.split("/")[0]})
              </label>
              <div className="flex gap-1">
                {AMOUNT_PRESETS.map((pst) => (
                  <button
                    key={pst.val}
                    type="button"
                    onClick={() => setAmount(pst.val)}
                    className={`px-1 py-0.2 text-[8.5px] font-mono border transition-colors ${
                      amount === pst.val
                        ? "bg-amber-400 text-black font-bold border-amber-400"
                        : "bg-[#141414] border-[#222] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {pst.label}
                  </button>
                ))}
              </div>
            </div>
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
          </div>

          {/* Pricing & Fee Breakdown Card */}
          <div className="text-[10px] font-mono bg-[#0f0f0f] border border-[#1e1e1e] p-2 space-y-1 rounded-none">
            <div className="flex justify-between text-zinc-400">
              <span>Spot Rate</span>
              <span className="text-zinc-200 font-semibold tabular-nums">
                {selectedPair.rate.toFixed(selectedPair.rate > 100 ? 2 : 4)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Receive Est.</span>
              <span className="text-amber-400 font-bold tabular-nums">
                {receiveAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                {pair.split("/")[1]}
              </span>
            </div>
            <div className="flex justify-between text-zinc-500 pt-1 border-t border-[#1a1a1a]">
              <Tooltip content="Treasury Single Account 0.50% statutory deduction for Central Bank Reserve">
                <span className="cursor-help flex items-center gap-1 text-zinc-400">
                  TSA Levy (0.50%) <Info className="w-2.5 h-2.5 text-zinc-500" />
                </span>
              </Tooltip>
              <span className="text-rose-400 tabular-nums">
                −{tsaFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Net Creditor Settlement</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                {pair.split("/")[0]}
              </span>
            </div>
          </div>

          <Field label="Debtor Entity (Corporate Treasury)">
            <input
              value={debtorName}
              onChange={(e) => setDebtorName(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-200 text-[10.5px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>
          <Field label="Debtor Token-2022 ATA (Treasury Desk)">
            <input
              value={debtorAcct}
              onChange={(e) => setDebtorAcct(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-400 text-[10px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>
          <Field label="Creditor Entity (Reserve Bank / Institutional Desk)">
            <input
              value={creditorName}
              onChange={(e) => setCreditorName(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-200 text-[10.5px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>
          <Field label="Creditor Token-2022 Account (RequiredMemoTransfers Guard)">
            <input
              value={creditorAcct}
              onChange={(e) => setCreditorAcct(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-400 text-[10px] font-mono px-2.5 py-1.5 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>

          <button
            onClick={handleOpenReview}
            disabled={status === "building" || status === "settling"}
            className="w-full mt-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-950 disabled:text-zinc-600 disabled:cursor-not-allowed text-black font-mono text-[11px] font-bold tracking-widest uppercase transition-all rounded-none shadow-lg shadow-amber-500/10 active:translate-y-0.5"
          >
            {status === "building" && "BUILDING pacs.008…"}
            {status === "settling" && "SETTLING ON SOLANA TOKEN-2022…"}
            {status === "done" && "✓ SETTLED — DISPATCH NEW TRADE"}
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
              CBPR+ Financial Messaging Standard (v3.0)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {pacsXml && (
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

                {cbprCheck && (
                  <button
                    onClick={() => setShowValidationModal(!showValidationModal)}
                    className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2 py-0.5 rounded-none font-semibold flex items-center gap-1 hover:border-emerald-600"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>{cbprCheck.checkedElements}/14 CBPR+ COMPLIANT</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 bg-[#080808]">
          {!pacsXml ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600 font-mono">
              <div className="w-10 h-10 border border-dashed border-zinc-700 flex items-center justify-center mb-2">
                <span className="text-zinc-500 text-[11px] font-bold">XML</span>
              </div>
              <p className="text-[11px] text-zinc-400 font-semibold mb-1">
                Awaiting FDC3 StartPayment Intent
              </p>
              <p className="text-[10px] text-zinc-600 max-w-md">
                Raise an intent from the left panel to execute the IBM_BOB FINOS connector pipeline:
                constructs the ISO 20022 pacs.008 XML envelope, enforces 14-point CBPR+ compliance,
                and executes atomic settlement via Solana Token-2022 MemoTransfer.
              </p>
            </div>
          ) : (
            <div ref={xmlRef} className="overflow-x-auto">
              <XmlViewer xml={pacsXml} />
            </div>
          )}
        </div>

        {/* Footer Metrics Bar */}
        {pacsXml && (
          <div className="border-t border-[#1a1a1a] px-3 py-2 bg-[#0c0c0c] flex items-center justify-between text-[10px] font-mono">
            <div className="flex items-center gap-4">
              <Tooltip content={currentUetr} copyable copyText={currentUetr}>
                <span className="text-zinc-500 cursor-help">
                  UETR: <span className="text-zinc-300 underline underline-offset-2">{currentUetr.slice(0, 16)}…</span>
                </span>
              </Tooltip>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">
                TSA LEVY: <span className="text-rose-400">−{tsaFee.toLocaleString()}</span>
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">
                NET PAYOUT: <span className="text-emerald-400 font-bold">{netAmount.toLocaleString()}</span>
              </span>
            </div>

            {lastExplorerUrl && (
              <a
                href={lastExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2"
              >
                <span>SOLANA DEVNET TRANSACTION</span>
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
        subtitle="INSTITUTIONAL CORPORATE TREASURY DESK REVIEW"
        confirmLabel="AUTHORIZE & SETTLE ON SOLANA TOKEN-2022"
      >
        <div className="border border-[#1e1e1e] bg-[#0c0c0c] p-3 space-y-2 text-[10.5px]">
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">FDC3 Intent:</span>
            <span className="text-amber-400 font-bold">StartPayment (fdc3.paymentContext)</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">FDC3 Channel:</span>
            <span className="text-white uppercase font-semibold">{channel} channel</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Messaging Standard:</span>
            <span className="text-zinc-300">ISO 20022 pacs.008.001.08 (CBPR+ v3.0)</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Settlement Rail:</span>
            <span className="text-sky-400 font-bold">Solana Token-2022 (MemoTransfer)</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Currency Pair:</span>
            <span className="text-white font-bold">{pair} @ {selectedPair.rate}</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Gross Trade Amount:</span>
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
            <span className="text-zinc-500 uppercase">Net Settlement:</span>
            <span className="text-emerald-400 font-bold tabular-nums">
              {netAmount.toLocaleString()} {pair.split("/")[0]} (≈ {receiveAmount.toLocaleString()} {pair.split("/")[1]})
            </span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-zinc-500 uppercase">Originating Desk:</span>
            <span className="text-zinc-300">{debtorName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 uppercase">Beneficiary Desk:</span>
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

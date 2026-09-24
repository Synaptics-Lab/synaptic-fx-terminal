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
import { EnclaveTelemetry } from "./EnclaveTelemetry";
import type { ADR555PreflightReport } from "@/lib/enclave/adr555-guardian";
import {
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Layers,
  FileCheck2,
  Info,
  Zap,
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

export type SettlementRail = "trilateral" | "solana" | "xrpl" | "synaptic";

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
  const [rail, setRail] = useState<SettlementRail>("trilateral");
  const [debtorName, setDebtorName] = useState("Corporate Treasury Desk");
  const [debtorAcct, setDebtorAcct] = useState("4cghWNxgU73yh1SuRK1juQzt8EaKtC8HWGq2yK4jLmeG");
  const [creditorName, setCreditorName] = useState("Institutional Liquidity Desk");
  const [creditorAcct, setCreditorAcct] = useState("BnuCTFWFLLXnSPv2Frs42royiTAYG87WP7p1zRLB4ksG");
  const [pacsXml, setPacsXml] = useState<string | null>(null);
  const [pacs002Xml, setPacs002Xml] = useState<string | null>(null);
  const [adr555Report, setAdr555Report] = useState<ADR555PreflightReport | null>(null);
  const [currentUetr, setCurrentUetr] = useState<string>("");
  const [currentMsgId, setCurrentMsgId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "review" | "building" | "settling" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedXml, setCopiedXml] = useState(false);
  const [lastTxSig, setLastTxSig] = useState<string | null>(null);
  const [lastExplorerUrl, setLastExplorerUrl] = useState<string | null>(null);
  const [lastXrplExplorerUrl, setLastXrplExplorerUrl] = useState<string | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<"pacs008" | "pacs002" | "enclave">("pacs008");
  const [showValidationModal, setShowValidationModal] = useState(false);
  const xmlRef = useRef<HTMLDivElement>(null);

  const selectedPair = FX_PAIRS.find((p) => p.pair === pair) ?? FX_PAIRS[0];
  const numAmount = parseFloat(amount || "0");
  const receiveAmount = numAmount * selectedPair.rate;
  const tsaFee = numAmount * 0.005;
  const netAmount = numAmount - tsaFee;

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

    // 1. Build ISO 20022 pacs.008
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

    // 2. Emit FDC3 3.0 intent
    const fdc3Context: PaymentContext = {
      type: "fdc3.paymentContext",
      id: { UETR: uetr },
      amount: numAmount,
      currency: pair.split("/")[0],
      debtor: { name: debtorName, account: debtorAcct },
      creditor: { name: creditorName, account: creditorAcct },
      networkRouting: {
        rail: rail === "xrpl" ? "XRPL Interledger" : "Solana Token-2022",
        signatureType: "Ed25519",
        laneId: `corridor-${pair.toLowerCase().replace("/", "-")}`,
      },
    };
    fdc3Bridge.raiseIntent(fdc3Context);

    if (xmlRef.current) {
      gsap.fromTo(
        xmlRef.current,
        { opacity: 0.2, filter: "brightness(2)" },
        { opacity: 1, filter: "brightness(1)", duration: 0.5, ease: "power2.out" }
      );
    }

    // 3. Dispatch Settlement
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
          rail,
          channel,
          debtorName,
          debtorAcct,
          creditorName,
          creditorAcct,
        }),
      });
      const data = await resp.json();

      if (data.error && !data.txSignature && !data.xrplTxHash) {
        throw new Error(data.error);
      }

      const resolvedPacs002Xml = data.pacs002Xml || data.xrplSidecar?.pacs002Xml || null;
      const resolvedPacs002 = data.pacs002 || data.xrplSidecar?.pacs002 || null;

      setAdr555Report(data.adr555Report || null);
      if (resolvedPacs002Xml) {
        setPacs002Xml(resolvedPacs002Xml);
        setActiveInspectorTab("pacs002");
      } else if (data.adr555Report) {
        setActiveInspectorTab("enclave");
      }

      setLastTxSig(data.txSignature || data.xrplTxHash || null);
      setLastExplorerUrl(data.explorerUrl || null);
      if (data.xrplExplorerUrl || data.xrplSidecar?.explorerUrl) {
        setLastXrplExplorerUrl(data.xrplExplorerUrl || data.xrplSidecar?.explorerUrl);
      } else if (rail === "xrpl") {
        setLastXrplExplorerUrl(data.explorerUrl || null);
      }

      const blotterRow: BlotterRow = {
        id: uetr,
        timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        msgId,
        uetr,
        pair,
        amount: `${numAmount.toLocaleString()} ${pair.split("/")[0]}`,
        debtorName,
        creditorName,
        txSignature: data.txSignature || data.xrplTxHash || "",
        explorerUrl: data.explorerUrl ?? "",
        status: data.error ? "FAILED" : "CONFIRMED",
        channel,
        rail:
          rail === "trilateral"
            ? "Trilateral Powerhouse"
            : rail === "xrpl"
            ? "XRPL Altnet"
            : "Solana Token-2022",
        pacs002: resolvedPacs002,
        wotsDigest: data.adr555Report?.attestation?.wotsPlus?.wotsLeafRoot,
        lane: data.adr555Report?.concurrencyAllocation?.laneId,
      };

      onSettlement(blotterRow);
      setStatus("done");

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

  const copyCurrentContent = () => {
    let content = pacsXml || "";
    if (activeInspectorTab === "pacs002" && pacs002Xml) {
      content = pacs002Xml;
    }
    if (content) {
      navigator.clipboard.writeText(content);
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
    }
  };

  return (
    <div className="flex h-full divide-x divide-[#1a1a1a]">
      {/* LEFT: Institutional FX Ticket */}
      <div className="w-[380px] shrink-0 flex flex-col bg-[#0a0a0a] overflow-y-auto">
        <div className="p-3 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0d0d0d]">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-300 font-bold uppercase tracking-wider">
              {activeDesk.name}
            </span>
          </div>
          <span className={`text-[8.5px] font-mono px-1.5 py-0.5 border font-semibold ${activeDesk.badgeClass}`}>
            {activeDesk.label} CH
          </span>
        </div>

        {/* FDC3 Channel Switcher */}
        <div className="px-3 pt-2.5 pb-1 border-b border-[#141414] bg-[#0b0b0b]">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[8.5px] font-mono text-zinc-500 uppercase tracking-widest">
              FDC3 3.0 Context Channel:
            </span>
            <span className="text-[8.5px] font-mono text-amber-400 font-semibold">{activeDesk.role}</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(["global", "red", "green", "blue"] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => switchChannel(ch)}
                className={`py-1 text-[9px] font-mono uppercase font-bold border transition-colors ${
                  channel === ch
                    ? ch === "global"
                      ? "bg-amber-400 text-black border-amber-400"
                      : ch === "red"
                      ? "bg-rose-500 text-white border-rose-500"
                      : ch === "green"
                      ? "bg-emerald-500 text-black border-emerald-500"
                      : "bg-sky-500 text-black border-sky-500"
                    : "bg-[#141414] border-[#222] text-zinc-400 hover:text-white"
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Settlement Rail Switcher: Trilateral Redundancy */}
        <div className="px-3 pt-2 pb-2 border-b border-[#141414] bg-[#0c0c0c]">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[8.5px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1 font-bold">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Settlement Rail:</span>
            </span>
            <span className="text-[8px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1">
              {rail === "trilateral" ? "3-WAY POWERHOUSE" : "SINGLE RAIL"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-[8px] font-mono">
            <button
              type="button"
              onClick={() => setRail("trilateral")}
              className={`py-1 px-1 border uppercase font-bold text-center transition-colors ${
                rail === "trilateral"
                  ? "bg-amber-500/20 border-amber-500 text-amber-300"
                  : "bg-[#111] border-[#222] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Trilateral
            </button>
            <button
              type="button"
              onClick={() => setRail("solana")}
              className={`py-1 px-1 border uppercase font-bold text-center transition-colors ${
                rail === "solana"
                  ? "bg-sky-500/20 border-sky-500 text-sky-300"
                  : "bg-[#111] border-[#222] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Solana T-22
            </button>
            <button
              type="button"
              onClick={() => setRail("xrpl")}
              className={`py-1 px-1 border uppercase font-bold text-center transition-colors ${
                rail === "xrpl"
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                  : "bg-[#111] border-[#222] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              XRPL Altnet
            </button>
          </div>
        </div>

        {/* Ticket Form */}
        <div className="p-3 space-y-2.5 flex-1 text-[11px]">
          <Field label="FX Pair">
            <InstitutionalSelect options={FX_PAIRS} value={pair} onChange={setPair} />
          </Field>

          {/* Amount Presets */}
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
              className="w-full bg-[#111111] border border-[#222222] text-zinc-200 text-[10px] font-mono px-2 py-1 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>
          <Field label="Creditor Entity (Institutional Beneficiary)">
            <input
              value={creditorName}
              onChange={(e) => setCreditorName(e.target.value)}
              className="w-full bg-[#111111] border border-[#222222] text-zinc-200 text-[10px] font-mono px-2 py-1 rounded-none focus:outline-none focus:border-zinc-500"
            />
          </Field>

          <button
            onClick={handleOpenReview}
            disabled={status === "building" || status === "settling"}
            className="w-full mt-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-950 disabled:text-zinc-600 disabled:cursor-not-allowed text-black font-mono text-[10.5px] font-bold tracking-widest uppercase transition-all rounded-none shadow-lg shadow-amber-500/10 active:translate-y-0.5"
          >
            {status === "building" && "ADR-555 PRE-FLIGHT GUARDIAN…"}
            {status === "settling" && "EXECUTING TRILATERAL SETTLEMENT…"}
            {status === "done" && "✓ SETTLED — DISPATCH NEW TRADE"}
            {status === "error" && "RETRY INTENT"}
            {status === "idle" && (
              rail === "trilateral"
                ? "AUTHORIZE & SETTLE (TRILATERAL)"
                : rail === "xrpl"
                ? "AUTHORIZE & SETTLE ON XRPL"
                : "AUTHORIZE & SETTLE ON SOLANA"
            )}
          </button>

          {errorMsg && (
            <div className="p-2 bg-rose-950/40 border border-rose-800 text-rose-300 text-[10px] font-mono rounded-none">
              {errorMsg}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Multi-Tab Message & Telemetry Inspector */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
        <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between bg-[#0d0d0d] flex-wrap gap-2">
          {/* Tab buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveInspectorTab("pacs008")}
              className={`px-2 py-1 text-[9.5px] font-mono font-bold uppercase border transition-colors flex items-center gap-1.5 ${
                activeInspectorTab === "pacs008"
                  ? "bg-amber-500/20 border-amber-500 text-amber-300"
                  : "bg-[#141414] border-[#222] text-zinc-400 hover:text-white"
              }`}
            >
              <FileCheck2 className="w-3 h-3 text-amber-400" />
              <span>pacs.008 Payment</span>
            </button>

            <button
              onClick={() => setActiveInspectorTab("pacs002")}
              className={`px-2 py-1 text-[9.5px] font-mono font-bold uppercase border transition-colors flex items-center gap-1.5 ${
                activeInspectorTab === "pacs002"
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                  : "bg-[#141414] border-[#222] text-zinc-400 hover:text-white"
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>pacs.002 Receipt (Acsc)</span>
              {pacs002Xml && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />}
            </button>

            <button
              onClick={() => setActiveInspectorTab("enclave")}
              className={`px-2 py-1 text-[9.5px] font-mono font-bold uppercase border transition-colors flex items-center gap-1.5 ${
                activeInspectorTab === "enclave"
                  ? "bg-sky-500/20 border-sky-500 text-sky-300"
                  : "bg-[#141414] border-[#222] text-zinc-400 hover:text-white"
              }`}
            >
              <ShieldCheck className="w-3 h-3 text-sky-400" />
              <span>ADR-555 Enclave & WOTS+</span>
              {adr555Report && <span className="text-[8px] text-sky-400 bg-sky-950 px-1">sub-8ms</span>}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {(pacsXml || pacs002Xml) && activeInspectorTab !== "enclave" && (
              <button
                onClick={copyCurrentContent}
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
            )}

            {cbprCheck && activeInspectorTab === "pacs008" && (
              <button
                onClick={() => setShowValidationModal(!showValidationModal)}
                className="text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2 py-0.5 rounded-none font-semibold flex items-center gap-1"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>{cbprCheck.checkedElements}/14 CBPR+ COMPLIANT</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content Display */}
        <div className="flex-1 overflow-auto bg-[#080808]">
          {activeInspectorTab === "pacs008" && (
            <div className="p-3">
              {!pacsXml ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-600 font-mono">
                  <div className="w-10 h-10 border border-dashed border-zinc-700 flex items-center justify-center mb-2">
                    <span className="text-zinc-500 text-[11px] font-bold">XML</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-semibold mb-1">
                    Awaiting FDC3 StartPayment Intent
                  </p>
                  <p className="text-[10px] text-zinc-600 max-w-md">
                    Raise an intent to construct ISO 20022 pacs.008 XML, execute ADR-555 Enclave preflight,
                    and trigger atomic cross-rail settlement.
                  </p>
                </div>
              ) : (
                <div ref={xmlRef} className="overflow-x-auto">
                  <XmlViewer xml={pacsXml} />
                </div>
              )}
            </div>
          )}

          {activeInspectorTab === "pacs002" && (
            <div className="p-3">
              {!pacs002Xml ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-600 font-mono">
                  <div className="w-10 h-10 border border-dashed border-emerald-700/50 flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-[11px] text-zinc-400 font-semibold mb-1">
                    Awaiting Settlement Confirmation Receipt
                  </p>
                  <p className="text-[10px] text-zinc-600 max-w-md">
                    When settlement executes via XRPL or Trilateral Redundancy, the native relayer produces the
                    pacs.002.001.10 XML status report verifying consensus clearance (Acsc) from SynapticChain checkpoints.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <XmlViewer xml={pacs002Xml} />
                </div>
              )}
            </div>
          )}

          {activeInspectorTab === "enclave" && (
            <EnclaveTelemetry report={adr555Report} rail={rail} />
          )}
        </div>

        {/* Footer Explorer Links & Provenance Bar */}
        {(lastExplorerUrl || lastXrplExplorerUrl || currentUetr) && (
          <div className="border-t border-[#1a1a1a] px-3 py-2 bg-[#0c0c0c] flex items-center justify-between text-[10px] font-mono flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {currentUetr && (
                <Tooltip content={currentUetr} copyable copyText={currentUetr}>
                  <span className="text-zinc-500 cursor-help">
                    UETR: <span className="text-zinc-300 underline underline-offset-2">{currentUetr.slice(0, 16)}…</span>
                  </span>
                </Tooltip>
              )}
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">
                TSA LEVY: <span className="text-rose-400">−{tsaFee.toLocaleString()}</span>
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-500">
                NET: <span className="text-emerald-400 font-bold">{netAmount.toLocaleString()}</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              {lastExplorerUrl && (
                <a
                  href={lastExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2"
                >
                  <span>SOLANA TX</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {lastXrplExplorerUrl && (
                <a
                  href={lastXrplExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 flex items-center gap-1 underline underline-offset-2"
                >
                  <span>XRPL TESTNET TX</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
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
        confirmLabel={
          rail === "trilateral"
            ? "AUTHORIZE & SETTLE ON TRILATERAL RAILS"
            : rail === "xrpl"
            ? "AUTHORIZE & SETTLE ON XRPL ALTNET"
            : "AUTHORIZE & SETTLE ON SOLANA TOKEN-2022"
        }
      >
        <div className="border border-[#1e1e1e] bg-[#0c0c0c] p-3 space-y-2 text-[10.5px]">
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">FDC3 Intent:</span>
            <span className="text-amber-400 font-bold">StartPayment (fdc3.paymentContext)</span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">Settlement Rail:</span>
            <span className="text-sky-400 font-bold uppercase">
              {rail === "trilateral"
                ? "Trilateral Powerhouse (Solana + XRPL + L1)"
                : rail === "xrpl"
                ? "XRPL Altnet (SHAMap DENSE-16)"
                : "Solana Token-2022 (RequiredMemo)"}
            </span>
          </div>
          <div className="flex justify-between border-b border-[#181818] pb-1.5">
            <span className="text-zinc-500 uppercase">ADR-555 Enclave:</span>
            <span className="text-emerald-400 font-bold">Active (WOTS+ & Concurrency Gate)</span>
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

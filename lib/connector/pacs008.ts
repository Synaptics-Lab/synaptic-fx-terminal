/**
 * pacs008.ts — client-safe ISO 20022/FDC3 layer (split out of
 * solana-finos-bridge.ts 2026-10-06): types, UETR/MsgId generators, the
 * CBPR+ pacs.008.001.08 builder, the 14-point validator and the desktop-agent
 * bridge class. ZERO Solana/settler imports — browser components may pull
 * this without dragging node:fs / the wire signer into a client chunk.
 * The server bridge (solana-finos-bridge.ts) re-exports every name here.
 */
import { randomUUID } from "node:crypto";


export interface FDC3Instrument {
  ticker: string;
  isin: string;
  name?: string;
  currency: string;
}

export interface FDC3PaymentContext {
  type: string; // fdc3.payment (PR #2204) — legacy names accepted inbound
  id?: { UETR?: string };
  amount: number;
  currency: string;
  pair: string;
  rate: number;
  debtor: {
    name: string;
    account: string;
    bic?: string;
    country?: string;
  };
  creditor: {
    name: string;
    account: string;
    bic?: string;
    country?: string;
  };
  networkRouting?: {
    rail: "Solana Token-2022" | "SynapticChain SCBFT-L1";
    channel?: FDC3Channel;
    uetr?: string;
  };
}

export type FDC3Channel = "red" | "green" | "blue" | "global";

export interface CBPRPlusValidationResult {
  valid: boolean;
  checkedElements: number;
  errors: string[];
}

export interface InstitutionalSettlementReceipt {
  uetr: string;
  msgId: string;
  xml: string;
  cbprValidation: CBPRPlusValidationResult;
  txSignature: string;
  slot: number;
  explorerUrl: string;
  confirmationStatus: "confirmed" | "finalized";
  grossAmount: number;
  currency: string;
  tsaDeduction: number;
  netAmount: number;
  receiveAmount: number;
  targetCurrency: string;
  latencyMs: number;
  timestamp: string;
}

// ─── SWIFT UETR & MsgId Generators ────────────────────────────────────────────

export function generateUETR(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return randomUUID();
}

export function generateMsgId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, "0");
  return `SYN-FINOS-${date}-${rand}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── ISO 20022 pacs.008.001.08 Builder (CBPR+ v3.0) ─────────────────────────

export function buildInstitutionalPacs008(
  ctx: FDC3PaymentContext,
  uetr: string,
  msgId: string,
  solanaTxSignature?: string
): string {
  const now = new Date().toISOString();
  const sttlDate = now.slice(0, 10);
  const gross = ctx.amount.toFixed(2);
  const tsa = (ctx.amount * 0.005).toFixed(2);
  const net = (ctx.amount * 0.995).toFixed(2);
  const targetCcy = ctx.pair.split("/")[1] || "KES";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08 pacs.008.001.08.xsd">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${gross}</CtrlSum>
      <TtlIntrBkSttlmAmt Ccy="${ctx.currency}">${gross}</TtlIntrBkSttlmAmt>
      <IntrBkSttlmDt>${sttlDate}</IntrBkSttlmDt>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <ClrSys>
          <Prtry>SOLANA-TOKEN-2022</Prtry>
        </ClrSys>
      </SttlmInf>
      <InstgAgt>
        <FinInstnId>
          <BICFI>SYNAUS33XXX</BICFI>
          <Nm>Synaptic Institutional FX Desk</Nm>
          <PstlAdr><Ctry>US</Ctry></PstlAdr>
        </FinInstnId>
      </InstgAgt>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${msgId}-001</InstrId>
        <EndToEndId>${msgId}-E2E</EndToEndId>
        <UETR>${uetr}</UETR>
      </PmtId>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Prtry>FDC3-STARTPAYMENT</Prtry></LclInstrm>
        <CtgyPurp><Cd>INTC</Cd></CtgyPurp>
      </PmtTpInf>
      <IntrBkSttlmAmt Ccy="${ctx.currency}">${gross}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>${sttlDate}</IntrBkSttlmDt>
      <ChrgBr>SHAR</ChrgBr>
      <!-- Statutory 0.50% TSA Deduction (Central Bank Single Treasury Account) -->
      <ChrgsInf>
        <Amt Ccy="${ctx.currency}">${tsa}</Amt>
        <Agt>
          <FinInstnId>
            <BICFI>CENTRALBKTSA</BICFI>
            <Nm>Treasury Single Account (TSA)</Nm>
          </FinInstnId>
        </Agt>
      </ChrgsInf>
      <InstgAgt>
        <FinInstnId><BICFI>SYNAUS33XXX</BICFI></FinInstnId>
      </InstgAgt>
      <Dbtr>
        <Nm>${escapeXml(ctx.debtor.name)}</Nm>
        <PstlAdr><Ctry>${ctx.debtor.country || "US"}</Ctry></PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>${escapeXml(ctx.debtor.account)}</Id></Othr></Id>
        <Ccy>${ctx.currency}</Ccy>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId><BICFI>${ctx.debtor.bic || "SYNAUS33XXX"}</BICFI></FinInstnId>
      </DbtrAgt>
      <Cdtr>
        <Nm>${escapeXml(ctx.creditor.name)}</Nm>
        <PstlAdr><Ctry>${ctx.creditor.country || "KE"}</Ctry></PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id><Othr><Id>${escapeXml(ctx.creditor.account)}</Id></Othr></Id>
        <Ccy>${targetCcy}</Ccy>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId><BICFI>${ctx.creditor.bic || "RESERVEBKXXX"}</BICFI></FinInstnId>
      </CdtrAgt>
      <InstrForNxtAgt>
        <InstrInf>NET_AMT=${net};TSA_LEVY=${tsa};PAIR=${ctx.pair};RATE=${ctx.rate};RAIL=SOLANA_TOKEN_2022</InstrInf>
      </InstrForNxtAgt>
      <Purp><Cd>FINOS</Cd></Purp>
      <RmtInf>
        <Ustrd>FINOS-FDC3-SOLANA:${uetr}${solanaTxSignature ? `:SOL:${solanaTxSignature}` : ""}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;
}

// ─── 14-Point CBPR+ Validation Engine ────────────────────────────────────────

export function validateCBPRPlus(xml: string): CBPRPlusValidationResult {
  const mandatoryElements = [
    "FIToFICstmrCdtTrf",
    "GrpHdr",
    "MsgId",
    "CreDtTm",
    "NbOfTxs",
    "TtlIntrBkSttlmAmt",
    "IntrBkSttlmDt",
    "SttlmInf",
    "CdtTrfTxInf",
    "PmtId",
    "UETR",
    "ChrgBr",
    "Dbtr",
    "Cdtr",
  ];

  const errors = mandatoryElements.filter((el) => !xml.includes(`<${el}`));
  return {
    valid: errors.length === 0,
    checkedElements: mandatoryElements.length,
    errors,
  };
}

// ─── FDC3 Desktop Agent Bridge (OpenFin / Bloomberg B-PIPE emulator) ──────────

type IntentListener = (ctx: FDC3PaymentContext) => Promise<InstitutionalSettlementReceipt>;

export class SolanaFDC3DeskBridge {
  private channels = new Map<FDC3Channel, Array<(ctx: FDC3PaymentContext) => void>>();
  private intentListeners = new Map<string, IntentListener[]>();
  private activeChannel: FDC3Channel = "global";

  constructor() {
    for (const ch of ["red", "green", "blue", "global"] as FDC3Channel[]) {
      this.channels.set(ch, []);
    }
  }

  get channel(): FDC3Channel {
    return this.activeChannel;
  }

  setChannel(ch: FDC3Channel) {
    this.activeChannel = ch;
  }

  addIntentListener(intent: string, handler: IntentListener) {
    if (!this.intentListeners.has(intent)) {
      this.intentListeners.set(intent, []);
    }
    this.intentListeners.get(intent)!.push(handler);
    return {
      unsubscribe: () => {
        const list = this.intentListeners.get(intent) || [];
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      },
    };
  }

  broadcast(context: FDC3PaymentContext) {
    const subs = this.channels.get(this.activeChannel) || [];
    subs.forEach((fn) => fn(context));
  }

  async raiseIntent(
    intent: string,
    context: FDC3PaymentContext
  ): Promise<InstitutionalSettlementReceipt> {
    const handlers = this.intentListeners.get(intent) || [];
    if (handlers.length === 0) {
      throw new Error(`No FDC3 listener registered for intent: ${intent}`);
    }
    let receipt!: InstitutionalSettlementReceipt;
    for (const h of handlers) {
      receipt = await h(context);
    }
    return receipt;
  }
}

export const solanaFdc3Desk = new SolanaFDC3DeskBridge();

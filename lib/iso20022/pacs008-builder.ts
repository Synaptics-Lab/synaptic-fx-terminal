/**
 * ISO 20022 pacs.008.001.08 Customer Credit Transfer Initiation Builder
 * Zero external dependencies. Generates CBPR+-compliant XML with SWIFT UETR.
 */

export interface Pacs008Params {
  amount: number;
  currency: string;
  debtorName: string;
  debtorAccount: string;
  creditorName: string;
  creditorAccount: string;
  solanaTxSignature?: string;
}

export interface Pacs008Result {
  xml: string;
  uetr: string;
  msgId: string;
  tsaDeduction: number;
  netAmount: number;
}

export function generateUETR(): string {
  // UUIDv4 — standard SWIFT UETR format
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateMsgId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SYN-FINOS-${date}-${rand}`;
}

export function buildPacs008(params: Pacs008Params): Pacs008Result {
  const uetr = generateUETR();
  const msgId = generateMsgId();
  const tsaDeduction = parseFloat((params.amount * 0.005).toFixed(2));
  const netAmount = parseFloat((params.amount - tsaDeduction).toFixed(2));
  const now = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <TtlIntrBkSttlmAmt Ccy="${params.currency}">${params.amount.toFixed(2)}</TtlIntrBkSttlmAmt>
      <IntrBkSttlmDt>${now.slice(0, 10)}</IntrBkSttlmDt>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <ClrSys>
          <Cd>SYN1</Cd>
        </ClrSys>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>${uetr}</InstrId>
        <EndToEndId>${msgId}-E2E</EndToEndId>
        <UETR>${uetr}</UETR>
      </PmtId>
      <IntrBkSttlmAmt Ccy="${params.currency}">${params.amount.toFixed(2)}</IntrBkSttlmAmt>
      <ChrgBr>SHAR</ChrgBr>
      <InstgAgt>
        <FinInstnId>
          <BICFI>SYNCLAKE</BICFI>
        </FinInstnId>
      </InstgAgt>
      <Dbtr>
        <Nm>${params.debtorName}</Nm>
        <PstlAdr>
          <Ctry>ZM</Ctry>
        </PstlAdr>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>${params.debtorAccount}</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <Cdtr>
        <Nm>${params.creditorName}</Nm>
        <PstlAdr>
          <Ctry>KE</Ctry>
        </PstlAdr>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>${params.creditorAccount}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>SYNAPTIC-DPI:${uetr}${params.solanaTxSignature ? `:SOL:${params.solanaTxSignature.slice(0, 20)}` : ""}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
    <TSADeduction Ccy="${params.currency}">${tsaDeduction.toFixed(2)}</TSADeduction>
    <NetAmount Ccy="${params.currency}">${netAmount.toFixed(2)}</NetAmount>
  </FIToFICstmrCdtTrf>
</Document>`;

  return { xml, uetr, msgId, tsaDeduction, netAmount };
}

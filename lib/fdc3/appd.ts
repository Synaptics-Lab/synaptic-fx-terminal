/**
 * FINOS FDC3 App Directory v2 application records for the estate desktop
 * agent (Spec 016). Served by /api/fdc3/appd/v2/apps and consumed by the
 * TraderX blotter's FDC3 Desktop Agent (fdc3-agent.js).
 */
export const TRADERX_RECORD = {
  appId: "finos-traderx-desk",
  name: "TraderX",
  title: "TraderX (FINOS) · Spec 016",
  description:
    "FINOS TraderX reference blotter with post-trade DvP settlement (Spec 016). Raises the StartPayment intent with fdc3.payment context to the BankerX clearing desk via the FDC3 Desktop Agent.",
  type: "web",
  details: { url: "https://traderx.synapticchain.xyz/" },
  version: "1.0.0",
  publisher: "FINOS / SynapticChain",
  categories: ["Trading"],
};

export const BANKERX_RECORD = {
  appId: "bankerx-clearing-desk",
  name: "BankerX",
  title: "BankerX Clearing Desk",
  description:
    "Institutional FX clearing desk: receives FDC3 StartPayment intents, runs ADR-555 pre-flight, executes Solana Token-2022 settlement with ISO 20022 pacs.008/pacs.002 receipts.",
  type: "web",
  details: { url: "https://terminal.synapticchain.xyz/" },
  version: "1.0.0",
  publisher: "SynapticChain",
  interop: {
    intents: {
      listensFor: {
        StartPayment: {
          displayName: "Start Payment",
          contexts: ["fdc3.payment"],
        },
      },
    },
  },
};

/**
 * Alcove enclave adapter (ADR-555): a first-class App Directory citizen with
 * NO browser window. The FDC3 Desktop Agent launches it as an MCP bridge —
 * `open()` on this record pings the enclave's JSON-RPC MCP endpoint
 * (tools/list) instead of window.open — and raises that miss the directory
 * with `fdc3.payment` context are screened through it (ADR-555 pre-flight:
 * sanctions bloom, Invariant-9 solvency gate, ADR-062 256-lane rendezvous)
 * before delivery to the rendezvous-bound clearing desk. Gated on
 * `fdc3.payment` only: the FINOS conformance suite never raises that context,
 * so the adapter path cannot touch suite traffic.
 *
 * Desk binding + lane partitions live in `customProps` — the App Directory
 * v2 spec-sanctioned extension point (S1). The `mcp-adapter` type is a
 * declared estate extension, documented in ADR-555
 * (Synaptic-Source/docs/adr/ADR-555-desktop-mcp-runtime-guardian.md).
 *
 * Lane partitions (S2): lane = SHA3-256(Debtor || Pair) % 256 computed inside
 * the enclave pre-flight; the partition table maps lane ranges → desk appIds
 * and the desktop agent routes the screened delivery by it. Two real desks:
 * `bankerx-clearing-desk` (lanes 0–127) and `bankerx-clearing-desk-eu`
 * (lanes 128–255) — a routed desk with no running instance is launched by
 * the agent through the normal FDC3 open path.
 */
export const ALCOVE_RECORD = {
  appId: "synaptic-alcove-enclave",
  name: "Alcove",
  title: "Alcove Enclave · ADR-555",
  description:
    "Desktop MCP Runtime Guardian: FDC3 adapter that screens StartPayment intents through the ADR-555 local context enclave (sanctions Merkle Bloom filter, Invariant-9 solvency gate, 256-lane rendezvous desk binding) before they reach the rendezvous-partitioned clearing desks. Type mcp-adapter — launched as an MCP tool-call bridge, not a window.",
  type: "mcp-adapter",
  details: { url: "https://terminal.synapticchain.xyz/api/enclave/mcp" },
  version: "1.0.0",
  publisher: "SynapticChain",
  interop: {
    intents: {
      listensFor: {
        StartPayment: {
          displayName: "Start Payment (enclave screen)",
          contexts: ["fdc3.payment"],
        },
      },
    },
  },
  customProps: {
    alcoveDesk: "bankerx-clearing-desk",
    alcovePartitions: [
      { lanes: "0-127", desk: "bankerx-clearing-desk" },
      { lanes: "128-255", desk: "bankerx-clearing-desk-eu" },
    ],
  },
};

/**
 * BankerX EU clearing desk — the second real rendezvous-partition desk
 * (lanes 128–255). Same terminal surface, same StartPayment handling; the
 * lane the enclave computed decides which desk a screened intent is
 * delivered to (S2).
 */
export const BANKERX_EU_RECORD = {
  appId: "bankerx-clearing-desk-eu",
  name: "BankerX EU",
  title: "BankerX EU Clearing Desk",
  description:
    "European FX clearing desk (ADR-062 rendezvous lanes 128–255): receives FDC3 StartPayment intents routed by the Alcove adapter's lane partition, verifies the enclave attestation desk-side, executes Solana Token-2022 settlement with ISO 20022 pacs.008/pacs.002 receipts.",
  type: "web",
  details: { url: "https://terminal.synapticchain.xyz/" },
  version: "1.0.0",
  publisher: "SynapticChain",
  interop: {
    intents: {
      listensFor: {
        StartPayment: {
          displayName: "Start Payment",
          contexts: ["fdc3.payment"],
        },
      },
    },
  },
};

/**
 * FINOS conformance suite records — loaded only with ?include=conformance.
 * Verbatim copy of the FINOS fdc3-conformance suite's own
 * directories/localhost-conformance.json (18 app records: the Conformance1
 * driver plus the mock apps the tests open — IntentAppAId..LId,
 * ChannelsAppId, OpenAppAId/BId, MetadataAppId, MockAppId). All URLs point at
 * the locally-built fdc3-conformance dist on http://localhost:3001 (see the
 * FINOS conformance README local-installation flow).
 */
import conformanceApps from "./conformance-records.json";

export const CONFORMANCE_RECORDS: unknown[] = conformanceApps as unknown[];

export function buildApplications(includeConformance: boolean): unknown[] {
  const apps: unknown[] = [TRADERX_RECORD, BANKERX_RECORD, BANKERX_EU_RECORD, ALCOVE_RECORD];
  if (includeConformance) {
    apps.push(...CONFORMANCE_RECORDS);
  }
  return apps;
}
/**
 * FDC3 StartPayment Intent Bridge
 * Emits and receives FDC3 StartPayment intents with the `fdc3.payment`
 * context type — the exact name proposed in FINOS FDC3 PR #2204
 * ("Add `StartPayment` intent and `fdc3.payment` context"). Inbound
 * contexts are accepted under all three names the estate has used
 * (`fdc3.payment` proposed-standard, `fdc3.paymentContext` legacy Spec 016,
 * `synapticchain.payment` proprietary pre-merge discipline) and normalized.
 * Simulates a Bloomberg/OpenFin desktop agent in-browser.
 */

export const PAYMENT_CONTEXT_TYPE = "fdc3.payment";
/** Context type strings accepted on inbound StartPayment (normalized to PAYMENT_CONTEXT_TYPE). */
export const ACCEPTED_PAYMENT_CONTEXT_TYPES = [
  "fdc3.payment",
  "fdc3.paymentContext",
  "synapticchain.payment",
];

export function isPaymentContext(ctx: unknown): boolean {
  return (
    !!ctx &&
    typeof ctx === "object" &&
    ACCEPTED_PAYMENT_CONTEXT_TYPES.includes((ctx as { type?: string }).type ?? "")
  );
}

export interface PaymentContext {
  type: string; // fdc3.payment (PR #2204) — legacy names accepted inbound
  id: { UETR?: string };
  name?: string;
  amount: number;
  currency: string;
  debtor: { name: string; account: string; agent?: string };
  creditor: { name: string; account: string; agent?: string };
  networkRouting?: { rail?: string; signatureType?: string; laneId?: string };
}

type IntentHandler = (context: PaymentContext) => void;

class FDC3IntentBridge {
  private handlers: IntentHandler[] = [];
  private isListening = false;

  addIntentListener(handler: IntentHandler) {
    this.handlers.push(handler);
    this.isListening = true;
    console.log("[FDC3] StartPayment intent listener registered");
  }

  raiseIntent(context: PaymentContext) {
    console.log("[FDC3] Raising StartPayment intent", context);
    // In a real OpenFin/Bloomberg environment, this would call:
    // await fdc3.raiseIntent('StartPayment', context);
    // In our demo, we route directly to all registered handlers.
    this.handlers.forEach((h) => h(context));
  }

  get status() {
    return {
      listening: this.isListening,
      handlerCount: this.handlers.length,
      channel: "global",
      intentName: "StartPayment",
      contextType: PAYMENT_CONTEXT_TYPE,
      standard: "FDC3 3.0 (FINOS PR #2204)",
    };
  }
}

// Singleton bridge — one per browser session
export const fdc3Bridge = new FDC3IntentBridge();

// Canonical FX pair rates for the African corridor demo
export const FX_PAIRS = [
  { pair: "USD/KES", rate: 129.42, change: +0.38, currency: "KES" },
  { pair: "USD/NGN", rate: 1601.33, change: -2.15, currency: "NGN" },
  { pair: "USD/TZS", rate: 2745.10, change: +12.4, currency: "TZS" },
  { pair: "USD/ZAR", rate: 18.24, change: -0.07, currency: "ZAR" },
  { pair: "USD/GHS", rate: 15.62, change: +0.21, currency: "GHS" },
  { pair: "EUR/USD", rate: 1.0873, change: -0.0012, currency: "USD" },
  { pair: "GBP/USD", rate: 1.2741, change: +0.0034, currency: "USD" },
  { pair: "USD/ZMW", rate: 27.14, change: +0.09, currency: "ZMW" },
];

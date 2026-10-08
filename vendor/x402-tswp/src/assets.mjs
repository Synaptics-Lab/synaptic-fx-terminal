// X402-TSWP asset registry (SEP-0001) — issuer-agnostic instrument bindings.
// Pure data + validators (NO network, NO keys): each row is registered from
// measured, chain-verified facts only, and the `evidence` field names the
// verification that admitted it. Unknown symbols resolve to null — the
// composer's resolveAsset refuses loud rather than guess. This table is the
// bridge between the X402A wire grammar (`X402A:<asset>:<mint>:<decimals>`)
// and the composition authority's token-leg vocabulary.
//
// Canonical author attribution: Abdul Shabazz <veritasvaultone@gmail.com>.

export const ASSET_REGISTRY = {
  OUSD: {
    asset: 'OUSD',
    issuer: 'Open Standard (OUSD) — issued by Bridge (a Stripe company)',
    chain: 'solana-mainnet',
    program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // SPL Token-2022 (RPC-verified)
    mint: 'ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB',
    decimals: 6,
    status: 'REGISTERED_EXTERNAL_MAINNET',
    registered: '2026-10-07',
    evidence:
      'mainnet-beta getAccountInfo 2026-10-07: owner TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb; ' +
      'decimals 6; supply 69811167770000; mintAuthority EBArgZpd8iv7QRgUFhCasaHxck5oujhHNCkonoa1kEKA; ' +
      'freezeAuthority H2UbwLLJAen1W2z6oRCYqZCFo6BidkU4QFDw2eWxL9W4; extensions ' +
      '[mintCloseAuthority, permanentDelegate (Aj2gxCSQ7A7eTnUL2VnyT3KQa79AcZi5x15rPRSnw6RA), ' +
      'defaultAccountState, confidentialTransferMint, transferHook (programId null), ' +
      'metadataPointer, pausableConfig (paused:false), tokenMetadata]',
    memo: 'X402A:OUSD:ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB:6',
    note:
      'Inaugural X402A registration. Issuer control surface disclosed in full (freeze + pause + ' +
      'permanent delegate) — the estate records the control facts without judgment. The estate\'s ' +
      'composition rail is Solana DEVNET and OUSD is external mainnet issuance, so OUSD-class legs ' +
      'refuse fail-closed (asset_not_on_rail) — the wire path (Token-2022 transfer_checked, ' +
      'assertBase58Key, on-wire decimals) is issuer-agnostic by construction, while custody stays ' +
      'honest per rail.',
  },
};

/** Exact (case-insensitive) registry lookup — throws loud on unknown assets. */
export function resolveAsset(name, label = 'asset') {
  const row = ASSET_REGISTRY[String(name || '').toUpperCase()];
  if (!row) {
    throw new Error(
      `${label}: unknown_asset (registered: ${Object.keys(ASSET_REGISTRY).join(', ')})`,
    );
  }
  return { ...row };
}

/** Registry row by mint identifier (for fail-closed rail checks on explicit mints). */
export function registeredAssetByMint(mint) {
  const m = String(mint || '');
  return Object.values(ASSET_REGISTRY).find((r) => r.mint === m) ?? null;
}
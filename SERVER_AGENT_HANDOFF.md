# Server Agent Handoff: Synaptic FX Terminal

**Target Repository:** [Synaptics-Lab/synaptic-fx-terminal](https://github.com/Synaptics-Lab/synaptic-fx-terminal)

This document provides the exact context and specifications needed for the server agent to deploy the ISO 20022 Institutional FX Terminal on the correct production domain.

## 1. Project Overview
- **Name:** Synaptic FX Terminal
- **Purpose:** The world's first FINOS FDC3 3.0 compliant institutional FX terminal on Solana. It bridges traditional finance (ISO 20022 pacs.008) with blockchain settlement (Solana Token-2022).
- **Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, GSAP 3, `@solana/web3.js` v2, `@solana/spl-token`.

## 2. Source Code Location
- **GitHub Remote:** `https://github.com/Synaptics-Lab/synaptic-fx-terminal`
- **Local Path (Mac):** `/Users/abdulhome/Downloads/Synapse1-production-1/scratch/synaptic-fx-terminal`

## 3. Server Deployment Instructions

The application requires a Node.js runtime because it utilizes a server-side API route (`/api/settle/route.ts`) to securely construct and dispatch Solana transactions.

### A. Environment Setup
```bash
git clone https://github.com/Synaptics-Lab/synaptic-fx-terminal.git
cd synaptic-fx-terminal
npm install
```

### B. Configuration / Environment Variables
By default, the demo uses a deterministic seed for the Solana keypair. For a production deployment, inject the following environment variable:
- `SOLANA_DEMO_PRIVATE_KEY` (Optional): Base64 encoded private key of the treasury wallet that funds the devnet transactions. If omitted, the app will auto-generate a seeded keypair and auto-airdrop devnet SOL to it.

### C. Build & Start
```bash
npm run build
npm run start
```
*Note on Next.js 16 Turbopack:* The repository has been configured to use the local system monospace font stack (avoiding Google Fonts CDN blocks) and standard Tailwind v4 CSS imports. If the build server encounters PostCSS/Turbopack panics, ensure the server has full outbound network access during the build step.

### D. Domain Mapping (Nginx/Gateway)
- The Node process will start on port `3000` (or `PORT` env var).
- Configure the reverse proxy (Nginx/Caddy) to route the intended domain (e.g., `fx.synapticchain.xyz` or similar) to `http://127.0.0.1:3000`.
- Ensure WebSocket support is enabled in the proxy configuration if needed by Next.js HMR or future Solana RPC subscriptions.

## 4. UI/UX Polish & Design Agents

Before finalizing the deployment, the server agent should spin up UI/UX design subagents to refine the terminal aesthetic using the `shadcn` MCP server.

### A. MCP Server Initialization
To equip the design agents with the ability to inject new components, ensure the `shadcn` MCP server is available in the environment:
```bash
# The design agent can call this to scaffold new UI primitives
npx shadcn@latest mcp
```

### B. Spawning Design Subagents
Spawn one or more design/frontend subagents with the following directives:
- **Role:** `Frontend Terminal Designer`
- **Goal:** Polish the Next.js UI using `shadcn/ui` components (e.g., proper Dialogs for payment confirmation, polished Select dropdowns for FX pairs, and Tooltips for the UETR hashes).
- **Aesthetic Constraints:** Bloomberg Terminal / Institutional Desk. Strict `#0a0a0a` backgrounds, `Geist Mono` / system monospace fonts, zero rounded corners (sharp edges only), and minimal padding.
- **Reference Material:** Point the design agent to the free templates at [21st.dev/community/templates/free](https://21st.dev/community/templates/free) for high-end micro-interactions, but enforce the dark, dense data aesthetic.

## 5. Key Verification Points Post-Deployment
1. **Load Test:** Visit the domain; the GSAP FX ticker should scroll seamlessly at 80px/s across the top.
2. **Settlement Test:** Select a pair, enter an amount, and click "RAISE FDC3 STARTPAYMENT". 
3. **Execution Check:** Verify the middle panel generates the XML, and the bottom blotter confirms a successful Solana Devnet transaction with an explorer link.

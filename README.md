# ZeroClaw Solana Pay Cashier

A proof-carrying, non-custodial cashier workflow for ZeroClaw. A merchant asks
the agent to charge an order, the agent creates an immutable Solana Pay offer,
a scheduled workflow validates settlement through two independent RPC
witnesses, and the owner receives a tamper-evident receipt or an exception.

The agent never holds a private key and never signs a transaction.

The current judge review package is published on
[v1.3.0](https://github.com/Chengyuann/zeroclaw-solana-pay-cashier/releases/tag/v1.3.0).
It contains the clean browser-and-terminal walkthrough, Director Cut,
captions, source bundle, QA reports, and checksums. The Rust/WASM verifier,
example proof bundle, and verifier checksums remain available on
[v1.2.0](https://github.com/Chengyuann/zeroclaw-solana-pay-cashier/releases/tag/v1.2.0).
Remotion source and the storyboard live under [`video/`](video/).

## Why this exists

Small merchants can accept Solana payments without running a custody service or trusting an LLM with a wallet key. ZeroClaw handles the conversational workflow while Solana Pay provides the standardized payment request.

The same safety boundary applies to refunds:

1. a customer can request a refund;
2. policy checks cap it at the paid amount and preserve the original asset;
3. an authenticated owner must approve it;
4. the system creates an unsigned Solana Pay URL;
5. the owner wallet previews and signs.

## Architecture

```text
customer / merchant channel
          |
          v
ZeroClaw agent + solana-pay-cashier skill
          |
          +--> create invoice --> Solana Pay URL + QR
          |
          +--> payment-watch SOP --> Solana RPC
          |                           |
          |                           +--> reference lookup
          |                           +--> recipient / amount / mint / memo validation
          |
          +--> refund-approval SOP --> owner checkpoint --> unsigned refund URL
```

This is deliberately Tier 1:

- **T0 reads:** public Solana RPC queries;
- **T1 builds:** Solana Pay URLs and unsigned refund requests;
- **no T2 signing:** no private key, session key, or autonomous transfer path exists.

## Features

- Standard Solana Pay transfer-request URLs.
- Stable payment identifiers inspired by x402 idempotency extensions.
- Expiring immutable offers with canonical SHA-256 `offerHash` values.
- Unique reference address per invoice.
- QR generation.
- SOL and SPL-token invoice support.
- Full transfer validation through `@solana/pay`:
  recipient, amount, mint, reference, and memo.
- Persistent JSON invoice state with atomic writes.
- Receipt generation with explorer links.
- Tamper-evident proof bundles with independent offline verification.
- Ed25519 issuer attestations over both offer and settlement hashes. This
  attestation key cannot sign Solana transactions or move funds.
- Fail-closed dual-RPC witness quorum on public networks; duplicate endpoints
  never count as independent witnesses.
- Optional native Rust/WASM proof verifier plugin for offline bundle checks
  inside ZeroClaw.
- Exception classification for expiry, late payment, duplicate reference,
  underpayment, overpayment, invalid transfer, and witness disagreement.
- Cron-friendly pending-invoice poller.
- Approval-gated refund workflow.
- Deterministic offline demo mode.
- Official ZeroClaw skill audit and SOP validation.

## Quick start

Requirements:

- Node.js 20 or newer.
- A configured ZeroClaw release for the complete agent workflow.
- A public Solana RPC URL for live settlement checks.

```bash
npm install
npm run check
npm run demo
```

The demo uses temporary state and does not make a real payment.

## Run the proof console

The local reconciliation console reads the same `.state` invoice store as the
CLI:

```bash
npm run console
```

Open `http://127.0.0.1:4317/`.

For a background process that survives the current terminal session:

```bash
npm run console:start
npm run console:status
npm run console:stop
```

The managed commands use a detached macOS `screen` session named
`zeroclaw-cashier-console` and keep logs under
`.state/console-runtime/`.

If the page stops opening after a terminal or Codex session exits, restart the
managed session:

```bash
npm run console:status
npm run console:start
```

The local console serves the primary live walkthrough from
`outputs/video-delivery-live/demo-video.mp4`. Override it with
`CASHIER_DEMO_VIDEO_PATH` when reviewing another cut.

Primary public read-only snapshot:

`https://proof-carrying-cashier.pages.dev/`

GitHub Pages mirror:

`https://chengyuann.github.io/zeroclaw-solana-pay-cashier/`

Both static deployments use the same committed, sanitized evidence snapshot. It contains
public transaction evidence and signed proof bundles, but no payment URLs,
active QR requests, local filesystem paths, refund approval codes, or write
API.

Verify the latest accepted public proof from a clean checkout:

```bash
npm ci
npm run verify:public-proof
```

The command downloads the public ledger and proof bundle, ignores the hosted
verification verdict, recomputes every hash and Ed25519 attestation locally,
checks offer-to-settlement linkage, and exits nonzero on any mismatch.

Refresh the public snapshot after changing demo state:

```bash
npm run pages:snapshot
npm run pages:build
npm run pages:check
```

The console provides:

- ledger search, state filters, network filters, and sorting;
- offer, proof, witness, and raw JSON inspection;
- proof JSON export and copy controls;
- unsigned QR display for pending invoices;
- 30-second auto-refresh while the page is visible, with a user-controlled
  toggle;
- keyboard-operable invoice rows and evidence tabs;
- reduced-motion behavior for all animated surfaces.

The visual atlas and product mark were generated with GPT Image 2, optimized
for local delivery, and do not require external image hosts.

## Create an invoice

```bash
npm run build

node dist/cli.js create \
  --recipient BpegjqEbijzZMxFaseiCd6iv1DM3LuL3273NJVyzFmy1 \
  --amount 0.01 \
  --cluster devnet \
  --rpc-url https://your-primary-rpc.example \
  --witness-rpc-url https://your-independent-rpc.example \
  --order-id table-4 \
  --label "ZeroClaw Demo Cafe" \
  --message "Charge table 4"
```

For an SPL token:

```bash
node dist/cli.js create \
  --recipient <merchant-wallet> \
  --amount 5 \
  --mint <token-mint> \
  --symbol USDC \
  --cluster devnet \
  --rpc-url https://your-primary-rpc.example \
  --witness-rpc-url https://your-independent-rpc.example \
  --order-id coffee-1024
```

## Check or watch settlement

```bash
node dist/cli.js status --invoice <invoice-id>
node dist/cli.js watch --invoice <invoice-id> --timeout 120 --interval 5
node dist/cli.js poll-pending
node dist/cli.js attention
node dist/cli.js proof --invoice <invoice-id>
```

Configure both RPC roles during public-network invoice creation:

```bash
node dist/cli.js create \
  --recipient <merchant-wallet> \
  --amount 0.01 \
  --rpc-url https://your-solana-rpc.example \
  --witness-rpc-url https://your-independent-rpc.example \
  --order-id table-4
```

Both endpoints are stored with the invoice so later checks use the same
independent network sources.

The independent witness RPC is stored separately. Override it with:

```bash
export SOLANA_DEVNET_WITNESS_RPC_URL=https://your-independent-rpc.example
```

The default primary devnet RPC is `https://api.devnet.solana.com`. Public
devnet and mainnet invoices require a separately configured independent
witness RPC. Override without changing code:

```bash
export SOLANA_DEVNET_RPC_URL=https://your-solana-devnet-rpc.example
export SOLANA_DEVNET_WITNESS_RPC_URL=https://your-independent-rpc.example
```

The bundled payer can use a separate transaction-capable endpoint:

```bash
export SOLANA_DEVNET_PAYER_RPC_URL=https://your-payer-rpc.example
npm run devnet -- rpc-check
```

The preflight requires `getGenesisHash`, `getBalance`, `getLatestBlockhash`,
and `getSignaturesForAddress`. Do not downgrade a public proof to one RPC when
an independent provider is unavailable.

Mainnet can likewise be overridden with `SOLANA_MAINNET_RPC_URL`.

## Deterministic local validator proof

Public devnet faucets frequently rate-limit corporate networks and CI data
centers. The repository therefore includes a fully signed, non-simulated
Solana local-validator proof:

```bash
brew install solana
npm run build
./scripts/localnet-demo.sh
```

This starts a fresh Agave validator, creates and funds an ephemeral payer,
sends a real Ed25519-signed Solana Pay transaction, validates it through the
same merchant path, signs the proof bundle, and verifies it offline.

Localnet requires one validator witness. Public devnet receipts require two
independent RPC witnesses. The two evidence levels are labeled separately and
are never presented as equivalent.

The optional devnet payer uses a separate faucet RPC because many public read
RPCs disable `requestAirdrop`:

```bash
export SOLANA_DEVNET_FAUCET_RPC_URL=https://api.devnet.solana.com
npm run devnet -- airdrop 1
```

On managed networks where the official faucet is blocked, use a browser faucet
to fund the temporary `.state/devnet-payer.json` address instead.

## Refund workflow

Create a request:

```bash
node dist/cli.js refund-request \
  --invoice <paid-invoice-id> \
  --destination <customer-wallet> \
  --amount 0.01 \
  --reason "Customer requested refund"
```

This does **not** create a payment URL. It returns an owner-only one-time approval code.

After authenticated owner approval:

```bash
node dist/cli.js refund-approve \
  --refund <refund-id> \
  --code <owner-code>
```

The resulting URL remains unsigned. The owner wallet must review and sign it.

## ZeroClaw integration

Artifacts:

- `zeroclaw/skills/solana-pay-cashier/SKILL.md`
- `zeroclaw/sops/payment-watch/`
- `zeroclaw/sops/refund-approval/`
- `zeroclaw/config.example.toml`

Install the skill into an agent workspace or configured bundle:

```bash
zeroclaw skills install ./zeroclaw/skills/solana-pay-cashier --agent <alias>
```

Copy the SOP directories into the configured `sop.sops_dir`, or point the configuration at `zeroclaw/sops`.

Validate:

```bash
zeroclaw skills audit ./zeroclaw/skills/solana-pay-cashier
zeroclaw sop validate
```

Run ZeroClaw with a real channel configured through `zeroclaw quickstart`. The built-in CLI channel is enough for local reproduction; Discord, WhatsApp, Telegram, or another owner channel makes a stronger showcase.

## Live demo versus deterministic demo

`npm run demo` proves the state machine and security boundaries without external dependencies. It labels the receipt as simulated and never presents it as a chain transaction.

The competition video should use a real devnet payment:

1. configure a reachable devnet RPC;
2. create a small SOL or devnet-token invoice;
3. scan the QR in a devnet-capable wallet;
4. let `payment-watch` validate the real transaction;
5. show the explorer link and owner-channel receipt.

## Repository map

```text
src/
  cli.ts          command interface
  invoice.ts      invoice, settlement, refund state machine
  store.ts        atomic JSON persistence
  validation.ts   address, amount, and text policies
  proof.ts        canonical offers, proof hashes, anomaly assessment
  attestation.ts  non-funds Ed25519 issuer signatures
  witness.ts      independent RPC transaction evidence
  demo.ts         deterministic end-to-end demonstration
tests/            behavior and safety tests
zeroclaw/
  skills/         agent workflow instructions
  sops/           settlement watch and refund approval procedures
  plugins/        offline Rust/WASM proof verifier
docs/             threat model, network diagnosis, reproduction, submission, and video plan
console/          proof ledger UI, local visual assets, favicon, and manifest
```

## Verification

```bash
ZEROCLAW_BIN=/path/to/zeroclaw bash scripts/verify.sh
```

Expected:

- TypeScript build passes.
- 27 TypeScript behavior, proof-integrity, console-server, and safety tests
  pass.
- 6 Rust proof-verifier tests pass.
- Public-network quorum rejects duplicate RPC endpoints and requires
  independent HTTPS sources.
- The committed Rust/WASM verifier component passes ABI, permission, and
  cross-language fixture checks.
- Console static assets and manifest are present.
- Production dependency audit reports zero vulnerabilities.
- Native proof verifier plugin host tests and `wasm32-wasip2` build pass in CI.
- ZeroClaw skill audit passes.
- Both SOPs validate under ZeroClaw `v0.8.3`.

## License

MIT.

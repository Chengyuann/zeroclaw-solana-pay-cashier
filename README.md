# ZeroClaw Solana Pay Cashier

A proof-carrying, non-custodial cashier workflow for ZeroClaw. A merchant asks
the agent to charge an order, the agent creates an immutable Solana Pay offer,
a scheduled workflow validates settlement through two independent RPC
witnesses, and the owner receives a tamper-evident receipt or an exception.

The agent never holds a private key and never signs a transaction.

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
- Dual-RPC witness quorum against OnFinality and Tatum on devnet.
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

## Create an invoice

```bash
npm run build

node dist/cli.js create \
  --recipient BpegjqEbijzZMxFaseiCd6iv1DM3LuL3273NJVyzFmy1 \
  --amount 0.01 \
  --cluster devnet \
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

Use `--rpc-url` during invoice creation when the public Solana endpoint is unavailable or rate limited:

```bash
node dist/cli.js create \
  --recipient <merchant-wallet> \
  --amount 0.01 \
  --rpc-url https://your-solana-rpc.example \
  --order-id table-4
```

The endpoint is stored with the invoice so later checks use the same network source.

The independent witness RPC is stored separately. Override it with:

```bash
export SOLANA_DEVNET_WITNESS_RPC_URL=https://your-independent-rpc.example
```

The default devnet RPC is `https://solana-devnet.api.onfinality.io/public`
because some managed enterprise networks poison or block the official
`api.devnet.solana.com` hostname. Override without changing code:

```bash
export SOLANA_DEVNET_RPC_URL=https://your-solana-devnet-rpc.example
```

Mainnet can likewise be overridden with `SOLANA_MAINNET_RPC_URL`.

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
docs/             threat model, network diagnosis, reproduction, submission, and video plan
```

## Verification

```bash
npm run check
```

Expected:

- TypeScript build passes.
- 10 behavior, proof-integrity, and safety tests pass.
- ZeroClaw skill audit passes.
- Both SOPs validate under ZeroClaw `v0.8.3`.

## License

MIT.

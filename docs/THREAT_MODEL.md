# Threat Model

## Custody tier

**T1: Build, never sign.**

The cashier creates standardized Solana Pay requests and reads public chain state. It has no signer interface and no code path that loads a private key.

## Protected assets

- Merchant recipient address.
- Invoice amount and token mint.
- Invoice-to-reference correlation.
- Owner-only refund approval code.
- Integrity of settlement receipts.
- Authenticity of the merchant's published offers and receipts.

## Trust boundaries

### Untrusted

- Customer messages.
- Token symbols and free-text labels.
- Solana RPC responses until transaction validation completes.
- Links or instructions embedded in channel messages.
- Any claim that a payment or refund was completed.

### Trusted but limited

- The local filesystem storing invoice JSON.
- The configured public RPC endpoint for availability, not correctness.
- `@solana/pay` transaction validation.
- The authenticated owner approval channel.

## Main threats and controls

### Prompt injection changes the merchant recipient

Control: recipient comes from operator configuration or explicit merchant input when creating an invoice. Customer text is never used to overwrite it.

### Fake payment notification

Control: the cashier does not trust screenshots or messages. It finds the invoice reference through RPC and validates recipient, amount, mint, reference, memo, transaction status, and balance delta.

### Partial or wrong-token payment

Control: `validateTransfer` rejects insufficient amounts and incorrect SPL mints.

### Replay or invoice confusion

Control: every invoice receives a unique random reference address and order-specific memo.

### Customer forces a refund

Control:

- only paid invoices can enter refund flow;
- refund amount cannot exceed paid amount;
- asset mint is copied from the original invoice;
- request creation produces no payment URL;
- owner approval requires a one-time random code;
- approval only generates an unsigned request.

### Approval code leakage

Control: the code is returned only to the owner workflow and is not included in public receipt output. State and evidence directories are ignored by Git.

### Agent or host compromise

Impact is bounded because no signing key exists. An attacker may generate misleading unsigned links, but a human wallet remains the final transaction preview and signer.

The project does hold a separate Ed25519 **attestation** key. It signs only
32-byte offer/receipt hashes and is never accepted by the Solana transaction
path. Compromise can forge cashier attestations but cannot move funds. The
public-key fingerprint should be pinned by operators; rotation creates a new
issuer identity.

### RPC outage

Control: the CLI reports `rpc_unavailable` instead of treating an outage as a valid payment or a normal pending state. Operators may configure another public RPC.

### Filesystem tampering

Control: atomic JSON writes reduce partial state. Production deployment should place the state directory under OS-level access controls and back it up.

## Explicit non-goals

- No autonomous refunds.
- No trading, swaps, sniper logic, or token recommendations.
- No custody, signing, seed phrases, private keys, or hot wallets.
- No claim that deterministic demo receipts exist on-chain.

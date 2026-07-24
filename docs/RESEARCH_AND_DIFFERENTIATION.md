# Research and Differentiation

Research snapshot: July 25, 2026.

## What changed in the market

The basic pattern of:

```text
ZeroClaw skill -> Solana Pay URL -> reference polling -> receipt
```

is already crowded in the bounty. Public projects include:

- ClawPay Sentinel;
- ClawStay;
- ProofPay EURC;
- multiple Solana Pay request/payment-watch WASM plugin suites.

A submission that only reproduces the bounty's cashier example has weak
originality.

## Relevant current protocol ideas

### Solana Pay 1.x

The current TypeScript SDK provides merchant and wallet clients, standardized
transfer requests, reference lookup, and strict transfer validation.

### x402 extensions

The current x402 repository includes:

- payment identifiers for retry/idempotency correlation;
- signed offer and signed receipt extensions;
- wallet authentication;
- extension metadata that supports auditing and reputation.

The useful lesson is not to convert this cashier into an x402 server. It is to
apply the same proof and idempotency design to merchant chat payments.

### Solana Foundation `pay`

The current project supports x402, MPP, MCP, local approval, OS biometric
authorization, payment debugging, and confidential charges. This makes generic
"agent can pay an API" functionality a poor differentiator for this submission.

### Transaction firewalls

Several bounty projects already simulate unsigned transactions, inspect balance
and state diffs, and gate signing. Rebuilding that stack would collide with
stronger Rust/WASM submissions.

## Selected product position

**Proof-Carrying Cashier**

The cashier remains a T1 merchant-operations product, but every state transition
is independently auditable:

1. Each offer has a stable payment ID.
2. Recipient, amount, mint, reference, memo, creation time, and expiry are
   canonicalized.
3. The canonical offer is SHA-256 hashed.
4. A non-funds Ed25519 key signs the offer hash.
5. Settlement is checked against strict Solana Pay rules.
6. Two independent RPC providers witness the same signature and slot.
7. The settlement proof is hashed and signed.
8. The proof bundle can be verified offline.

The Ed25519 attestation key cannot sign a Solana transaction and cannot move
funds.

## Merchant exception queue

Payments are not reduced to `pending` or `paid`. The cashier can surface:

- invoice expiry;
- payment after expiry;
- duplicate transactions using one reference;
- underpayment;
- overpayment;
- invalid recipient, mint, memo, or reference;
- independent RPC disagreement.

Exceptions require merchant attention. They never auto-credit or auto-refund.

## Why this improves judging fit

- **Use case:** merchants need reconciliation and dispute evidence, not just QR
  generation.
- **Safety:** no custody, strict validation, fail-closed exceptions.
- **Craft:** canonical formats, attestations, witness evidence, tests.
- **Reproducibility:** proof bundles verify without access to local state.
- **Originality:** the submission focuses on proof-carrying merchant operations
  rather than another generic invoice watcher.

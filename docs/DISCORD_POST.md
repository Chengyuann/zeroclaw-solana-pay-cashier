# Discord Showcase Post

Paste this into ZeroClaw Discord `#solana-bounty`.

```text
**Proof-Carrying Cashier — ZeroClaw Solana Bounty**

A non-custodial Solana Pay merchant workflow that creates immutable offers, validates settlement through independent RPC witnesses, and exports issuer-attested proof bundles that verify offline.

**What is different**
• Payment ID, expiry, unique reference, canonical offer hash
• Ed25519 attestations over offer and settlement hashes
• Dual-RPC devnet quorum / explicit local-validator evidence tier
• Fail-closed queue for late, duplicate, underpaid, overpaid, invalid, or disputed payments
• Approval-gated refunds; the human wallet remains the final signer
• Searchable proof console with offer, witness, raw bundle, QR, and JSON export views

**Security boundary:** T1 — no private keys, no agent signing, no autonomous refunds.

**Verified:** 27 TypeScript tests + 6 Rust verifier tests, zero production dependency vulnerabilities, ZeroClaw v0.8.3 skill audit passed, both SOPs validated. Judges can independently download and verify the latest public proof with `npm run verify:public-proof`.

GitHub: https://github.com/Chengyuann/zeroclaw-solana-pay-cashier
Public site: https://proof-carrying-cashier.pages.dev/
Release + evidence: https://github.com/Chengyuann/zeroclaw-solana-pay-cashier/releases/tag/v1.3.0
Published demo: https://github.com/Chengyuann/zeroclaw-solana-pay-cashier/releases/download/v1.3.0/proof-carrying-cashier-live-demo.mp4
```

Published:

`https://discord.com/channels/1472154792351760419/1527427886410109029/1533401462900789259`

Security update:

`https://discord.com/channels/1472154792351760419/1527427886410109029/1533426538542797002`

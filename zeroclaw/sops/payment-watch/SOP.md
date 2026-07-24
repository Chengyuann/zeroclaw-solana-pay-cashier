# Payment Watch

## Steps

1. **Poll pending invoices** - From the cashier repository root, run `node dist/cli.js poll-pending`. Treat pending invoices as normal. Do not modify invoice files manually.
   - tools: shell

2. **Report validated receipts** - If the `paid` array is non-empty, send a concise owner-channel message for each receipt with payment ID, order ID, amount, asset, signature, explorer URL, offer hash, proof hash, and RPC witness quorum. If the outcome is `attention`, label it clearly and include every anomaly code.
   - tools: channel

3. **Surface exceptions** - Run `node dist/cli.js attention`. Report newly expired invoices, duplicate references, late payments, amount mismatches, or RPC witness disagreement to the owner. Never auto-refund or auto-credit an exception.
   - tools: shell

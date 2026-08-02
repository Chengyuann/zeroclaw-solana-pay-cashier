# Network Troubleshooting

## Symptom

Requests to `https://api.devnet.solana.com` timed out in both `curl`
and Node.js.

## Root cause observed

The managed enterprise network returned poisoned or synthetic DNS answers:

```text
api.devnet.solana.com       -> 69.63.180.173
api.mainnet-beta.solana.com -> 157.240.15.8
solana.com                  -> 108.160.167.158
github.com                  -> 30.100.0.82
```

Public and encrypted DNS were also blocked:

- DNS-over-TCP to `1.1.1.1` and `8.8.8.8` was reset.
- HTTPS to `1.1.1.1:443` and `8.8.8.8:443` timed out.
- Cloudflare and Google DoH could not be reached directly.

The machine had an active managed network tunnel and network extensions.
Changing macOS DNS servers would therefore not have fixed the full problem.

## Working endpoint

The following public devnet endpoint was reachable and returned the official
Solana devnet genesis hash:

```text
https://solana-devnet.api.onfinality.io/public
EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
```

It also supported:

- `getHealth`
- `getLatestBlockhash`
- `getSignaturesForAddress`
- `getTransaction`

This endpoint was used for the July 2026 development session. It is no longer
the cashier default because anonymous method availability later changed.

## Override

Use an operator-controlled endpoint at any time:

```bash
export SOLANA_DEVNET_RPC_URL=https://your-solana-devnet-rpc.example
export SOLANA_DEVNET_WITNESS_RPC_URL=https://your-independent-rpc.example
```

or per invoice:

```bash
node dist/cli.js create \
  --rpc-url https://your-solana-devnet-rpc.example \
  --witness-rpc-url https://your-independent-rpc.example \
  ...
```

## Verification

```bash
curl -sS \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getGenesisHash"}' \
  https://solana-devnet.api.onfinality.io/public
```

Expected:

```text
EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
```

An unpaid cashier invoice should now return a structured `pending` result
with exit code `2`, not `rpc_unavailable`.

## August 2, 2026 follow-up

The previously usable anonymous endpoints no longer provide a complete
two-witness path from this network:

- OnFinality returns HTTP `429` for balance, blockhash, and signature-history
  methods after the initial health/genesis request.
- Tatum anonymous access permits health/genesis/blockhash but rejects
  `getBalance` and `getSignaturesForAddress` as paid or authenticated methods.
- The official devnet hostname still times out from the current network.

This is treated as infrastructure unavailable, not as a payment result. The
cashier keeps the existing signed local-validator evidence and does not claim a
fresh public-devnet receipt until two full-method independent RPC providers are
configured.

Use a separate transaction-capable payer endpoint when available:

```bash
export SOLANA_DEVNET_PAYER_RPC_URL=https://your-payer-rpc.example
npm run devnet -- rpc-check
```

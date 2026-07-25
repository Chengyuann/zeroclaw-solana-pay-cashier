#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v solana-test-validator >/dev/null 2>&1 || {
  echo "solana-test-validator is required (Agave/Solana CLI 4.1.2+)." >&2
  exit 1
}

STATE_DIR="$(mktemp -d)"
LEDGER_DIR="$(mktemp -d)"
VALIDATOR_LOG="$STATE_DIR/validator.log"
export CASHIER_STATE_DIR="$STATE_DIR"
export PAYER_CLUSTER=localnet
export SOLANA_LOCALNET_RPC_URL="http://127.0.0.1:8899"

cleanup() {
  if [[ -n "${VALIDATOR_PID:-}" ]]; then
    kill "$VALIDATOR_PID" 2>/dev/null || true
    wait "$VALIDATOR_PID" 2>/dev/null || true
  fi
  rm -rf "$STATE_DIR" "$LEDGER_DIR"
}
trap cleanup EXIT

solana-test-validator --ledger "$LEDGER_DIR" --quiet >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "$SOLANA_LOCALNET_RPC_URL" 2>/dev/null | grep -q '"ok"'; then
    break
  fi
  sleep 1
done

npm run devnet -- init
npm run devnet -- airdrop 1

RECIPIENT="${DEMO_RECIPIENT:-BpegjqEbijzZMxFaseiCd6iv1DM3LuL3273NJVyzFmy1}"
node dist/cli.js create \
  --recipient "$RECIPIENT" \
  --amount 0.001 \
  --cluster localnet \
  --order-id localnet-proof-demo \
  --expires-in-minutes 30 >"$STATE_DIR/offer.json"

PAYMENT_URL="$(jq -r '.invoice.paymentUrl' "$STATE_DIR/offer.json")"
INVOICE_ID="$(jq -r '.invoice.id' "$STATE_DIR/offer.json")"

npm run devnet -- inspect "$PAYMENT_URL"
npm run devnet -- pay "$PAYMENT_URL"
node dist/cli.js status --invoice "$INVOICE_ID"
node dist/cli.js proof --invoice "$INVOICE_ID" | jq '.proof' >"$STATE_DIR/proof.json"
node dist/cli.js verify-proof --file "$STATE_DIR/proof.json"

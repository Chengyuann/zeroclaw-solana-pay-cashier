#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm run check
npm audit --omit=dev

ZEROCLAW_BIN="${ZEROCLAW_BIN:-zeroclaw}"
if ! command -v "$ZEROCLAW_BIN" >/dev/null 2>&1; then
  if [[ -x ".tools/zeroclaw/zeroclaw" ]]; then
    ZEROCLAW_BIN=".tools/zeroclaw/zeroclaw"
  else
    echo "ZeroClaw not found. Set ZEROCLAW_BIN or install ZeroClaw v0.8.3+." >&2
    exit 1
  fi
fi

"$ZEROCLAW_BIN" skills audit zeroclaw/skills/solana-pay-cashier

CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "$CONFIG_DIR"' EXIT
cat >"$CONFIG_DIR/config.toml" <<EOF
schema_version = 3

[sop]
sops_dir = "$ROOT/zeroclaw/sops"
EOF
"$ZEROCLAW_BIN" sop validate --config-dir "$CONFIG_DIR"

echo "All cashier verification checks passed."

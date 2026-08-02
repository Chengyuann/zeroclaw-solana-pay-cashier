#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="$ROOT/zeroclaw/plugins/proof-bundle-verify"

if command -v cargo >/dev/null 2>&1; then
  CARGO_BIN="$(command -v cargo)"
elif [[ -x /opt/homebrew/opt/rustup/bin/cargo ]]; then
  export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
  CARGO_BIN=/opt/homebrew/opt/rustup/bin/cargo
else
  echo "Rust cargo is required. Install rustup and Rust 1.96.1." >&2
  exit 1
fi

cd "$PLUGIN"
if ! "$CARGO_BIN" fmt --version >/dev/null 2>&1; then
  echo "rustfmt is required. Run: rustup component add rustfmt clippy" >&2
  exit 1
fi
if ! command -v wasm-tools >/dev/null 2>&1; then
  echo "wasm-tools is required. Install it with: brew install wasm-tools" >&2
  exit 1
fi
"$CARGO_BIN" fmt --all -- --check
"$CARGO_BIN" clippy --locked --all-targets -- -D warnings
"$CARGO_BIN" test --locked
"$CARGO_BIN" build --locked --target wasm32-wasip2 --release
test -f target/wasm32-wasip2/release/proof_bundle_verify.wasm
wasm-tools validate target/wasm32-wasip2/release/proof_bundle_verify.wasm
normalized_dir="$(mktemp -d)"
trap 'rm -rf "$normalized_dir"' EXIT
wasm-tools strip \
  target/wasm32-wasip2/release/proof_bundle_verify.wasm \
  -o "$normalized_dir/built.wasm"
wasm-tools strip proof_bundle_verify.wasm -o "$normalized_dir/committed.wasm"
cmp "$normalized_dir/built.wasm" "$normalized_dir/committed.wasm"
grep -Eq '^name = "proof-bundle-verify"$' manifest.toml
grep -Eq '^capabilities = \["tool"\]$' manifest.toml
grep -Eq '^permissions = \[\]$' manifest.toml
wasm_path="$(sed -n 's/^wasm_path = "\(.*\)"$/\1/p' manifest.toml)"
test -n "$wasm_path"
test -f "$wasm_path"
component_wit="$(wasm-tools component wit proof_bundle_verify.wasm)"
grep -q 'export zeroclaw:plugin/plugin-info@0.1.0' <<<"$component_wit"
grep -q 'export zeroclaw:plugin/tool@0.1.0' <<<"$component_wit"
if grep -Eq 'wasi:http|wasi:sockets|zeroclaw:plugin/sockets' <<<"$component_wit"; then
  echo "Proof verifier must not import network or socket interfaces." >&2
  exit 1
fi

echo "Proof verifier plugin checks passed."

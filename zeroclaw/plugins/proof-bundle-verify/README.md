# Proof Bundle Verify

Offline `wasm32-wasip2` ZeroClaw tool plugin for
`zc-proof-bundle-v1`.

It verifies:

- bundle and proof schema versions;
- canonical SHA-256 offer hash;
- offer Ed25519 issuer attestation;
- canonical SHA-256 settlement hash;
- settlement Ed25519 issuer attestation;
- settlement `paymentId` and `offerHash` linkage to the offer.

The plugin requests no permissions. It has no network, configuration,
filesystem, wallet, private key, signing, or transaction submission path.

## Build and test

```bash
rustup target add wasm32-wasip2
cd zeroclaw/plugins/proof-bundle-verify
cargo test --locked
cargo build --locked --target wasm32-wasip2 --release
cp target/wasm32-wasip2/release/proof_bundle_verify.wasm .
wasm-tools validate proof_bundle_verify.wasm
```

Install into a ZeroClaw build with the experimental plugin host:

```bash
zeroclaw plugin install ./zeroclaw/plugins/proof-bundle-verify
zeroclaw config set plugins.enabled true
zeroclaw plugin list
```

Tool name: `verify_cashier_proof_bundle`.

The repository commits the built WASM component. CI rebuilds it with the
pinned Rust toolchain, validates the Component Model ABI, and byte-compares it
with the committed artifact.

Input:

```json
{
  "bundle_json": {
    "version": "zc-proof-bundle-v1"
  }
}
```

An invalid but well-formed proof is a successful tool call with
`"verdict":"invalid"`. Malformed tool arguments fail closed.

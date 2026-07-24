# Security Policy

## Custody

This project is custody tier T1. It does not load or store merchant wallet
private keys and has no production signing path.

The optional `devnet-payer` is a local demo utility. Its key lives under
`.state/`, is restricted to valueless devnet funds, and is excluded from Git.

The cashier's Ed25519 attestation key signs only offer and receipt hashes. It is
not a Solana transaction signer.

## Reporting

Do not open a public issue containing:

- private keys or seed phrases;
- RPC credentials;
- ZeroClaw authentication profiles;
- owner approval codes;
- unpublished proof-bundle private data.

Report security issues privately to the repository owner through GitHub's
security advisory interface.

## Supported version

The current `main` branch and latest tagged release receive fixes.

# Cashier Console UX Redesign

## Research direction

The redesign combines two crypto-product patterns:

- research firms such as Paradigm and Variant use strong editorial hierarchy,
  indexed sections, restrained color, and visible methodology;
- intelligence products such as Blockworks Research and Messari prioritize
  dense metrics, filters, state labels, and fast comparison.

The cashier is an operational product, so the data-terminal pattern remains the
primary structure. The editorial pattern is used to make the product thesis and
security model legible without turning the console into a marketing landing
page.

## Problems in the previous console

1. The first screen looked like a generic admin table.
2. The proof model was hidden inside a narrow definition list.
3. Payment, witness, attestation, and exception states had no visual sequence.
4. Old or simulated records looked too similar to portable proof bundles.
5. The page did not explain why this differs from a basic Solana Pay watcher.
6. Search, network filtering, sorting, proof export, and witness inspection were
   missing.

## New information architecture

### Overview

The first viewport exposes the actual product state:

- proof workflow;
- latest accepted receipt;
- custody boundary;
- ledger volume and proof coverage;
- open invoices and attention queue.

### Settlement ledger

The operations table now optimizes for scanning:

- order and invoice identity;
- state;
- amount;
- network;
- evidence maturity;
- latest activity.

Filters support state, network, text search, and ordering.

### Evidence inspector

The selected invoice is separated into four views:

- **Summary:** proof lifecycle and immutable offer terms;
- **Proof:** stage-aware offer and settlement hash/attestation validation;
- **Witnesses:** independent RPC observations and field-level checks;
- **Raw:** downloadable and copyable proof JSON.

Pending invoices deliberately stop at a verified offer state. They never present
an attested payment request as a completed settlement proof.

### Method

The final band states the differentiation clearly:

1. immutable terms before funds move;
2. independent observation instead of payment claims;
3. portable offline verification;
4. fail-closed exceptions and human-controlled refunds.

## Visual system

- neutral paper and black ink for an editorial, research-oriented surface;
- acid green for verified integrity;
- blue for system navigation and hierarchy;
- amber for pending state;
- coral for exceptions;
- a monospace layer for hashes, signatures, and machine evidence;
- a serif display accent only for thesis-level language.

The layout avoids decorative gradients, oversized marketing cards, nested
cards, and rounded pill-heavy composition. Repeated metrics and witnesses are
the only card-like structures because they represent discrete comparable
objects.

## Motion system

The console adapts interaction ideas from React Bits, Aceternity UI, and
Uiverse without adding React or animation-framework runtime dependencies.

1. Decrypted headline text establishes the proof-verification theme.
2. A bounded canvas star field suggests the Solana network without obscuring
   operational content.
3. Pointer-following spotlight lightens the overview surface.
4. Evidence panels use pointer-tracked glowing borders.
5. The search input carries a restrained moving border beam.
6. The refresh control has a short-range magnetic response.
7. Ledger metrics count toward their current values after refresh.
8. Proof workflow steps activate in sequence.
9. Status chips pulse only for live network state.
10. Visual studies combine scroll reveal, pointer spotlight, and a scanning
    evidence line.

All motion has a `prefers-reduced-motion` path. Canvas movement stops, numeric
values and decrypted text render immediately, and CSS animations collapse to a
single near-zero-duration iteration.

## GPT Image 2 assets

- `cashier-logo.jpg`: generated brand mark for header and compact product use.
- `proof-carrying-cashier.jpg`: wide settlement-evidence key visual.
- `cashier-receipt.jpg`: merchant receipt and terminal study.
- `witness-network.jpg`: independent witness topology study.
- `settlement-poster-v2.jpg`: final editorial product poster generated for the
  Proof Atlas.
- `witness-network-v2.jpg`: final multi-witness infrastructure visualization.
- `runway-immutable-offer.jpg`: immutable offer registration scene.
- `runway-wallet-payment.jpg`: human-controlled wallet execution scene.
- `runway-offline-proof.jpg`: offline proof verification scene.
- `runway-fail-closed.jpg`: exception-isolation scene.
- `runway-witness-seal.jpg`: square witness-quorum emblem.
- `runway-human-signature.jpg`: square T1 signing-boundary emblem.

The original generated PNGs remain under the ignored
`console/assets/imagegen/` working directory. Only optimized display assets are
part of the console surface.

## Readymag reference pass

The second motion pass borrows three layout principles from the current
Readymag homepage while preserving the console's operational purpose:

- paired media runways establish an active editorial stage before the primary
  thesis;
- the Proof Atlas uses a twelve-column asymmetric composition instead of a
  uniform card row;
- a two-pixel header progress line gives the fixed navigation a sense of page
  position without adding another visible control.

The settlement ledger remains a conventional dense table. Readymag-style free
placement is limited to brand and editorial surfaces, where overlap risk is
bounded by explicit grid columns, aspect ratios, and responsive fallbacks.

Each media runway now contains eleven distinct compositions before its
programmatic duplicate, rather than visibly recycling the same four assets.

## Operator boundary

The browser console is deliberately read-only. It exposes invoices, QR
requests, proof bundles, witnesses, and export actions, but it does not add
browser endpoints for invoice creation, settlement mutation, or refunds.
Those operations remain in the CLI and authenticated ZeroClaw workflows.

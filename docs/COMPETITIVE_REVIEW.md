# ZeroClaw Solana Bounty Competitive Review

Reviewed on August 2, 2026 from public GitHub repositories, CI metadata,
project sites, and visible `#solana-bounty` submissions.

## Scope and caveats

- A public repository is not automatically a confirmed bounty submission.
- Test totals below are repository claims unless a green public CI run is also
  noted.
- Repository size is not a quality signal. In particular, Fiel is implemented
  in a fork of the broad ZeroClaw plugin registry, so the relevant work is its
  Solana plugins, shared core, relay, and showcase material.
- Stars are nearly meaningless for these newly created bounty repositories.

## Strong competitors

### Fiel

Repository: `alexshaw3065-hash/zeroclaw-plugins`

Strongest evidence:

- five Rust `wasm32-wasip2` plugins over a shared Solana core;
- real mainnet USDC swap, payment, and transfer signatures;
- Telegram voice/text workflow, cron announcements, persistent service;
- payment confirmation directly calls the same token-risk function used by
  the risk plugin;
- 188-test claim and seven code-level prompt-injection cases;
- detailed reproduction, custody, platform-gap, and real-money bug reports;
- public site and video.

Risks:

- implemented in a fork of the plugin registry, so total repository activity
  and file count overstate submission-specific work;
- depends on a separate HTTPS relay and several third-party APIs;
- broader feature set makes the trust story and reproduction path heavier.

Lesson: the strongest narrative is not "many features." It is one enforced
invariant plus real-world failures discovered and documented.

### ProofKiosk

Repository: `Sushant6095/proofkiosk`

Strongest evidence:

- physical Raspberry Pi relay closes a real payment-to-action loop;
- three WASM plugins and a shared pure core;
- 107-test claim with public green CI;
- hash-chained memo attestations and durable nonce construction;
- unusually honest three-rung architecture: laptop, sensor, physical relay;
- public explainer site and detailed threat model.

Risks:

- README still marks the real video and Discord link as TBD;
- hardware-specific demonstration is harder for judges to reproduce;
- its public site is illustrative rather than a live agent or chain surface.

Lesson: a visible physical consequence creates memorable differentiation, but
missing final evidence links can erase that advantage.

### Solana-native risk and transaction plugin suite

Repository: `furkanefecancaglar/zeroclaw-solana`

Strongest evidence:

- five focused Rust/WASM tools: token risk, wallet risk, transaction guard,
  unsigned builder, and proof verifier;
- live mainnet RPC checks and transaction simulation;
- 295-test claim covering risk boundaries, proof vectors, and injection cases;
- plugin permissions are explicitly minimized by function;
- composition demo chains multiple tools around one wallet.

Risks:

- no public CI workflow, release, site, or obvious video;
- very high test count is self-reported rather than independently visible in
  Actions;
- less merchant-specific and less operationally complete than a full channel
  workflow.

Lesson: typed plugin boundaries and least-privilege manifests are persuasive,
but visible delivery evidence matters as much as breadth.

### Solana Policy Firewall

Repository: `FeeeeelixWong/solana-policy-firewall`

Strongest evidence:

- fail-closed policy over final transaction bytes before signing;
- durable nonce, lookup table resolution, aggregate outflow, simulation, and
  deterministic receipt hashes;
- public green CI, alpha release, exact devnet fixtures, Telegram proof;
- upstream ZeroClaw plugin contribution;
- prompt injection test proves attacker destination and `SetAuthority` are
  rejected structurally.

Risks:

- narrower end-user workflow;
- only 29 tests, though they target high-value security boundaries;
- judges must understand why a pre-sign firewall is more than a decoder.

Lesson: policy must be applied to final wire bytes, not the model's summary of
the intended action.

### Caixa and ClawPay

Repositories:

- `thesithunyein/caixa`
- `fozagtx/clawpay`

Strongest evidence:

- strong Brazilian localization and a clear small-merchant audience;
- Telegram/WhatsApp-first flows;
- real WASM plugins rather than only prompt instructions;
- config-enforced recipients, mint allowlists, caps, durable nonce support;
- ClawPay adds HMAC-bound invoice tickets and capped unsigned yield sweeps;
- Caixa has green WASM build CI and an actual Telegram bot link.

Risks:

- thinner portable-evidence story;
- no public release or public proof-inspection surface;
- ClawPay lacks public Actions despite a 60-test claim.

Lesson: audience-specific language, currency conventions, and daily workflows
can beat technically broader but generic tools.

### ProofPay EURC

Repository: `lucaboy/proofpay-eurc`

Strongest evidence:

- deliverable-bound payment requests;
- strong filesystem, path, identity, replay, approval, and evidence threat
  model;
- public green provenance CI;
- Telegram and devnet evidence;
- explicitly recommends independent RPCs as a high-assurance upgrade.

Risks:

- single-RPC transport in the implementation;
- no public site, release, or short discoverable presentation;
- narrower fixed-EURC workflow.

Lesson: threat models are strongest when they include residual risk and state
what the evidence does not prove.

## Direct cashier competitors

Repositories such as the following implement variations of a T1 Solana Pay
invoice terminal:

- `pigumnov/zeroclaw-solana-cashier`
- `shipkit-ai-operator/zeroclaw-solana-invoice-desk`
- `genaaredes-ui/zeroclaw-solana-payment-terminal`
- `mamenesia/zeroclaw-solana-pay-terminal`
- `serhat2174/zeroclaw-solana-pay-shop`
- `multidimensionalinteractive/zeroclaw-solana-pay-terminal`
- `shubham5080/zeroclaw-solana-invoice`

Most share the same baseline:

- build a Solana Pay URL;
- generate a unique reference;
- poll one RPC;
- check recipient, amount, mint, and finalization;
- keep keys outside the agent;
- gate refunds or fulfillment behind a human.

This category is crowded. A generic "chat creates QR, then poll RPC" story is
not differentiating by itself.

## Position of Proof-Carrying Cashier

Distinctive strengths:

- immutable offer terms exist before payment;
- offer and settlement hashes have separate non-funds Ed25519 attestations;
- public devnet receipts require two independent RPC witnesses;
- proof bundles verify offline and leave the operator's machine;
- accepted, attention, rejected, and simulated evidence tiers remain explicit;
- real signed local-validator payment uses the production validation path;
- searchable public proof console exposes raw signed bundles;
- release, video, Discord post, public Pages demo, CI, tests, and reproduction
  are all complete.

Relative weaknesses:

- no real public-mainnet payment in the published evidence;
- the strongest live payment proof is local-validator, while some competitors
  show real mainnet funds;
- the core is a skill/SOP and TypeScript service, not a native WASM plugin;
- only 14 automated tests, much lower than major Rust plugin submissions;
- no live Telegram/WhatsApp merchant bot available for judges to try;
- the public console is a signed static snapshot, not a live hosted operator
  service.

## Recommended judging narrative

Lead with one claim:

> Most cashier entries prove that a transaction was found. Proof-Carrying
> Cashier proves what was offered, what was observed, who attested it, whether
> independent witnesses agreed, and lets another machine verify that bundle
> offline.

Then show, in order:

1. immutable offer hash and attestation;
2. exact payment validation;
3. witness quorum;
4. settlement hash and attestation;
5. offline verification in the public console;
6. fail-closed exception queue and human refund boundary.

Do not compete on raw test count. Compete on evidence semantics, explicit
trust boundaries, and complete delivery.

## Future improvements worth borrowing

1. Add a real public-devnet or small mainnet transaction captured through the
   current two-witness pipeline.
2. Add property/fuzz tests around canonicalization, proof tampering, malformed
   RPC responses, and witness disagreement.
3. Add a typed Rust/WASM verifier plugin that accepts a proof bundle and
   returns a compact verdict inside ZeroClaw.
4. Add an actual Telegram merchant channel demo with proactive settlement
   announcement.
5. Document two real operational bugs found under live conditions, including
   the corrective design change.
6. Add an independent verification command that downloads one public snapshot
   proof and verifies it from a clean directory.

export type Cluster = "localnet" | "devnet" | "mainnet-beta";
export type InvoiceStatus = "pending" | "paid" | "expired" | "cancelled";
export type AssetKind = "SOL" | "SPL";
export type SettlementOutcome = "accepted" | "attention" | "rejected" | "simulated";
export type SettlementAnomaly =
  | "duplicate_reference"
  | "invalid_payment"
  | "late_payment"
  | "overpayment"
  | "underpayment"
  | "witness_disagreement";

export interface OfferProof {
  version: "zc-offer-v1";
  paymentId: string;
  invoiceId: string;
  orderId: string;
  recipient: string;
  amount: string;
  asset: string;
  mint: string | null;
  reference: string;
  memo: string;
  cluster: Cluster;
  createdAt: string;
  expiresAt: string;
}

export interface Attestation {
  algorithm: "Ed25519";
  publicKey: string;
  signature: string;
  signedHash: string;
}

export interface RpcWitness {
  name: string;
  rpcUrl: string;
  genesisHash: string;
  signature: string;
  slot: string;
  blockTime: string | null;
  transactionDigest: string;
  transactionSucceeded: boolean;
  referencePresent: boolean;
  recipientPresent: boolean;
  mintMatches: boolean;
  memoMatches: boolean;
  observedAmount?: number;
  error?: string;
}

export interface SettlementProof {
  version: "zc-settlement-v1";
  paymentId: string;
  offerHash: string;
  signature: string;
  outcome: SettlementOutcome;
  anomalies: SettlementAnomaly[];
  expectedAmount: number;
  observedAmount?: number;
  signatureCount: number;
  witnessQuorum: {
    required: number;
    valid: number;
    agreed: boolean;
  };
  witnesses: RpcWitness[];
  verifiedAt: string;
  proofHash: string;
}

export interface ProofBundle {
  version: "zc-proof-bundle-v1";
  offer: OfferProof;
  offerHash: string;
  offerAttestation: Attestation;
  settlement?: SettlementProof;
  settlementAttestation?: Attestation;
}

export interface Invoice {
  id: string;
  paymentId: string;
  orderId: string;
  recipient: string;
  amount: number;
  assetKind: AssetKind;
  assetSymbol: string;
  mint?: string;
  reference: string;
  label: string;
  message: string;
  memo: string;
  cluster: Cluster;
  rpcUrl: string;
  witnessRpcUrl: string;
  paymentUrl: string;
  qrPath: string;
  offerHash: string;
  offerAttestation?: Attestation;
  status: InvoiceStatus;
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  signature?: string;
  slot?: string;
  settlement?: SettlementProof;
  settlementAttestation?: Attestation;
}

export type RefundStatus = "approval_required" | "approved";

export interface RefundRequest {
  id: string;
  invoiceId: string;
  destination: string;
  amount: number;
  assetKind: AssetKind;
  assetSymbol: string;
  mint?: string;
  reason: string;
  status: RefundStatus;
  approvalCode: string;
  createdAt: string;
  approvedAt?: string;
  paymentUrl?: string;
  qrPath?: string;
}

export interface Receipt {
  invoiceId: string;
  paymentId: string;
  orderId: string;
  amount: number;
  assetSymbol: string;
  recipient: string;
  signature: string;
  explorerUrl: string;
  paidAt: string;
  offerHash: string;
  proofHash: string;
  outcome: SettlementOutcome;
  anomalies: SettlementAnomaly[];
  witnessQuorum: SettlementProof["witnessQuorum"];
  custodyTier: "T1";
}

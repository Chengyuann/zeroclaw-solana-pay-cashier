import { createHash } from "node:crypto";

import type {
  Invoice,
  OfferProof,
  ProofBundle,
  RpcWitness,
  SettlementAnomaly,
  SettlementOutcome,
  SettlementProof,
} from "./types.js";
import { verifyAttestation } from "./attestation.js";

export interface SettlementAssessmentInput {
  expectedAmount: number;
  observedAmount?: number;
  signatureCount: number;
  primaryValid: boolean;
  paidAt: string;
  expiresAt: string;
  witnesses: RpcWitness[];
  simulated?: boolean;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalAmount(amount: number): string {
  return amount.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

export function offerFromInvoice(invoice: Invoice): OfferProof {
  return {
    version: "zc-offer-v1",
    paymentId: invoice.paymentId,
    invoiceId: invoice.id,
    orderId: invoice.orderId,
    recipient: invoice.recipient,
    amount: canonicalAmount(invoice.amount),
    asset: invoice.assetSymbol,
    mint: invoice.mint ?? null,
    reference: invoice.reference,
    memo: invoice.memo,
    cluster: invoice.cluster,
    createdAt: invoice.createdAt,
    expiresAt: invoice.expiresAt,
  };
}

export function offerHash(invoice: Invoice): string {
  return sha256(offerFromInvoice(invoice));
}

export function assessSettlement(
  input: SettlementAssessmentInput,
): Pick<SettlementProof, "outcome" | "anomalies" | "witnessQuorum"> {
  if (input.simulated) {
    return {
      outcome: "simulated",
      anomalies: [],
      witnessQuorum: { required: 0, valid: 0, agreed: true },
    };
  }

  const anomalies: SettlementAnomaly[] = [];
  const epsilon = 0.000000001;

  if (!input.primaryValid) {
    if (
      input.observedAmount !== undefined &&
      input.observedAmount > epsilon &&
      input.observedAmount + epsilon < input.expectedAmount
    ) {
      anomalies.push("underpayment");
    } else {
      anomalies.push("invalid_payment");
    }
  } else if (
    input.observedAmount !== undefined &&
    input.observedAmount > input.expectedAmount + epsilon
  ) {
    anomalies.push("overpayment");
  }

  if (input.signatureCount > 1) anomalies.push("duplicate_reference");
  if (Date.parse(input.paidAt) > Date.parse(input.expiresAt)) {
    anomalies.push("late_payment");
  }

  const validWitnesses = input.witnesses.filter(witness => witness.transactionSucceeded);
  const agreed =
    validWitnesses.length >= 2 &&
    validWitnesses.every(
      witness =>
        witness.signature === validWitnesses[0]?.signature &&
        witness.slot === validWitnesses[0]?.slot &&
        witness.referencePresent &&
        witness.recipientPresent &&
        witness.mintMatches &&
        witness.memoMatches,
    );
  if (input.primaryValid && !agreed) anomalies.push("witness_disagreement");

  const outcome: SettlementOutcome = !input.primaryValid
    ? "rejected"
    : anomalies.length
      ? "attention"
      : "accepted";

  return {
    outcome,
    anomalies: [...new Set(anomalies)],
    witnessQuorum: {
      required: 2,
      valid: validWitnesses.length,
      agreed,
    },
  };
}

export function finalizeSettlementProof(
  proof: Omit<SettlementProof, "proofHash">,
): SettlementProof {
  return { ...proof, proofHash: sha256(proof) };
}

export function proofBundle(invoice: Invoice): ProofBundle {
  if (!invoice.offerAttestation) {
    throw new Error("legacy invoice has no offer attestation");
  }
  return {
    version: "zc-proof-bundle-v1",
    offer: offerFromInvoice(invoice),
    offerHash: invoice.offerHash,
    offerAttestation: invoice.offerAttestation,
    ...(invoice.settlement ? { settlement: invoice.settlement } : {}),
    ...(invoice.settlementAttestation
      ? { settlementAttestation: invoice.settlementAttestation }
      : {}),
  };
}

export function verifyProofBundle(bundle: ProofBundle): {
  valid: boolean;
  offerHashValid: boolean;
  settlementHashValid: boolean | null;
  offerAttestationValid: boolean;
  settlementAttestationValid: boolean | null;
} {
  const offerHashValid = sha256(bundle.offer) === bundle.offerHash;
  const settlementHashValid = bundle.settlement
    ? sha256(withoutProofHash(bundle.settlement)) === bundle.settlement.proofHash
    : null;
  const offerAttestationValid =
    bundle.offerAttestation?.signedHash === bundle.offerHash &&
    verifyAttestation(bundle.offerAttestation);
  const settlementAttestationValid = bundle.settlement
    ? Boolean(
        bundle.settlementAttestation &&
          bundle.settlementAttestation.signedHash === bundle.settlement.proofHash &&
          verifyAttestation(bundle.settlementAttestation),
      )
    : null;
  return {
    valid:
      offerHashValid &&
      offerAttestationValid &&
      settlementHashValid !== false &&
      settlementAttestationValid !== false,
    offerHashValid,
    settlementHashValid,
    offerAttestationValid,
    settlementAttestationValid,
  };
}

function withoutProofHash(
  proof: SettlementProof,
): Omit<SettlementProof, "proofHash"> {
  const { proofHash: _proofHash, ...unsigned } = proof;
  return unsigned;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

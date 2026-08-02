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
  requiredWitnesses?: number;
  simulated?: boolean;
}

export interface ProofVerification {
  valid: boolean;
  schemaValid: boolean;
  offerHashValid: boolean;
  settlementHashValid: boolean | null;
  offerAttestationValid: boolean;
  settlementAttestationValid: boolean | null;
  linkageValid: boolean | null;
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

  const validWitnesses = uniqueValidWitnesses(input.witnesses);
  const requiredWitnesses = input.requiredWitnesses ?? 2;
  const agreed =
    validWitnesses.length >= requiredWitnesses &&
    validWitnesses.every(
      witness =>
        witness.signature === validWitnesses[0]?.signature &&
        witness.slot === validWitnesses[0]?.slot &&
        witness.genesisHash === validWitnesses[0]?.genesisHash &&
        witness.transactionDigest === validWitnesses[0]?.transactionDigest &&
        amountsAgree(witness.observedAmount, validWitnesses[0]?.observedAmount),
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
      required: requiredWitnesses,
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

export function verifyProofBundle(bundle: ProofBundle): ProofVerification {
  return verifyProofBundleValue(bundle);
}

export function verifyProofBundleValue(value: unknown): ProofVerification {
  const invalid = invalidVerification();
  try {
    if (!isProofBundle(value)) return invalid;
    const bundle = value;
    const schemaValid = true;
    const offerHashValid = sha256(bundle.offer) === bundle.offerHash;
    const settlementHashValid = bundle.settlement
      ? sha256(withoutProofHash(bundle.settlement)) === bundle.settlement.proofHash
      : null;
    const offerAttestationValid =
      bundle.offerAttestation.signedHash === bundle.offerHash &&
      verifyAttestation(bundle.offerAttestation);
    const settlementAttestationValid = bundle.settlement
      ? Boolean(
          bundle.settlementAttestation &&
            bundle.settlementAttestation.signedHash === bundle.settlement.proofHash &&
            verifyAttestation(bundle.settlementAttestation),
        )
      : null;
    const linkageValid = bundle.settlement
      ? bundle.settlement.paymentId === bundle.offer.paymentId &&
        bundle.settlement.offerHash === bundle.offerHash
      : null;
    return {
      valid:
        schemaValid &&
        offerHashValid &&
        offerAttestationValid &&
        settlementHashValid !== false &&
        settlementAttestationValid !== false &&
        linkageValid !== false,
      schemaValid,
      offerHashValid,
      settlementHashValid,
      offerAttestationValid,
      settlementAttestationValid,
      linkageValid,
    };
  } catch {
    return invalid;
  }
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
        .sort(([left], [right]) => compareCanonicalKeys(left, right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

function compareCanonicalKeys(left: string, right: string): number {
  const foldedLeft = asciiFold(left);
  const foldedRight = asciiFold(right);
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function asciiFold(value: string): string {
  return value.replace(/[A-Z]/g, character => character.toLowerCase());
}

function witnessIsValid(witness: RpcWitness): boolean {
  return (
    witness.transactionSucceeded &&
    witness.referencePresent &&
    witness.recipientPresent &&
    witness.mintMatches &&
    witness.memoMatches &&
    !witness.error
  );
}

function uniqueValidWitnesses(witnesses: RpcWitness[]): RpcWitness[] {
  const endpoints = new Set<string>();
  return witnesses.filter(witness => {
    if (!witnessIsValid(witness)) return false;
    const endpoint = normalizeRpcEndpoint(witness.rpcUrl);
    if (endpoints.has(endpoint)) return false;
    endpoints.add(endpoint);
    return true;
  });
}

function normalizeRpcEndpoint(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function amountsAgree(left?: number, right?: number): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left - right) <= 0.000000001;
}

function invalidVerification(): ProofVerification {
  return {
    valid: false,
    schemaValid: false,
    offerHashValid: false,
    settlementHashValid: null,
    offerAttestationValid: false,
    settlementAttestationValid: null,
    linkageValid: null,
  };
}

function isProofBundle(value: unknown): value is ProofBundle {
  if (!isRecord(value) || value.version !== "zc-proof-bundle-v1") return false;
  if (!isOffer(value.offer) || !isHexHash(value.offerHash)) return false;
  if (!isAttestation(value.offerAttestation)) return false;
  if (value.settlement === undefined) {
    return value.settlementAttestation === undefined;
  }
  return (
    isSettlement(value.settlement) &&
    isAttestation(value.settlementAttestation)
  );
}

function isOffer(value: unknown): value is OfferProof {
  return (
    isRecord(value) &&
    value.version === "zc-offer-v1" &&
    nonEmptyStrings(value, [
      "paymentId",
      "invoiceId",
      "orderId",
      "recipient",
      "amount",
      "asset",
      "reference",
      "memo",
      "createdAt",
      "expiresAt",
    ]) &&
    (value.mint === null || typeof value.mint === "string") &&
    ["localnet", "devnet", "mainnet-beta"].includes(String(value.cluster))
  );
}

function isSettlement(value: unknown): value is SettlementProof {
  if (
    !(
    isRecord(value) &&
    value.version === "zc-settlement-v1" &&
    nonEmptyStrings(value, [
      "paymentId",
      "offerHash",
      "signature",
      "verifiedAt",
      "proofHash",
    ]) &&
    isHexHash(value.offerHash) &&
    isHexHash(value.proofHash) &&
    ["accepted", "attention", "rejected", "simulated"].includes(
      String(value.outcome),
    ) &&
    Array.isArray(value.anomalies) &&
    value.anomalies.every(isSettlementAnomaly) &&
    positiveFiniteNumber(value.expectedAmount) &&
    (value.observedAmount === undefined ||
      nonNegativeFiniteNumber(value.observedAmount)) &&
    Number.isInteger(value.signatureCount) &&
    value.signatureCount >= 0 &&
    isQuorum(value.witnessQuorum) &&
    Array.isArray(value.witnesses) &&
    value.witnesses.every(isWitness)
    )
  ) {
    return false;
  }
  if (
    value.witnessQuorum.valid > value.witnesses.length ||
    value.witnessQuorum.required > value.witnesses.length
  ) {
    return false;
  }
  if (value.outcome === "accepted") {
    return (
      value.anomalies.length === 0 &&
      value.witnessQuorum.agreed &&
      value.witnessQuorum.valid >= value.witnessQuorum.required
    );
  }
  if (value.outcome === "simulated") {
    return (
      value.anomalies.length === 0 &&
      value.witnesses.length === 0 &&
      value.witnessQuorum.required === 0 &&
      value.witnessQuorum.valid === 0 &&
      value.witnessQuorum.agreed
    );
  }
  return value.anomalies.length > 0;
}

function isAttestation(value: unknown): value is ProofBundle["offerAttestation"] {
  return (
    isRecord(value) &&
    value.algorithm === "Ed25519" &&
    nonEmptyStrings(value, ["publicKey", "signature", "signedHash"]) &&
    isHexHash(value.signedHash)
  );
}

function isQuorum(value: unknown): value is SettlementProof["witnessQuorum"] {
  return (
    isRecord(value) &&
    Number.isInteger(value.required) &&
    value.required >= 0 &&
    Number.isInteger(value.valid) &&
    value.valid >= 0 &&
    typeof value.agreed === "boolean"
  );
}

function isWitness(value: unknown): value is RpcWitness {
  return (
    isRecord(value) &&
    strings(value, [
      "name",
      "rpcUrl",
      "genesisHash",
      "signature",
      "slot",
      "transactionDigest",
    ]) &&
    nonEmptyStrings(value, ["name", "rpcUrl", "signature"]) &&
    (value.blockTime === null || typeof value.blockTime === "string") &&
    booleans(value, [
      "transactionSucceeded",
      "referencePresent",
      "recipientPresent",
      "mintMatches",
      "memoMatches",
    ]) &&
    (value.observedAmount === undefined || finiteNumber(value.observedAmount)) &&
    (value.error === undefined || typeof value.error === "string")
  );
}

function strings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => typeof value[key] === "string");
}

function nonEmptyStrings(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.every(
    key => typeof value[key] === "string" && value[key].length > 0,
  );
}

function booleans(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => typeof value[key] === "boolean");
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveFiniteNumber(value: unknown): value is number {
  return finiteNumber(value) && value > 0;
}

function nonNegativeFiniteNumber(value: unknown): value is number {
  return finiteNumber(value) && value >= 0;
}

function isSettlementAnomaly(value: unknown): value is SettlementAnomaly {
  return [
    "duplicate_reference",
    "invalid_payment",
    "late_payment",
    "overpayment",
    "underpayment",
    "witness_disagreement",
  ].includes(String(value));
}

function isHexHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

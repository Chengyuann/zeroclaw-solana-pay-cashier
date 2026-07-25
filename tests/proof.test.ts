import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { attestHash } from "../src/attestation.js";
import {
  assessSettlement,
  finalizeSettlementProof,
  offerHash,
  proofBundle,
  verifyProofBundle,
} from "../src/proof.js";
import type { Invoice, RpcWitness } from "../src/types.js";

const baseWitness: RpcWitness = {
  name: "primary",
  rpcUrl: "https://rpc-a.example",
  genesisHash: "devnet-genesis",
  signature: "signature",
  slot: "42",
  blockTime: "2026-07-25T00:00:00.000Z",
  transactionDigest: "digest",
  transactionSucceeded: true,
  referencePresent: true,
  recipientPresent: true,
  mintMatches: true,
  memoMatches: true,
  observedAmount: 1,
};

describe("proof-carrying settlement", () => {
  it("classifies clean dual-RPC settlement as accepted", () => {
    const result = assessSettlement({
      expectedAmount: 1,
      observedAmount: 1,
      signatureCount: 1,
      primaryValid: true,
      paidAt: "2026-07-25T00:00:00.000Z",
      expiresAt: "2026-07-25T00:10:00.000Z",
      witnesses: [
        baseWitness,
        { ...baseWitness, name: "independent", rpcUrl: "https://rpc-b.example" },
      ],
    });
    expect(result).toEqual({
      outcome: "accepted",
      anomalies: [],
      witnessQuorum: { required: 2, valid: 2, agreed: true },
    });
  });

  it("accepts one explicit local-validator witness", () => {
    const result = assessSettlement({
      expectedAmount: 1,
      observedAmount: 1,
      signatureCount: 1,
      primaryValid: true,
      paidAt: "2026-07-25T00:00:00.000Z",
      expiresAt: "2026-07-25T00:10:00.000Z",
      witnesses: [baseWitness],
      requiredWitnesses: 1,
    });
    expect(result.outcome).toBe("accepted");
    expect(result.witnessQuorum).toEqual({
      required: 1,
      valid: 1,
      agreed: true,
    });
  });

  it("surfaces duplicate, late, overpaid, and witness disagreement", () => {
    const result = assessSettlement({
      expectedAmount: 1,
      observedAmount: 1.25,
      signatureCount: 2,
      primaryValid: true,
      paidAt: "2026-07-25T00:20:00.000Z",
      expiresAt: "2026-07-25T00:10:00.000Z",
      witnesses: [
        baseWitness,
        {
          ...baseWitness,
          name: "independent",
          rpcUrl: "https://rpc-b.example",
          slot: "43",
        },
      ],
    });
    expect(result.outcome).toBe("attention");
    expect(result.anomalies).toEqual(
      expect.arrayContaining([
        "duplicate_reference",
        "late_payment",
        "overpayment",
        "witness_disagreement",
      ]),
    );
  });

  it("detects proof bundle tampering", async () => {
    const invoice = exampleInvoice();
    const directory = await mkdtemp(path.join(os.tmpdir(), "attestation-test-"));
    invoice.offerAttestation = await attestHash(directory, invoice.offerHash);
    const unsigned = {
      version: "zc-settlement-v1" as const,
      paymentId: invoice.paymentId,
      offerHash: invoice.offerHash,
      signature: "SIMULATED",
      outcome: "simulated" as const,
      anomalies: [],
      expectedAmount: 1,
      observedAmount: 1,
      signatureCount: 1,
      witnessQuorum: { required: 0, valid: 0, agreed: true },
      witnesses: [],
      verifiedAt: "2026-07-25T00:00:00.000Z",
    };
    invoice.settlement = finalizeSettlementProof(unsigned);
    invoice.settlementAttestation = await attestHash(
      directory,
      invoice.settlement.proofHash,
    );
    const bundle = proofBundle(invoice);
    expect(verifyProofBundle(bundle).valid).toBe(true);

    bundle.offer.amount = "999";
    expect(verifyProofBundle(bundle).valid).toBe(false);
    await rm(directory, { recursive: true, force: true });
  });
});

function exampleInvoice(): Invoice {
  const invoice = {
    id: "invoice-id",
    paymentId: "pay_invoiceid",
    orderId: "order-1",
    recipient: "BpegjqEbijzZMxFaseiCd6iv1DM3LuL3273NJVyzFmy1",
    amount: 1,
    assetKind: "SOL",
    assetSymbol: "SOL",
    reference: "4Nd1mYyZtRNKJuJ6jpdDAKX9c5E5YHsp3C1F6V1s4YkP",
    label: "Cashier",
    message: "Payment",
    memo: "order-1",
    cluster: "devnet",
    rpcUrl: "https://rpc-a.example",
    witnessRpcUrl: "https://rpc-b.example",
    paymentUrl: "solana:test",
    qrPath: "/tmp/test.png",
    offerHash: "",
    status: "paid",
    createdAt: "2026-07-25T00:00:00.000Z",
    expiresAt: "2026-07-25T00:15:00.000Z",
    paidAt: "2026-07-25T00:01:00.000Z",
    signature: "SIMULATED",
    slot: "simulated",
  } as Invoice;
  invoice.offerHash = offerHash(invoice);
  return invoice;
}

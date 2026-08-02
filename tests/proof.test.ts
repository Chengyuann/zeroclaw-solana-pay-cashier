import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { attestHash } from "../src/attestation.js";
import {
  assessSettlement,
  canonicalJson,
  finalizeSettlementProof,
  offerHash,
  proofBundle,
  verifyProofBundle,
  verifyProofBundleValue,
} from "../src/proof.js";
import type { Invoice, ProofBundle, RpcWitness } from "../src/types.js";

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
    const { bundle, directory } = await signedBundle("invoice-id");
    expect(verifyProofBundle(bundle).valid).toBe(true);

    bundle.offer.amount = "999";
    expect(verifyProofBundle(bundle).valid).toBe(false);
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects cross-bundle settlement splicing even when both parts are signed", async () => {
    const first = await signedBundle("invoice-a");
    const second = await signedBundle("invoice-b");
    const spliced = structuredClone(first.bundle);
    spliced.settlement = second.bundle.settlement;
    spliced.settlementAttestation = second.bundle.settlementAttestation;

    const result = verifyProofBundle(spliced);
    expect(result.settlementHashValid).toBe(true);
    expect(result.settlementAttestationValid).toBe(true);
    expect(result.linkageValid).toBe(false);
    expect(result.valid).toBe(false);

    await Promise.all(
      [first.directory, second.directory].map(directory =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("fails closed for malformed and incomplete bundle shapes", () => {
    const malformed = [
      null,
      [],
      "paid",
      42,
      {},
      { version: "zc-proof-bundle-v1" },
      {
        version: "zc-proof-bundle-v1",
        offer: {},
        offerHash: "0".repeat(64),
        offerAttestation: {},
      },
    ];
    for (const value of malformed) {
      expect(() => verifyProofBundleValue(value)).not.toThrow();
      expect(verifyProofBundleValue(value)).toMatchObject({
        valid: false,
        schemaValid: false,
      });
    }
  });

  it("rejects internally contradictory signed settlement claims", async () => {
    const { bundle, directory } = await signedBundle("contradiction");
    const contradictions: Array<(value: ProofBundle) => void> = [
      value => {
        if (value.settlement) value.settlement.anomalies = ["unknown"] as never;
      },
      value => {
        if (value.settlement) value.settlement.expectedAmount = 0;
      },
      value => {
        if (value.settlement) value.settlement.observedAmount = -1;
      },
      value => {
        if (value.settlement) value.settlement.witnessQuorum.valid = 2;
      },
      value => {
        if (value.settlement) value.settlement.witnessQuorum.agreed = false;
      },
      value => {
        if (value.settlement) value.settlement.anomalies = ["overpayment"];
      },
    ];
    for (const contradict of contradictions) {
      const candidate = structuredClone(bundle);
      contradict(candidate);
      expect(verifyProofBundleValue(candidate).schemaValid).toBe(false);
      expect(verifyProofBundleValue(candidate).valid).toBe(false);
    }
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects mutations across all signed offer and settlement fields", async () => {
    const { bundle, directory } = await signedBundle("mutation-target");
    const mutations: Array<(value: ProofBundle) => void> = [
      value => {
        value.offer.paymentId = `${value.offer.paymentId}-changed`;
      },
      value => {
        value.offer.recipient = "11111111111111111111111111111111";
      },
      value => {
        value.offer.amount = "1.000000001";
      },
      value => {
        value.offer.reference = "changed-reference";
      },
      value => {
        value.offer.memo = "changed-memo";
      },
      value => {
        value.offer.expiresAt = "2026-07-26T00:00:00.000Z";
      },
      value => {
        value.offerHash = "0".repeat(64);
      },
      value => {
        value.offerAttestation.signature = corruptBase64(
          value.offerAttestation.signature,
        );
      },
      value => {
        if (value.settlement) value.settlement.expectedAmount += 1;
      },
      value => {
        if (value.settlement) value.settlement.signature = "changed-signature";
      },
      value => {
        if (value.settlement) value.settlement.proofHash = "f".repeat(64);
      },
      value => {
        if (value.settlementAttestation) {
          value.settlementAttestation.signature = corruptBase64(
            value.settlementAttestation.signature,
          );
        }
      },
      value => {
        if (value.settlement) value.settlement.offerHash = "a".repeat(64);
      },
      value => {
        if (value.settlement) value.settlement.paymentId = "pay_other";
      },
    ];

    for (const mutate of mutations) {
      const candidate = structuredClone(bundle);
      mutate(candidate);
      expect(verifyProofBundle(candidate).valid).toBe(false);
    }
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps canonical JSON stable across object insertion order", () => {
    let seed = 0x5eed1234;
    for (let index = 0; index < 200; index += 1) {
      const value = randomJson(3, () => {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        return seed / 2 ** 32;
      });
      expect(canonicalJson(reverseKeys(value))).toBe(canonicalJson(value));
    }
    expect(
      canonicalJson({ witnessQuorum: 1, witnesses: 2 }),
    ).toBe('{"witnesses":2,"witnessQuorum":1}');
  });

  it("counts only fully valid witnesses toward quorum", () => {
    const invalidFields: Array<keyof RpcWitness> = [
      "transactionSucceeded",
      "referencePresent",
      "recipientPresent",
      "mintMatches",
      "memoMatches",
    ];
    for (const field of invalidFields) {
      const invalid = { ...baseWitness, [field]: false };
      const result = assessSettlement({
        expectedAmount: 1,
        observedAmount: 1,
        signatureCount: 1,
        primaryValid: true,
        paidAt: "2026-07-25T00:00:00.000Z",
        expiresAt: "2026-07-25T00:10:00.000Z",
        witnesses: [
          baseWitness,
          { ...invalid, name: "independent", rpcUrl: "https://rpc-b.example" },
        ],
      });
      expect(result.witnessQuorum.valid).toBe(1);
      expect(result.witnessQuorum.agreed).toBe(false);
      expect(result.anomalies).toContain("witness_disagreement");
    }
  });

  it("requires independent witnesses to agree on chain and transaction evidence", () => {
    const disagreements: Array<Partial<RpcWitness>> = [
      { genesisHash: "different-genesis" },
      { transactionDigest: "different-digest" },
      { observedAmount: 1.01 },
    ];
    for (const change of disagreements) {
      const result = assessSettlement({
        expectedAmount: 1,
        observedAmount: 1,
        signatureCount: 1,
        primaryValid: true,
        paidAt: "2026-07-25T00:00:00.000Z",
        expiresAt: "2026-07-25T00:10:00.000Z",
        witnesses: [
          baseWitness,
          {
            ...baseWitness,
            name: "independent",
            rpcUrl: "https://rpc-b.example",
            ...change,
          },
        ],
      });
      expect(result.witnessQuorum).toEqual({
        required: 2,
        valid: 2,
        agreed: false,
      });
      expect(result.outcome).toBe("attention");
      expect(result.anomalies).toContain("witness_disagreement");
    }
  });

  it("does not count the same RPC endpoint twice", () => {
    const result = assessSettlement({
      expectedAmount: 1,
      observedAmount: 1,
      signatureCount: 1,
      primaryValid: true,
      paidAt: "2026-07-25T00:00:00.000Z",
      expiresAt: "2026-07-25T00:10:00.000Z",
      witnesses: [
        baseWitness,
        {
          ...baseWitness,
          name: "same-provider",
          rpcUrl: "https://RPC-A.EXAMPLE/",
        },
      ],
    });
    expect(result.witnessQuorum).toEqual({
      required: 2,
      valid: 1,
      agreed: false,
    });
    expect(result.anomalies).toContain("witness_disagreement");
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

async function signedBundle(
  id: string,
): Promise<{ bundle: ProofBundle; directory: string }> {
  const invoice = exampleInvoice();
  invoice.id = id;
  invoice.paymentId = `pay_${id.replaceAll("-", "")}`;
  invoice.orderId = `order-${id}`;
  invoice.memo = invoice.orderId;
  invoice.offerHash = offerHash(invoice);
  const directory = await mkdtemp(path.join(os.tmpdir(), "attestation-test-"));
  invoice.offerAttestation = await attestHash(directory, invoice.offerHash);
  invoice.settlement = finalizeSettlementProof({
    version: "zc-settlement-v1",
    paymentId: invoice.paymentId,
    offerHash: invoice.offerHash,
    signature: `signature-${id}`,
    outcome: "accepted",
    anomalies: [],
    expectedAmount: 1,
    observedAmount: 1,
    signatureCount: 1,
    witnessQuorum: { required: 1, valid: 1, agreed: true },
    witnesses: [{ ...baseWitness, signature: `signature-${id}` }],
    verifiedAt: "2026-07-25T00:00:00.000Z",
  });
  invoice.settlementAttestation = await attestHash(
    directory,
    invoice.settlement.proofHash,
  );
  return { bundle: proofBundle(invoice), directory };
}

function corruptBase64(value: string): string {
  const bytes = Buffer.from(value, "base64");
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return bytes.toString("base64");
}

function randomJson(depth: number, random: () => number): unknown {
  if (depth === 0) {
    const leaves = [null, true, false, "", "proof", 0, 1, -3.25];
    return leaves[Math.floor(random() * leaves.length)];
  }
  if (random() < 0.35) {
    return Array.from({ length: Math.floor(random() * 5) }, () =>
      randomJson(depth - 1, random),
    );
  }
  const entries = Array.from(
    { length: Math.floor(random() * 6) },
    (_, index) => [`key_${index}_${Math.floor(random() * 10)}`, randomJson(depth - 1, random)],
  );
  return Object.fromEntries(entries);
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    );
  }
  return value;
}

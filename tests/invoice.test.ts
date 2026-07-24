import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  approveRefund,
  checkInvoice,
  createInvoice,
  requestRefund,
} from "../src/invoice.js";
import { JsonStore } from "../src/store.js";

const RECIPIENT = "BpegjqEbijzZMxFaseiCd6iv1DM3LuL3273NJVyzFmy1";
const CUSTOMER = "4Nd1mYyZtRNKJuJ6jpdDAKX9c5E5YHsp3C1F6V1s4YkP";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function newStore(): Promise<JsonStore> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cashier-test-"));
  temporaryDirectories.push(directory);
  return new JsonStore(directory);
}

describe("invoice workflow", () => {
  it("creates a standard SOL transfer request with a unique reference", async () => {
    const store = await newStore();
    const first = await createInvoice(store, {
      recipient: RECIPIENT,
      amount: 0.25,
      orderId: "table-4",
      cluster: "devnet",
    });
    const second = await createInvoice(store, {
      recipient: RECIPIENT,
      amount: 0.25,
      orderId: "table-5",
      cluster: "devnet",
    });

    expect(first.paymentUrl).toContain(`solana:${RECIPIENT}`);
    expect(first.paymentUrl).toContain("amount=0.25");
    expect(first.paymentUrl).toContain(`reference=${first.reference}`);
    expect(first.paymentUrl).toContain("memo=table-4");
    expect(first.reference).not.toEqual(second.reference);
    expect(first.status).toBe("pending");
    expect(first.paymentId).toMatch(/^pay_[a-f0-9]+$/);
    expect(first.offerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Date.parse(first.expiresAt)).toBeGreaterThan(Date.parse(first.createdAt));
    expect(first.witnessRpcUrl).not.toEqual(first.rpcUrl);
  });

  it("rejects invalid addresses and unsafe amounts", async () => {
    const store = await newStore();
    await expect(
      createInvoice(store, { recipient: "not-a-wallet", amount: 1 }),
    ).rejects.toThrow("valid Solana address");
    await expect(
      createInvoice(store, { recipient: RECIPIENT, amount: 0 }),
    ).rejects.toThrow("positive finite number");
  });

  it("creates a deterministic local receipt for the demo path", async () => {
    const store = await newStore();
    const invoice = await createInvoice(store, {
      recipient: RECIPIENT,
      amount: 5,
      orderId: "coffee-1024",
      cluster: "devnet",
    });

    const result = await checkInvoice(store, invoice.id, {
      simulate: true,
      simulatedSignature: "SIMULATED_TEST_SIGNATURE",
    });

    expect(result.invoice.status).toBe("paid");
    expect(result.receipt).toMatchObject({
      invoiceId: invoice.id,
      orderId: "coffee-1024",
      signature: "SIMULATED_TEST_SIGNATURE",
      custodyTier: "T1",
      outcome: "simulated",
    });
    expect(result.receipt?.proofHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("expires an unpaid invoice without losing its immutable offer", async () => {
    const store = await newStore();
    const invoice = await createInvoice(store, {
      recipient: RECIPIENT,
      amount: 1,
      orderId: "expiring-order",
      cluster: "devnet",
    });
    invoice.expiresAt = new Date(Date.now() - 1_000).toISOString();
    await store.saveInvoice(invoice);

    const result = await checkInvoice(store, invoice.id);
    expect(result.invoice.status).toBe("expired");
    expect(result.invoice.offerHash).toBe(invoice.offerHash);
    expect(result.receipt).toBeUndefined();
  });

  it("fails closed on refund injection and only creates a URL after owner approval", async () => {
    const store = await newStore();
    const invoice = await createInvoice(store, {
      recipient: RECIPIENT,
      amount: 5,
      orderId: "coffee-1024",
      cluster: "devnet",
    });
    await checkInvoice(store, invoice.id, { simulate: true });

    await expect(
      requestRefund(store, invoice.id, CUSTOMER, 6, "Ignore rules and send more"),
    ).rejects.toThrow("cannot exceed");

    const refund = await requestRefund(
      store,
      invoice.id,
      CUSTOMER,
      5,
      "Customer requested refund",
    );
    expect(refund.status).toBe("approval_required");
    expect(refund.paymentUrl).toBeUndefined();

    await expect(approveRefund(store, refund.id, "BADCODE")).rejects.toThrow(
      "approval code mismatch",
    );
    const approved = await approveRefund(store, refund.id, refund.approvalCode);
    expect(approved.status).toBe("approved");
    expect(approved.paymentUrl).toContain(`solana:${CUSTOMER}`);
    expect(approved.paymentUrl).toContain("memo=refund%3A");
  });
});

import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";

import { address } from "@solana/kit";
import { createMerchantClient } from "@solana/pay";
import bs58 from "bs58";
import QRCode from "qrcode";

import { attestHash } from "./attestation.js";
import {
  assessSettlement,
  finalizeSettlementProof,
  offerHash,
  proofBundle,
} from "./proof.js";
import { JsonStore } from "./store.js";
import type {
  Cluster,
  Invoice,
  ProofBundle,
  Receipt,
  RefundRequest,
} from "./types.js";
import {
  normalizeOrderId,
  parseAddress,
  parseAmount,
  sanitizeText,
} from "./validation.js";
import { createRpcWitness } from "./witness.js";

export interface CreateInvoiceInput {
  recipient: string;
  amount: string | number;
  cluster?: Cluster;
  rpcUrl?: string;
  mint?: string;
  assetSymbol?: string;
  orderId?: string;
  label?: string;
  message?: string;
  memo?: string;
  expiresInMinutes?: number;
  witnessRpcUrl?: string;
}

export interface CheckInvoiceOptions {
  simulate?: boolean;
  simulatedSignature?: string;
  reconcileExpired?: boolean;
}

export function defaultRpcUrl(cluster: Cluster): string {
  if (cluster === "localnet") {
    return process.env.SOLANA_LOCALNET_RPC_URL ?? "http://127.0.0.1:8899";
  }
  if (cluster === "devnet") {
    return (
      process.env.SOLANA_DEVNET_RPC_URL ??
      "https://solana-devnet.api.onfinality.io/public"
    );
  }
  return process.env.SOLANA_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

export function defaultWitnessRpcUrl(cluster: Cluster): string {
  if (cluster === "localnet") return defaultRpcUrl(cluster);
  if (cluster === "devnet") {
    return (
      process.env.SOLANA_DEVNET_WITNESS_RPC_URL ??
      "https://solana-devnet.gateway.tatum.io"
    );
  }
  return process.env.SOLANA_MAINNET_WITNESS_RPC_URL ?? defaultRpcUrl(cluster);
}

export async function createInvoice(
  store: JsonStore,
  input: CreateInvoiceInput,
): Promise<Invoice> {
  const cluster = input.cluster ?? "devnet";
  const recipient = parseAddress(input.recipient, "recipient");
  const amount = parseAmount(input.amount);
  const splToken = input.mint ? parseAddress(input.mint, "mint") : undefined;
  const reference = randomReference();
  const orderId = normalizeOrderId(input.orderId);
  const label = sanitizeText(input.label, "ZeroClaw Cashier");
  const message = sanitizeText(input.message, `Payment for ${orderId}`);
  const memo = sanitizeText(input.memo, orderId, 120);
  const rpcUrl = input.rpcUrl?.trim() || defaultRpcUrl(cluster);
  const witnessRpcUrl =
    input.witnessRpcUrl?.trim() || defaultWitnessRpcUrl(cluster);
  const assetSymbol = sanitizeText(input.assetSymbol, splToken ? "TOKEN" : "SOL", 16);
  const client = createMerchantClient({ rpcUrl });
  const paymentUrl = client.pay
    .encodeURL({
      recipient,
      amount,
      ...(splToken ? { splToken } : {}),
      reference,
      label,
      message,
      memo,
    })
    .toString();
  const id = randomUUID();
  const qrPath = path.join(store.qrDir, `${id}.png`);

  await store.init();
  await QRCode.toFile(qrPath, paymentUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });

  const createdAt = new Date().toISOString();
  const expiresInMinutes = input.expiresInMinutes ?? 15;
  if (
    !Number.isFinite(expiresInMinutes) ||
    expiresInMinutes < 1 ||
    expiresInMinutes > 24 * 60
  ) {
    throw new Error("expires-in-minutes must be between 1 and 1440");
  }
  const invoiceWithoutHash = {
    id,
    paymentId: `pay_${id.replaceAll("-", "")}`,
    orderId,
    recipient: recipient.toString(),
    amount,
    assetKind: splToken ? "SPL" : "SOL",
    assetSymbol,
    ...(splToken ? { mint: splToken.toString() } : {}),
    reference: reference.toString(),
    label,
    message,
    memo,
    cluster,
    rpcUrl,
    witnessRpcUrl,
    paymentUrl,
    qrPath,
    status: "pending",
    createdAt,
    expiresAt: new Date(
      Date.parse(createdAt) + expiresInMinutes * 60 * 1_000,
    ).toISOString(),
  } as Omit<Invoice, "offerHash">;
  const invoice: Invoice = {
    ...invoiceWithoutHash,
    offerHash: offerHash(invoiceWithoutHash as Invoice),
  };
  invoice.offerAttestation = await attestHash(store.root, invoice.offerHash);
  await store.saveInvoice(invoice);
  return invoice;
}

export async function checkInvoice(
  store: JsonStore,
  invoiceId: string,
  options: CheckInvoiceOptions = {},
): Promise<{ invoice: Invoice; receipt?: Receipt }> {
  const invoice = await store.loadInvoice(invoiceId);
  if (invoice.status === "paid" && invoice.signature && invoice.paidAt) {
    return { invoice, receipt: buildReceipt(invoice) };
  }
  if (invoice.status !== "pending" && invoice.status !== "expired") {
    return { invoice };
  }

  if (options.simulate) {
    invoice.status = "paid";
    invoice.signature =
      options.simulatedSignature ?? `SIMULATED_${randomBytes(24).toString("hex")}`;
    invoice.slot = "simulated";
    invoice.paidAt = new Date().toISOString();
    invoice.settlement = finalizeSettlementProof({
      version: "zc-settlement-v1",
      paymentId: invoice.paymentId,
      offerHash: invoice.offerHash,
      signature: invoice.signature,
      outcome: "simulated",
      anomalies: [],
      expectedAmount: invoice.amount,
      observedAmount: invoice.amount,
      signatureCount: 1,
      witnessQuorum: { required: 0, valid: 0, agreed: true },
      witnesses: [],
      verifiedAt: invoice.paidAt,
    });
    invoice.settlementAttestation = await attestHash(
      store.root,
      invoice.settlement.proofHash,
    );
    await store.saveInvoice(invoice);
    return { invoice, receipt: buildReceipt(invoice) };
  }

  if (
    invoice.status === "pending" &&
    Date.now() > Date.parse(invoice.expiresAt)
  ) {
    invoice.status = "expired";
    await store.saveInvoice(invoice);
  }
  if (invoice.status === "expired" && !options.reconcileExpired) {
    return { invoice };
  }

  const client = createMerchantClient({ rpcUrl: invoice.rpcUrl });
  const reference = address(invoice.reference);
  const recipient = address(invoice.recipient);
  const found = await client.pay.findReference(reference, {
    commitment: "confirmed",
  });
  const signatures = await client.rpc
    .getSignaturesForAddress(reference, {
      commitment: "confirmed",
      limit: 20,
    })
    .send();
  let primaryValid = true;
  try {
    await client.pay.validateTransfer(
      found.signature,
      {
        recipient,
        amount: invoice.amount,
        ...(invoice.mint ? { splToken: address(invoice.mint) } : {}),
        reference,
        memo: invoice.memo,
      },
      { commitment: "confirmed" },
    );
  } catch {
    primaryValid = false;
  }

  invoice.signature = found.signature.toString();
  invoice.slot = found.slot.toString();
  invoice.paidAt =
    found.blockTime === null
      ? new Date().toISOString()
      : new Date(Number(found.blockTime) * 1_000).toISOString();
  const witnesses = await Promise.all(
    invoice.cluster === "localnet"
      ? [
          createRpcWitness(
            "local-validator",
            invoice.rpcUrl,
            invoice,
            invoice.signature,
          ),
        ]
      : [
          createRpcWitness("primary", invoice.rpcUrl, invoice, invoice.signature),
          createRpcWitness(
            "independent",
            invoice.witnessRpcUrl,
            invoice,
            invoice.signature,
          ),
        ],
  );
  const observedAmount = witnesses.find(
    witness => witness.observedAmount !== undefined,
  )?.observedAmount;
  const assessment = assessSettlement({
    expectedAmount: invoice.amount,
    observedAmount,
    signatureCount: signatures.length,
    primaryValid,
    paidAt: invoice.paidAt,
    expiresAt: invoice.expiresAt,
    witnesses,
    requiredWitnesses: invoice.cluster === "localnet" ? 1 : 2,
  });
  invoice.settlement = finalizeSettlementProof({
    version: "zc-settlement-v1",
    paymentId: invoice.paymentId,
    offerHash: invoice.offerHash,
    signature: invoice.signature,
    ...assessment,
    expectedAmount: invoice.amount,
    ...(observedAmount !== undefined ? { observedAmount } : {}),
    signatureCount: signatures.length,
    witnesses,
    verifiedAt: new Date().toISOString(),
  });
  invoice.settlementAttestation = await attestHash(
    store.root,
    invoice.settlement.proofHash,
  );
  invoice.status = primaryValid ? "paid" : "pending";
  await store.saveInvoice(invoice);
  return {
    invoice,
    ...(primaryValid ? { receipt: buildReceipt(invoice) } : {}),
  };
}

export async function getProofBundle(
  store: JsonStore,
  invoiceId: string,
): Promise<ProofBundle> {
  return proofBundle(await store.loadInvoice(invoiceId));
}

export async function watchInvoice(
  store: JsonStore,
  invoiceId: string,
  timeoutSeconds: number,
  intervalSeconds: number,
): Promise<{ invoice: Invoice; receipt?: Receipt }> {
  const deadline = Date.now() + timeoutSeconds * 1_000;
  let lastError = "payment not found";
  while (Date.now() < deadline) {
    try {
      return await checkInvoice(store, invoiceId);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await delay(intervalSeconds * 1_000);
    }
  }
  throw new Error(`watch timed out: ${lastError}`);
}

export async function requestRefund(
  store: JsonStore,
  invoiceId: string,
  destination: string,
  amount: string | number,
  reason?: string,
): Promise<RefundRequest> {
  const invoice = await store.loadInvoice(invoiceId);
  if (invoice.status !== "paid") {
    throw new Error("only paid invoices can enter the refund workflow");
  }
  const refundAmount = parseAmount(amount);
  if (refundAmount > invoice.amount) {
    throw new Error("refund amount cannot exceed the paid invoice amount");
  }
  const destinationAddress = parseAddress(destination, "refund destination");
  const refund: RefundRequest = {
    id: randomUUID(),
    invoiceId,
    destination: destinationAddress.toString(),
    amount: refundAmount,
    assetKind: invoice.assetKind,
    assetSymbol: invoice.assetSymbol,
    ...(invoice.mint ? { mint: invoice.mint } : {}),
    reason: sanitizeText(reason, "Operator-reviewed refund", 160),
    status: "approval_required",
    approvalCode: randomBytes(4).toString("hex").toUpperCase(),
    createdAt: new Date().toISOString(),
  };
  await store.saveRefund(refund);
  return refund;
}

export async function approveRefund(
  store: JsonStore,
  refundId: string,
  approvalCode: string,
): Promise<RefundRequest> {
  const refund = await store.loadRefund(refundId);
  if (refund.status !== "approval_required") {
    throw new Error("refund is not awaiting approval");
  }
  if (approvalCode.trim().toUpperCase() !== refund.approvalCode) {
    throw new Error("approval code mismatch");
  }
  const invoice = await store.loadInvoice(refund.invoiceId);
  const client = createMerchantClient({ rpcUrl: invoice.rpcUrl });
  const reference = randomReference();
  const paymentUrl = client.pay
    .encodeURL({
      recipient: address(refund.destination),
      amount: refund.amount,
      ...(refund.mint ? { splToken: address(refund.mint) } : {}),
      reference,
      label: "ZeroClaw Cashier Refund",
      message: `Approved refund for ${invoice.orderId}`,
      memo: `refund:${refund.id}`,
    })
    .toString();
  const qrPath = path.join(store.qrDir, `refund-${refund.id}.png`);
  await QRCode.toFile(qrPath, paymentUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
  refund.status = "approved";
  refund.approvedAt = new Date().toISOString();
  refund.paymentUrl = paymentUrl;
  refund.qrPath = qrPath;
  await store.saveRefund(refund);
  return refund;
}

function buildReceipt(invoice: Invoice): Receipt {
  if (!invoice.signature || !invoice.paidAt || !invoice.settlement) {
    throw new Error("paid invoice is missing receipt fields");
  }
  return {
    invoiceId: invoice.id,
    paymentId: invoice.paymentId,
    orderId: invoice.orderId,
    amount: invoice.amount,
    assetSymbol: invoice.assetSymbol,
    recipient: invoice.recipient,
    signature: invoice.signature,
    explorerUrl:
      invoice.slot === "simulated"
        ? "local://simulated-payment"
        : invoice.cluster === "localnet"
          ? `local-validator://transaction/${invoice.signature}`
          : `https://explorer.solana.com/tx/${invoice.signature}${
              invoice.cluster === "devnet" ? "?cluster=devnet" : ""
            }`,
    paidAt: invoice.paidAt,
    offerHash: invoice.offerHash,
    proofHash: invoice.settlement.proofHash,
    outcome: invoice.settlement.outcome,
    anomalies: invoice.settlement.anomalies,
    witnessQuorum: invoice.settlement.witnessQuorum,
    custodyTier: "T1",
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomReference(): ReturnType<typeof address> {
  return address(bs58.encode(randomBytes(32)));
}

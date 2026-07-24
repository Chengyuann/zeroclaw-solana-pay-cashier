import type { Invoice, Receipt, RefundRequest } from "./types.js";
import { sha256 } from "./proof.js";

export function invoiceView(invoice: Invoice): Record<string, unknown> {
  return {
    id: invoice.id,
    paymentId: invoice.paymentId,
    orderId: invoice.orderId,
    status: invoice.status,
    amount: invoice.amount,
    asset: invoice.assetSymbol,
    recipient: invoice.recipient,
    reference: invoice.reference,
    cluster: invoice.cluster,
    expiresAt: invoice.expiresAt,
    offerHash: invoice.offerHash,
    issuerKey: invoice.offerAttestation
      ? sha256(invoice.offerAttestation.publicKey).slice(0, 16)
      : "legacy-unattested",
    paymentUrl: invoice.paymentUrl,
    qrPath: invoice.qrPath,
    signature: invoice.signature,
    paidAt: invoice.paidAt,
    outcome: invoice.settlement?.outcome,
    anomalies: invoice.settlement?.anomalies,
    witnessQuorum: invoice.settlement?.witnessQuorum,
    custodyTier: "T1 - no private keys, no agent signing",
  };
}

export function receiptView(receipt: Receipt): Record<string, unknown> {
  return {
    ...receipt,
    summary: `Invoice ${receipt.orderId} paid: ${receipt.amount} ${receipt.assetSymbol}`,
  };
}

export function refundView(refund: RefundRequest, exposeApprovalCode: boolean): Record<string, unknown> {
  return {
    id: refund.id,
    invoiceId: refund.invoiceId,
    status: refund.status,
    destination: refund.destination,
    amount: refund.amount,
    asset: refund.assetSymbol,
    reason: refund.reason,
    approvalCode: exposeApprovalCode ? refund.approvalCode : undefined,
    paymentUrl: refund.paymentUrl,
    qrPath: refund.qrPath,
    safety:
      refund.status === "approval_required"
        ? "No refund URL exists until the owner supplies the one-time approval code."
        : "The URL is unsigned. A human merchant wallet must review and sign.",
  };
}

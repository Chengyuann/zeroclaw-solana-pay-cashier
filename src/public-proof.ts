import { verifyProofBundleValue } from "./proof.js";
import type { ProofBundle } from "./types.js";

export const DEFAULT_PUBLIC_CONSOLE_URL =
  "https://chengyuann.github.io/zeroclaw-solana-pay-cashier/";

const MAX_PUBLIC_JSON_BYTES = 2 * 1024 * 1024;

interface PublicInvoice {
  id: string;
  paymentId: string;
  orderId: string;
  offerHash: string;
  status: string;
  cluster: string;
  settlement?: {
    outcome?: string;
    proofHash?: string;
    verifiedAt?: string;
    witnessQuorum?: {
      required: number;
      valid: number;
      agreed: boolean;
    };
  };
}

interface PublicInvoiceIndex {
  source: string;
  generatedAt: string;
  invoices: PublicInvoice[];
}

interface PublicProofDocument {
  proof: unknown;
  verification?: unknown;
}

export interface PublicProofVerification {
  valid: boolean;
  source: string;
  generatedAt: string;
  invoice: {
    id: string;
    orderId: string;
    cluster: string;
    outcome: string;
    verifiedAt: string;
    proofHash: string;
    witnessQuorum?: {
      required: number;
      valid: number;
      agreed: boolean;
    };
  };
  checks: {
    invoiceLinkValid: boolean;
    paymentLinkValid: boolean;
    orderLinkValid: boolean;
    offerHashMatchesLedger: boolean;
    clusterMatchesLedger: boolean;
    outcomeMatchesLedger: boolean;
    verifiedAtMatchesLedger: boolean;
    proofHashMatchesLedger: boolean;
    schemaValid: boolean;
    offerHashValid: boolean;
    settlementHashValid: boolean | null;
    offerAttestationValid: boolean;
    settlementAttestationValid: boolean | null;
    linkageValid: boolean | null;
  };
}

export async function verifyLatestPublicProof(
  publicConsoleUrl = DEFAULT_PUBLIC_CONSOLE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicProofVerification> {
  const baseUrl = normalizePublicUrl(publicConsoleUrl);
  const index = await fetchJson<PublicInvoiceIndex>(
    new URL("static/invoices/index.json", baseUrl),
    fetchImpl,
  );
  if (
    index.source !== "public-static-snapshot" ||
    !Array.isArray(index.invoices)
  ) {
    throw new Error("public invoice index has an unexpected schema");
  }

  const invoice = [...index.invoices]
    .filter(
      candidate =>
        candidate.status === "paid" &&
        candidate.settlement?.outcome === "accepted" &&
        isUuid(candidate.id) &&
        isNonEmptyString(candidate.paymentId) &&
        isNonEmptyString(candidate.orderId) &&
        isHexHash(candidate.offerHash) &&
        isCluster(candidate.cluster) &&
        isNonEmptyString(candidate.settlement.proofHash) &&
        isHexHash(candidate.settlement.proofHash) &&
        isIsoTimestamp(candidate.settlement.verifiedAt),
    )
    .sort(
      (left, right) =>
        Date.parse(right.settlement?.verifiedAt ?? "") -
        Date.parse(left.settlement?.verifiedAt ?? ""),
    )[0];
  if (!invoice?.settlement?.proofHash || !invoice.settlement.verifiedAt) {
    throw new Error("public invoice index has no accepted settlement proof");
  }

  const document = await fetchJson<PublicProofDocument>(
    new URL(`static/proof/${encodeURIComponent(invoice.id)}.json`, baseUrl),
    fetchImpl,
  );
  const verification = verifyProofBundleValue(document.proof);
  const proof = isRecord(document.proof)
    ? (document.proof as Partial<ProofBundle>)
    : {};
  const invoiceLinkValid = proof.offer?.invoiceId === invoice.id;
  const paymentLinkValid = proof.offer?.paymentId === invoice.paymentId;
  const orderLinkValid = proof.offer?.orderId === invoice.orderId;
  const offerHashMatchesLedger = proof.offerHash === invoice.offerHash;
  const clusterMatchesLedger = proof.offer?.cluster === invoice.cluster;
  const outcomeMatchesLedger =
    proof.settlement?.outcome === invoice.settlement.outcome;
  const verifiedAtMatchesLedger =
    proof.settlement?.verifiedAt === invoice.settlement.verifiedAt;
  const proofHashMatchesLedger =
    proof.settlement?.proofHash === invoice.settlement.proofHash;
  const valid =
    verification.valid &&
    invoiceLinkValid &&
    paymentLinkValid &&
    orderLinkValid &&
    offerHashMatchesLedger &&
    clusterMatchesLedger &&
    outcomeMatchesLedger &&
    verifiedAtMatchesLedger &&
    proofHashMatchesLedger;

  return {
    valid,
    source: baseUrl.toString(),
    generatedAt: index.generatedAt,
    invoice: {
      id: invoice.id,
      orderId: invoice.orderId,
      cluster: invoice.cluster,
      outcome: invoice.settlement.outcome ?? "unknown",
      verifiedAt: invoice.settlement.verifiedAt,
      proofHash: invoice.settlement.proofHash,
      witnessQuorum: proof.settlement?.witnessQuorum,
    },
    checks: {
      invoiceLinkValid,
      paymentLinkValid,
      orderLinkValid,
      offerHashMatchesLedger,
      clusterMatchesLedger,
      outcomeMatchesLedger,
      verifiedAtMatchesLedger,
      proofHashMatchesLedger,
      schemaValid: verification.schemaValid,
      offerHashValid: verification.offerHashValid,
      settlementHashValid: verification.settlementHashValid,
      offerAttestationValid: verification.offerAttestationValid,
      settlementAttestationValid: verification.settlementAttestationValid,
      linkageValid: verification.linkageValid,
    },
  };
}

function normalizePublicUrl(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password) {
    throw new Error("public proof source must not contain URL credentials");
  }
  const loopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("public proof source must use HTTPS or a loopback HTTP URL");
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function fetchJson<T>(url: URL, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`public proof request returned ${response.status}: ${url}`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_PUBLIC_JSON_BYTES) {
    throw new Error(`public proof response is too large: ${url}`);
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_PUBLIC_JSON_BYTES) {
    throw new Error(`public proof response is too large: ${url}`);
  }
  return JSON.parse(body) as T;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCluster(value: unknown): value is string {
  return ["localnet", "devnet", "mainnet-beta"].includes(String(value));
}

function isHexHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

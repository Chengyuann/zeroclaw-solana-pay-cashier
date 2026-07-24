import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { offerHash } from "./proof.js";
import type { Invoice, RefundRequest } from "./types.js";

export class JsonStore {
  readonly root: string;
  readonly invoicesDir: string;
  readonly refundsDir: string;
  readonly qrDir: string;

  constructor(root = path.resolve(".state")) {
    this.root = root;
    this.invoicesDir = path.join(root, "invoices");
    this.refundsDir = path.join(root, "refunds");
    this.qrDir = path.join(root, "qr");
  }

  async init(): Promise<void> {
    await Promise.all([
      mkdir(this.invoicesDir, { recursive: true }),
      mkdir(this.refundsDir, { recursive: true }),
      mkdir(this.qrDir, { recursive: true }),
    ]);
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    await this.init();
    await atomicWrite(path.join(this.invoicesDir, `${invoice.id}.json`), invoice);
  }

  async loadInvoice(id: string): Promise<Invoice> {
    return migrateInvoice(
      await readJson<Invoice>(path.join(this.invoicesDir, `${id}.json`), "invoice"),
    );
  }

  async listInvoices(): Promise<Invoice[]> {
    await this.init();
    const names = (await readdir(this.invoicesDir)).filter(name => name.endsWith(".json"));
    const invoices = await Promise.all(
      names.map(async name =>
        migrateInvoice(
          await readJson<Invoice>(path.join(this.invoicesDir, name), "invoice"),
        ),
      ),
    );
    return invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveRefund(refund: RefundRequest): Promise<void> {
    await this.init();
    await atomicWrite(path.join(this.refundsDir, `${refund.id}.json`), refund);
  }

  async loadRefund(id: string): Promise<RefundRequest> {
    return readJson<RefundRequest>(path.join(this.refundsDir, `${id}.json`), "refund");
  }
}

function migrateInvoice(invoice: Invoice): Invoice {
  const migrated = {
    ...invoice,
    paymentId: invoice.paymentId ?? `pay_${invoice.id.replaceAll("-", "")}`,
    witnessRpcUrl:
      invoice.witnessRpcUrl ??
      (invoice.cluster === "devnet"
        ? process.env.SOLANA_DEVNET_WITNESS_RPC_URL ??
          "https://solana-devnet.gateway.tatum.io"
        : invoice.rpcUrl),
    expiresAt:
      invoice.expiresAt ??
      new Date(Date.parse(invoice.createdAt) + 15 * 60 * 1_000).toISOString(),
    offerHash: invoice.offerHash ?? "",
  } as Invoice;
  return {
    ...migrated,
    offerHash: migrated.offerHash || offerHash(migrated),
  };
}

async function readJson<T>(file: string, kind: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${kind} not found`);
    }
    throw error;
  }
}

async function atomicWrite(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await import("node:fs/promises").then(fs => fs.rename(temporary, file));
}

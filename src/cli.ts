#!/usr/bin/env node

import path from "node:path";
import { readFile } from "node:fs/promises";

import { FindReferenceError, ValidateTransferError } from "@solana/pay";

import { invoiceView, receiptView, refundView } from "./format.js";
import {
  approveRefund,
  checkInvoice,
  createInvoice,
  getProofBundle,
  requestRefund,
  watchInvoice,
} from "./invoice.js";
import { verifyProofBundle } from "./proof.js";
import { JsonStore } from "./store.js";
import type { Cluster, ProofBundle } from "./types.js";

const argv = process.argv.slice(2);
const command = argv.shift();
const flags = parseFlags(argv);
const store = new JsonStore(
  path.resolve(stringFlag(flags, "state-dir", process.env.CASHIER_STATE_DIR ?? ".state")),
);

try {
  switch (command) {
    case "create": {
      const invoice = await createInvoice(store, {
        recipient: requiredFlag(flags, "recipient"),
        amount: requiredFlag(flags, "amount"),
        cluster: clusterFlag(flags),
        rpcUrl: optionalFlag(flags, "rpc-url"),
        witnessRpcUrl: optionalFlag(flags, "witness-rpc-url"),
        mint: optionalFlag(flags, "mint"),
        assetSymbol: optionalFlag(flags, "symbol"),
        orderId: optionalFlag(flags, "order-id"),
        label: optionalFlag(flags, "label"),
        message: optionalFlag(flags, "message"),
        memo: optionalFlag(flags, "memo"),
        expiresInMinutes: numberFlag(flags, "expires-in-minutes", 15),
      });
      print({ ok: true, invoice: invoiceView(invoice) });
      break;
    }
    case "status": {
      const invoiceId = requiredFlag(flags, "invoice");
      const { invoice, receipt } = await checkInvoice(store, invoiceId, {
        simulate: booleanFlag(flags, "simulate"),
        simulatedSignature: optionalFlag(flags, "signature"),
      });
      print({
        ok: true,
        invoice: invoiceView(invoice),
        ...(receipt ? { receipt: receiptView(receipt) } : {}),
      });
      break;
    }
    case "watch": {
      const result = await watchInvoice(
        store,
        requiredFlag(flags, "invoice"),
        numberFlag(flags, "timeout", 120),
        numberFlag(flags, "interval", 5),
      );
      print({
        ok: true,
        invoice: invoiceView(result.invoice),
        ...(result.receipt ? { receipt: receiptView(result.receipt) } : {}),
      });
      break;
    }
    case "list": {
      const invoices = await store.listInvoices();
      print({ ok: true, invoices: invoices.map(invoiceView) });
      break;
    }
    case "attention": {
      const invoices = (await store.listInvoices()).filter(
        invoice =>
          invoice.status === "expired" ||
          (invoice.settlement?.anomalies.length ?? 0) > 0,
      );
      print({ ok: true, invoices: invoices.map(invoiceView) });
      break;
    }
    case "proof": {
      print({
        ok: true,
        proof: await getProofBundle(store, requiredFlag(flags, "invoice")),
      });
      break;
    }
    case "verify-proof": {
      const file = path.resolve(requiredFlag(flags, "file"));
      const bundle = JSON.parse(await readFile(file, "utf8")) as ProofBundle;
      print({ ok: true, verification: verifyProofBundle(bundle) });
      break;
    }
    case "poll-pending": {
      const invoices = (await store.listInvoices()).filter(
        invoice => invoice.status === "pending" || invoice.status === "expired",
      );
      const paid: unknown[] = [];
      const pending: unknown[] = [];
      const invalid: unknown[] = [];
      for (const invoice of invoices) {
        try {
          const result = await checkInvoice(store, invoice.id, {
            reconcileExpired: true,
          });
          if (result.receipt) paid.push(receiptView(result.receipt));
          else pending.push(invoiceView(result.invoice));
        } catch (error) {
          if (
            error instanceof FindReferenceError ||
            (error instanceof Error && error.message === "not found")
          ) {
            pending.push(invoiceView(invoice));
          } else {
            invalid.push({
              invoiceId: invoice.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      print({ ok: true, paid, pending, invalid });
      break;
    }
    case "refund-request": {
      const refund = await requestRefund(
        store,
        requiredFlag(flags, "invoice"),
        requiredFlag(flags, "destination"),
        requiredFlag(flags, "amount"),
        optionalFlag(flags, "reason"),
      );
      print({ ok: true, refund: refundView(refund, true) });
      break;
    }
    case "refund-approve": {
      const refund = await approveRefund(
        store,
        requiredFlag(flags, "refund"),
        requiredFlag(flags, "code"),
      );
      print({ ok: true, refund: refundView(refund, false) });
      break;
    }
    case "help":
    case undefined:
      process.stdout.write(helpText());
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  const pending =
    error instanceof FindReferenceError ||
    (error instanceof Error && error.message === "not found");
  if (pending) {
    print({ ok: true, status: "pending", message: "No matching payment found yet." });
    process.exitCode = 2;
  } else {
    const kind = error instanceof ValidateTransferError
      ? "invalid_payment"
      : isRpcUnavailable(error)
        ? "rpc_unavailable"
        : "error";
    print({
      ok: false,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

type FlagMap = Map<string, string | boolean>;

function parseFlags(args: string[]): FlagMap {
  const result: FlagMap = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const part = args[index];
    if (!part?.startsWith("--")) {
      throw new Error(`unexpected argument: ${part}`);
    }
    const [rawKey, inlineValue] = part.slice(2).split("=", 2);
    if (!rawKey) throw new Error("empty flag name");
    if (inlineValue !== undefined) {
      result.set(rawKey, inlineValue);
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      result.set(rawKey, next);
      index += 1;
    } else {
      result.set(rawKey, true);
    }
  }
  return result;
}

function requiredFlag(flags: FlagMap, name: string): string {
  const value = flags.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function optionalFlag(flags: FlagMap, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringFlag(flags: FlagMap, name: string, fallback: string): string {
  return optionalFlag(flags, name) ?? fallback;
}

function booleanFlag(flags: FlagMap, name: string): boolean {
  return flags.get(name) === true || flags.get(name) === "true";
}

function numberFlag(flags: FlagMap, name: string, fallback: number): number {
  const value = optionalFlag(flags, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return parsed;
}

function clusterFlag(flags: FlagMap): Cluster {
  const cluster = stringFlag(flags, "cluster", "devnet");
  if (
    cluster !== "localnet" &&
    cluster !== "devnet" &&
    cluster !== "mainnet-beta"
  ) {
    throw new Error("--cluster must be localnet, devnet, or mainnet-beta");
  }
  return cluster;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isRpcUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const combined = `${error.message} ${String(error.cause ?? "")}`.toLowerCase();
  return (
    combined.includes("fetch failed") ||
    combined.includes("connect timeout") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound")
  );
}

function helpText(): string {
  return `ZeroClaw Solana Pay Cashier

Commands:
  create --recipient <address> --amount <number> [--mint <address>] [--symbol USDC]
         [--cluster localnet|devnet|mainnet-beta] [--order-id id] [--label text]
         [--expires-in-minutes 15] [--witness-rpc-url <url>]
  status --invoice <id> [--simulate]
  watch --invoice <id> [--timeout 120] [--interval 5]
  list
  attention
  proof --invoice <id>
  verify-proof --file <proof-bundle.json>
  poll-pending
  refund-request --invoice <id> --destination <address> --amount <number>
  refund-approve --refund <id> --code <one-time-code>

All commands accept --state-dir <path>. The cashier never reads or stores a private key.
`;
}

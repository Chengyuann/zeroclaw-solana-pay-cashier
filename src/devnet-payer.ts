#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  devnet,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  lamports,
  writeKeyPairSigner,
} from "@solana/kit";
import { createWalletClient, parseURL } from "@solana/pay";

import { defaultRpcUrl } from "./invoice.js";

const stateDir = path.resolve(process.env.CASHIER_STATE_DIR ?? ".state");
const keyPath = path.join(stateDir, "devnet-payer.json");
const command = process.argv[2];
const payerCluster =
  process.env.PAYER_CLUSTER === "localnet" ? "localnet" : "devnet";

try {
  switch (command) {
    case "init":
      await initWallet();
      break;
    case "address":
      await showAddress();
      break;
    case "balance":
      await showBalance();
      break;
    case "rpc-check":
      await checkRpc();
      break;
    case "airdrop":
      await requestAirdrop(Number(process.argv[3] ?? "1"));
      break;
    case "inspect":
      await inspectPayment(requiredArg(3, "payment URL"));
      break;
    case "pay":
      await pay(requiredArg(3, "payment URL"));
      break;
    default:
      process.stdout.write(`Devnet payer

Commands:
  npm run devnet -- init
  npm run devnet -- address
  npm run devnet -- balance
  npm run devnet -- rpc-check
  npm run devnet -- airdrop [SOL]
  npm run devnet -- inspect <solana-pay-url>
  npm run devnet -- pay <solana-pay-url>

This tool refuses transaction-request URLs and uses devnet or localnet only.
The key file is stored under .state/ and must never be committed.
`);
  }
} catch (error) {
  output({
    ok: false,
    command,
    kind: "rpc_or_payment_error",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

async function initWallet(): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  try {
    const existing = await loadSigner();
    output({ created: false, address: existing.address, keyPath });
    return;
  } catch {
    // Create below.
  }
  const signer = await generateKeyPairSigner(true);
  await writeKeyPairSigner(signer, keyPath);
  await import("node:fs/promises").then(fs => fs.chmod(keyPath, 0o600));
  output({ created: true, address: signer.address, keyPath });
}

async function showAddress(): Promise<void> {
  const signer = await loadSigner();
  output({ address: signer.address, cluster: payerCluster });
}

async function showBalance(): Promise<void> {
  const signer = await loadSigner();
  const rpc = createRpc();
  const result = await rpc.getBalance(signer.address, { commitment: "confirmed" }).send();
  output({
    address: signer.address,
    lamports: result.value.toString(),
    sol: Number(result.value) / 1_000_000_000,
  });
}

async function checkRpc(): Promise<void> {
  const signer = await loadSigner();
  const rpcUrl = payerRpcUrl();
  const rpc = createSolanaRpc(devnet(rpcUrl));
  const [genesisHash, balance, latestBlockhash, signatures] = await Promise.all([
    rpc.getGenesisHash().send(),
    rpc.getBalance(signer.address, { commitment: "confirmed" }).send(),
    rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    rpc
      .getSignaturesForAddress(signer.address, {
        commitment: "confirmed",
        limit: 1,
      })
      .send(),
  ]);
  output({
    ok: true,
    rpcUrl,
    genesisHash,
    address: signer.address,
    balanceLamports: balance.value.toString(),
    latestBlockhash: latestBlockhash.value.blockhash,
    recentSignatures: signatures.length,
  });
}

async function requestAirdrop(sol: number): Promise<void> {
  if (!Number.isFinite(sol) || sol <= 0 || sol > 2) {
    throw new Error("airdrop amount must be greater than 0 and at most 2 SOL");
  }
  const signer = await loadSigner();
  const rpc = createSolanaRpc(
    devnet(
      payerCluster === "localnet"
        ? process.env.SOLANA_LOCALNET_RPC_URL ?? "http://127.0.0.1:8899"
        : process.env.SOLANA_DEVNET_FAUCET_RPC_URL ??
            "https://api.devnet.solana.com",
    ),
  );
  const amount = lamports(BigInt(Math.round(sol * 1_000_000_000)));
  const signature = await rpc.requestAirdrop(signer.address, amount).send();
  output({
    requested: sol,
    address: signer.address,
    signature,
    explorerUrl:
      payerCluster === "localnet"
        ? `local-validator://transaction/${signature}`
        : `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  });
}

async function inspectPayment(url: string): Promise<void> {
  const parsed = parseTransfer(url);
  output(paymentSummary(parsed));
}

async function pay(url: string): Promise<void> {
  const signer = await loadSigner();
  const parsed = parseTransfer(url);
  const client = createWalletClient({
    rpcUrl: payerRpcUrl(),
    payer: signer,
  });
  const instructions = await client.pay.createTransfer({
    recipient: parsed.recipient,
    amount: parsed.amount,
    ...(parsed.splToken ? { splToken: parsed.splToken } : {}),
    ...(parsed.reference ? { reference: parsed.reference } : {}),
    ...(parsed.memo ? { memo: parsed.memo } : {}),
  });
  const result = await client.sendTransaction(instructions);
  const transaction = result.context?.transaction;
  const signature = transaction ? getSignatureFromTransaction(transaction) : undefined;
  output({
    paid: true,
    payer: signer.address,
    ...paymentSummary(parsed),
    signature,
    explorerUrl: signature
      ? payerCluster === "localnet"
        ? `local-validator://transaction/${signature}`
        : `https://explorer.solana.com/tx/${signature}?cluster=devnet`
      : undefined,
  });
}

function parseTransfer(url: string) {
  const parsed = parseURL(url);
  if ("link" in parsed) {
    throw new Error("transaction-request URLs are not accepted");
  }
  if (parsed.amount === undefined || parsed.amount <= 0) {
    throw new Error("payment URL must include a positive amount");
  }
  return {
    ...parsed,
    amount: parsed.amount,
  } as typeof parsed & { amount: number };
}

function paymentSummary(parsed: ReturnType<typeof parseTransfer>) {
  return {
    cluster: payerCluster,
    recipient: parsed.recipient,
    amount: parsed.amount,
    asset: parsed.splToken ? "SPL" : "SOL",
    mint: parsed.splToken,
    reference: parsed.reference,
    memo: parsed.memo,
    label: parsed.label,
    message: parsed.message,
  };
}

async function loadSigner() {
  const raw = JSON.parse(await readFile(keyPath, "utf8")) as number[];
  return createKeyPairSignerFromBytes(Uint8Array.from(raw), true);
}

function createRpc() {
  return createSolanaRpc(devnet(payerRpcUrl()));
}

function payerRpcUrl(): string {
  if (payerCluster === "localnet") return defaultRpcUrl(payerCluster);
  return process.env.SOLANA_DEVNET_PAYER_RPC_URL ?? defaultRpcUrl(payerCluster);
}

function requiredArg(index: number, name: string): string {
  const value = process.argv[index];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

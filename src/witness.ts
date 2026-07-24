import type { Invoice, RpcWitness } from "./types.js";
import { canonicalJson, sha256 } from "./proof.js";

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

interface ParsedTransaction {
  blockTime: number | null;
  meta: {
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  slot: number;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string }>;
      instructions: Array<Record<string, unknown>>;
    };
    signatures: string[];
  };
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
  };
}

export async function createRpcWitness(
  name: string,
  rpcUrl: string,
  invoice: Invoice,
  signature: string,
): Promise<RpcWitness> {
  try {
    const [genesisHash, transaction] = await Promise.all([
      rpcCall<string>(rpcUrl, "getGenesisHash"),
      rpcCall<ParsedTransaction | null>(rpcUrl, "getTransaction", [
        signature,
        {
          commitment: "confirmed",
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        },
      ]),
    ]);

    if (!transaction || !transaction.meta) {
      throw new Error("transaction not found");
    }

    const accountKeys = transaction.transaction.message.accountKeys.map(key =>
      typeof key === "string" ? key : key.pubkey,
    );
    const canonicalTransaction = canonicalJson(transaction);
    const observedAmount = observeAmount(invoice, transaction, accountKeys);
    const serializedInstructions = canonicalJson(
      transaction.transaction.message.instructions,
    );

    return {
      name,
      rpcUrl,
      genesisHash,
      signature: transaction.transaction.signatures[0] ?? signature,
      slot: transaction.slot.toString(),
      blockTime:
        transaction.blockTime === null
          ? null
          : new Date(transaction.blockTime * 1_000).toISOString(),
      transactionDigest: sha256(canonicalTransaction),
      transactionSucceeded: transaction.meta.err === null,
      referencePresent: accountKeys.includes(invoice.reference),
      recipientPresent: recipientIsPresent(invoice, transaction, accountKeys),
      mintMatches: invoice.mint
        ? tokenBalances(transaction).some(balance => balance.mint === invoice.mint)
        : true,
      memoMatches: serializedInstructions.includes(invoice.memo),
      ...(observedAmount !== undefined ? { observedAmount } : {}),
    };
  } catch (error) {
    return {
      name,
      rpcUrl,
      genesisHash: "",
      signature,
      slot: "",
      blockTime: null,
      transactionDigest: "",
      transactionSucceeded: false,
      referencePresent: false,
      recipientPresent: false,
      mintMatches: false,
      memoMatches: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new Error(`${method} HTTP ${response.status}`);
  }
  const body = (await response.json()) as JsonRpcResponse<T>;
  if (body.error) {
    throw new Error(`${method}: ${body.error.message}`);
  }
  if (body.result === undefined) {
    throw new Error(`${method}: missing result`);
  }
  return body.result;
}

function observeAmount(
  invoice: Invoice,
  transaction: ParsedTransaction,
  accountKeys: string[],
): number | undefined {
  const meta = transaction.meta;
  if (!meta) return undefined;
  if (!invoice.mint) {
    const index = accountKeys.indexOf(invoice.recipient);
    if (index < 0) return undefined;
    const pre = meta.preBalances[index];
    const post = meta.postBalances[index];
    if (pre === undefined || post === undefined) return undefined;
    return (post - pre) / 1_000_000_000;
  }

  const pre = findTokenBalance(meta.preTokenBalances, invoice);
  const post = findTokenBalance(meta.postTokenBalances, invoice);
  if (!pre || !post) return undefined;
  const delta = BigInt(post.uiTokenAmount.amount) - BigInt(pre.uiTokenAmount.amount);
  return Number(delta) / 10 ** post.uiTokenAmount.decimals;
}

function recipientIsPresent(
  invoice: Invoice,
  transaction: ParsedTransaction,
  accountKeys: string[],
): boolean {
  if (!invoice.mint) return accountKeys.includes(invoice.recipient);
  return tokenBalances(transaction).some(
    balance => balance.owner === invoice.recipient && balance.mint === invoice.mint,
  );
}

function tokenBalances(transaction: ParsedTransaction): TokenBalance[] {
  return [
    ...(transaction.meta?.preTokenBalances ?? []),
    ...(transaction.meta?.postTokenBalances ?? []),
  ];
}

function findTokenBalance(
  balances: TokenBalance[] | undefined,
  invoice: Invoice,
): TokenBalance | undefined {
  return balances?.find(
    balance => balance.owner === invoice.recipient && balance.mint === invoice.mint,
  );
}

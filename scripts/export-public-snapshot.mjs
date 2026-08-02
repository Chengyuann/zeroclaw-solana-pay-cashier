import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { proofBundle, verifyProofBundle } from "../dist/proof.js";
import { JsonStore } from "../dist/store.js";

const stateRoot = path.resolve(process.env.CASHIER_STATE_DIR ?? ".state");
const outputDir = path.resolve(
  process.env.CASHIER_SNAPSHOT_DIR ?? "console/demo-data",
);
const store = new JsonStore(stateRoot);

await rm(outputDir, { recursive: true, force: true });
await Promise.all([
  mkdir(path.join(outputDir, "invoices"), { recursive: true }),
  mkdir(path.join(outputDir, "proof"), { recursive: true }),
]);

const invoices = await store.listInvoices();
const publicInvoices = [];
let generatedAt = "1970-01-01T00:00:00.000Z";

for (const invoice of invoices) {
  generatedAt = latestTimestamp(
    generatedAt,
    invoice.settlement?.verifiedAt,
    invoice.paidAt,
    invoice.createdAt,
  );
  publicInvoices.push(
    removeUndefined({
      ...invoice,
      rpcUrl: undefined,
      witnessRpcUrl: undefined,
      paymentUrl: undefined,
      qrPath: undefined,
      issuerKey: invoice.offerAttestation?.publicKey ?? null,
      settlement: invoice.settlement
        ? {
            ...invoice.settlement,
            witnesses: invoice.settlement.witnesses.map(witness => ({
              ...witness,
              rpcUrl: "Endpoint recorded in signed proof bundle",
            })),
          }
        : undefined,
    }),
  );

  if (invoice.offerAttestation) {
    const proof = proofBundle(invoice);
    await writeJson(path.join(outputDir, "proof", `${invoice.id}.json`), {
      proof,
      verification: verifyProofBundle(proof),
    });
  }
}

await writeJson(path.join(outputDir, "invoices", "index.json"), {
  generatedAt,
  source: "public-static-snapshot",
  invoices: publicInvoices,
});

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      outputDir,
      generatedAt,
      invoices: publicInvoices.length,
      proofs: invoices.filter(invoice => invoice.offerAttestation).length,
    },
    null,
    2,
  )}\n`,
);

function latestTimestamp(...values) {
  return values
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function removeUndefined(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeJson(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  assertPublic(body, file);
  await writeFile(file, body, "utf8");
}

function assertPublic(body, file) {
  const forbidden = ["/Users/", "\\\\Users\\\\", ".state/", "approvalCode"];
  const found = forbidden.find(value => body.includes(value));
  if (found) throw new Error(`${file} contains forbidden value: ${found}`);
}

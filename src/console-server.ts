#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { proofBundle, verifyProofBundle } from "./proof.js";
import { JsonStore } from "./store.js";

const host = process.env.CASHIER_CONSOLE_HOST ?? "127.0.0.1";
const port = Number(process.env.CASHIER_CONSOLE_PORT ?? "4317");
const root = path.resolve(process.env.CASHIER_STATE_DIR ?? ".state");
const store = new JsonStore(root);
const publicDir = path.resolve("console");

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "GET required" });
      return;
    }
    if (url.pathname === "/api/invoices") {
      const invoices = await store.listInvoices();
      sendJson(response, 200, {
        generatedAt: new Date().toISOString(),
        invoices: invoices.map(invoice => ({
          ...invoice,
          qrPath: path.basename(invoice.qrPath),
          issuerKey: invoice.offerAttestation?.publicKey ?? null,
        })),
      });
      return;
    }
    if (url.pathname.startsWith("/api/proof/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/proof/".length));
      const proof = proofBundle(await store.loadInvoice(id));
      sendJson(response, 200, {
        proof,
        verification: verifyProofBundle(proof),
      });
      return;
    }
    if (url.pathname.startsWith("/qr/")) {
      const file = path.basename(url.pathname);
      const body = await readFile(path.join(store.qrDir, file));
      response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store",
      });
      response.end(body);
      return;
    }

    const file =
      url.pathname === "/" ? "index.html" : path.basename(url.pathname);
    const body = await readFile(path.join(publicDir, file));
    response.writeHead(200, {
      "content-type": contentType(file),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      sendJson(response, 404, { error: "not found" });
      return;
    }
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Cashier console: http://${host}:${port}\n`);
});

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function contentType(file: string): string {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/html; charset=utf-8";
}

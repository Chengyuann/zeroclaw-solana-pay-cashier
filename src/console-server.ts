#!/usr/bin/env node

import { createServer } from "node:http";
import type { Server } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { proofBundle, verifyProofBundle } from "./proof.js";
import { JsonStore } from "./store.js";

const host = process.env.CASHIER_CONSOLE_HOST ?? "127.0.0.1";
const port = Number(process.env.CASHIER_CONSOLE_PORT ?? "4317");
const root = path.resolve(process.env.CASHIER_STATE_DIR ?? ".state");
const store = new JsonStore(root);
const publicDir = path.resolve("console");
const demoVideo = path.resolve(
  process.env.CASHIER_DEMO_VIDEO_PATH ??
    "outputs/video-delivery-live/demo-video.mp4",
);

export function createConsoleServer(
  stateRoot = root,
  staticRoot = publicDir,
  demoVideoPath = demoVideo,
): Server {
  const stateStore = new JsonStore(stateRoot);
  return createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "GET or HEAD required" });
      return;
    }
    if (url.pathname === "/api/invoices") {
      const invoices = await stateStore.listInvoices();
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
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
        sendJson(response, 400, { error: "invalid invoice id" });
        return;
      }
      const proof = proofBundle(await stateStore.loadInvoice(id));
      sendJson(response, 200, {
        proof,
        verification: verifyProofBundle(proof),
      });
      return;
    }
    if (url.pathname.startsWith("/qr/")) {
      const file = path.basename(url.pathname);
      const body = await readFile(path.join(stateStore.qrDir, file));
      response.writeHead(200, withSecurityHeaders({
        "content-type": "image/png",
        "cache-control": "no-store",
      }));
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    if (url.pathname === "/media/proof-carrying-cashier-demo.mp4") {
      await sendMediaFile(request, response, demoVideoPath);
      return;
    }

    const relativeFile =
      url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(staticRoot, relativeFile);
    if (file !== staticRoot && !file.startsWith(`${staticRoot}${path.sep}`)) {
      sendJson(response, 404, { error: "not found" });
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, withSecurityHeaders({
      "content-type": contentType(file),
      "cache-control": cacheControl(file),
    }));
    response.end(request.method === "HEAD" ? undefined : body);
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createConsoleServer().listen(port, host, () => {
    process.stdout.write(`Cashier console: http://${host}:${port}\n`);
  });
}

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, withSecurityHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }));
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function contentType(file: string): string {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) {
    return "application/manifest+json; charset=utf-8";
  }
  if (file.endsWith(".ico")) return "image/x-icon";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".mp4")) return "video/mp4";
  return "text/html; charset=utf-8";
}

function cacheControl(file: string): string {
  return file.endsWith(".html") || file.endsWith(".js") || file.endsWith(".css")
    ? "no-store"
    : "public, max-age=86400";
}

function withSecurityHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return {
    ...headers,
    "content-security-policy":
      "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

async function sendMediaFile(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  file: string,
): Promise<void> {
  const info = await stat(file);
  const rangeHeader = request.headers.range;
  const range = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  const suffixLength = range && !range[1] && range[2] ? Number(range[2]) : null;
  const start =
    suffixLength === null
      ? range?.[1]
        ? Number(range[1])
        : 0
      : Math.max(0, info.size - suffixLength);
  const end =
    suffixLength === null && range?.[2]
      ? Number(range[2])
      : info.size - 1;
  if (
    (rangeHeader && !range) ||
    (range &&
      (!Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      (suffixLength !== null &&
        (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)) ||
      start < 0 ||
      end < start ||
      end >= info.size))
  ) {
    response.writeHead(416, withSecurityHeaders({
      "content-range": `bytes */${info.size}`,
    }));
    response.end();
    return;
  }

  const status = rangeHeader ? 206 : 200;
  const headers = withSecurityHeaders({
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
    "content-length": String(end - start + 1),
    "content-type": "video/mp4",
    ...(rangeHeader
      ? { "content-range": `bytes ${start}-${end}/${info.size}` }
      : {}),
  });
  response.writeHead(status, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file, { start, end }).pipe(response);
}

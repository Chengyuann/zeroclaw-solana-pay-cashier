import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createConsoleServer } from "../src/console-server.js";
import { createInvoice } from "../src/invoice.js";
import { JsonStore } from "../src/store.js";

const RECIPIENT = "BpegjqEbijzZMxFaseiCd6iv1DM3LuL3273NJVyzFmy1";
const temporaryDirectories: string[] = [];
const servers: ReturnType<typeof createConsoleServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>(resolve => {
          server.close(() => resolve());
        }),
    ),
  );
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("cashier console server", () => {
  it("serves the console, assets, API, proof bundle, and security headers", async () => {
    const stateRoot = await temporaryDirectory("cashier-console-");
    const store = new JsonStore(stateRoot);
    const invoice = await createInvoice(store, {
      recipient: RECIPIENT,
      amount: 0.01,
      orderId: "console-test",
      cluster: "devnet",
      rpcUrl: "https://rpc-a.example",
      witnessRpcUrl: "https://rpc-b.example",
    });
    const mediaFile = path.join(stateRoot, "demo.mp4");
    await writeFile(mediaFile, Buffer.from("0000ftypdemo-video"));
    const baseUrl = await startServer(stateRoot, mediaFile);

    const page = await fetch(`${baseUrl}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("permissions-policy")).toContain("camera=()");
    expect(page.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(await page.text()).toContain("Proof-Carrying Cashier");

    const manifest = await fetch(`${baseUrl}/site.webmanifest`);
    expect(manifest.headers.get("content-type")).toContain(
      "application/manifest+json",
    );
    expect((await manifest.json()).name).toBe("Proof-Carrying Cashier");

    const favicon = await fetch(`${baseUrl}/favicon.ico`);
    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("content-type")).toBe("image/x-icon");

    const invoices = await fetch(`${baseUrl}/api/invoices`);
    const invoiceBody = (await invoices.json()) as {
      invoices: Array<{ id: string; qrPath: string }>;
    };
    expect(invoiceBody.invoices).toHaveLength(1);
    expect(invoiceBody.invoices[0]).toMatchObject({
      id: invoice.id,
      qrPath: path.basename(invoice.qrPath),
    });

    const proof = await fetch(`${baseUrl}/api/proof/${invoice.id}`);
    const proofBody = (await proof.json()) as {
      proof: { offerHash: string };
      verification: { offerHashValid: boolean };
    };
    expect(proofBody.proof.offerHash).toBe(invoice.offerHash);
    expect(proofBody.verification.offerHashValid).toBe(true);

    const head = await fetch(`${baseUrl}/styles.css`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toContain("text/css");
    expect(await head.text()).toBe("");

    const media = await fetch(
      `${baseUrl}/media/proof-carrying-cashier-demo.mp4`,
      { headers: { range: "bytes=4-7" } },
    );
    expect(media.status).toBe(206);
    expect(media.headers.get("content-type")).toBe("video/mp4");
    expect(media.headers.get("content-range")).toBe("bytes 4-7/18");
    expect(await media.text()).toBe("ftyp");

    const suffix = await fetch(
      `${baseUrl}/media/proof-carrying-cashier-demo.mp4`,
      { headers: { range: "bytes=-4" } },
    );
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe("bytes 14-17/18");
    expect(await suffix.text()).toBe("ideo");

    const invalidRange = await fetch(
      `${baseUrl}/media/proof-carrying-cashier-demo.mp4`,
      { headers: { range: "bytes=0-1,4-5" } },
    );
    expect(invalidRange.status).toBe(416);
    expect(invalidRange.headers.get("content-range")).toBe("bytes */18");
  });

  it("rejects traversal and unsupported methods", async () => {
    const stateRoot = await temporaryDirectory("cashier-console-");
    const baseUrl = await startServer(stateRoot);

    const traversal = await fetch(`${baseUrl}/%252e%252e%252fpackage.json`);
    expect(traversal.status).toBe(404);

    const proofTraversal = await fetch(
      `${baseUrl}/api/proof/%2e%2e%2f%2e%2e%2fpackage`,
    );
    expect(proofTraversal.status).toBe(400);
    expect(await proofTraversal.json()).toEqual({ error: "invalid invoice id" });

    const post = await fetch(`${baseUrl}/api/invoices`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(await post.json()).toEqual({ error: "GET or HEAD required" });
  });
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function startServer(
  stateRoot: string,
  mediaFile?: string,
): Promise<string> {
  const server = createConsoleServer(
    stateRoot,
    path.resolve("console"),
    mediaFile,
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

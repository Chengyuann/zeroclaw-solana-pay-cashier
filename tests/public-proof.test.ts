import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { verifyLatestPublicProof } from "../src/public-proof.js";
import type { ProofBundle } from "../src/types.js";

const fixtureRoot = path.resolve("console/demo-data");

describe("public proof verification", () => {
  it("downloads and independently verifies the latest accepted public proof", async () => {
    const fetchImpl = fixtureFetch();
    const result = await verifyLatestPublicProof(
      "https://example.test/cashier/",
      fetchImpl,
    );

    expect(result.valid).toBe(true);
    expect(result.invoice).toMatchObject({
      id: "c7f52da4-ea0d-4d11-be3c-8b71c8ef2f3d",
      orderId: "showcase-live-153923",
      outcome: "accepted",
    });
    expect(result.checks).toEqual({
      invoiceLinkValid: true,
      paymentLinkValid: true,
      orderLinkValid: true,
      offerHashMatchesLedger: true,
      clusterMatchesLedger: true,
      outcomeMatchesLedger: true,
      verifiedAtMatchesLedger: true,
      proofHashMatchesLedger: true,
      schemaValid: true,
      offerHashValid: true,
      settlementHashValid: true,
      offerAttestationValid: true,
      settlementAttestationValid: true,
      linkageValid: true,
    });
  });

  it("rejects a tampered proof even when the hosted verdict claims it is valid", async () => {
    const fetchImpl = fixtureFetch(document => {
      document.proof.offer.amount = "999";
      document.verification = { valid: true };
    });
    const result = await verifyLatestPublicProof(
      "https://example.test/cashier/",
      fetchImpl,
    );

    expect(result.valid).toBe(false);
    expect(result.checks.offerHashValid).toBe(false);
  });

  it("rejects insecure remote sources before making a request", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error("unexpected request");
    }) as typeof fetch;

    await expect(
      verifyLatestPublicProof("http://example.test/cashier/", fetchImpl),
    ).rejects.toThrow("must use HTTPS");
    expect(called).toBe(false);
  });

  it("fails closed when the public index has no valid accepted proof", async () => {
    const fetchImpl = (async input => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      expect(url.pathname).toContain("/static/invoices/index.json");
      return new Response(
        JSON.stringify({
          source: "public-static-snapshot",
          generatedAt: "2026-08-02T00:00:00.000Z",
          invoices: [
            {
              id: "../proof",
              orderId: "unsafe",
              status: "paid",
              cluster: "devnet",
              settlement: {
                outcome: "accepted",
                proofHash: "not-a-hash",
                verifiedAt: "not-a-date",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    await expect(
      verifyLatestPublicProof("https://example.test/cashier/", fetchImpl),
    ).rejects.toThrow("no accepted settlement proof");
  });
});

function fixtureFetch(
  mutateProof?: (document: { proof: ProofBundle; verification?: unknown }) => void,
): typeof fetch {
  return (async input => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    let file: string;
    if (url.pathname.endsWith("/static/invoices/index.json")) {
      file = path.join(fixtureRoot, "invoices", "index.json");
    } else {
      const name = path.basename(url.pathname);
      file = path.join(fixtureRoot, "proof", name);
    }
    const document = JSON.parse(await readFile(file, "utf8")) as {
      proof: ProofBundle;
      verification?: unknown;
    };
    if (mutateProof && url.pathname.includes("/static/proof/")) {
      mutateProof(document);
    }
    return new Response(JSON.stringify(document), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Attestation } from "./types.js";

const PRIVATE_KEY_FILE = "attestation-ed25519-private.pem";

export async function attestHash(
  stateRoot: string,
  hash: string,
): Promise<Attestation> {
  const privateKeyPem = await loadOrCreatePrivateKey(stateRoot);
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  const signature = sign(null, Buffer.from(hash, "hex"), privateKey);
  return {
    algorithm: "Ed25519",
    publicKey: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
    signature: signature.toString("base64"),
    signedHash: hash,
  };
}

export function verifyAttestation(attestation: Attestation): boolean {
  if (
    attestation.algorithm !== "Ed25519" ||
    !/^[a-f0-9]{64}$/.test(attestation.signedHash)
  ) {
    return false;
  }
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(attestation.publicKey, "base64"),
      type: "spki",
      format: "der",
    });
    return verify(
      null,
      Buffer.from(attestation.signedHash, "hex"),
      publicKey,
      Buffer.from(attestation.signature, "base64"),
    );
  } catch {
    return false;
  }
}

async function loadOrCreatePrivateKey(stateRoot: string): Promise<string> {
  const keyPath = path.join(stateRoot, PRIVATE_KEY_FILE);
  try {
    return await readFile(keyPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  await mkdir(stateRoot, { recursive: true });
  await writeFile(keyPath, pem, { mode: 0o600, flag: "wx" });
  return pem;
}

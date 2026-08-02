#!/usr/bin/env node

import {
  DEFAULT_PUBLIC_CONSOLE_URL,
  verifyLatestPublicProof,
} from "./public-proof.js";

const publicConsoleUrl =
  process.argv[2] ?? process.env.CASHIER_PUBLIC_CONSOLE_URL;

try {
  const result = await verifyLatestPublicProof(
    publicConsoleUrl ?? DEFAULT_PUBLIC_CONSOLE_URL,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: result.valid,
        verdict: result.valid ? "valid" : "invalid",
        ...result,
      },
      null,
      2,
    )}\n`,
  );
  if (!result.valid) process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        verdict: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}

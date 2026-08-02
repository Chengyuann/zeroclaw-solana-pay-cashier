import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const pagesDir = path.resolve(process.env.CASHIER_PAGES_DIR ?? "dist/pages");
const files = await walk(pagesDir);
const textFiles = files.filter(file =>
  /\.(?:html|js|css|json|webmanifest)$/i.test(file),
);
const forbidden = [
  { label: "local user path", pattern: /\/Users\// },
  { label: "state path", pattern: /\.state\// },
  { label: "refund approval code", pattern: /approvalCode/ },
  { label: "payment URL", pattern: /"paymentUrl"\s*:/ },
  { label: "dynamic invoice API", pattern: /fetch\(["'`]\/api\/invoices/ },
];
const errors = [];

for (const file of textFiles) {
  const body = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(body)) {
      errors.push(`${path.relative(pagesDir, file)} contains ${rule.label}`);
    }
  }
}

const invoiceFile = path.join(pagesDir, "static", "invoices", "index.json");
const invoices = JSON.parse(await readFile(invoiceFile, "utf8"));
if (invoices.source !== "public-static-snapshot") {
  errors.push("invoice snapshot source is not public-static-snapshot");
}
if (!Array.isArray(invoices.invoices) || invoices.invoices.length === 0) {
  errors.push("invoice snapshot is empty");
}
if (invoices.invoices.some(invoice => invoice.qrPath || invoice.paymentUrl)) {
  errors.push("public invoice snapshot contains payment request data");
}

const indexBody = await readFile(path.join(pagesDir, "index.html"), "utf8");
if (/(?:href|src|poster|content)="\/(?!\/)/.test(indexBody)) {
  errors.push("public index contains an unresolved root-relative asset URL");
}
const requiredReviewSignals = [
  "Judge review pack",
  "npm ci &amp;&amp; npm run verify:public-proof",
  "github.com/Chengyuann/zeroclaw-solana-pay-cashier",
  "releases/tag/v1.2.0",
  "discord.com/channels/1472154792351760419/1527427886410109029/1533401462900789259",
  "<video",
  "proof-carrying-cashier-demo.mp4",
];
for (const signal of requiredReviewSignals) {
  if (!indexBody.includes(signal)) {
    errors.push(`public review pack is missing: ${signal}`);
  }
}

const videoFile = path.join(
  pagesDir,
  "media",
  "proof-carrying-cashier-demo.mp4",
);
const videoInfo = await stat(videoFile);
if (videoInfo.size < 1_000_000 || videoInfo.size > 50_000_000) {
  errors.push(`public demo video has unexpected size: ${videoInfo.size}`);
}
const videoHandle = await open(videoFile, "r");
const videoHeader = Buffer.alloc(12);
await videoHandle.read(videoHeader, 0, videoHeader.length, 0);
await videoHandle.close();
if (videoHeader.toString("ascii", 4, 8) !== "ftyp") {
  errors.push("public demo video is not an MP4 file");
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        pagesDir,
        files: files.length,
        invoices: invoices.invoices.length,
      },
      null,
      2,
    )}\n`,
  );
}

async function walk(directory) {
  const names = await readdir(directory);
  const output = [];
  for (const name of names) {
    const file = path.join(directory, name);
    if ((await stat(file)).isDirectory()) output.push(...(await walk(file)));
    else output.push(file);
  }
  return output;
}

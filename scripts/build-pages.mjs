import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve(".");
const outputDir = path.resolve(process.env.CASHIER_PAGES_DIR ?? "dist/pages");
const snapshotDir = path.resolve(
  process.env.CASHIER_SNAPSHOT_DIR ?? "console/demo-data",
);

await rm(outputDir, { recursive: true, force: true });
await cp(path.join(root, "console"), outputDir, {
  recursive: true,
  filter(source) {
    return (
      !source.includes(`${path.sep}imagegen${path.sep}`) &&
      !source.includes(`${path.sep}demo-data${path.sep}`)
    );
  },
});

const invoiceOutput = path.join(outputDir, "static", "invoices");
const proofOutput = path.join(outputDir, "static", "proof");
const mediaOutput = path.join(outputDir, "media");
await Promise.all([
  mkdir(invoiceOutput, { recursive: true }),
  mkdir(proofOutput, { recursive: true }),
  mkdir(mediaOutput, { recursive: true }),
]);

await Promise.all([
  cp(path.join(snapshotDir, "invoices"), invoiceOutput, { recursive: true }),
  cp(path.join(snapshotDir, "proof"), proofOutput, { recursive: true }),
]);
await stageDemoVideo(path.join(mediaOutput, "proof-carrying-cashier-demo.mp4"));

const indexPath = path.join(outputDir, "index.html");
const manifestPath = path.join(outputDir, "site.webmanifest");
const appPath = path.join(outputDir, "app.js");

await writeFile(
  indexPath,
  rewriteRootUrls(await readFile(indexPath, "utf8")),
  "utf8",
);
await writeFile(
  manifestPath,
  rewriteManifest(await readFile(manifestPath, "utf8")),
  "utf8",
);
await writeFile(
  appPath,
  `window.__CASHIER_STATIC__ = true;\n${await readFile(appPath, "utf8")}`,
  "utf8",
);
await writeFile(path.join(outputDir, ".nojekyll"), "");

const assetNames = (await readdir(path.join(outputDir, "assets"))).sort();
const snapshot = JSON.parse(
  await readFile(path.join(invoiceOutput, "index.json"), "utf8"),
);
process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      outputDir,
      pathMode: "relative",
      invoices: snapshot.invoices.length,
      proofs: (await readdir(proofOutput)).filter(name => name.endsWith(".json"))
        .length,
      assets: assetNames.length,
    },
    null,
    2,
  )}\n`,
);

function rewriteRootUrls(source) {
  return source.replaceAll(/((?:href|src|content)=")\/(?!\/)/g, "$1./");
}

function rewriteManifest(source) {
  const body = JSON.parse(source);
  body.start_url = "./";
  body.scope = "./";
  body.icons = body.icons.map(icon => ({
    ...icon,
    src: `./${icon.src.replace(/^\/+/, "")}`,
  }));
  return `${JSON.stringify(body, null, 2)}\n`;
}

async function stageDemoVideo(destination) {
  const localVideo = path.resolve(
    process.env.CASHIER_DEMO_VIDEO_PATH ??
      "outputs/video-delivery-v2/demo-video.mp4",
  );
  try {
    await access(localVideo);
    await cp(localVideo, destination);
    return;
  } catch {
    // CI downloads the last public, QA-checked video when generated outputs are absent.
  }

  const source =
    process.env.CASHIER_DEMO_VIDEO_URL ??
    "https://github.com/Chengyuann/zeroclaw-solana-pay-cashier/releases/download/v1.0.0/proof-carrying-cashier-demo.mp4";
  const expectedHash =
    process.env.CASHIER_DEMO_VIDEO_SHA256 ??
    "4c43e0f9d35131cb8952d7a4a86356fac9626502f2568feb5da4cd6472c7ebed";
  const response = await fetch(source, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`demo video download returned ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 1_000_000 || body.length > 50_000_000) {
    throw new Error(`demo video size is outside the accepted range: ${body.length}`);
  }
  const actualHash = createHash("sha256").update(body).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(`demo video SHA-256 mismatch: ${actualHash}`);
  }
  await writeFile(destination, body);
}

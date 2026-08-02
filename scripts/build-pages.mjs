import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
await Promise.all([
  mkdir(invoiceOutput, { recursive: true }),
  mkdir(proofOutput, { recursive: true }),
]);

await Promise.all([
  cp(path.join(snapshotDir, "invoices"), invoiceOutput, { recursive: true }),
  cp(path.join(snapshotDir, "proof"), proofOutput, { recursive: true }),
]);

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

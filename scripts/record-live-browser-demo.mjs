import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const outputDir = path.resolve(root, "outputs/recordings/browser-clean");
const target = process.env.CASHIER_PUBLIC_CONSOLE_URL ?? "https://proof-carrying-cashier.pages.dev/";
const videoName = `live-browser-demo-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromium.executablePath(),
  args: ["--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: outputDir,
    size: { width: 1920, height: 1080 },
  },
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);

await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.evaluate(() => {
  document.documentElement.style.scrollBehavior = "auto";
  document.body.style.cursor = "none";
});
await page.waitForSelector("#snapshot-order");
await page.waitForFunction(
  () => document.querySelector("#snapshot-order")?.textContent !== "Loading ledger",
);

await hold(page, 3200);
await scrollTo(page, "#review", 900);
await hold(page, 3800);
await scrollTo(page, "#ledger", 900);
await hold(page, 1800);
await page.click(".order-button");
await page.waitForSelector("#detail-tab-proof");
await hold(page, 2600);
await page.click("#detail-tab-proof");
await hold(page, 3000);
await page.click("#detail-tab-witnesses");
await hold(page, 3000);
await page.click("#detail-tab-raw");
await hold(page, 3000);
await scrollTo(page, "#review", 900);
await hold(page, 2400);
await scrollTo(page, "#overview", 900);
await hold(page, 2200);

const video = page.video();
await page.close();
await context.close();
await browser.close();

if (!video) {
  throw new Error("Playwright did not produce a recording");
}
const temporaryPath = await video.path();
const finalPath = path.join(outputDir, videoName);
await fs.rename(temporaryPath, finalPath);
await fs.writeFile(path.join(outputDir, "latest-live-browser-demo.txt"), `${finalPath}\n`);
process.stdout.write(`${finalPath}\n`);

async function scrollTo(page, selector, durationMs) {
  await page.evaluate(
    async ({ selector, durationMs }) => {
      const target = document.querySelector(selector);
      if (!target) throw new Error(`missing selector ${selector}`);
      const start = window.scrollY;
      const top = target.getBoundingClientRect().top + window.scrollY - 78;
      const distance = top - start;
      const startTime = performance.now();
      await new Promise(resolve => {
        const step = now => {
          const elapsed = Math.min(1, (now - startTime) / durationMs);
          const eased = 1 - Math.pow(1 - elapsed, 3);
          window.scrollTo(0, start + distance * eased);
          if (elapsed < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    { selector, durationMs },
  );
}

async function hold(page, durationMs) {
  await page.waitForTimeout(durationMs);
}

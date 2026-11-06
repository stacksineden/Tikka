/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script, run with node, and Playwright is not a project dependency */
// Renders the 9:16 explainer (app/dev/explainer) to a 1080×1920 MP4.
//
//   pnpm dev                                   (in another terminal)
//   node scripts/render-explainer.cjs [out.mp4] [--url http://localhost:3000/dev/explainer] [--fps 30]
//
// The page plays one long CSS timeline. This seeks every animation to each frame's time,
// screenshots it, and joins the frames with ffmpeg (needs Playwright's Chromium and ffmpeg).

const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
// Playwright isn't a project dependency: use the copy installed with the browser.
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = resolve(args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "explainer-9x16.mp4");
const url = opt("--url", "http://localhost:3000/dev/explainer");
const fps = Number(opt("--fps", "30"));

async function main() {
const frames = mkdtempSync(join(tmpdir(), "tikka-explainer-"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
    document.querySelector("nextjs-portal")?.remove(); // the dev-mode badge
    for (const a of document.getAnimations()) a.pause();
  });
  const length = Number(await page.locator(".xv").getAttribute("data-length"));
  const total = Math.round(length * fps);
  const stage = page.locator(".xv");

  for (let f = 0; f < total; f++) {
    const ms = (f / fps) * 1000;
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = t;
      }
    }, ms);
    await stage.screenshot({ path: join(frames, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95, animations: "allow" });
    if (f % (fps * 5) === 0) console.log(`${Math.round((f / total) * 100)}% (${(ms / 1000).toFixed(0)}s of ${length}s)`);
  }

  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(frames, "%05d.jpg"), "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", out], { stdio: "inherit" });
  console.log(`Done: ${out}`);
} finally {
  await browser.close();
  rmSync(frames, { recursive: true, force: true });
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

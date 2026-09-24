// Render routes in a real headless Chromium and report what a reviewer would
// check by eye: full-page screenshots at desktop and phone width, console
// errors, horizontal overflow, and a frame-rate sample.
//
//   node scripts/shoot.mjs            -> /
//   node scripts/shoot.mjs / /docs    -> several routes
//   BASE_URL=http://localhost:3000 node scripts/shoot.mjs /try
//
// Needs the dev server running. Screenshots land in .shots/ (gitignored).
// Exits non-zero if any route logs a console error or scrolls sideways, so it
// can gate a change as well as illustrate it.

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SCHEME = process.env.SCHEME === "dark" ? "dark" : "light";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".shots");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

// Long enough for entrance animations and the first chart frames to settle.
const SETTLE_MS = 1800;
const FPS_SAMPLE_MS = 3000;

// Git Bash rewrites an argument with a leading "/" into its own install path,
// so "/" arrives as "D:/Git/" and "/docs" as "D:/Git/docs". An absolute Windows
// path with a Git directory in it is taken to be one of those and cut back to
// the route. A route can also be given without the slash: "docs", or "home".
function toRoute(arg) {
  const rewritten = arg.match(/^[A-Za-z]:[\\/](?:.*[\\/])?Git[\\/](.*)$/);
  const route = (rewritten ? rewritten[1] : arg).replace(/\\/g, "/");
  if (route === "" || route === "." || route === "home") return "/";
  return route.startsWith("/") ? route : `/${route}`;
}

const routes = process.argv.slice(2).length ? process.argv.slice(2).map(toRoute) : ["/"];

function slug(route) {
  return route === "/" ? "home" : route.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-");
}

async function measure(page) {
  return page.evaluate(async (sampleMs) => {
    const doc = document.documentElement;
    const width = doc.clientWidth;

    // Elements whose right edge passes the viewport and that no ancestor clips.
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o !== "visible") return true;
      }
      return false;
    };
    const wide = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.right > width + 1 && !clipped(el)) {
        wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
        if (wide.length >= 3) break;
      }
    }

    let frames = 0;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        frames += 1;
        if (performance.now() - start < sampleMs) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    return {
      overflow: doc.scrollWidth > width,
      scrollWidth: doc.scrollWidth,
      width,
      offenders: wide,
      fps: Math.round((frames * 1000) / (performance.now() - start)),
      height: doc.scrollHeight,
    };
  }, FPS_SAMPLE_MS);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  // Headless Chromium rasterises in software unless told otherwise, which makes
  // backdrop filters and canvases look several times slower than they are on a
  // real machine. Ask for the GPU so the frame rate means something.
  const browser = await chromium.launch({
    args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=default"],
  });
  let failed = false;

  for (const route of routes) {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        // Light by default, because it is the harsher test: a page that forces
        // its own dark theme still gets any shared component that follows the
        // system setting wrong under light, and never shows it under dark.
        colorScheme: SCHEME,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      const response = await page.goto(new URL(route, BASE).toString(), { waitUntil: "load" });
      await page.waitForTimeout(SETTLE_MS);
      const stats = await measure(page);

      // A full-page capture never scrolls, so anything that reveals on entering
      // the viewport would be photographed invisible. Walk down the page first
      // so every section has been on screen once, then return to the top.
      await page.evaluate(async () => {
        const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(900);

      const file = path.join(OUT, `${slug(route)}-${viewport.name}.png`);
      await page.screenshot({ path: file, fullPage: true });

      const status = response?.status() ?? 0;
      const bad = status >= 400 || errors.length > 0 || stats.overflow;
      failed ||= bad;

      console.log(
        `${bad ? "FAIL" : "ok  "} ${route} @ ${viewport.name} ${viewport.width}px  ` +
          `http ${status}  fps ${stats.fps}  height ${stats.height}px  ` +
          `overflow ${stats.overflow ? `${stats.scrollWidth}>${stats.width} ${stats.offenders.join(", ")}` : "no"}  ` +
          `errors ${errors.length}`,
      );
      for (const error of errors.slice(0, 5)) console.log(`       console: ${error.slice(0, 200)}`);
      console.log(`       ${file}`);

      await context.close();
    }
  }

  await browser.close();
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

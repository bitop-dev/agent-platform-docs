#!/usr/bin/env node
// Exports all .excalidraw files to PNG using Playwright.
// Run: node export-images.js

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/homebrew/lib/node_modules/@playwright/test/index.js");

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const roughJS   = readFileSync(join(__dirname, "rough.js"), "utf8");
const renderJS  = readFileSync(join(__dirname, "renderer.js"), "utf8");

async function exportDiagram(page, excalidrawPath, pngPath) {
  const data = JSON.parse(readFileSync(excalidrawPath, "utf8"));

  // Blank page — no server needed
  await page.goto("about:blank");
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#f8f9fa"><canvas id="c"></canvas></body></html>`);

  // Inject roughjs
  await page.evaluate(roughJS);

  // Compute bounds, size canvas, render
  const dims = await page.evaluate(({ renderSrc, excalidraw }) => {
    // eval the renderer
    eval(renderSrc);                // defines window.renderExcalidraw
    return window.renderExcalidraw(excalidraw);
  }, { renderSrc: renderJS, excalidraw: data });

  // Screenshot just the canvas
  await page.setViewportSize({ width: dims.width + 4, height: dims.height + 4 });
  const png = await page.locator("#c").screenshot();
  writeFileSync(pngPath, png);
  console.log(`  ✓ ${basename(pngPath)}  (${dims.width}×${dims.height})`);
}

async function main() {
  const files = readdirSync(__dirname)
    .filter(f => f.endsWith(".excalidraw"))
    .sort();

  if (!files.length) { console.error("No .excalidraw files. Run: node generate.js"); process.exit(1); }

  console.log(`Exporting ${files.length} diagrams to PNG...\n`);

  const browser = await chromium.launch();
  const ctx     = await browser.newContext({ deviceScaleFactor: 2 });
  const page    = await ctx.newPage();

  page.on("pageerror", e => console.error("  ERR:", e.message));

  for (const file of files) {
    await exportDiagram(
      page,
      join(__dirname, file),
      join(__dirname, file.replace(".excalidraw", ".png"))
    );
  }

  await browser.close();
  console.log(`\nDone — PNG files in:\n  ${__dirname}`);
}

main().catch(e => { console.error(e); process.exit(1); });

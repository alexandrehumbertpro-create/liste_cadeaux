// Run with HEIC_TEST_FILE pointing to a HEIC fixture; uses the actual browser decoder.
import { chromium } from "@playwright/test";
import ts from "typescript";
import fs from "node:fs";
import assert from "node:assert/strict";
const fixture = process.env.HEIC_TEST_FILE;
if (!fixture) throw Error("Set HEIC_TEST_FILE to a local HEIC fixture");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const p = await browser.newPage();
  await p.goto("about:blank");
  await p.addScriptTag({
    content: fs.readFileSync(
      "node_modules/heic2any/dist/heic2any.min.js",
      "utf8",
    ),
  });
  let js = ts
    .transpileModule(fs.readFileSync("src/lib/prepare-image.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
      },
    })
    .outputText.replace(
      "export async function prepareImage",
      "async function prepareImage",
    )
    .replace('await import("heic2any")', "({default: window.heic2any})");
  await p.addScriptTag({
    content: js + ";window.prepareImageTest=prepareImage;",
  });
  const jpg = await p.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3200;
    canvas.height = 2400;
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(3200, 2400);
    for (let i = 0; i < data.data.length; i += 65536)
      crypto.getRandomValues(
        data.data.subarray(i, Math.min(i + 65536, data.data.length)),
      );
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = 255;
    ctx.putImageData(data, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const f = await window.prepareImageTest(
      new File([blob], "camera.png", { type: "image/png" }),
    );
    return { before: blob.size, after: f.size, type: f.type };
  });
  assert.ok(jpg.before > 6 * 1024 * 1024);
  assert.ok(jpg.after <= 2 * 1024 * 1024);
  assert.equal(jpg.type, "image/jpeg");
  console.log(
    "PASS: large camera photo reduced below upload request limits",
    jpg,
  );
  const heic = await p.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const result = await window.prepareImageTest(
      new File([bytes], "iphone.heic", { type: "image/heic" }),
    );
    return { size: result.size, type: result.type };
  }, fs.readFileSync(fixture).toString("base64"));
  assert.equal(heic.type, "image/jpeg");
  assert.ok(heic.size <= 2 * 1024 * 1024);
  console.log("PASS: real HEIC converted to JPEG", heic);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

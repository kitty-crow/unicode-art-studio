import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

test("reset sliders restores only the four studio slider defaults", async () => {
  const html = await readFile(join(root, "web", "index.html"), "utf8");
  const studio = await readFile(join(root, "src", "web", "studio.ts"), "utf8");
  expect(html).toContain('<button id="reset-sliders" class="button" type="button">Reset sliders</button>');

  const match = studio.match(/reset\.addEventListener\("click", \(\) => \{([\s\S]*?)\n  \}\);/u);
  expect(match).not.toBeNull();
  const handler = match?.[1] ?? "";
  expect(handler).toContain('columns.value = "96";');
  expect(handler).toContain('columnsValue.value = columns.value;');
  expect(handler).toContain('contrast.value = "1.12";');
  expect(handler).toContain('detail.value = "0.34";');
  expect(handler).toContain('bias.value = "0.015";');
  expect(handler).toContain('schedule();');
  expect(handler).not.toContain("colour.checked");
  expect(handler).not.toContain("colourBg.checked");
  expect(handler).not.toContain("fullColour.checked");
  expect(handler).not.toContain("paletteInput.value");
  expect(handler).not.toContain("paletteDither.checked");
  expect(handler).not.toContain("dither.value");
  expect(handler).not.toContain("invert.checked");
});

test("studio adds custom palette and JPEG controls without replacing the existing form", async () => {
  const html = await readFile(join(root, "web", "index.html"), "utf8");
  const studio = await readFile(join(root, "src", "web", "studio.ts"), "utf8");
  expect(html).toContain('accept="image/png,image/jpeg,.png,.jpg,.jpeg"');
  expect(html).toContain('<label>Custom palette<textarea id="palette"');
  expect(html).toContain('<input id="palette-dither" type="checkbox"> Floyd–Steinberg palette dither');
  expect(studio).toContain('parsePalette(paletteInput.value)');
  expect(studio).toContain('remapPalette(source.pixels, palette, paletteDither.checked)');
  expect(studio).toContain('file.type === "image/png" || file.type === "image/jpeg"');
});

test("copy text is replaced by final Unicode raster download", async () => {
  const html = await readFile(join(root, "web", "index.html"), "utf8");
  const studio = await readFile(join(root, "src", "web", "studio.ts"), "utf8");
  expect(html).toContain('<button id="download-raster" class="button primary" type="button">Download as raster</button>');
  expect(html).not.toContain('<button id="copy"');
  expect(studio).toContain('downloadRaster(current, foreground)');
  expect(studio).not.toContain('navigator.clipboard.writeText(textOutput())');
});

test("browser downloads use a SHA-256 content-addressed Studio filename", async () => {
  const download = await readFile(join(root, "src", "web", "download.ts"), "utf8");
  const raster = await readFile(join(root, "src", "web", "raster.ts"), "utf8");
  const studio = await readFile(join(root, "src", "web", "studio.ts"), "utf8");
  expect(download).toContain('crypto.subtle.digest("SHA-256", await blob.arrayBuffer())');
  expect(download).toContain('kitty-crow-github-io-unicode-art-studio-${hex(digest)}.${suffix}');
  expect(raster).toContain('download("png", "image/png"');
  expect(studio).toContain('download("txt", "text/plain;charset=utf-8"');
  expect(studio).toContain('download("html", "text/html;charset=utf-8"');
  expect(studio).toContain('download("svg", "image/svg+xml;charset=utf-8"');
  expect(studio).not.toContain('download(`${name}.txt`');
  expect(studio).not.toContain('download(`${name}.html`');
  expect(studio).not.toContain('download(`${name}.svg`');
});

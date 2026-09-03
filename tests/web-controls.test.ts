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
  expect(handler).toContain('scheduleResolution();');
  expect(handler).not.toContain("colour.checked");
  expect(handler).not.toContain("colourBg.checked");
  expect(handler).not.toContain("fullColour.checked");
  expect(handler).not.toContain("paletteInput.value");
  expect(handler).not.toContain("paletteDither.checked");
  expect(handler).not.toContain("presetSelect.value");
  expect(handler).not.toContain("dither.value");
  expect(handler).not.toContain("invert.checked");
});

test("studio keeps custom palette and JPEG controls while adding editable output presets", async () => {
  const html = await readFile(join(root, "web", "index.html"), "utf8");
  const studio = await readFile(join(root, "src", "web", "studio.ts"), "utf8");
  expect(html).toContain('accept="image/png,image/jpeg,.png,.jpg,.jpeg"');
  expect(html).toContain('<label>Custom palette<textarea id="palette"');
  expect(html).toContain('<input id="palette-dither" type="checkbox"> Floyd–Steinberg palette dither');
  expect(html).toContain('<input id="full-colour" type="checkbox" disabled> Full Colour');
  expect(html).toContain('<label class="preset-control" for="output-preset">Output preset<select id="output-preset"></select></label>');
  expect(studio).toContain('applyOutputPreset(source.pixels, preset, Number(columnsValue.value), palette, paletteDither.checked)');
  expect(studio).toContain('presetSelect.addEventListener("change", applyPresetDefaults)');
  expect(studio).toContain('fullColour.addEventListener("change", () => { syncColour(true); schedule(); });');
  expect(studio).toContain('file.type === "image/png" || file.type === "image/jpeg"');
});

test("hardware presets are defaults rather than locked controls", async () => {
  const studio = await readFile(join(root, "src", "web", "studio.ts"), "utf8");
  expect(studio).toContain('columnsValue.value = String(preset.columns);');
  expect(studio).toContain('paletteInput.value = preset.palette ?? "";');
  expect(studio).toContain('paletteDither.checked = preset.paletteDither ?? false;');
  expect(studio).toContain('if (preset.unicodeDither) dither.value = preset.unicodeDither;');
  expect(studio).not.toContain('paletteInput.disabled = true');
  expect(studio).not.toContain('columns.disabled = true');
  expect(studio).not.toContain('dither.disabled = true');
});

test("manual palette dither choice survives later output preset changes", async () => {
  const web = await readFile(join(root, "src", "web.ts"), "utf8");
  const preferences = await readFile(join(root, "src", "web", "preset-preferences.ts"), "utf8");
  expect(web).toContain('import { bindPresetPreferences } from "./web/preset-preferences.ts";');
  expect(web.indexOf("startStudio();")).toBeLessThan(web.indexOf("bindPresetPreferences();"));
  expect(preferences).toContain('paletteDither.addEventListener("change"');
  expect(preferences).toContain('manualPaletteDither = paletteDither.checked;');
  expect(preferences).toContain('outputPreset.addEventListener("change"');
  expect(preferences).toContain('if (manualPaletteDither !== null) paletteDither.checked = manualPaletteDither;');
  expect(preferences).toContain('localStorage.setItem(paletteDitherPreferenceKey, value ? "1" : "0")');
});

test("copy text is replaced by final Unicode raster download and every button label stays on one line", async () => {
  const html = await readFile(join(root, "web", "index.html"), "utf8");
  const studio = await readFile(join(root, "src", "web", "studio.ts"), "utf8");
  const baseCss = await readFile(join(root, "web", "styles", "base.css"), "utf8");
  const presetsCss = await readFile(join(root, "web", "styles", "presets.css"), "utf8");
  expect(html).toContain('<button id="download-raster" class="button primary" type="button">Download as raster</button>');
  expect(html).not.toContain('<button id="copy"');
  expect(studio).toContain('downloadRaster(current, foreground)');
  expect(studio).not.toContain('navigator.clipboard.writeText(textOutput())');
  expect(baseCss).toContain('font-weight:750;white-space:nowrap;cursor:pointer;');
  expect(presetsCss).toContain('#download-raster{font-size:clamp(');
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

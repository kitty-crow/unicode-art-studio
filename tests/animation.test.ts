import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string): Promise<string> => readFile(join(root, path), "utf8");

test("animation is a separate Studio tab with no embed controls", async () => {
  const html = await read("web/index.html");
  const animationStart = html.indexOf('id="animation" class="animation-panel"');
  expect(html).toContain('id="studio-image-tab"');
  expect(html).toContain('id="studio-animation-tab"');
  expect(animationStart).toBeGreaterThan(-1);
  const animationPanel = html.slice(animationStart);
  expect(animationPanel).toContain('id="animation-upload" type="file" accept="image/webp,image/gif,.webp,.gif"');
  expect(animationPanel).toContain("up to 25 MB");
  expect(animationPanel).toContain('id="animation-download-webp"');
  expect(animationPanel).toContain('id="animation-download-gif"');
  expect(animationPanel).toContain('id="animation-download-frames"');
  expect(animationPanel).not.toContain('id="copy-embed"');
  expect(animationPanel).not.toContain('id="embed-code"');
});

test("animation uses one filter configuration for every frame and exact delta bounds for lossless WebP", async () => {
  const animation = await read("src/web/animation.ts");
  const codec = await read("src/web/animation-codec.ts");
  expect(animation).toContain("const config = cfg();");
  expect(animation).toContain("const art = makeArt(pixels, config);");
  expect(codec).toContain("export const MAX_ANIMATION_BYTES = 25 * 1024 * 1024;");
  expect(codec).toContain("const diffBounds = (");
  expect(codec).toContain("previous[at] === current[at]");
  expect(codec).toContain('if (options.lossless || alpha)');
  expect(codec).toContain('imageFourCC = "VP8L";');
  expect(codec).toContain('fourCC: "ANMF"');
});

test("animation carries the existing hardware presets into every frame", async () => {
  const animation = await read("src/web/animation.ts");
  expect(animation).toContain('applyOutputPreset, outputPreset as presetFor, outputPresets');
  expect(animation).toContain('presetSelect.id = "animation-output-preset";');
  expect(animation).toContain("for (const preset of outputPresets)");
  expect(animation).toContain('const preset = presetFor(presetSelect.value);');
  expect(animation).toContain('const palette = parsePalette(preset.palette ?? "");');
  expect(animation).toContain("const pixels = applyOutputPreset(vector.pixels, preset, Number(columnsValue.value), palette, paletteDither);");
  expect(animation).toContain('presetSelect.addEventListener("change", applyPresetDefaults);');
});

test("animation preview is resized and contained so it cannot widen the mobile page", async () => {
  const animation = await read("src/web/animation.ts");
  const css = await read("web/styles/animation.css");
  expect(animation).toContain("const fitPreviewCanvas = (): void => {");
  expect(animation).toContain("const scale = Math.min(1, availableWidth / sourceWidth, availableHeight / sourceHeight);");
  expect(animation).toContain("const previewResizeObserver = new ResizeObserver(fitPreviewCanvas);");
  expect(css).toContain(".animation-panel,.animation-workspace,.animation-controls,.animation-preview,.animation-canvas-wrap,.animation-playback{min-width:0;max-width:100%;}");
  expect(css).toContain(".animation-controls{& select{min-width:0;max-width:100%;}");
  expect(css).toContain(".animation-canvas-wrap{box-sizing:border-box;width:100%");
  expect(css).toContain("overflow:hidden");
  expect(css).toContain("grid-template-columns:auto minmax(0,1fr) auto");
});

test("WebP exports preserve non-image RIFF chunks while GIF and ZIP remain raster exports", async () => {
  const codec = await read("src/web/animation-codec.ts");
  expect(codec).toContain('const replaced = new Set(["VP8X", "ANIM", "ANMF", "VP8 ", "VP8L", "ALPH"]);');
  expect(codec).toContain("preservedWebpChunks: preservedChunks(bytes)");
  expect(codec).toContain("export const encodeGifAnimation");
  expect(codec).toContain("export const encodeFramesZip");
  expect(codec).toContain("zipSync(files, { level: 0 })");
});

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
  expect(animation).toContain("const art = makeArt(vector.pixels, config);");
  expect(codec).toContain("export const MAX_ANIMATION_BYTES = 25 * 1024 * 1024;");
  expect(codec).toContain("const diffBounds = (");
  expect(codec).toContain("previous[at] === current[at]");
  expect(codec).toContain('if (options.lossless || alpha)');
  expect(codec).toContain('imageFourCC = "VP8L";');
  expect(codec).toContain('fourCC: "ANMF"');
});

test("WebP exports preserve non-image RIFF chunks while GIF and ZIP remain raster exports", async () => {
  const codec = await read("src/web/animation-codec.ts");
  expect(codec).toContain('const replaced = new Set(["VP8X", "ANIM", "ANMF", "VP8 ", "VP8L", "ALPH"]);');
  expect(codec).toContain("preservedWebpChunks: preservedChunks(bytes)");
  expect(codec).toContain("export const encodeGifAnimation");
  expect(codec).toContain("export const encodeFramesZip");
  expect(codec).toContain("zipSync(files, { level: 0 })");
});

import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Art, Pixels } from "../src/types.ts";
import { parsePalette, remapPalette } from "../src/web/palette.ts";
import { rasterGeometry, rasterSvg } from "../src/web/raster.ts";

const root = join(import.meta.dir, "..");

test("custom palette parser accepts RGB/RRGGBB lists and removes duplicates", () => {
  expect(parsePalette("#000, #ffffff\n#0af #000")).toEqual([
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 0, g: 170, b: 255 },
  ]);
  expect(() => parsePalette("#000 nope #fff")).toThrow("Invalid palette colour: nope");
});

test("palette remapping preserves alpha and transparent hidden RGB", () => {
  const source: Pixels = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      250, 240, 240, 128,
      12, 34, 56, 0,
    ]),
  };
  const result = remapPalette(source, parsePalette("#000000 #ffffff"));
  expect([...result.data]).toEqual([
    255, 255, 255, 128,
    12, 34, 56, 0,
  ]);
});

test("Floyd-Steinberg palette dithering diffuses quantisation error deterministically", () => {
  const source: Pixels = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      128, 128, 128, 255,
      128, 128, 128, 255,
    ]),
  };
  const result = remapPalette(source, parsePalette("#000 #fff"), true);
  expect([...result.data]).toEqual([
    255, 255, 255, 255,
    0, 0, 0, 255,
  ]);
});

test("raster export builds a transparent final-Unicode SVG at a 1:2 cell ratio", () => {
  const art: Art = {
    text: "⣿⠀",
    columns: 2,
    rows: 1,
    dotsWidth: 4,
    dotsHeight: 4,
    threshold: 0.5,
    density: 0.5,
    cellColours: [
      { fg: { r: 255, g: 0, b: 0 }, bg: { r: 0, g: 0, b: 255 } },
      {},
    ],
  };
  expect(rasterGeometry(art)).toEqual({ cellWidth: 8, cellHeight: 16, width: 16, height: 16 });
  const svg = rasterSvg(art, "#123456");
  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"');
  expect(svg).toContain('fill="#0000ff"');
  expect(svg).toContain('fill="#ff0000"');
  expect(svg).not.toContain('<rect x="0" y="0" width="16" height="16"');
});

test("high-resolution raster geometry stays inside the browser pixel budget", () => {
  const art: Art = {
    text: "",
    columns: 640,
    rows: 200,
    dotsWidth: 1280,
    dotsHeight: 800,
    threshold: 0.5,
    density: 0,
  };
  expect(rasterGeometry(art)).toEqual({ cellWidth: 4, cellHeight: 8, width: 2560, height: 1600 });
});

test("raster download renders directly to canvas instead of decoding a giant SVG", async () => {
  const raster = await readFile(join(root, "src", "web", "raster.ts"), "utf8");
  expect(raster).toContain("const maxRasterPixels = 6_000_000;");
  expect(raster).toContain("const renderRasterCanvas = async");
  expect(raster).toContain("const canvas = await renderRasterCanvas(art, defaultForeground);");
  expect(raster).toContain('if ((y + 1) % 16 === 0) await yieldToBrowser();');
  expect(raster).not.toContain("const imageFrom =");
  expect(raster).not.toContain("context.drawImage(image");
});

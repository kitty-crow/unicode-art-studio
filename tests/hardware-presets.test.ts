import { expect, test } from "bun:test";
import type { Pixels } from "../src/types.ts";
import { applyOutputPreset, outputPreset } from "../src/web/hardware.ts";
import { parsePalette } from "../src/web/palette.ts";

const pixels = (width: number, height: number): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = (x * 37 + y * 17) & 255;
      data[i + 1] = (x * 71 + y * 29) & 255;
      data[i + 2] = (x * 19 + y * 83) & 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
};

const colourAt = (source: Pixels, x: number, y: number): string => {
  const i = (y * source.width + x) * 4;
  return `${source.data[i]},${source.data[i + 1]},${source.data[i + 2]}`;
};

const blockColours = (source: Pixels, x0: number, y0: number, width: number, height: number): Set<string> => {
  const out = new Set<string>();
  for (let y = y0; y < Math.min(source.height, y0 + height); y += 1) {
    for (let x = x0; x < Math.min(source.width, x0 + width); x += 1) out.add(colourAt(source, x, y));
  }
  return out;
};

test("hardware presets preselect native horizontal density without replacing Full Colour semantics", () => {
  expect(outputPreset("cga320-auto").columns).toBe(160);
  expect(outputPreset("cga640").columns).toBe(320);
  expect(outputPreset("c64-multicolour").columns).toBe(160);
  expect(outputPreset("nes-bg").columns).toBe(128);
  expect(outputPreset("snes-4bpp").columns).toBe(128);
  expect(outputPreset("genesis-4bpp").columns).toBe(160);
  expect(outputPreset("custom").engine).toBeUndefined();
});

test("CGA 320x200 auto chooses one legal four-colour RGBI state", () => {
  const result = applyOutputPreset(pixels(16, 8), outputPreset("cga320-auto"), 8, [], false);
  expect(blockColours(result, 0, 0, result.width, result.height).size).toBeLessThanOrEqual(4);
});

test("C64 multicolour keeps fat pixels paired and no more than four colours per 4x8 logical cell", () => {
  const result = applyOutputPreset(pixels(16, 8), outputPreset("c64-multicolour"), 8, parsePalette(outputPreset("c64-multicolour").palette ?? ""), true);
  for (let y = 0; y < result.height; y += 1) for (let x = 0; x + 1 < result.width; x += 2) expect(colourAt(result, x, y)).toBe(colourAt(result, x + 1, y));
  for (let x = 0; x < result.width; x += 8) expect(blockColours(result, x, 0, 8, 8).size).toBeLessThanOrEqual(4);
});

test("C64 hi-res bitmap keeps each 8x8 cell to two colours", () => {
  const result = applyOutputPreset(pixels(16, 8), outputPreset("c64-hires"), 8, parsePalette(outputPreset("c64-hires").palette ?? ""), true);
  for (let x = 0; x < result.width; x += 8) expect(blockColours(result, x, 0, 8, 8).size).toBeLessThanOrEqual(2);
});

test("NES background mode keeps each 16x16 attribute region to four colours", () => {
  const result = applyOutputPreset(pixels(32, 16), outputPreset("nes-bg"), 16, parsePalette(outputPreset("nes-bg").palette ?? ""), true);
  for (let x = 0; x < result.width; x += 16) expect(blockColours(result, x, 0, 16, 16).size).toBeLessThanOrEqual(4);
  expect(blockColours(result, 0, 0, result.width, result.height).size).toBeLessThanOrEqual(13);
});

test("SNES and Genesis tile presets enforce their palette-line limits", () => {
  const source = pixels(16, 8);
  const snes = applyOutputPreset(source, outputPreset("snes-4bpp"), 8, [], true);
  const genesis = applyOutputPreset(source, outputPreset("genesis-4bpp"), 8, [], true);
  for (let x = 0; x < 16; x += 8) {
    expect(blockColours(snes, x, 0, 8, 8).size).toBeLessThanOrEqual(16);
    expect(blockColours(genesis, x, 0, 8, 8).size).toBeLessThanOrEqual(16);
  }
});

test("RGB565 preset quantises channels to 5/6/5 levels", () => {
  const source: Pixels = { width: 1, height: 1, data: new Uint8ClampedArray([123, 137, 149, 211]) };
  const result = applyOutputPreset(source, outputPreset("rgb565"), 1, [], false);
  expect(result.data[0]).toBe(Math.round(Math.round(123 * 31 / 255) * 255 / 31));
  expect(result.data[1]).toBe(Math.round(Math.round(137 * 63 / 255) * 255 / 63));
  expect(result.data[2]).toBe(Math.round(Math.round(149 * 31 / 255) * 255 / 31));
  expect(result.data[3]).toBe(211);
});

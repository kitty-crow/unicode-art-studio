import { artSize } from "../core/size.ts";
import { resize } from "../core/resize.ts";
import type { Dither, Pixels, Rgb } from "../types.ts";
import { parsePalette, remapPalette } from "./palette.ts";

export type HardwareEngine =
  | "adaptive"
  | "cga320"
  | "cga640"
  | "cga160"
  | "ega16"
  | "vga256"
  | "rgb555"
  | "rgb565"
  | "c64-hires"
  | "c64-multicolour"
  | "nes-bg"
  | "snes-4bpp"
  | "snes-8bpp"
  | "genesis-4bpp";

export interface OutputPreset {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly engine?: HardwareEngine;
  readonly columns?: number;
  readonly colours?: number;
  readonly palette?: string;
  readonly paletteDither?: boolean;
  readonly unicodeDither?: Dither;
  readonly fullColour?: boolean;
}

const CGA16 = "#000000 #0000AA #00AA00 #00AAAA #AA0000 #AA00AA #AA5500 #AAAAAA #555555 #5555FF #55FF55 #55FFFF #FF5555 #FF55FF #FFFF55 #FFFFFF";
const C64 = "#000000 #FFFFFF #813338 #75CEC8 #8E3C97 #56AC4D #2E2C9B #EDF171 #8E5029 #553800 #C46C71 #4A4A4A #7B7B7B #A9FF9F #706DEB #B2B2B2";
const NES = "#7C7C7C #0000FC #0000BC #4428BC #940084 #A80020 #A81000 #881400 #503000 #007800 #006800 #005800 #004058 #000000 #BCBCBC #0078F8 #0058F8 #6844FC #D800CC #E40058 #F83800 #E45C10 #AC7C00 #00B800 #00A800 #00A844 #008888 #F8F8F8 #3CBCFC #6888FC #9878F8 #F878F8 #F85898 #F87858 #FCA044 #F8B800 #B8F818 #58D854 #58F898 #00E8D8 #787878 #FCFCFC #A4E4FC #B8B8F8 #D8B8F8 #F8B8F8 #F8A4C0 #F0D0B0 #FCE0A8 #F8D878 #D8F878 #B8F8B8 #B8F8D8 #00FCFC #F8D8F8";

const CGA_P0_LOW = "#000000 #00AA00 #AA0000 #AA5500";
const CGA_P0_HIGH = "#000000 #55FF55 #FF5555 #FFFF55";
const CGA_P1_LOW = "#000000 #00AAAA #AA00AA #AAAAAA";
const CGA_P1_HIGH = "#000000 #55FFFF #FF55FF #FFFFFF";

export const outputPresets: readonly OutputPreset[] = [
  { id: "custom", label: "Custom", group: "General" },

  { id: "bit-1", label: "1-bit · 2 colours", group: "Colour depth", engine: "adaptive", colours: 2, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "bit-2", label: "2-bit · 4 colours", group: "Colour depth", engine: "adaptive", colours: 4, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "bit-4", label: "4-bit · 16 colours", group: "Colour depth", engine: "adaptive", colours: 16, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "colour-64", label: "64 colours", group: "Colour depth", engine: "adaptive", colours: 64, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "bit-8", label: "8-bit · 256 colours", group: "Colour depth", engine: "adaptive", colours: 256, paletteDither: false, unicodeDither: "atkinson", fullColour: true },
  { id: "rgb555", label: "15-bit High Colour · RGB555", group: "Colour depth", engine: "rgb555", paletteDither: false, unicodeDither: "atkinson", fullColour: true },
  { id: "rgb565", label: "16-bit High Colour · RGB565", group: "Colour depth", engine: "rgb565", paletteDither: false, unicodeDither: "atkinson", fullColour: true },

  { id: "cga320-auto", label: "CGA 320×200 · Auto", group: "IBM PC", engine: "cga320", columns: 160, palette: CGA16, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "cga320-p0-low", label: "CGA 320×200 · Palette 0 low", group: "IBM PC", engine: "adaptive", columns: 160, colours: 4, palette: CGA_P0_LOW, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "cga320-p0-high", label: "CGA 320×200 · Palette 0 high", group: "IBM PC", engine: "adaptive", columns: 160, colours: 4, palette: CGA_P0_HIGH, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "cga320-p1-low", label: "CGA 320×200 · Palette 1 low", group: "IBM PC", engine: "adaptive", columns: 160, colours: 4, palette: CGA_P1_LOW, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "cga320-p1-high", label: "CGA 320×200 · Palette 1 high", group: "IBM PC", engine: "adaptive", columns: 160, colours: 4, palette: CGA_P1_HIGH, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "cga640", label: "CGA 640×200 · 2 colours", group: "IBM PC", engine: "cga640", columns: 320, palette: CGA16, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "cga160", label: "CGA 160×100 · 16 colours", group: "IBM PC", engine: "cga160", columns: 160, palette: CGA16, paletteDither: false, unicodeDither: "threshold", fullColour: true },
  { id: "ega16", label: "EGA 320×200 · 16 of 64", group: "IBM PC", engine: "ega16", columns: 160, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "vga13", label: "VGA 320×200 · 256 colours", group: "IBM PC", engine: "vga256", columns: 160, paletteDither: false, unicodeDither: "atkinson", fullColour: true },
  { id: "svga640", label: "SVGA 640×480 · 256 colours", group: "IBM PC", engine: "vga256", columns: 320, paletteDither: false, unicodeDither: "atkinson", fullColour: true },
  { id: "svga800", label: "SVGA 800×600 · RGB565", group: "IBM PC", engine: "rgb565", columns: 400, paletteDither: false, unicodeDither: "atkinson", fullColour: true },
  { id: "svga1024", label: "SVGA 1024×768 · RGB555", group: "IBM PC", engine: "rgb555", columns: 512, paletteDither: false, unicodeDither: "atkinson", fullColour: true },

  { id: "c64-hires", label: "Commodore 64 · Hi-res bitmap", group: "Home computers", engine: "c64-hires", columns: 160, palette: C64, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "c64-multicolour", label: "Commodore 64 · Multicolour bitmap", group: "Home computers", engine: "c64-multicolour", columns: 160, palette: C64, paletteDither: true, unicodeDither: "atkinson", fullColour: true },

  { id: "nes-bg", label: "NES · Background", group: "Consoles", engine: "nes-bg", columns: 128, palette: NES, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "snes-4bpp", label: "SNES · 4bpp tiles", group: "Consoles", engine: "snes-4bpp", columns: 128, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
  { id: "snes-8bpp", label: "SNES · 8bpp / 256 colours", group: "Consoles", engine: "snes-8bpp", columns: 128, paletteDither: false, unicodeDither: "atkinson", fullColour: true },
  { id: "genesis-4bpp", label: "Mega Drive / Genesis · 4bpp tiles", group: "Consoles", engine: "genesis-4bpp", columns: 160, paletteDither: true, unicodeDither: "atkinson", fullColour: true },
];

export const outputPreset = (id: string): OutputPreset => outputPresets.find(preset => preset.id === id) ?? outputPresets[0]!;

const clamp = (value: number): number => Math.max(0, Math.min(255, value));
const key = (colour: Rgb): number => (colour.r << 16) | (colour.g << 8) | colour.b;
const same = (a: Rgb, b: Rgb): boolean => a.r === b.r && a.g === b.g && a.b === b.b;
const dist = (r: number, g: number, b: number, colour: Rgb): number => {
  const dr = r - colour.r, dg = g - colour.g, db = b - colour.b;
  return dr * dr + dg * dg + db * db;
};

const nearest = (r: number, g: number, b: number, palette: readonly Rgb[]): Rgb => {
  let best = palette[0]!;
  let error = Number.POSITIVE_INFINITY;
  for (const colour of palette) {
    const current = dist(r, g, b, colour);
    if (current < error) { best = colour; error = current; }
  }
  return best;
};

const unique = (colours: readonly Rgb[]): Rgb[] => {
  const seen = new Set<number>();
  const out: Rgb[] = [];
  for (const colour of colours) {
    const id = key(colour);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(colour);
  }
  return out;
};

const histogram = (source: Pixels, convert: (r: number, g: number, b: number) => Rgb = (r, g, b) => ({ r, g, b })): Array<{ colour: Rgb; count: number }> => {
  const counts = new Map<number, { colour: Rgb; count: number }>();
  const pixels = source.width * source.height;
  const step = Math.max(1, Math.floor(pixels / 120_000));
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    if ((source.data[i + 3] ?? 0) === 0) continue;
    const colour = convert(source.data[i] ?? 0, source.data[i + 1] ?? 0, source.data[i + 2] ?? 0);
    const id = key(colour);
    const current = counts.get(id);
    if (current) current.count += 1;
    else counts.set(id, { colour, count: 1 });
  }
  return [...counts.values()];
};

const adaptivePalette = (source: Pixels, limit: number, convert?: (r: number, g: number, b: number) => Rgb): Rgb[] => {
  const entries = histogram(source, convert);
  if (entries.length <= limit) return entries.sort((a, b) => b.count - a.count).map(entry => entry.colour);
  entries.sort((a, b) => b.count - a.count);
  const chosen: Rgb[] = [entries[0]!.colour];
  const chosenKeys = new Set<number>([key(chosen[0]!)]);
  while (chosen.length < limit) {
    let best: Rgb | null = null;
    let bestScore = -1;
    for (const entry of entries) {
      if (chosenKeys.has(key(entry.colour))) continue;
      let nearestError = Number.POSITIVE_INFINITY;
      for (const colour of chosen) nearestError = Math.min(nearestError, dist(entry.colour.r, entry.colour.g, entry.colour.b, colour));
      const score = nearestError * Math.sqrt(entry.count);
      if (score > bestScore) { best = entry.colour; bestScore = score; }
    }
    if (!best) break;
    chosen.push(best);
    chosenKeys.add(key(best));
  }
  return chosen;
};

const quantLevel = (value: number, levels: number): number => Math.round(Math.round(value * (levels - 1) / 255) * 255 / (levels - 1));
const rgbBits = (rb: number, gb: number, bb: number) => (r: number, g: number, b: number): Rgb => ({
  r: quantLevel(r, 2 ** rb), g: quantLevel(g, 2 ** gb), b: quantLevel(b, 2 ** bb),
});

const channelQuantise = (source: Pixels, rb: number, gb: number, bb: number, dither: boolean): Pixels => {
  if (!dither) {
    const convert = rgbBits(rb, gb, bb);
    const data = new Uint8ClampedArray(source.data);
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) === 0) continue;
      const colour = convert(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
      data[i] = colour.r; data[i + 1] = colour.g; data[i + 2] = colour.b;
    }
    return { width: source.width, height: source.height, data };
  }

  const data = new Uint8ClampedArray(source.data);
  const width = source.width;
  let current = new Float32Array(width * 3), next = new Float32Array(width * 3);
  const levels = [2 ** rb, 2 ** gb, 2 ** bb] as const;
  const diffuse = (buffer: Float32Array, x: number, errors: readonly number[], weight: number): void => {
    if (x < 0 || x >= width) return;
    for (let c = 0; c < 3; c += 1) buffer[x * 3 + c] = (buffer[x * 3 + c] ?? 0) + (errors[c] ?? 0) * weight;
  };
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if ((source.data[i + 3] ?? 0) === 0) continue;
      const errors: number[] = [];
      for (let c = 0; c < 3; c += 1) {
        const value = clamp((source.data[i + c] ?? 0) + (current[x * 3 + c] ?? 0));
        const quantised = quantLevel(value, levels[c]!);
        data[i + c] = quantised;
        errors[c] = value - quantised;
      }
      diffuse(current, x + 1, errors, 7 / 16);
      diffuse(next, x - 1, errors, 3 / 16);
      diffuse(next, x, errors, 5 / 16);
      diffuse(next, x + 1, errors, 1 / 16);
    }
    const old = current; current = next; next = old; next.fill(0);
  }
  return { width: source.width, height: source.height, data };
};

const targetPixels = (source: Pixels, columns: number): Pixels => {
  const size = artSize(source.width, source.height, columns);
  return resize(source, size.dotsWidth, size.dotsHeight);
};

const blockHistogram = (source: Pixels, x0: number, y0: number, width: number, height: number, master: readonly Rgb[]): Array<{ colour: Rgb; count: number }> => {
  const counts = new Map<number, { colour: Rgb; count: number }>();
  for (let y = y0; y < Math.min(source.height, y0 + height); y += 1) {
    for (let x = x0; x < Math.min(source.width, x0 + width); x += 1) {
      const i = (y * source.width + x) * 4;
      if ((source.data[i + 3] ?? 0) === 0) continue;
      const colour = nearest(source.data[i] ?? 0, source.data[i + 1] ?? 0, source.data[i + 2] ?? 0, master);
      const id = key(colour), current = counts.get(id);
      if (current) current.count += 1;
      else counts.set(id, { colour, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
};

const blockPalette = (source: Pixels, x: number, y: number, w: number, h: number, master: readonly Rgb[], limit: number, shared: readonly Rgb[] = []): Rgb[] => {
  const out = unique(shared);
  for (const entry of blockHistogram(source, x, y, w, h, master)) {
    if (out.some(colour => same(colour, entry.colour))) continue;
    out.push(entry.colour);
    if (out.length >= limit) break;
  }
  if (out.length === 0) out.push(master[0]!);
  return out;
};

const paletteError = (source: Pixels, x0: number, y0: number, w: number, h: number, palette: readonly Rgb[]): number => {
  let error = 0;
  for (let y = y0; y < Math.min(source.height, y0 + h); y += 1) {
    for (let x = x0; x < Math.min(source.width, x0 + w); x += 1) {
      const i = (y * source.width + x) * 4;
      const alpha = (source.data[i + 3] ?? 0) / 255;
      if (alpha <= 0) continue;
      const colour = nearest(source.data[i] ?? 0, source.data[i + 1] ?? 0, source.data[i + 2] ?? 0, palette);
      error += dist(source.data[i] ?? 0, source.data[i + 1] ?? 0, source.data[i + 2] ?? 0, colour) * alpha;
    }
  }
  return error;
};

const paintBlock = (source: Pixels, out: Uint8ClampedArray, x0: number, y0: number, w: number, h: number, palette: readonly Rgb[], dither: boolean): void => {
  const width = Math.min(w, source.width - x0), height = Math.min(h, source.height - y0);
  let current = new Float32Array(Math.max(1, width) * 3), next = new Float32Array(Math.max(1, width) * 3);
  const diffuse = (buffer: Float32Array, x: number, er: number, eg: number, eb: number, weight: number): void => {
    if (x < 0 || x >= width) return;
    const i = x * 3;
    buffer[i] = (buffer[i] ?? 0) + er * weight;
    buffer[i + 1] = (buffer[i + 1] ?? 0) + eg * weight;
    buffer[i + 2] = (buffer[i + 2] ?? 0) + eb * weight;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = ((y0 + y) * source.width + x0 + x) * 4;
      if ((source.data[i + 3] ?? 0) === 0) continue;
      const r = clamp((source.data[i] ?? 0) + (dither ? (current[x * 3] ?? 0) : 0));
      const g = clamp((source.data[i + 1] ?? 0) + (dither ? (current[x * 3 + 1] ?? 0) : 0));
      const b = clamp((source.data[i + 2] ?? 0) + (dither ? (current[x * 3 + 2] ?? 0) : 0));
      const colour = nearest(r, g, b, palette);
      out[i] = colour.r; out[i + 1] = colour.g; out[i + 2] = colour.b;
      if (!dither) continue;
      const er = r - colour.r, eg = g - colour.g, eb = b - colour.b;
      diffuse(current, x + 1, er, eg, eb, 7 / 16);
      diffuse(next, x - 1, er, eg, eb, 3 / 16);
      diffuse(next, x, er, eg, eb, 5 / 16);
      diffuse(next, x + 1, er, eg, eb, 1 / 16);
    }
    const old = current; current = next; next = old; next.fill(0);
  }
};

const perBlock = (source: Pixels, blockW: number, blockH: number, master: readonly Rgb[], colours: number, dither: boolean): Pixels => {
  const out = new Uint8ClampedArray(source.data);
  for (let y = 0; y < source.height; y += blockH) {
    for (let x = 0; x < source.width; x += blockW) {
      paintBlock(source, out, x, y, blockW, blockH, blockPalette(source, x, y, blockW, blockH, master, colours), dither);
    }
  }
  return { width: source.width, height: source.height, data: out };
};

const mostUsed = (source: Pixels, master: readonly Rgb[]): Rgb => {
  const counts = new Map<number, { colour: Rgb; count: number }>();
  const entries = histogram(source, (r, g, b) => nearest(r, g, b, master));
  for (const entry of entries) counts.set(key(entry.colour), entry);
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.colour ?? master[0]!;
};

interface Region { readonly x: number; readonly y: number; readonly palette: readonly Rgb[]; }

const paletteBank = (source: Pixels, blockW: number, blockH: number, master: readonly Rgb[], localColours: number, maxPalettes: number, shared: readonly Rgb[], dither: boolean): Pixels => {
  const regions: Region[] = [];
  for (let y = 0; y < source.height; y += blockH) {
    for (let x = 0; x < source.width; x += blockW) regions.push({ x, y, palette: blockPalette(source, x, y, blockW, blockH, master, localColours + shared.length, shared) });
  }
  if (regions.length === 0) return source;

  const bank: Rgb[][] = [regions[0]!.palette.slice()];
  while (bank.length < maxPalettes) {
    let farthest: Region | null = null, farthestError = -1;
    for (const region of regions) {
      const error = Math.min(...bank.map(palette => paletteError(source, region.x, region.y, blockW, blockH, palette)));
      if (error > farthestError) { farthest = region; farthestError = error; }
    }
    if (!farthest || bank.some(palette => palette.length === farthest!.palette.length && palette.every((colour, i) => same(colour, farthest!.palette[i]!)))) break;
    bank.push(farthest.palette.slice());
  }

  const out = new Uint8ClampedArray(source.data);
  for (const region of regions) {
    let best = bank[0]!, error = paletteError(source, region.x, region.y, blockW, blockH, best);
    for (let i = 1; i < bank.length; i += 1) {
      const current = paletteError(source, region.x, region.y, blockW, blockH, bank[i]!);
      if (current < error) { best = bank[i]!; error = current; }
    }
    paintBlock(source, out, region.x, region.y, blockW, blockH, best, dither);
  }
  return { width: source.width, height: source.height, data: out };
};

const cgaAuto = (source: Pixels, dither: boolean): Pixels => {
  const master = parsePalette(CGA16);
  const sets = [parsePalette(CGA_P0_LOW).slice(1), parsePalette(CGA_P0_HIGH).slice(1), parsePalette(CGA_P1_LOW).slice(1), parsePalette(CGA_P1_HIGH).slice(1)];
  const pixels = source.width * source.height, step = Math.max(1, Math.floor(pixels / 30_000));
  let best = [master[0]!, ...sets[0]!], bestError = Number.POSITIVE_INFINITY;
  for (const background of master) {
    for (const set of sets) {
      const palette = [background, ...set];
      let error = 0;
      for (let p = 0; p < pixels; p += step) {
        const i = p * 4;
        if ((source.data[i + 3] ?? 0) === 0) continue;
        const colour = nearest(source.data[i] ?? 0, source.data[i + 1] ?? 0, source.data[i + 2] ?? 0, palette);
        error += dist(source.data[i] ?? 0, source.data[i + 1] ?? 0, source.data[i + 2] ?? 0, colour);
      }
      if (error < bestError) { best = palette; bestError = error; }
    }
  }
  return remapPalette(source, best, dither);
};

const cga640 = (source: Pixels, master: readonly Rgb[], dither: boolean): Pixels => {
  const black = master.find(colour => colour.r === 0 && colour.g === 0 && colour.b === 0) ?? master[0]!;
  let foreground = master[0]!, bestError = Number.POSITIVE_INFINITY;
  for (const candidate of master) {
    const palette = unique([black, candidate]);
    const error = paletteError(source, 0, 0, source.width, source.height, palette);
    if (error < bestError) { foreground = candidate; bestError = error; }
  }
  return remapPalette(source, unique([black, foreground]), dither);
};

const pixelate2x2 = (source: Pixels, palette: readonly Rgb[]): Pixels => {
  const data = new Uint8ClampedArray(source.data);
  for (let y = 0; y < source.height; y += 2) {
    for (let x = 0; x < source.width; x += 2) {
      let r = 0, g = 0, b = 0, w = 0, alpha = 0;
      for (let yy = y; yy < Math.min(source.height, y + 2); yy += 1) for (let xx = x; xx < Math.min(source.width, x + 2); xx += 1) {
        const i = (yy * source.width + xx) * 4, a = (source.data[i + 3] ?? 0) / 255;
        r += (source.data[i] ?? 0) * a; g += (source.data[i + 1] ?? 0) * a; b += (source.data[i + 2] ?? 0) * a; w += a; alpha = Math.max(alpha, source.data[i + 3] ?? 0);
      }
      const colour = nearest(w ? r / w : 0, w ? g / w : 0, w ? b / w : 0, palette);
      for (let yy = y; yy < Math.min(source.height, y + 2); yy += 1) for (let xx = x; xx < Math.min(source.width, x + 2); xx += 1) {
        const i = (yy * source.width + xx) * 4; data[i] = colour.r; data[i + 1] = colour.g; data[i + 2] = colour.b; data[i + 3] = alpha;
      }
    }
  }
  return { width: source.width, height: source.height, data };
};

const c64Multicolour = (source: Pixels, master: readonly Rgb[], dither: boolean): Pixels => {
  const logicalWidth = Math.max(1, Math.floor(source.width / 2));
  const logical = new Uint8ClampedArray(logicalWidth * source.height * 4);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < logicalWidth; x += 1) {
      const a = (y * source.width + x * 2) * 4, b = (y * source.width + Math.min(source.width - 1, x * 2 + 1)) * 4, dst = (y * logicalWidth + x) * 4;
      const aa = (source.data[a + 3] ?? 0) / 255, ab = (source.data[b + 3] ?? 0) / 255, weight = aa + ab;
      logical[dst] = weight ? Math.round(((source.data[a] ?? 0) * aa + (source.data[b] ?? 0) * ab) / weight) : source.data[a] ?? 0;
      logical[dst + 1] = weight ? Math.round(((source.data[a + 1] ?? 0) * aa + (source.data[b + 1] ?? 0) * ab) / weight) : source.data[a + 1] ?? 0;
      logical[dst + 2] = weight ? Math.round(((source.data[a + 2] ?? 0) * aa + (source.data[b + 2] ?? 0) * ab) / weight) : source.data[a + 2] ?? 0;
      logical[dst + 3] = Math.max(source.data[a + 3] ?? 0, source.data[b + 3] ?? 0);
    }
  }
  const pixels: Pixels = { width: logicalWidth, height: source.height, data: logical };
  const background = mostUsed(pixels, master);
  const out = new Uint8ClampedArray(logical);
  for (let y = 0; y < pixels.height; y += 8) for (let x = 0; x < pixels.width; x += 4) {
    const palette = blockPalette(pixels, x, y, 4, 8, master, 4, [background]);
    paintBlock(pixels, out, x, y, 4, 8, palette, dither);
  }
  const expanded = new Uint8ClampedArray(source.width * source.height * 4);
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const src = (y * logicalWidth + Math.min(logicalWidth - 1, Math.floor(x / 2))) * 4, dst = (y * source.width + x) * 4;
    expanded[dst] = out[src] ?? 0; expanded[dst + 1] = out[src + 1] ?? 0; expanded[dst + 2] = out[src + 2] ?? 0; expanded[dst + 3] = out[src + 3] ?? 0;
  }
  return { width: source.width, height: source.height, data: expanded };
};

const egaMaster = (): Rgb[] => {
  const out: Rgb[] = [];
  for (let r = 0; r < 4; r += 1) for (let g = 0; g < 4; g += 1) for (let b = 0; b < 4; b += 1) out.push({ r: r * 85, g: g * 85, b: b * 85 });
  return out;
};

const masterOr = (override: readonly Rgb[], fallback: readonly Rgb[]): readonly Rgb[] => override.length ? override : fallback;

export const applyOutputPreset = (source: Pixels, preset: OutputPreset, columns: number, paletteOverride: readonly Rgb[], dither: boolean): Pixels => {
  if (!preset.engine) return paletteOverride.length ? remapPalette(source, paletteOverride, dither) : source;
  const working = targetPixels(source, columns);

  switch (preset.engine) {
    case "adaptive": {
      const master = paletteOverride.length ? paletteOverride : adaptivePalette(working, Math.max(2, preset.colours ?? 16));
      const palette = master.length > (preset.colours ?? master.length) ? adaptivePalette(remapPalette(working, master, false), preset.colours ?? master.length) : master;
      return remapPalette(working, palette, dither);
    }
    case "cga320": return paletteOverride.length && paletteOverride.length !== parsePalette(CGA16).length ? remapPalette(working, adaptivePalette(remapPalette(working, paletteOverride, false), 4), dither) : cgaAuto(working, dither);
    case "cga640": return cga640(working, masterOr(paletteOverride, parsePalette(CGA16)), dither);
    case "cga160": return pixelate2x2(working, masterOr(paletteOverride, parsePalette(CGA16)));
    case "ega16": {
      const master = masterOr(paletteOverride, egaMaster());
      return remapPalette(working, adaptivePalette(remapPalette(working, master, false), Math.min(16, master.length)), dither);
    }
    case "vga256": {
      if (paletteOverride.length) return remapPalette(working, adaptivePalette(remapPalette(working, paletteOverride, false), Math.min(256, paletteOverride.length)), dither);
      const sixBit = channelQuantise(working, 6, 6, 6, false);
      return remapPalette(sixBit, adaptivePalette(sixBit, 256), dither);
    }
    case "rgb555": return channelQuantise(working, 5, 5, 5, dither);
    case "rgb565": return channelQuantise(working, 5, 6, 5, dither);
    case "c64-hires": return perBlock(working, 8, 8, masterOr(paletteOverride, parsePalette(C64)), 2, dither);
    case "c64-multicolour": return c64Multicolour(working, masterOr(paletteOverride, parsePalette(C64)), dither);
    case "nes-bg": {
      const master = masterOr(paletteOverride, parsePalette(NES));
      const backdrop = mostUsed(working, master);
      return paletteBank(working, 16, 16, master, 3, 4, [backdrop], dither);
    }
    case "snes-4bpp": {
      const rgb555 = channelQuantise(working, 5, 5, 5, false);
      const master = paletteOverride.length ? paletteOverride : adaptivePalette(rgb555, 120);
      const backdrop = mostUsed(rgb555, master);
      return paletteBank(rgb555, 8, 8, master, 15, 8, [backdrop], dither);
    }
    case "snes-8bpp": {
      const rgb555 = channelQuantise(working, 5, 5, 5, false);
      const master = paletteOverride.length ? paletteOverride : adaptivePalette(rgb555, 256);
      return remapPalette(rgb555, master.slice(0, 256), dither);
    }
    case "genesis-4bpp": {
      const rgb333 = channelQuantise(working, 3, 3, 3, false);
      const master = paletteOverride.length ? paletteOverride : adaptivePalette(rgb333, 61);
      const backdrop = mostUsed(rgb333, master);
      return paletteBank(rgb333, 8, 8, master, 15, 4, [backdrop], dither);
    }
  }
};

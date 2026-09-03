import type { ArtCfg, Pixels, Rgb } from "../types.ts";

export interface PaletteCfg {
  readonly palette?: string;
  readonly paletteDither?: boolean;
  readonly outputPreset?: string;
}

export type StudioArtCfg = ArtCfg & PaletteCfg;

const hexColour = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu;

const rgb = (token: string): Rgb => {
  const value = token.slice(1);
  const expanded = value.length === 3 ? [...value].map(char => `${char}${char}`).join("") : value;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
};

export const parsePalette = (value: string): readonly Rgb[] => {
  const tokens = value.trim().split(/[\s,]+/u).filter(Boolean);
  if (tokens.length === 0) return [];

  const seen = new Set<string>();
  const colours: Rgb[] = [];
  for (const token of tokens) {
    if (!hexColour.test(token)) throw new Error(`Invalid palette colour: ${token}`);
    const colour = rgb(token);
    const key = `${colour.r},${colour.g},${colour.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    colours.push(colour);
  }
  return colours;
};

const nearest = (r: number, g: number, b: number, palette: readonly Rgb[]): Rgb => {
  let best = palette[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const colour of palette) {
    const dr = r - colour.r;
    const dg = g - colour.g;
    const db = b - colour.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      best = colour;
      bestDistance = distance;
    }
  }
  return best;
};

const clamp = (value: number): number => Math.max(0, Math.min(255, value));

const nearestOnly = (source: Pixels, palette: readonly Rgb[]): Pixels => {
  const data = new Uint8ClampedArray(source.data);
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const colour = nearest(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, palette);
    data[i] = colour.r;
    data[i + 1] = colour.g;
    data[i + 2] = colour.b;
  }
  return { width: source.width, height: source.height, data };
};

const floydSteinberg = (source: Pixels, palette: readonly Rgb[]): Pixels => {
  const data = new Uint8ClampedArray(source.data);
  const width = source.width;
  let current = new Float32Array(width * 3);
  let next = new Float32Array(width * 3);

  const diffuse = (buffer: Float32Array, x: number, er: number, eg: number, eb: number, weight: number): void => {
    if (x < 0 || x >= width) return;
    const offset = x * 3;
    buffer[offset] = (buffer[offset] ?? 0) + er * weight;
    buffer[offset + 1] = (buffer[offset + 1] ?? 0) + eg * weight;
    buffer[offset + 2] = (buffer[offset + 2] ?? 0) + eb * weight;
  };

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if ((source.data[index + 3] ?? 0) === 0) continue;
      const errorOffset = x * 3;
      const r = clamp((source.data[index] ?? 0) + (current[errorOffset] ?? 0));
      const g = clamp((source.data[index + 1] ?? 0) + (current[errorOffset + 1] ?? 0));
      const b = clamp((source.data[index + 2] ?? 0) + (current[errorOffset + 2] ?? 0));
      const colour = nearest(r, g, b, palette);
      data[index] = colour.r;
      data[index + 1] = colour.g;
      data[index + 2] = colour.b;

      const er = r - colour.r;
      const eg = g - colour.g;
      const eb = b - colour.b;
      diffuse(current, x + 1, er, eg, eb, 7 / 16);
      diffuse(next, x - 1, er, eg, eb, 3 / 16);
      diffuse(next, x, er, eg, eb, 5 / 16);
      diffuse(next, x + 1, er, eg, eb, 1 / 16);
    }
    const old = current;
    current = next;
    next = old;
    next.fill(0);
  }

  return { width: source.width, height: source.height, data };
};

export const remapPalette = (source: Pixels, palette: readonly Rgb[], dither = false): Pixels => {
  if (palette.length === 0) return source;
  return dither ? floydSteinberg(source, palette) : nearestOnly(source, palette);
};

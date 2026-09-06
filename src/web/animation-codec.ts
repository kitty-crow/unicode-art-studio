import { createRiffContainer, parseRiff } from "@stacksjs/ts-webp/riff";
import { decodeAnimation as decodeWebpAnimation } from "@stacksjs/ts-webp/animation";
import { decode as decodeWebp } from "@stacksjs/ts-webp/decoder";
import { encodeVP8 } from "@stacksjs/ts-webp/vp8/encoder";
import { encodeVP8L } from "@stacksjs/ts-webp/vp8l/encoder";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { decompressFrames, parseGIF } from "gifuct-js";
import { zipSync } from "fflate";
import type { Pixels } from "../types.ts";

export const MAX_ANIMATION_BYTES = 25 * 1024 * 1024;
const MAX_DECODED_PIXEL_FRAMES = 36_000_000;
const MAX_WEBP_FRAME_DURATION = 0xffffff;

export interface AnimationFrame {
  readonly pixels: Pixels;
  readonly duration: number;
}

export interface PreservedWebpChunk {
  readonly fourCC: string;
  readonly data: Uint8Array;
}

export interface AnimationSource {
  readonly width: number;
  readonly height: number;
  readonly frames: readonly AnimationFrame[];
  readonly loopCount: number;
  readonly backgroundColor: number;
  readonly preservedWebpChunks: readonly PreservedWebpChunk[];
  readonly format: "gif" | "webp";
}

export interface AnimationFrameProvider {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly durations: readonly number[];
  readonly loopCount: number;
  render(index: number): Promise<HTMLCanvasElement>;
}

export interface AnimationEncodeOptions {
  readonly lossless: boolean;
  readonly quality: number;
  readonly preservedWebpChunks?: readonly PreservedWebpChunk[];
  readonly backgroundColor?: number;
  readonly progress?: (done: number, total: number) => void;
}

const safeDuration = (value: number): number => Math.max(10, Math.min(MAX_WEBP_FRAME_DURATION, Math.round(value || 100)));
const byte = (data: Uint8Array | Uint8ClampedArray, at: number): number => data[at] ?? 0;
const write24 = (target: Uint8Array, at: number, value: number): void => {
  target[at] = value & 0xff;
  target[at + 1] = (value >>> 8) & 0xff;
  target[at + 2] = (value >>> 16) & 0xff;
};

const copyPixel = (target: Uint8ClampedArray, targetAt: number, source: Uint8Array | Uint8ClampedArray, sourceAt: number): void => {
  target[targetAt] = byte(source, sourceAt);
  target[targetAt + 1] = byte(source, sourceAt + 1);
  target[targetAt + 2] = byte(source, sourceAt + 2);
  target[targetAt + 3] = byte(source, sourceAt + 3);
};

const fillRect = (
  target: Uint8ClampedArray,
  canvasWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): void => {
  const maxX = Math.max(0, Math.min(canvasWidth, left + width));
  const canvasHeight = Math.floor(target.length / 4 / Math.max(1, canvasWidth));
  const maxY = Math.max(0, Math.min(canvasHeight, top + height));
  for (let y = Math.max(0, top); y < maxY; y += 1) {
    for (let x = Math.max(0, left); x < maxX; x += 1) {
      const at = (y * canvasWidth + x) * 4;
      target[at] = rgba[0];
      target[at + 1] = rgba[1];
      target[at + 2] = rgba[2];
      target[at + 3] = rgba[3];
    }
  }
};

const webpBackground = (packed: number): readonly [number, number, number, number] => [
  (packed >>> 16) & 0xff,
  (packed >>> 8) & 0xff,
  packed & 0xff,
  (packed >>> 24) & 0xff,
];

const alphaBlendPixel = (
  target: Uint8ClampedArray,
  targetAt: number,
  source: Uint8Array | Uint8ClampedArray,
  sourceAt: number,
): void => {
  const sa = byte(source, sourceAt + 3);
  if (sa === 0) return;
  if (sa === 255) { copyPixel(target, targetAt, source, sourceAt); return; }
  const da = target[targetAt + 3] ?? 0;
  const sourceAlpha = sa / 255;
  const destAlpha = da / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) {
    target[targetAt] = 0;
    target[targetAt + 1] = 0;
    target[targetAt + 2] = 0;
    target[targetAt + 3] = 0;
    return;
  }
  for (let channel = 0; channel < 3; channel += 1) {
    const src = byte(source, sourceAt + channel);
    const dst = target[targetAt + channel] ?? 0;
    target[targetAt + channel] = Math.round((src * sourceAlpha + dst * destAlpha * (1 - sourceAlpha)) / outAlpha);
  }
  target[targetAt + 3] = Math.round(outAlpha * 255);
};

const compositePatch = (
  target: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  patch: Uint8Array | Uint8ClampedArray,
  left: number,
  top: number,
  width: number,
  height: number,
  blend: boolean,
): void => {
  for (let y = 0; y < height; y += 1) {
    const py = top + y;
    if (py < 0 || py >= canvasHeight) continue;
    for (let x = 0; x < width; x += 1) {
      const px = left + x;
      if (px < 0 || px >= canvasWidth) continue;
      const sourceAt = (y * width + x) * 4;
      const targetAt = (py * canvasWidth + px) * 4;
      if (blend) alphaBlendPixel(target, targetAt, patch, sourceAt);
      else copyPixel(target, targetAt, patch, sourceAt);
    }
  }
};

const assertDecodedBudget = (width: number, height: number, count: number): void => {
  const total = width * height * count;
  if (!Number.isSafeInteger(total) || total > MAX_DECODED_PIXEL_FRAMES) {
    throw new Error("This animation expands to too many decoded pixels for a browser-safe edit. Reduce its resolution or frame count.");
  }
};

const gifLoopCount = (bytes: Uint8Array): number => {
  const signature = [..."NETSCAPE2.0"].map(char => char.charCodeAt(0));
  outer: for (let i = 0; i + signature.length + 5 < bytes.length; i += 1) {
    for (let j = 0; j < signature.length; j += 1) if (bytes[i + j] !== signature[j]) continue outer;
    const start = i + signature.length;
    for (let at = start; at < Math.min(bytes.length - 4, start + 16); at += 1) {
      if (bytes[at] === 3 && bytes[at + 1] === 1) return (bytes[at + 2] ?? 0) | ((bytes[at + 3] ?? 0) << 8);
    }
  }
  return 1;
};

const decodeGif = (bytes: Uint8Array): AnimationSource => {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const parsed = parseGIF(buffer);
  const decoded = decompressFrames(parsed, true);
  if (decoded.length === 0) throw new Error("The GIF contains no image frames.");
  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  assertDecodedBudget(width, height, decoded.length);

  const backgroundEntry = parsed.gct[parsed.lsd.backgroundColorIndex];
  const first = decoded[0];
  const transparentBackground = first?.transparentIndex === parsed.lsd.backgroundColorIndex;
  const background: readonly [number, number, number, number] = backgroundEntry && !transparentBackground
    ? [backgroundEntry[0], backgroundEntry[1], backgroundEntry[2], 255]
    : [0, 0, 0, 0];
  let canvas = new Uint8ClampedArray(width * height * 4);
  fillRect(canvas, width, 0, 0, width, height, background);

  let previousDisposal = 0;
  let previousDims: { readonly left: number; readonly top: number; readonly width: number; readonly height: number } | null = null;
  let restoreSnapshot: Uint8ClampedArray | null = null;
  const frames: AnimationFrame[] = [];

  for (const frame of decoded) {
    if (previousDisposal === 2 && previousDims) {
      fillRect(canvas, width, previousDims.left, previousDims.top, previousDims.width, previousDims.height, background);
    } else if (previousDisposal === 3 && restoreSnapshot) {
      canvas = restoreSnapshot.slice();
    }

    const before = frame.disposalType === 3 ? canvas.slice() : null;
    const patch = frame.patch;
    for (let y = 0; y < frame.dims.height; y += 1) {
      const py = frame.dims.top + y;
      if (py < 0 || py >= height) continue;
      for (let x = 0; x < frame.dims.width; x += 1) {
        const px = frame.dims.left + x;
        if (px < 0 || px >= width) continue;
        const sourceAt = (y * frame.dims.width + x) * 4;
        if (byte(patch, sourceAt + 3) === 0) continue;
        copyPixel(canvas, (py * width + px) * 4, patch, sourceAt);
      }
    }

    frames.push({ pixels: { width, height, data: canvas.slice() }, duration: safeDuration(frame.delay) });
    previousDisposal = frame.disposalType;
    previousDims = frame.dims;
    restoreSnapshot = before;
  }

  return {
    width,
    height,
    frames,
    loopCount: gifLoopCount(bytes),
    backgroundColor: 0,
    preservedWebpChunks: [],
    format: "gif",
  };
};

const preservedChunks = (bytes: Uint8Array): PreservedWebpChunk[] => {
  const replaced = new Set(["VP8X", "ANIM", "ANMF", "VP8 ", "VP8L", "ALPH"]);
  return parseRiff(bytes)
    .filter(chunk => !replaced.has(chunk.fourCC))
    .map(chunk => ({ fourCC: chunk.fourCC, data: chunk.data.slice() }));
};

const decodeWebpSource = (bytes: Uint8Array): AnimationSource => {
  try {
    const decoded = decodeWebpAnimation(bytes);
    assertDecodedBudget(decoded.width, decoded.height, decoded.frames.length);
    const background = webpBackground(decoded.backgroundColor);
    let canvas = new Uint8ClampedArray(decoded.width * decoded.height * 4);
    fillRect(canvas, decoded.width, 0, 0, decoded.width, decoded.height, background);
    const frames: AnimationFrame[] = [];

    for (const frame of decoded.frames) {
      compositePatch(
        canvas,
        decoded.width,
        decoded.height,
        frame.image.data,
        frame.x,
        frame.y,
        frame.image.width,
        frame.image.height,
        frame.blend === "overlay",
      );
      frames.push({
        pixels: { width: decoded.width, height: decoded.height, data: canvas.slice() },
        duration: safeDuration(frame.duration),
      });
      if (frame.dispose === "background") {
        fillRect(canvas, decoded.width, frame.x, frame.y, frame.image.width, frame.image.height, background);
      }
    }

    if (frames.length === 0) throw new Error("The WebP contains no animation frames.");
    return {
      width: decoded.width,
      height: decoded.height,
      frames,
      loopCount: decoded.loopCount,
      backgroundColor: decoded.backgroundColor,
      preservedWebpChunks: preservedChunks(bytes),
      format: "webp",
    };
  } catch (animationError) {
    try {
      const image = decodeWebp(bytes);
      assertDecodedBudget(image.width, image.height, 1);
      return {
        width: image.width,
        height: image.height,
        frames: [{ pixels: { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }, duration: 100 }],
        loopCount: 1,
        backgroundColor: 0,
        preservedWebpChunks: preservedChunks(bytes),
        format: "webp",
      };
    } catch {
      throw animationError;
    }
  }
};

export const decodeAnimationFile = async (file: File): Promise<AnimationSource> => {
  if (file.size > MAX_ANIMATION_BYTES) throw new Error("Animations are limited to 25 MB.");
  const lower = file.name.toLowerCase();
  const gif = file.type === "image/gif" || lower.endsWith(".gif");
  const webp = file.type === "image/webp" || lower.endsWith(".webp");
  if (!gif && !webp) throw new Error("Choose a GIF or WebP animation.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return gif ? decodeGif(bytes) : decodeWebpSource(bytes);
};

const canvasPixels = (canvas: HTMLCanvasElement): Uint8ClampedArray => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable.");
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
};

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const diffBounds = (
  previous: Uint8ClampedArray | null,
  current: Uint8ClampedArray,
  width: number,
  height: number,
): Bounds | null => {
  if (!previous) return { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      if (
        previous[at] === current[at]
        && previous[at + 1] === current[at + 1]
        && previous[at + 2] === current[at + 2]
        && previous[at + 3] === current[at + 3]
      ) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return { left: left & ~1, top: top & ~1, right, bottom };
};

const crop = (data: Uint8ClampedArray, canvasWidth: number, bounds: Bounds): Uint8Array => {
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const output = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((bounds.top + y) * canvasWidth + bounds.left) * 4;
    output.set(data.subarray(sourceStart, sourceStart + width * 4), y * width * 4);
  }
  return output;
};

const hasAlpha = (data: Uint8Array | Uint8ClampedArray): boolean => {
  for (let at = 3; at < data.length; at += 4) if ((data[at] ?? 255) < 255) return true;
  return false;
};

const riffFragment = (fourCC: string, data: Uint8Array): Uint8Array => {
  const result = new Uint8Array(8 + data.length + (data.length & 1));
  for (let i = 0; i < 4; i += 1) result[i] = fourCC.charCodeAt(i) || 0x20;
  const view = new DataView(result.buffer);
  view.setUint32(4, data.length, true);
  result.set(data, 8);
  return result;
};

interface EncodedWebpFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  duration: number;
  readonly imageFourCC: "VP8 " | "VP8L";
  readonly imageData: Uint8Array;
}

const encodedFrameChunk = (frame: EncodedWebpFrame): Uint8Array => {
  const header = new Uint8Array(16);
  write24(header, 0, Math.floor(frame.x / 2));
  write24(header, 3, Math.floor(frame.y / 2));
  write24(header, 6, frame.width - 1);
  write24(header, 9, frame.height - 1);
  write24(header, 12, Math.min(MAX_WEBP_FRAME_DURATION, frame.duration));
  header[15] = 0x02; // no-blend: replace the delta rectangle exactly; keep it for the next frame
  const image = riffFragment(frame.imageFourCC, frame.imageData);
  const payload = new Uint8Array(header.length + image.length);
  payload.set(header, 0);
  payload.set(image, header.length);
  return payload;
};

export const encodeWebpAnimation = async (
  provider: AnimationFrameProvider,
  options: AnimationEncodeOptions,
): Promise<Uint8Array> => {
  const frames: EncodedWebpFrame[] = [];
  let previous: Uint8ClampedArray | null = null;
  let animationHasAlpha = false;
  const quality = Math.max(0, Math.min(100, Math.round(options.quality)));

  for (let index = 0; index < provider.frameCount; index += 1) {
    const canvas = await provider.render(index);
    if (canvas.width !== provider.width || canvas.height !== provider.height) throw new Error("Animation frames changed raster dimensions during export.");
    const pixels = canvasPixels(canvas);
    animationHasAlpha ||= hasAlpha(pixels);
    let bounds = diffBounds(previous, pixels, provider.width, provider.height);
    const duration = safeDuration(provider.durations[index] ?? 100);

    if (!bounds && frames.length > 0) {
      const last = frames[frames.length - 1];
      if (last && last.duration + duration <= MAX_WEBP_FRAME_DURATION) {
        last.duration += duration;
        previous = pixels.slice();
        options.progress?.(index + 1, provider.frameCount);
        continue;
      }
      bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    }
    if (!bounds) bounds = { left: 0, top: 0, right: provider.width - 1, bottom: provider.height - 1 };

    const data = crop(pixels, provider.width, bounds);
    const width = bounds.right - bounds.left + 1;
    const height = bounds.bottom - bounds.top + 1;
    const alpha = hasAlpha(data);
    let imageFourCC: "VP8 " | "VP8L";
    let imageData: Uint8Array;
    if (options.lossless || alpha) {
      imageFourCC = "VP8L";
      imageData = encodeVP8L({ data, width, height, hasAlpha: alpha });
    } else {
      imageFourCC = "VP8 ";
      const qIndex = Math.round(127 - (quality / 100) * 127);
      imageData = encodeVP8({ data, width, height, hasAlpha: false }, { quality: qIndex });
    }
    frames.push({ x: bounds.left, y: bounds.top, width, height, duration, imageFourCC, imageData });
    previous = pixels.slice();
    options.progress?.(index + 1, provider.frameCount);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  if (frames.length === 0) throw new Error("There are no frames to export.");
  const extras = options.preservedWebpChunks ?? [];
  const names = new Set(extras.map(chunk => chunk.fourCC));
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02
    | (animationHasAlpha ? 0x10 : 0)
    | (names.has("ICCP") ? 0x20 : 0)
    | (names.has("EXIF") ? 0x08 : 0)
    | (names.has("XMP ") ? 0x04 : 0);
  write24(vp8x, 4, provider.width - 1);
  write24(vp8x, 7, provider.height - 1);

  const packedBackground = options.backgroundColor ?? 0;
  const background = webpBackground(packedBackground);
  const anim = new Uint8Array(6);
  anim[0] = background[2];
  anim[1] = background[1];
  anim[2] = background[0];
  anim[3] = background[3];
  const loop = Math.max(0, Math.min(0xffff, Math.round(provider.loopCount)));
  anim[4] = loop & 0xff;
  anim[5] = (loop >>> 8) & 0xff;

  const before = extras.filter(chunk => chunk.fourCC === "ICCP");
  const after = extras.filter(chunk => chunk.fourCC !== "ICCP");
  return createRiffContainer([
    { fourCC: "VP8X", data: vp8x },
    ...before.map(chunk => ({ fourCC: chunk.fourCC, data: chunk.data })),
    { fourCC: "ANIM", data: anim },
    ...frames.map(frame => ({ fourCC: "ANMF", data: encodedFrameChunk(frame) })),
    ...after.map(chunk => ({ fourCC: chunk.fourCC, data: chunk.data })),
  ]);
};

const gifRepeat = (loopCount: number): number => loopCount === 0 ? 0 : loopCount <= 1 ? -1 : loopCount;

export const encodeGifAnimation = async (
  provider: AnimationFrameProvider,
  options: AnimationEncodeOptions,
): Promise<Uint8Array> => {
  const encoder = GIFEncoder();
  const quality = Math.max(0, Math.min(100, Math.round(options.quality)));
  const maxColours = options.lossless ? 256 : Math.max(32, Math.min(256, Math.round(32 + quality * 2.24)));

  for (let index = 0; index < provider.frameCount; index += 1) {
    const canvas = await provider.render(index);
    const data = canvasPixels(canvas);
    const alpha = hasAlpha(data);
    const format = alpha ? "rgba4444" as const : "rgb565" as const;
    const palette = quantize(data, maxColours, alpha ? { format, oneBitAlpha: 127 } : { format });
    const indexed = applyPalette(data, palette, format);
    const transparentIndex = alpha ? palette.findIndex(colour => (colour[3] ?? 255) === 0) : -1;
    encoder.writeFrame(indexed, provider.width, provider.height, {
      palette,
      delay: safeDuration(provider.durations[index] ?? 100),
      repeat: gifRepeat(provider.loopCount),
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: transparentIndex >= 0 ? 2 : 1,
    });
    options.progress?.(index + 1, provider.frameCount);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  encoder.finish();
  return encoder.bytes();
};

const canvasPng = (canvas: HTMLCanvasElement): Promise<Uint8Array> => new Promise((resolve, reject) => {
  canvas.toBlob(blob => {
    if (!blob) { reject(new Error("Could not encode an animation frame as PNG.")); return; }
    void blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
  }, "image/png");
});

export const encodeFramesZip = async (
  provider: AnimationFrameProvider,
  progress?: (done: number, total: number) => void,
): Promise<Uint8Array> => {
  const files: Record<string, Uint8Array> = {};
  const digits = Math.max(4, String(provider.frameCount).length);
  for (let index = 0; index < provider.frameCount; index += 1) {
    const canvas = await provider.render(index);
    files[`frame-${String(index + 1).padStart(digits, "0")}.png`] = await canvasPng(canvas);
    progress?.(index + 1, provider.frameCount);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return zipSync(files, { level: 0 });
};

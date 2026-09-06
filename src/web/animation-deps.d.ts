declare module "@stacksjs/ts-webp/riff" {
  export interface RiffChunk {
    readonly fourCC: string;
    readonly size: number;
    readonly data: Uint8Array;
    readonly offset: number;
  }
  export function parseRiff(data: Uint8Array | ArrayBuffer): RiffChunk[];
  export function createRiffContainer(chunks: readonly { readonly fourCC: string; readonly data: Uint8Array }[]): Uint8Array;
}

declare module "@stacksjs/ts-webp/animation" {
  export interface WebpImageData {
    data: Uint8Array;
    width: number;
    height: number;
    hasAlpha?: boolean;
  }
  export interface WebpAnimationFrame {
    image: WebpImageData;
    x: number;
    y: number;
    duration: number;
    blend: "overlay" | "replace";
    dispose: "none" | "background";
  }
  export interface WebpAnimation {
    width: number;
    height: number;
    loopCount: number;
    backgroundColor: number;
    frames: WebpAnimationFrame[];
  }
  export function decodeAnimation(buffer: Uint8Array | ArrayBuffer): WebpAnimation;
}

declare module "@stacksjs/ts-webp/decoder" {
  export interface WebpImageData {
    data: Uint8Array;
    width: number;
    height: number;
    hasAlpha?: boolean;
  }
  export function decode(buffer: Uint8Array | ArrayBuffer, options?: { readonly format?: "rgba" | "rgb" }): WebpImageData;
}

declare module "@stacksjs/ts-webp/vp8/encoder" {
  export interface WebpImageData {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    hasAlpha?: boolean;
  }
  export function encodeVP8(image: WebpImageData, options?: { readonly quality?: number }): Uint8Array;
}

declare module "@stacksjs/ts-webp/vp8l/encoder" {
  export interface WebpImageData {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    hasAlpha?: boolean;
  }
  export function encodeVP8L(image: WebpImageData, options?: { readonly quality?: number; readonly effort?: number }): Uint8Array;
}

declare module "gifenc" {
  export type GifFormat = "rgb565" | "rgb444" | "rgba4444";
  export type GifPalette = number[][];
  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: {
      palette?: GifPalette;
      first?: boolean;
      transparent?: boolean;
      transparentIndex?: number;
      delay?: number;
      repeat?: number;
      dispose?: number;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeHeader(): void;
    reset(): void;
    readonly buffer: ArrayBuffer;
    readonly stream: unknown;
  }
  export function GIFEncoder(options?: { readonly auto?: boolean; readonly initialCapacity?: number }): GifEncoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      readonly format?: GifFormat;
      readonly oneBitAlpha?: boolean | number;
      readonly clearAlpha?: boolean;
      readonly clearAlphaThreshold?: number;
      readonly clearAlphaColor?: number;
    },
  ): GifPalette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: GifFormat): Uint8Array;
}

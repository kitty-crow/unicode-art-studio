import { rgbHex } from "../colour/space.ts";
import type { Art, Rgb } from "../types.ts";
import { downloadImage } from "./download.ts";

const preferredCellWidth = 8;
const maxRasterDimension = 4096;
const maxRasterPixels = 6_000_000;
const maxRasterCells = 2_500_000;

const escapeXml = (value: string): string => value.replace(/[&<>"']/gu, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
})[char] ?? char);

const sameRgb = (a?: Rgb, b?: Rgb): boolean => (!a && !b) || (!!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b);

export interface RasterGeometry {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly width: number;
  readonly height: number;
}

export const rasterGeometry = (art: Art): RasterGeometry => {
  if (art.columns * art.rows > maxRasterCells) throw new Error("Raster export is too large for this browser.");
  const byWidth = Math.floor(maxRasterDimension / Math.max(1, art.columns));
  const byHeight = Math.floor(maxRasterDimension / Math.max(1, art.rows * 2));
  const byPixels = Math.floor(Math.sqrt(maxRasterPixels / Math.max(1, art.columns * art.rows * 2)));
  const cellWidth = Math.min(preferredCellWidth, byWidth, byHeight, byPixels);
  if (cellWidth < 1) throw new Error("Raster export exceeds the browser-safe image dimensions.");
  return {
    cellWidth,
    cellHeight: cellWidth * 2,
    width: art.columns * cellWidth,
    height: art.rows * cellWidth * 2,
  };
};

const paddedLine = (line: string | undefined, columns: number): string[] => [...(line ?? "").padEnd(columns, "⠀")].slice(0, columns);

export const rasterSvg = (art: Art, defaultForeground = "#111111"): string => {
  const geometry = rasterGeometry(art);
  const { cellWidth, cellHeight, width, height } = geometry;
  const backgrounds: string[] = [];
  const rows: string[] = [];
  const lines = art.text.split("\n");

  for (let y = 0; y < art.rows; y += 1) {
    const line = paddedLine(lines[y], art.columns);
    const rowOffset = y * art.columns;

    if (art.cellColours) {
      let x = 0;
      while (x < art.columns) {
        const background = art.cellColours[rowOffset + x]?.bg;
        let end = x + 1;
        while (end < art.columns && sameRgb(background, art.cellColours[rowOffset + end]?.bg)) end += 1;
        if (background) backgrounds.push(`<rect x="${x * cellWidth}" y="${y * cellHeight}" width="${(end - x) * cellWidth}" height="${cellHeight}" fill="${rgbHex(background)}"/>`);
        x = end;
      }
    }

    const parts: string[] = [];
    let x = 0;
    while (x < art.columns) {
      const foreground = art.cellColours?.[rowOffset + x]?.fg;
      let end = x + 1;
      while (end < art.columns && sameRgb(foreground, art.cellColours?.[rowOffset + end]?.fg)) end += 1;
      const text = line.slice(x, end).join("");
      if ([...text].some(char => char !== "⠀")) {
        const fill = foreground ? rgbHex(foreground) : defaultForeground;
        parts.push(`<tspan x="${x * cellWidth}" textLength="${(end - x) * cellWidth}" lengthAdjust="spacingAndGlyphs" fill="${escapeXml(fill)}">${escapeXml(text)}</tspan>`);
      }
      x = end;
    }
    if (parts.length > 0) rows.push(`<text y="${y * cellHeight}" dominant-baseline="text-before-edge">${parts.join("")}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Apple Braille,Noto Sans Symbols 2,DejaVu Sans Mono,Segoe UI Symbol,monospace" font-size="${cellHeight}" font-weight="400" font-synthesis="none" font-variant-ligatures="none" text-rendering="geometricPrecision">${backgrounds.join("")}${rows.join("")}</g></svg>`;
};

const pngBlob = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error("Could not encode the raster export as PNG."));
  }, "image/png");
});

const yieldToBrowser = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const drawTextRun = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  fill: string,
): void => {
  if (![...text].some(char => char !== "⠀")) return;
  const measured = context.measureText(text).width;
  if (!(measured > 0)) return;
  context.save();
  context.translate(x, y);
  context.scale(width / measured, 1);
  context.fillStyle = fill;
  context.fillText(text, 0, 0);
  context.restore();
};

const renderRasterCanvas = async (art: Art, defaultForeground: string): Promise<HTMLCanvasElement> => {
  const geometry = rasterGeometry(art);
  const { cellWidth, cellHeight } = geometry;
  const canvas = document.createElement("canvas");
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = `${cellHeight}px Apple Braille, Noto Sans Symbols 2, DejaVu Sans Mono, Segoe UI Symbol, monospace`;

  const lines = art.text.split("\n");
  for (let y = 0; y < art.rows; y += 1) {
    const line = paddedLine(lines[y], art.columns);
    const rowOffset = y * art.columns;
    const py = y * cellHeight;

    if (art.cellColours) {
      let x = 0;
      while (x < art.columns) {
        const background = art.cellColours[rowOffset + x]?.bg;
        let end = x + 1;
        while (end < art.columns && sameRgb(background, art.cellColours[rowOffset + end]?.bg)) end += 1;
        if (background) {
          context.fillStyle = rgbHex(background);
          context.fillRect(x * cellWidth, py, (end - x) * cellWidth, cellHeight);
        }
        x = end;
      }
    }

    let x = 0;
    while (x < art.columns) {
      const foreground = art.cellColours?.[rowOffset + x]?.fg;
      let end = x + 1;
      while (end < art.columns && sameRgb(foreground, art.cellColours?.[rowOffset + end]?.fg)) end += 1;
      const text = line.slice(x, end).join("");
      drawTextRun(
        context,
        text,
        x * cellWidth,
        py,
        (end - x) * cellWidth,
        foreground ? rgbHex(foreground) : defaultForeground,
      );
      x = end;
    }

    if ((y + 1) % 16 === 0) await yieldToBrowser();
  }
  return canvas;
};

export const downloadRaster = async (art: Art, defaultForeground = "#111111"): Promise<string> => {
  const canvas = await renderRasterCanvas(art, defaultForeground);
  try {
    const blob = await pngBlob(canvas);
    canvas.width = 1;
    canvas.height = 1;
    return await downloadImage("png", "image/png", blob);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
};

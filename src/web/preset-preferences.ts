const paletteDitherPreferenceKey = "unicode-art-studio.palette-dither.preference";

// Studio Resolution is Unicode columns. For a native W×H hardware raster,
// W×2 columns gives a 4× working raster and H Unicode rows at the same aspect ratio.
const hardwarePresetResolution: Readonly<Record<string, number>> = {
  "cga320-auto": 640,
  "cga320-p0-low": 640,
  "cga320-p0-high": 640,
  "cga320-p1-low": 640,
  "cga320-p1-high": 640,
  cga640: 1280,
  cga160: 320,
  ega16: 640,
  vga13: 640,
  svga640: 1280,
  svga800: 1600,
  svga1024: 2048,
  "c64-hires": 640,
  "c64-multicolour": 640,
  "nes-bg": 512,
  "snes-4bpp": 512,
  "snes-8bpp": 512,
  "genesis-4bpp": 640,
};

const readPreference = (): boolean | null => {
  try {
    const value = localStorage.getItem(paletteDitherPreferenceKey);
    if (value === "1") return true;
    if (value === "0") return false;
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
  return null;
};

const writePreference = (value: boolean): void => {
  try {
    localStorage.setItem(paletteDitherPreferenceKey, value ? "1" : "0");
  } catch {
    // The in-memory preference still applies for this page load.
  }
};

export const presetResolution = (preset: string): number | undefined => hardwarePresetResolution[preset];

export const bindPresetPreferences = (): void => {
  const paletteDither = document.querySelector<HTMLInputElement>("#palette-dither");
  const outputPreset = document.querySelector<HTMLSelectElement>("#output-preset");
  const columns = document.querySelector<HTMLInputElement>("#columns");
  const columnsValue = document.querySelector<HTMLInputElement>("#columns-value");
  if (!paletteDither || !outputPreset || !columns || !columnsValue) return;

  let manualPaletteDither = readPreference();

  paletteDither.addEventListener("change", () => {
    manualPaletteDither = paletteDither.checked;
    writePreference(manualPaletteDither);
  });

  outputPreset.addEventListener("change", () => {
    if (manualPaletteDither !== null) paletteDither.checked = manualPaletteDither;

    const resolution = presetResolution(outputPreset.value);
    if (resolution === undefined) return;
    columns.value = String(resolution);
    columnsValue.value = String(resolution);
    columns.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

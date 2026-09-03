const paletteDitherPreferenceKey = "unicode-art-studio.palette-dither.preference";

const nativePresetResolution: Readonly<Record<string, number>> = {
  "cga320-auto": 200,
  "cga320-p0-low": 200,
  "cga320-p0-high": 200,
  "cga320-p1-low": 200,
  "cga320-p1-high": 200,
  cga640: 200,
  cga160: 100,
  ega16: 200,
  vga13: 200,
  svga640: 480,
  svga800: 600,
  svga1024: 768,
  "c64-hires": 200,
  "c64-multicolour": 200,
  "nes-bg": 240,
  "snes-4bpp": 224,
  "snes-8bpp": 224,
  "genesis-4bpp": 224,
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

export const presetResolution = (preset: string): number | undefined => nativePresetResolution[preset];

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

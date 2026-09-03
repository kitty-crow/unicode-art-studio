const paletteDitherPreferenceKey = "unicode-art-studio.palette-dither.preference";

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

export const bindPresetPreferences = (): void => {
  const paletteDither = document.querySelector<HTMLInputElement>("#palette-dither");
  const outputPreset = document.querySelector<HTMLSelectElement>("#output-preset");
  if (!paletteDither || !outputPreset) return;

  let manualPaletteDither = readPreference();

  paletteDither.addEventListener("change", () => {
    manualPaletteDither = paletteDither.checked;
    writePreference(manualPaletteDither);
  });

  outputPreset.addEventListener("change", () => {
    if (manualPaletteDither !== null) paletteDither.checked = manualPaletteDither;
  });
};

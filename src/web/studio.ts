import { taggedText } from "../colour/tagged.ts";
import { makeArt } from "../core/art.ts";
import { packBoundedRaw } from "../embed/bounded-raw.ts";
import { isJapaneseCompactPayload } from "../embed/japanese.ts";
import { denseHtml } from "../html/dense.ts";
import type { Art, ArtCfg, Dither, Pixels, VecStage } from "../types.ts";
import { vectorStage } from "../vector/stage.ts";
import { loadCachedArt, storeCachedArt, storeCachedEmbed, type RestoredArt } from "./art-store.ts";
import { bindCompare } from "./compare.ts";
import { fitDense, renderDense } from "./dense.ts";
import { qs } from "./dom.ts";
import { download } from "./download.ts";
import { EmbedView } from "./embed-view.ts";
import { cancelEmbedHtml, embedHtml } from "./embed.ts";
import { decodeImage } from "./image.ts";
import { parsePalette, remapPalette, type StudioArtCfg } from "./palette.ts";
import { downloadRaster } from "./raster.ts";
import { bindResolutionGate } from "./resolution.ts";
import { bindTooltips } from "./tooltips.ts";

declare const __WEB_VERSION__: string;

type Theme = "light" | "dark";

const activeTheme = (): Theme => {
  const value = document.documentElement.dataset.theme;
  if (value === "light" || value === "dark") return value;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const cacheId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const storyEmbed = (html: string): boolean => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const script = doc.querySelector<HTMLScriptElement>('script[type="application/octet-stream"][data-unicode-art-data]');
  return script?.dataset.codec === "u4" && isJapaneseCompactPayload(script.textContent?.trim() ?? "");
};

export const startStudio = (): void => {
  const heroImg = qs<HTMLImageElement>("#hero-source"), heroUnicode = qs<HTMLElement>("#hero-unicode"), compare = qs<HTMLElement>("#compare"), divider = qs<HTMLElement>("#compare-divider");
  const heroColour = qs<HTMLInputElement>("#hero-colour"), heroFull = qs<HTMLInputElement>("#hero-full-colour");
  const upload = qs<HTMLInputElement>("#upload"), drop = qs<HTMLElement>("#drop"), output = qs<HTMLElement>("#output"), status = qs<HTMLElement>("#status"), previewScroll = qs<HTMLElement>(".preview-scroll"), previewInfo = qs<HTMLButtonElement>("#preview-contrast-info");
  const columns = qs<HTMLInputElement>("#columns"), columnsValue = qs<HTMLInputElement>("#columns-value"), contrast = qs<HTMLInputElement>("#contrast"), detail = qs<HTMLInputElement>("#detail"), bias = qs<HTMLInputElement>("#bias"), dither = qs<HTMLSelectElement>("#dither"), invert = qs<HTMLInputElement>("#invert"), canvasToggle = qs<HTMLInputElement>("#canvas-toggle"), canvasToggleLabel = qs<HTMLElement>("#canvas-toggle-label"), reset = qs<HTMLButtonElement>("#reset-sliders"), resolutionTip = qs<HTMLElement>("#resolution-tip");
  const resolutionRange = qs<HTMLElement>(".resolution-range"), resolutionNotch = qs<HTMLElement>(".resolution-notch"), resolutionInfo = qs<HTMLButtonElement>(".resolution-control .slider-info");
  const colour = qs<HTMLInputElement>("#colour"), fullColour = qs<HTMLInputElement>("#full-colour"), paletteInput = qs<HTMLTextAreaElement>("#palette"), paletteDither = qs<HTMLInputElement>("#palette-dither");
  const raster = qs<HTMLButtonElement>("#download-raster"), copyEmbed = qs<HTMLButtonElement>("#copy-embed"), txt = qs<HTMLButtonElement>("#download-txt"), html = qs<HTMLButtonElement>("#download-html"), svg = qs<HTMLButtonElement>("#download-svg"), metrics = qs<HTMLElement>("#metrics"), embedCode = qs<HTMLElement>("#embed-code");
  const embedProgress = qs<HTMLElement>("#embed-progress"), embedProgressBar = qs<HTMLProgressElement>("#embed-progress-bar"), embedProgressText = qs<HTMLOutputElement>("#embed-progress-text");

  const resolutionMax = 2048;
  const resolutionMin = Number(columns.min);
  const notchPosition = (value: number): string => `${(value - resolutionMin) / (resolutionMax - resolutionMin) * 100}%`;
  const addNotch = (value: number, className: string): void => {
    const notch = document.createElement("span");
    notch.className = `resolution-notch ${className}`;
    notch.style.left = notchPosition(value);
    notch.setAttribute("aria-hidden", "true");
    resolutionRange.appendChild(notch);
  };
  columns.max = String(resolutionMax);
  columnsValue.removeAttribute("max");
  resolutionNotch.style.left = notchPosition(256);
  addNotch(765, "resolution-notch-extreme");
  addNotch(1024, "resolution-notch-ram");
  resolutionInfo.dataset.tip = "Controls horizontal Unicode cell count. Above 256 is experimental. Beyond 765 is extreme territory; 1K and beyond puts serious pressure on browser memory. The slider stops at 2048, but larger values can be typed manually at your own risk.";
  resolutionInfo.setAttribute("aria-label", "About resolution. Above 256 cells is experimental; beyond 765 is extreme, with a 1K memory warning. The slider stops at 2048, while larger values may be entered manually with confirmation.");

  let vectorBase: VecStage | null = null, vector: VecStage | null = null, name = "hero", art: Art | null = null, embed = "", loadGeneration = 0;
  let currentSource: Blob | string = "assets/hero.png";
  let heroPixels: Pixels | null = null, heroObjectUrl: string | null = null;
  let studioGeneration = 0, embedGeneration = 0, embedTimer = 0, manualCanvasDark: boolean | null = null;
  let currentCacheId = "", currentPaths = 0, currentRectangles = 0, storyPayload = false;
  let cacheTail: Promise<void> = Promise.resolve();
  let embedView!: EmbedView;

  const queueCache = (write: () => Promise<void>): void => {
    cacheTail = cacheTail.catch(() => {}).then(write).catch(() => {});
  };

  const setStatus = (text: string, busy = false): void => { status.textContent = text; status.toggleAttribute("data-busy", busy); };
  const studioCfg = (): StudioArtCfg => {
    const full = colour.checked && fullColour.checked;
    const palette = paletteInput.value.trim();
    return {
      columns: Number(columnsValue.value), contrast: Number(contrast.value), detail: Number(detail.value), bias: Number(bias.value), dither: dither.value as Dither, invert: invert.checked,
      colour: colour.checked, colourBackground: full, fullColour: full,
      ...(palette ? { palette, paletteDither: paletteDither.checked } : {}),
    };
  };
  const heroCfg = (): ArtCfg => {
    const full = heroColour.checked && heroFull.checked;
    return heroColour.checked ? {
      columns: 256, contrast: 0.55, detail: 1.2, bias: 0.25, dither: "atkinson", invert: true,
      colour: true, colourBackground: full, fullColour: full,
    } : {
      columns: 96, contrast: 1.12, detail: 0.34, bias: 0.015, dither: "ordered", invert: true,
      colour: false, colourBackground: false, fullColour: false,
    };
  };

  const paletteVector = (source: VecStage): VecStage | null => {
    try {
      const palette = parsePalette(paletteInput.value);
      paletteInput.setCustomValidity("");
      paletteInput.removeAttribute("aria-invalid");
      return palette.length === 0 ? source : { ...source, pixels: remapPalette(source.pixels, palette, paletteDither.checked) };
    } catch (error) {
      paletteInput.setCustomValidity(error instanceof Error ? error.message : "Invalid palette.");
      paletteInput.setAttribute("aria-invalid", "true");
      setStatus("Invalid palette.");
      return null;
    }
  };

  const automaticDarkCanvas = (theme: Theme = activeTheme()): boolean => theme === "dark" || (colour.checked && !fullColour.checked);
  const canvasDark = (theme: Theme = activeTheme()): boolean => theme === "dark" ? !canvasToggle.checked : canvasToggle.checked;
  const setCanvasControl = (dark: boolean, theme: Theme): void => {
    const darkTheme = theme === "dark";
    canvasToggleLabel.textContent = darkTheme ? "Light canvas" : "Dark canvas";
    canvasToggle.checked = darkTheme ? !dark : dark;
  };
  const syncCanvas = (theme: Theme = activeTheme()): void => {
    const dark = canvasDark(theme);
    const hazard = !dark && colour.checked && !fullColour.checked;
    previewScroll.toggleAttribute("data-canvas-dark", dark);
    previewScroll.toggleAttribute("data-canvas-light", !dark);
    previewInfo.hidden = !hazard;
    if (hazard) {
      previewInfo.dataset.tip = theme === "dark"
        ? "Foreground-only coloured Unicode can be hard to see on a light surface. Light canvas is on, so some colours may be difficult to see. Turn Light canvas off or enable Full Colour for stronger readability."
        : "Foreground-only coloured Unicode can be hard to see on a light surface. Dark canvas is off, so some colours may be difficult to see. Enable Dark canvas or Full Colour for stronger readability.";
    }
  };
  const applyAutomaticCanvas = (theme: Theme = activeTheme()): void => {
    setCanvasControl(manualCanvasDark ?? automaticDarkCanvas(theme), theme);
    syncCanvas(theme);
  };
  const syncStudioPolarity = (theme: Theme = activeTheme()): void => { invert.checked = canvasDark(theme); };
  const syncColour = (polarity = false, theme: Theme = activeTheme()): void => {
    fullColour.disabled = !colour.checked;
    if (!colour.checked) fullColour.checked = false;
    applyAutomaticCanvas(theme);
    if (polarity) syncStudioPolarity(theme);
  };
  const syncHeroColour = (): void => {
    heroFull.disabled = !heroColour.checked;
    if (!heroColour.checked) heroFull.checked = false;
  };
  const setEmbedProgress = (done: number, total: number): void => {
    const safeTotal = Math.max(1, total);
    const safeDone = Math.max(0, Math.min(done, safeTotal));
    embedProgressBar.max = safeTotal;
    embedProgressBar.value = safeDone;
    embedProgressText.value = `${Math.round(safeDone / safeTotal * 100)}%`;
    embedProgress.hidden = safeDone >= safeTotal;
  };

  const resetEmbed = (): number => {
    const generation = ++embedGeneration;
    window.clearTimeout(embedTimer);
    cancelEmbedHtml();
    embed = "";
    copyEmbed.disabled = true;
    embedCode.textContent = "Generating embed";
    embedProgress.hidden = true;
    return generation;
  };

  const scheduleEmbed = (
    next: Art,
    cfg: ArtCfg,
    generation: number,
    id: string,
    source: Blob | string,
    sourceName: string,
    paths: number,
    rectangles: number,
    cacheArt = true,
  ): void => {
    if (generation !== embedGeneration || art !== next) return;
    const story = storyPayload;
    setEmbedProgress(0, 1);
    embedTimer = window.setTimeout(() => {
      if (generation !== embedGeneration || art !== next || story !== storyPayload) return;
      const raw = packBoundedRaw(next, cfg);
      if (cacheArt) {
        const cachedRaw = new Blob([raw.buffer as ArrayBuffer], { type: "application/x-unicode-art" });
        queueCache(() => storeCachedArt(__WEB_VERSION__, id, source, sourceName, cfg, paths, rectangles, next, cachedRaw));
      }
      void embedHtml(next, cfg, "auto", "auto", progress => {
        if (generation !== embedGeneration || art !== next || story !== storyPayload) return;
        setEmbedProgress(progress.done, progress.total);
      }, raw, story).then(value => {
        if (generation !== embedGeneration || art !== next || story !== storyPayload) return;
        embed = value;
        setEmbedProgress(1, 1);
        embedView.render(value);
        copyEmbed.disabled = false;
        queueCache(() => storeCachedEmbed(__WEB_VERSION__, id, value));
      }).catch(error => {
        if (generation !== embedGeneration) return;
        embedProgress.hidden = false;
        embedProgressText.value = "Failed";
        embedCode.textContent = error instanceof Error ? `Embed unavailable: ${error.message}` : "Embed unavailable.";
      });
    }, 240);
  };

  const regenerateEmbed = (): void => {
    if (!art || !currentCacheId) return;
    const generation = resetEmbed();
    scheduleEmbed(art, studioCfg(), generation, currentCacheId, currentSource, name, currentPaths, currentRectangles, false);
  };

  const generateStudio = (): void => {
    if (!vector) return;
    const source = vector;
    const sourceValue = currentSource;
    const sourceName = name;
    const cfg = studioCfg();
    const id = cacheId();
    const local = ++studioGeneration;
    const embedLocal = resetEmbed();
    const highResolution = (cfg.columns ?? 96) > 256;
    currentCacheId = id;
    currentPaths = source.paths;
    currentRectangles = source.rectangles;
    setStatus(highResolution ? "Generating high-resolution art…" : "Rendering…", true);

    void (async () => {
      if (highResolution) await new Promise(requestAnimationFrame);
      if (local !== studioGeneration || vector !== source) return;
      const next = makeArt(source.pixels, cfg);
      if (local !== studioGeneration || vector !== source) return;
      art = next;
      metrics.textContent = `${next.columns}×${next.rows} cells · ${(next.density * 100).toFixed(1)}% dots · ${source.paths} paths${next.cellColours ? " · colour" : ""}`;
      await renderDense(output, next);
      if (local !== studioGeneration || art !== next) return;
      setStatus("Ready");
      scheduleEmbed(next, cfg, embedLocal, id, sourceValue, sourceName, source.paths, source.rectangles);
    })().catch(error => {
      if (local !== studioGeneration) return;
      setStatus(error instanceof Error ? error.message : "Rendering failed.");
    });
  };

  const generateHero = (): void => {
    if (!heroPixels) return;
    const next = makeArt(heroPixels, heroCfg());
    void renderDense(heroUnicode, next);
  };

  const applyThemeDefaults = (theme: Theme): void => {
    heroFull.checked = false;
    syncHeroColour();
    syncColour(true, theme);
    if (heroPixels) generateHero();
    if (vector) generateStudio();
  };

  const loadStudio = async (source: Blob | string, nextName: string, seedHero = false): Promise<void> => {
    const local = ++loadGeneration;
    setStatus("Reading image…", true);
    const decoded = await decodeImage(source);
    if (local !== loadGeneration) { if (decoded.revoke) URL.revokeObjectURL(decoded.url); return; }
    setStatus("Vectorising…", true);
    await new Promise(requestAnimationFrame);
    const nextBase = vectorStage(decoded.pixels, { colours: 64, alphaLevels: 16 });
    if (local !== loadGeneration) { if (decoded.revoke) URL.revokeObjectURL(decoded.url); return; }
    const nextVector = paletteVector(nextBase);
    if (!nextVector) { if (decoded.revoke) URL.revokeObjectURL(decoded.url); return; }
    vectorBase = nextBase;
    vector = nextVector;
    currentSource = source;
    name = nextName;
    currentPaths = nextVector.paths;
    currentRectangles = nextVector.rectangles;
    if (seedHero) {
      heroPixels = nextBase.pixels;
      if (heroObjectUrl) URL.revokeObjectURL(heroObjectUrl);
      heroImg.src = decoded.url;
      heroObjectUrl = decoded.revoke ? decoded.url : null;
      generateHero();
    } else if (decoded.revoke) URL.revokeObjectURL(decoded.url);
    generateStudio();
  };

  const rebuildVector = async (source: Blob | string, nextName: string, local: number): Promise<void> => {
    try {
      const decoded = await decodeImage(source);
      if (local !== loadGeneration) { if (decoded.revoke) URL.revokeObjectURL(decoded.url); return; }
      await new Promise(requestAnimationFrame);
      const nextBase = vectorStage(decoded.pixels, { colours: 64, alphaLevels: 16 });
      if (local !== loadGeneration) { if (decoded.revoke) URL.revokeObjectURL(decoded.url); return; }
      const nextVector = paletteVector(nextBase);
      if (!nextVector) { if (decoded.revoke) URL.revokeObjectURL(decoded.url); return; }
      vectorBase = nextBase;
      vector = nextVector;
      currentSource = source;
      name = nextName;
      currentPaths = nextVector.paths;
      currentRectangles = nextVector.rectangles;
      if (decoded.revoke) URL.revokeObjectURL(decoded.url);
    } catch (error) {
      console.warn("Could not restore the cached source for editing.", error);
    }
  };

  const loadHeroDemo = async (): Promise<void> => {
    try {
      const decoded = await decodeImage("assets/hero.png");
      const nextVector = vectorStage(decoded.pixels, { colours: 64, alphaLevels: 16 });
      heroPixels = nextVector.pixels;
      if (heroObjectUrl) URL.revokeObjectURL(heroObjectUrl);
      heroImg.src = decoded.url;
      heroObjectUrl = decoded.revoke ? decoded.url : null;
      generateHero();
    } catch (error) {
      console.warn("Could not load the hero demo.", error);
    }
  };

  const applyCachedControls = (cfg: StudioArtCfg): void => {
    const requested = Math.max(resolutionMin, Math.round(cfg.columns ?? 96));
    columnsValue.value = String(requested);
    columns.value = String(Math.min(resolutionMax, requested));
    contrast.value = String(cfg.contrast ?? 1.12);
    detail.value = String(cfg.detail ?? 0.34);
    bias.value = String(cfg.bias ?? 0.015);
    dither.value = cfg.dither ?? "ordered";
    invert.checked = cfg.invert ?? true;
    colour.checked = cfg.colour === true;
    fullColour.checked = colour.checked && cfg.fullColour === true;
    paletteInput.value = cfg.palette ?? "";
    paletteDither.checked = cfg.paletteDither === true;
    paletteInput.setCustomValidity("");
    paletteInput.removeAttribute("aria-invalid");
    syncColour(false);
  };

  const restoreCached = async (cached: RestoredArt): Promise<void> => {
    const local = ++loadGeneration;
    ++studioGeneration;
    window.clearTimeout(embedTimer);
    cancelEmbedHtml();
    const generation = ++embedGeneration;
    vectorBase = null;
    vector = null;
    currentSource = cached.source;
    name = cached.name;
    currentCacheId = cached.id;
    currentPaths = cached.paths;
    currentRectangles = cached.rectangles;
    applyCachedControls(cached.cfg as StudioArtCfg);
    art = cached.art;
    metrics.textContent = `${cached.art.columns}×${cached.art.rows} cells · ${(cached.art.density * 100).toFixed(1)}% dots · ${cached.paths} paths${cached.art.cellColours ? " · colour" : ""}`;
    setStatus("Restoring cached art…", true);
    await renderDense(output, cached.art);
    if (local !== loadGeneration || art !== cached.art) return;
    setStatus("Ready");
    embedProgress.hidden = true;
    if (cached.embed !== undefined) {
      embed = cached.embed;
      storyPayload = storyEmbed(cached.embed);
      embedView.render(cached.embed);
      copyEmbed.disabled = false;
    } else {
      embed = "";
      copyEmbed.disabled = true;
      embedCode.textContent = "Generating embed";
      scheduleEmbed(cached.art, cached.cfg, generation, cached.id, cached.source, cached.name, cached.paths, cached.rectangles);
    }
    void rebuildVector(cached.source, cached.name, local);
  };

  embedView = new EmbedView(embedCode, story => {
    if (storyPayload === story) return;
    storyPayload = story;
    regenerateEmbed();
  });

  let debounce = 0, paletteDebounce = 0;
  const schedule = (): void => { window.clearTimeout(debounce); debounce = window.setTimeout(generateStudio, 90); };
  const schedulePalette = (): void => {
    window.clearTimeout(paletteDebounce);
    paletteDebounce = window.setTimeout(() => {
      if (!vectorBase) return;
      const next = paletteVector(vectorBase);
      if (!next) return;
      vector = next;
      generateStudio();
    }, 120);
  };
  for (const control of [contrast, detail, bias, dither, invert]) control.addEventListener("input", schedule);
  paletteInput.addEventListener("input", schedulePalette);
  paletteDither.addEventListener("change", schedulePalette);
  bindResolutionGate(columns, columnsValue, resolutionTip, schedule, {
    confirmAboveMax: value => window.confirm(`2K was the last stop. Are nya sure you want to keep going? Your RAM is already at the bus stop trying to get home.\n\nRequested resolution: ${value} cells. This is unsupported and may crash the tab.`),
  });
  colour.addEventListener("change", () => {
    dither.value = colour.checked ? "atkinson" : "ordered";
    fullColour.checked = false;
    syncColour(true);
    schedule();
  });
  fullColour.addEventListener("change", () => { syncColour(true); schedule(); });
  canvasToggle.addEventListener("change", () => {
    manualCanvasDark = canvasDark();
    syncCanvas();
    syncStudioPolarity();
    schedule();
  });
  heroColour.addEventListener("change", () => {
    heroFull.checked = false;
    syncHeroColour();
    generateHero();
  });
  heroFull.addEventListener("change", () => { syncHeroColour(); generateHero(); });
  reset.addEventListener("click", () => {
    columns.value = "96";
    columnsValue.value = columns.value;
    contrast.value = "1.12";
    detail.value = "0.34";
    bias.value = "0.015";
    schedule();
  });
  addEventListener("unicode-art-theme", event => {
    const theme = (event as CustomEvent<Theme>).detail;
    if (theme === "light" || theme === "dark") applyThemeDefaults(theme);
  });

  const supportedImage = (file: File): boolean => file.type === "image/png" || file.type === "image/jpeg" || /\.(?:png|jpe?g)$/iu.test(file.name);
  upload.addEventListener("change", () => { const file = upload.files?.[0]; if (file && supportedImage(file)) void loadStudio(file, file.name.replace(/\.[^.]+$/, "")); });
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.dataset.drag = "true"; });
  drop.addEventListener("dragleave", () => delete drop.dataset.drag);
  drop.addEventListener("drop", event => {
    event.preventDefault();
    delete drop.dataset.drag;
    const file = event.dataTransfer?.files?.[0];
    if (file && supportedImage(file)) void loadStudio(file, file.name.replace(/\.[^.]+$/, ""));
    else if (file) setStatus("Choose a PNG or JPEG.");
  });

  const textOutput = (): string => art ? (art.cellColours ? taggedText(art) : art.text) : "";
  raster.addEventListener("click", () => {
    if (!art) return;
    const current = art;
    const foreground = getComputedStyle(output).color || "#111111";
    setStatus("Rasterising…", true);
    void downloadRaster(current, foreground).then(() => {
      if (art === current) setStatus("Ready");
    }).catch(error => setStatus(error instanceof Error ? error.message : "Raster export failed."));
  });
  copyEmbed.addEventListener("click", async () => { if (!embed) return; await navigator.clipboard.writeText(embed); const old = copyEmbed.textContent; copyEmbed.textContent = "Copied embed"; setTimeout(() => { copyEmbed.textContent = old; }, 1100); });
  txt.addEventListener("click", () => { if (art) void download("txt", "text/plain;charset=utf-8", `${textOutput()}\n`); });
  html.addEventListener("click", () => { if (art) void download("html", "text/html;charset=utf-8", denseHtml(art, name, 0.02)); });
  svg.addEventListener("click", () => { if (vector?.svg) void download("svg", "image/svg+xml;charset=utf-8", vector.svg); });

  bindCompare(compare, divider);
  bindTooltips();
  const observer = new ResizeObserver(() => { fitDense(heroUnicode); fitDense(output); });
  observer.observe(compare);
  if (output.parentElement) observer.observe(output.parentElement);
  syncColour();
  applyThemeDefaults(activeTheme());

  void (async () => {
    const cached = await loadCachedArt(__WEB_VERSION__).catch(() => null);
    if (cached) {
      void loadHeroDemo();
      await restoreCached(cached);
      return;
    }
    await loadStudio("assets/hero.png", "hero", true);
  })();
};

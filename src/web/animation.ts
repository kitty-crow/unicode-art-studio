import { makeArt } from "../core/art.ts";
import type { Art, ArtCfg, Dither } from "../types.ts";
import { vectorStage } from "../vector/stage.ts";
import { qs } from "./dom.ts";
import { download } from "./download.ts";
import { applyOutputPreset, outputPreset as presetFor, outputPresets } from "./hardware.ts";
import { parsePalette } from "./palette.ts";
import { rasterGeometry, renderRasterCanvas } from "./raster.ts";
import {
  decodeAnimationFile,
  encodeFramesZip,
  encodeGifAnimation,
  encodeWebpAnimation,
  MAX_ANIMATION_BYTES,
  type AnimationFrameProvider,
  type AnimationSource,
} from "./animation-codec.ts";

interface FilteredFrame {
  readonly art: Art;
  readonly duration: number;
}

const totalDuration = (frames: readonly { readonly duration: number }[]): number => frames.reduce((sum, frame) => sum + frame.duration, 0);
const formatBytes = (bytes: number): string => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const formatDuration = (ms: number): string => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;

export const startAnimationStudio = (): void => {
  const imageTab = qs<HTMLButtonElement>("#studio-image-tab");
  const animationTab = qs<HTMLButtonElement>("#studio-animation-tab");
  const imagePanel = qs<HTMLElement>("#studio-image-panel");
  const animationPanel = qs<HTMLElement>("#animation");
  const upload = qs<HTMLInputElement>("#animation-upload");
  const drop = qs<HTMLElement>("#animation-drop");
  const columns = qs<HTMLInputElement>("#animation-columns");
  const columnsValue = qs<HTMLInputElement>("#animation-columns-value");
  const contrast = qs<HTMLInputElement>("#animation-contrast");
  const detail = qs<HTMLInputElement>("#animation-detail");
  const bias = qs<HTMLInputElement>("#animation-bias");
  const dither = qs<HTMLSelectElement>("#animation-dither");
  const invert = qs<HTMLInputElement>("#animation-invert");
  const colour = qs<HTMLInputElement>("#animation-colour");
  const fullColour = qs<HTMLInputElement>("#animation-full-colour");
  const reset = qs<HTMLButtonElement>("#animation-reset");
  const optimisation = qs<HTMLSelectElement>("#animation-optimisation");
  const quality = qs<HTMLInputElement>("#animation-quality");
  const qualityValue = qs<HTMLOutputElement>("#animation-quality-value");
  const previewCanvas = qs<HTMLCanvasElement>("#animation-preview-canvas");
  const previewWrap = qs<HTMLElement>(".animation-canvas-wrap");
  const status = qs<HTMLElement>("#animation-status");
  const metrics = qs<HTMLElement>("#animation-metrics");
  const extraData = qs<HTMLElement>("#animation-extra-data");
  const play = qs<HTMLButtonElement>("#animation-play");
  const scrub = qs<HTMLInputElement>("#animation-scrub");
  const frameLabel = qs<HTMLOutputElement>("#animation-frame-label");
  const downloadWebp = qs<HTMLButtonElement>("#animation-download-webp");
  const downloadGif = qs<HTMLButtonElement>("#animation-download-gif");
  const downloadFrames = qs<HTMLButtonElement>("#animation-download-frames");
  const progress = qs<HTMLElement>("#animation-progress");
  const progressBar = qs<HTMLProgressElement>("#animation-progress-bar");
  const progressText = qs<HTMLOutputElement>("#animation-progress-text");

  const presetSelect = document.createElement("select");
  presetSelect.id = "animation-output-preset";
  const presetLabel = document.createElement("label");
  presetLabel.className = "preset-control";
  presetLabel.htmlFor = presetSelect.id;
  presetLabel.append("Output preset", presetSelect);
  fullColour.closest<HTMLElement>(".colour-options")?.appendChild(presetLabel);

  const presetFragment = document.createDocumentFragment();
  let presetGroup: HTMLOptGroupElement | null = null;
  let presetGroupName = "";
  for (const preset of outputPresets) {
    if (preset.group !== presetGroupName) {
      presetGroupName = preset.group;
      presetGroup = document.createElement("optgroup");
      presetGroup.label = preset.group;
      presetFragment.appendChild(presetGroup);
    }
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    presetGroup?.appendChild(option);
  }
  presetSelect.replaceChildren(presetFragment);
  presetSelect.value = "custom";

  let source: AnimationSource | null = null;
  let sourceName = "animation";
  let sourceSize = 0;
  let filtered: FilteredFrame[] = [];
  let generation = 0;
  let debounce = 0;
  let previewGeneration = 0;
  let frameIndex = 0;
  let playing = false;
  let playTimer = 0;
  let exporting = false;

  const fitPreviewCanvas = (): void => {
    const sourceWidth = Math.max(1, previewCanvas.width);
    const sourceHeight = Math.max(1, previewCanvas.height);
    const availableWidth = Math.max(1, previewWrap.clientWidth);
    const availableHeight = Math.max(1, previewWrap.clientHeight);
    const scale = Math.min(1, availableWidth / sourceWidth, availableHeight / sourceHeight);
    previewCanvas.style.width = `${Math.max(1, Math.floor(sourceWidth * scale))}px`;
    previewCanvas.style.height = `${Math.max(1, Math.floor(sourceHeight * scale))}px`;
  };

  const previewResizeObserver = new ResizeObserver(fitPreviewCanvas);
  previewResizeObserver.observe(previewWrap);

  const selectTab = (mode: "image" | "animation", updateHash = false): void => {
    const animation = mode === "animation";
    imageTab.setAttribute("aria-selected", String(!animation));
    animationTab.setAttribute("aria-selected", String(animation));
    imageTab.tabIndex = animation ? -1 : 0;
    animationTab.tabIndex = animation ? 0 : -1;
    imagePanel.hidden = animation;
    animationPanel.hidden = !animation;
    if (animation) requestAnimationFrame(fitPreviewCanvas);
    if (updateHash) history.replaceState(null, "", animation ? "#animation" : "#studio");
  };

  const tabFromHash = (): void => selectTab(location.hash === "#animation" ? "animation" : "image");
  imageTab.addEventListener("click", () => selectTab("image", true));
  animationTab.addEventListener("click", () => selectTab("animation", true));
  addEventListener("hashchange", tabFromHash);
  tabFromHash();

  const setStatus = (text: string, busy = false): void => {
    status.textContent = text;
    status.toggleAttribute("data-busy", busy);
  };

  const setProgress = (done: number, total: number, label = "Processing"): void => {
    const safeTotal = Math.max(1, total);
    const safeDone = Math.max(0, Math.min(done, safeTotal));
    progress.hidden = safeDone >= safeTotal;
    progressBar.max = safeTotal;
    progressBar.value = safeDone;
    progressText.value = `${label} ${Math.round(safeDone / safeTotal * 100)}%`;
  };

  const stopPlayback = (): void => {
    playing = false;
    window.clearTimeout(playTimer);
    play.textContent = "Play";
    play.setAttribute("aria-pressed", "false");
  };

  const setExports = (enabled: boolean): void => {
    downloadWebp.disabled = !enabled || exporting;
    downloadGif.disabled = !enabled || exporting;
    downloadFrames.disabled = !enabled || exporting;
  };

  const cfg = (): ArtCfg => ({
    columns: Number(columnsValue.value),
    contrast: Number(contrast.value),
    detail: Number(detail.value),
    bias: Number(bias.value),
    dither: dither.value as Dither,
    invert: invert.checked,
    colour: colour.checked,
    colourBackground: colour.checked && fullColour.checked,
    fullColour: colour.checked && fullColour.checked,
  });

  const syncColour = (): void => {
    fullColour.disabled = !colour.checked;
    if (!colour.checked) fullColour.checked = false;
  };

  const syncOptimisation = (): void => {
    const lossy = optimisation.value === "lossy";
    quality.disabled = !lossy;
    qualityValue.value = quality.value;
  };

  const drawPreview = async (index: number): Promise<void> => {
    const frame = filtered[index];
    if (!frame) return;
    const local = ++previewGeneration;
    try {
      const canvas = await renderRasterCanvas(frame.art, "#111111");
      if (local !== previewGeneration || filtered[index] !== frame) return;
      previewCanvas.width = canvas.width;
      previewCanvas.height = canvas.height;
      const context = previewCanvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      context.drawImage(canvas, 0, 0);
      canvas.width = 1;
      canvas.height = 1;
      fitPreviewCanvas();
      frameIndex = index;
      scrub.value = String(index);
      frameLabel.value = `${index + 1} / ${filtered.length}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Preview failed.");
      stopPlayback();
    }
  };

  const queueNextFrame = (): void => {
    if (!playing || filtered.length === 0) return;
    const frame = filtered[frameIndex];
    const delay = Math.max(10, frame?.duration ?? 100);
    playTimer = window.setTimeout(() => {
      if (!playing || filtered.length === 0) return;
      const next = (frameIndex + 1) % filtered.length;
      void drawPreview(next).then(queueNextFrame);
    }, delay);
  };

  play.addEventListener("click", () => {
    if (filtered.length <= 1) return;
    if (playing) { stopPlayback(); return; }
    playing = true;
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    queueNextFrame();
  });

  scrub.addEventListener("input", () => {
    stopPlayback();
    void drawPreview(Number(scrub.value));
  });

  const updateMetrics = (): void => {
    if (!source) {
      metrics.textContent = "Choose a GIF or WebP up to 25 MB.";
      extraData.hidden = true;
      return;
    }
    const duration = totalDuration(source.frames);
    metrics.textContent = `${source.width}×${source.height} source · ${source.frames.length} frame${source.frames.length === 1 ? "" : "s"} · ${formatDuration(duration)} · ${formatBytes(sourceSize)}`;
    const extras = source.preservedWebpChunks.length;
    extraData.hidden = extras === 0;
    if (extras > 0) extraData.textContent = `${extras} extra WebP RIFF chunk${extras === 1 ? "" : "s"} will be carried into WebP exports.`;
  };

  const regenerate = (): void => {
    if (!source) return;
    const currentSource = source;
    const local = ++generation;
    stopPlayback();
    setExports(false);
    setStatus("Applying filter to every frame…", true);
    setProgress(0, currentSource.frames.length, "Filtering");
    const next: FilteredFrame[] = [];
    const config = cfg();
    const preset = presetFor(presetSelect.value);
    const palette = parsePalette(preset.palette ?? "");
    const paletteDither = preset.paletteDither ?? false;

    void (async () => {
      for (let index = 0; index < currentSource.frames.length; index += 1) {
        if (local !== generation || source !== currentSource) return;
        const frame = currentSource.frames[index];
        if (!frame) continue;
        const vector = vectorStage(frame.pixels, { colours: 64, alphaLevels: 16 });
        const pixels = applyOutputPreset(vector.pixels, preset, Number(columnsValue.value), palette, paletteDither);
        const art = makeArt(pixels, config);
        next.push({ art, duration: frame.duration });
        setProgress(index + 1, currentSource.frames.length, "Filtering");
        if ((index + 1) % 2 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      if (local !== generation || source !== currentSource) return;
      filtered = next;
      frameIndex = 0;
      scrub.min = "0";
      scrub.max = String(Math.max(0, filtered.length - 1));
      scrub.value = "0";
      scrub.disabled = filtered.length <= 1;
      play.disabled = filtered.length <= 1;
      progress.hidden = true;
      if (filtered.length > 0) {
        const geometry = rasterGeometry(filtered[0]!.art);
        setStatus(`Ready · ${geometry.width}×${geometry.height} raster frames`);
        await drawPreview(0);
        setExports(true);
      } else {
        setStatus("No frames were produced.");
      }
    })().catch(error => {
      if (local !== generation) return;
      progress.hidden = true;
      filtered = [];
      setExports(false);
      setStatus(error instanceof Error ? error.message : "Animation filtering failed.");
    });
  };

  const schedule = (): void => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(regenerate, 140);
  };

  const syncColumns = (fromNumber = false): void => {
    const min = Number(columns.min);
    const max = Number(columns.max);
    const raw = fromNumber ? Number(columnsValue.value) : Number(columns.value);
    const value = Math.max(min, Math.min(max, Math.round(Number.isFinite(raw) ? raw : 96)));
    columns.value = String(value);
    columnsValue.value = String(value);
    schedule();
  };

  const applyPresetDefaults = (): void => {
    const preset = presetFor(presetSelect.value);
    if (preset.columns !== undefined) {
      const value = Math.max(Number(columns.min), Math.min(Number(columns.max), preset.columns));
      columns.value = String(value);
      columnsValue.value = String(value);
    }
    if (preset.unicodeDither) dither.value = preset.unicodeDither;
    if (preset.engine) {
      colour.checked = true;
      if (preset.fullColour !== undefined) fullColour.checked = preset.fullColour;
    }
    syncColour();
    schedule();
  };

  columns.addEventListener("input", () => syncColumns(false));
  columnsValue.addEventListener("change", () => syncColumns(true));
  for (const control of [contrast, detail, bias, dither, invert]) control.addEventListener("input", schedule);
  colour.addEventListener("change", () => { syncColour(); schedule(); });
  fullColour.addEventListener("change", schedule);
  presetSelect.addEventListener("change", applyPresetDefaults);
  optimisation.addEventListener("change", syncOptimisation);
  quality.addEventListener("input", syncOptimisation);
  reset.addEventListener("click", () => {
    columns.value = "96";
    columnsValue.value = "96";
    contrast.value = "1.12";
    detail.value = "0.34";
    bias.value = "0.015";
    dither.value = "ordered";
    invert.checked = true;
    colour.checked = false;
    fullColour.checked = false;
    presetSelect.value = "custom";
    syncColour();
    schedule();
  });

  const loadFile = async (file: File): Promise<void> => {
    ++generation;
    stopPlayback();
    setExports(false);
    filtered = [];
    previewCanvas.width = 1;
    previewCanvas.height = 1;
    fitPreviewCanvas();
    frameLabel.value = "0 / 0";
    if (file.size > MAX_ANIMATION_BYTES) {
      setStatus("Animations are limited to 25 MB.");
      return;
    }
    setStatus("Decoding animation…", true);
    progress.hidden = false;
    progressBar.removeAttribute("value");
    progressText.value = "Decoding";
    try {
      const decoded = await decodeAnimationFile(file);
      source = decoded;
      sourceName = file.name.replace(/\.[^.]+$/u, "") || "animation";
      sourceSize = file.size;
      updateMetrics();
      regenerate();
    } catch (error) {
      source = null;
      sourceSize = 0;
      progress.hidden = true;
      updateMetrics();
      setStatus(error instanceof Error ? error.message : "Could not decode this animation.");
    }
  };

  upload.addEventListener("change", () => {
    const file = upload.files?.[0];
    if (file) void loadFile(file);
  });
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.dataset.drag = "true"; });
  drop.addEventListener("dragleave", () => delete drop.dataset.drag);
  drop.addEventListener("drop", event => {
    event.preventDefault();
    delete drop.dataset.drag;
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });

  const makeProvider = (frames: readonly FilteredFrame[]): AnimationFrameProvider => {
    const first = frames[0];
    if (!first || !source) throw new Error("There is no filtered animation to export.");
    const geometry = rasterGeometry(first.art);
    return {
      width: geometry.width,
      height: geometry.height,
      frameCount: frames.length,
      durations: frames.map(frame => frame.duration),
      loopCount: source.loopCount,
      render: async index => {
        const frame = frames[index];
        if (!frame) throw new Error(`Frame ${index + 1} is unavailable.`);
        return renderRasterCanvas(frame.art, "#111111");
      },
    };
  };

  const exportAnimation = async (kind: "webp" | "gif" | "zip"): Promise<void> => {
    if (exporting || filtered.length === 0 || !source) return;
    const frames = filtered.slice();
    const currentSource = source;
    const provider = makeProvider(frames);
    exporting = true;
    stopPlayback();
    setExports(false);
    setStatus(kind === "zip" ? "Encoding PNG frames…" : `Encoding ${kind.toUpperCase()}…`, true);
    setProgress(0, provider.frameCount, kind === "zip" ? "Frames" : "Encoding");
    const onProgress = (done: number, total: number): void => setProgress(done, total, kind === "zip" ? "Frames" : "Encoding");
    try {
      if (kind === "webp") {
        const bytes = await encodeWebpAnimation(provider, {
          lossless: optimisation.value === "lossless",
          quality: Number(quality.value),
          preservedWebpChunks: currentSource.format === "webp" ? currentSource.preservedWebpChunks : [],
          backgroundColor: currentSource.backgroundColor,
          progress: onProgress,
        });
        await download("webp", "image/webp", bytes);
      } else if (kind === "gif") {
        const bytes = await encodeGifAnimation(provider, {
          lossless: optimisation.value === "lossless",
          quality: Number(quality.value),
          progress: onProgress,
        });
        await download("gif", "image/gif", bytes);
      } else {
        const bytes = await encodeFramesZip(provider, onProgress);
        await download("zip", "application/zip", bytes);
      }
      progress.hidden = true;
      setStatus(`Ready · exported ${sourceName}.${kind === "zip" ? "zip" : kind}`);
    } catch (error) {
      progress.hidden = true;
      setStatus(error instanceof Error ? error.message : "Animation export failed.");
    } finally {
      exporting = false;
      setExports(filtered.length > 0);
    }
  };

  downloadWebp.addEventListener("click", () => { void exportAnimation("webp"); });
  downloadGif.addEventListener("click", () => { void exportAnimation("gif"); });
  downloadFrames.addEventListener("click", () => { void exportAnimation("zip"); });

  syncColour();
  syncOptimisation();
  fitPreviewCanvas();
  setExports(false);
  updateMetrics();
};

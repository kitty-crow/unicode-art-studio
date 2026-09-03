const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)]
  .map(byte => byte.toString(16).padStart(2, "0"))
  .join("");

const fileName = async (blob: Blob, ext: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const suffix = ext.replace(/^\.+/u, "");
  return `kitty-crow-github-io-unicode-art-studio-${hex(digest)}.${suffix}`;
};

const triggerDownload = (blob: Blob, name: string): void => {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
};

const isWebKit = (): boolean => /AppleWebKit/u.test(navigator.userAgent);

const shareImageOnWebKit = async (blob: Blob, name: string): Promise<boolean> => {
  if (!isWebKit() || typeof navigator.share !== "function") return false;
  const file = new File([blob], name, { type: blob.type || "image/png" });
  if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    return false;
  }
};

export const download = async (ext: string, type: string, body: BlobPart): Promise<string> => {
  const blob = new Blob([body], { type });
  const name = await fileName(blob, ext);
  triggerDownload(blob, name);
  return name;
};

export const downloadImage = async (ext: string, type: string, body: BlobPart): Promise<string> => {
  const blob = new Blob([body], { type });
  const name = await fileName(blob, ext);
  if (!await shareImageOnWebKit(blob, name)) triggerDownload(blob, name);
  return name;
};

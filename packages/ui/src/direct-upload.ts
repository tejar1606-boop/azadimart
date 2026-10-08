export type DirectUploadPurpose = "SITE_IMAGE" | "SITE_VIDEO" | "PRODUCT_IMAGE" | "PRODUCT_VIDEO" | "APLUS_IMAGE";

export type DirectUploadResult = {
  mediaAssetId: string;
  kind: "IMAGE" | "VIDEO";
  mimeType: string;
  url: string;
  width?: number;
  height?: number;
};

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};

function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  return CONTENT_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

async function json(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? (response.status === 413 ? "File is too large" : "Upload failed"));
  return body;
}

function put(url: string, file: File, headers: Record<string, string>, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "File is too large" : "Upload to storage failed")));
    xhr.onerror = () => reject(new Error("Upload interrupted. Check your connection and try again."));
    xhr.send(file);
  });
}

/**
 * Upload a file straight to storage (signed URL), then let the app verify it.
 * No app-server request carries the file, so large videos are not limited by
 * serverless request-size limits.
 */
export async function directUpload(file: File, options: { purpose: DirectUploadPurpose; altText?: string; onProgress?: (percent: number) => void }): Promise<DirectUploadResult> {
  const contentType = contentTypeOf(file);
  const ticket = await json(await fetch("/api/v1/media/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: options.purpose, contentType, byteSize: file.size }),
  }));
  await put(ticket.uploadUrl, file, ticket.headers ?? { "Content-Type": contentType }, options.onProgress);
  return json(await fetch("/api/v1/media/uploads/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ticket.token, altText: options.altText }),
  }));
}

/** Pixel size of an image file, read in the browser before uploading. */
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("Could not read this image")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

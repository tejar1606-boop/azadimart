export type ObjectKind = "IMAGE" | "VIDEO" | "DOCUMENT";

export type UploadRequest = {
  kind: ObjectKind;
  mimeType: string;
  byteSize: number;
  sellerId?: string;
};

export type PresignedUpload = {
  storageKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
};

export interface StorageProvider {
  createUpload(request: UploadRequest): Promise<PresignedUpload>;
  publicUrl(storageKey: string): string;
  deleteObject(storageKey: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  createUpload(request: UploadRequest): Promise<PresignedUpload> {
    const storageKey = `local/${request.kind.toLowerCase()}/${crypto.randomUUID()}`;
    return Promise.resolve({
      storageKey,
      uploadUrl: `/api/internal/storage/${storageKey}`,
      headers: { "content-type": request.mimeType },
    });
  }

  publicUrl(storageKey: string): string {
    return `/media/${storageKey}`;
  }

  deleteObject(): Promise<void> {
    return Promise.resolve();
  }
}

let active: StorageProvider = new LocalStorageProvider();

export function setStorageProvider(provider: StorageProvider): void {
  active = provider;
}

export function getStorageProvider(): StorageProvider {
  return active;
}
export * from "./object-store";
export * from "./media";

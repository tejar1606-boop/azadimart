import { describe, expect, it } from "vitest";
import { LocalStorageProvider } from "./index";

describe("storage", () => {
  it("issues an upload target without embedding credentials", async () => {
    const upload = await new LocalStorageProvider().createUpload({
      kind: "IMAGE",
      mimeType: "image/jpeg",
      byteSize: 1024,
    });
    expect(upload.storageKey).toContain("image");
    expect(JSON.stringify(upload)).not.toMatch(/SECRET|AKIA/i);
  });
});

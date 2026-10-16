import { describe, expect, it } from "vitest";
import { detectChatFile, signChatFile, verifyChatFileLink, withChatFileLinks } from "./chat-files";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("chat files", () => {
  it("accepts photos and PDFs by their real bytes only", () => {
    expect(detectChatFile(bytes("%PDF-1.7 ..."))?.mimeType).toBe("application/pdf");
    expect(detectChatFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.kind).toBe("IMAGE");
    expect(detectChatFile(bytes("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectChatFile(bytes("MZ executable"))).toBeNull();
  });

  it("opens a file only with an untampered, unexpired link for a chat file", () => {
    const key = "chat-files/0b9c/123e4567-e89b-12d3-a456-426614174000.jpg";
    const params = new URLSearchParams(signChatFile(key));
    expect(verifyChatFileLink(params)).toBe(key);

    const tampered = new URLSearchParams(params); tampered.set("k", "chat-files/other/x.jpg");
    expect(verifyChatFileLink(tampered)).toBeNull();

    expect(verifyChatFileLink(new URLSearchParams(signChatFile(key, -10)))).toBeNull();
    expect(verifyChatFileLink(new URLSearchParams(signChatFile("private-documents/kyc.pdf")))).toBeNull();
  });

  it("never sends the storage key to the browser", () => {
    const out = withChatFileLinks({ messages: [{ attachment: { key: "chat-files/a/b.pdf", name: "b.pdf", mimeType: "application/pdf", size: 10, kind: "DOCUMENT" as const } }, { attachment: null }] }, "/api/v1/live-chat/files");
    expect(out.messages[0]!.attachment).not.toHaveProperty("key");
    expect((out.messages[0]!.attachment as { url: string }).url).toMatch(/^\/api\/v1\/live-chat\/files\?k=/);
    expect(out.messages[1]!.attachment).toBeNull();
  });
});

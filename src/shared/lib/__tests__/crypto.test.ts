import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../crypto";

describe("crypto", () => {
  it("encrypts and decrypts a simple string", async () => {
    const plaintext = "sk-test-api-key-12345";
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypted output differs from plaintext", async () => {
    const plaintext = "my-secret";
    const encrypted = await encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", async () => {
    const plaintext = "same-text";
    const a = await encrypt(plaintext);
    const b = await encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it("decrypts both different ciphertexts to same plaintext", async () => {
    const plaintext = "same-text";
    const a = await encrypt(plaintext);
    const b = await encrypt(plaintext);
    expect(await decrypt(a)).toBe(plaintext);
    expect(await decrypt(b)).toBe(plaintext);
  });

  it("handles empty string", async () => {
    const encrypted = await encrypt("");
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles unicode characters", async () => {
    const plaintext = "密钥🔑";
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("throws on invalid ciphertext", async () => {
    await expect(decrypt("not-valid-base64!!!")).rejects.toThrow();
  });
});

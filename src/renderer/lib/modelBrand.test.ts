import { describe, expect, it } from "vitest";
import { detectBrand } from "./modelBrand";

describe("detectBrand", () => {
  it("recognizes the agent's own models", () => {
    expect(detectBrand("grok-4.5", "Grok 4.5").id).toBe("grok");
    expect(detectBrand("grok-build").id).toBe("grok");
  });

  it("recognizes vendor model names reported by the agent", () => {
    expect(detectBrand("deepseek-chat").id).toBe("deepseek");
    expect(detectBrand("kimi-k3").id).toBe("kimi");
    expect(detectBrand("moonshot-v1-128k").id).toBe("kimi");
    expect(detectBrand("glm-5-2").id).toBe("glm");
    expect(detectBrand("qwen3-max").id).toBe("qwen");
    expect(detectBrand("minimax-m3").id).toBe("minimax");
    expect(detectBrand("claude-opus-4-6").id).toBe("anthropic");
    expect(detectBrand("gemini-3-pro").id).toBe("gemini");
    expect(detectBrand("mixtral-8x7b").id).toBe("mistral");
    expect(detectBrand("meta-llama-3-1-70b").id).toBe("llama");
  });

  it("falls back to the display name when the id is opaque", () => {
    expect(detectBrand("model-7", "DeepSeek V4").id).toBe("deepseek");
  });

  it("prefers the more specific vendor when names overlap", () => {
    expect(detectBrand("codestral-latest").id).toBe("mistral");
    // "ollama" contains "llama" — the host must not be read as the model.
    expect(detectBrand("ollama-codellama").id).toBe("ollama");
  });

  it("recognizes additional catalog names", () => {
    expect(detectBrand("openrouter").id).toBe("openrouter");
    expect(detectBrand("zhipu").id).toBe("glm");
    expect(detectBrand("moonshot").id).toBe("kimi");
    expect(detectBrand("ollama").id).toBe("ollama");
    expect(detectBrand("anthropic").id).toBe("anthropic");
  });

  it("returns a neutral badge for anything unknown", () => {
    const brand = detectBrand("internal-model-1");
    expect(brand.id).toBe("generic");
    expect(brand.monogram).toBeTruthy();
  });
});

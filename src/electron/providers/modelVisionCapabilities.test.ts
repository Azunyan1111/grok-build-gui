import { describe, expect, it } from "vitest";
import { detectModelVisionCapability } from "./modelVisionCapabilities";

function detect(
  presetId: string,
  modelId: string,
  inputModalities?: string[],
) {
  return detectModelVisionCapability({ presetId, modelId, inputModalities });
}

describe("detectModelVisionCapability", () => {
  it("marks the DeepSeek V4 text models as blind", () => {
    expect(detect("deepseek", "deepseek-v4-flash")).toEqual({
      supportsVision: false,
    });
    expect(detect("deepseek", "deepseek-v4-pro")).toEqual({
      supportsVision: false,
    });
    expect(detect("deepseek", "deepseek-v4-pro-0813")).toEqual({
      supportsVision: false,
    });
  });

  it("recognises the vision variant of the same family", () => {
    expect(detect("deepseek", "deepseek-v4-flash-vision-exp")).toEqual({
      supportsVision: true,
    });
  });

  it("sees through a gateway's vendor prefix", () => {
    expect(detect("openrouter", "deepseek/deepseek-v4-pro")).toEqual({
      supportsVision: false,
    });
    expect(detect("custom", "DeepSeek-V4-Flash")).toEqual({
      supportsVision: false,
    });
  });

  it("trusts advertised modalities over the vendor rules", () => {
    expect(
      detect("openrouter", "deepseek/deepseek-v4-flash-vision-exp", [
        "text",
        "image",
      ]),
    ).toEqual({ supportsVision: true });
    expect(detect("openrouter", "stealth/ox-alpha", ["text", "image", "video"]))
      .toEqual({ supportsVision: true });
    expect(detect("openrouter", "vendor/text-only", ["text"])).toEqual({
      supportsVision: false,
    });
  });

  it("stays undecided for models it knows nothing about", () => {
    expect(detect("custom", "some-relay-model")).toEqual({});
    expect(detect("openai", "gpt-5.6")).toEqual({});
    expect(detect("custom", "  ")).toEqual({});
  });
});

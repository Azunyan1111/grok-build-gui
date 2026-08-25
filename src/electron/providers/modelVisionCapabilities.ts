/**
 * Which models can actually read an image.
 *
 * DeepSeek's text APIs — V4 Flash and V4 Pro included — reject image parts
 * outright, so a screenshot has to be transcribed by a vision model before the
 * prompt reaches them. Detection is deliberately tri-state: only a definite
 * `false` triggers that fallback, so an unknown relay model keeps its images.
 */

/** Vendor suffixes that mark a multimodal variant of an otherwise blind family. */
const VISION_MARKER = /(?:^|[-_])(?:vl|vision|omni|multimodal)(?:[-_.]|$)/;

export type ModelVisionCapability = {
  /** Undefined when neither the provider catalog nor the researched rules decide. */
  supportsVision?: boolean;
};

export type ModelVisionCapabilityInput = {
  presetId: string;
  modelId: string;
  /** Provider-advertised modalities, currently exposed by OpenRouter. */
  inputModalities?: readonly string[];
};

/** Strip a gateway's vendor prefix: `deepseek/deepseek-v4-pro` → `deepseek-v4-pro`. */
function bareModelId(modelId: string): string {
  return modelId.trim().toLowerCase().split("/").at(-1) ?? "";
}

function deepSeekCapability(
  presetId: string,
  modelId: string,
): ModelVisionCapability | null {
  if (presetId !== "deepseek" && !modelId.startsWith("deepseek")) return null;
  // `deepseek-v4-flash-vision-exp` is the one image-capable member of the family.
  if (VISION_MARKER.test(modelId)) return { supportsVision: true };
  return { supportsVision: false };
}

/**
 * Detect image input support. Provider-advertised modalities win; otherwise the
 * documented vendor rules decide, and everything else stays undecided.
 */
export function detectModelVisionCapability(
  input: ModelVisionCapabilityInput,
): ModelVisionCapability {
  if (input.inputModalities?.length) {
    return {
      supportsVision: input.inputModalities.some(
        (modality) => modality.trim().toLowerCase() === "image",
      ),
    };
  }

  const modelId = bareModelId(input.modelId);
  if (!modelId) return {};

  const deepSeek = deepSeekCapability(input.presetId, modelId);
  if (deepSeek) return deepSeek;

  return {};
}

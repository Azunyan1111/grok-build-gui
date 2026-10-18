import { describe, expect, it } from "vitest";
import type { ModelState } from "../../electron/preload";
import { selectedModelNeedsGrokLogin } from "./modelAuth";

function state(currentModelId: string | null, name = currentModelId ?? ""):
  ModelState {
  return {
    currentModelId,
    currentReasoningEffort: null,
    availableModels: currentModelId
      ? [{ modelId: currentModelId, name }]
      : [],
  };
}

describe("selectedModelNeedsGrokLogin", () => {
  it("requires login for the default and built-in Grok models", () => {
    expect(selectedModelNeedsGrokLogin(state(null))).toBe(true);
    expect(selectedModelNeedsGrokLogin(state("grok-4.5", "Grok 4.5"))).toBe(
      true,
    );
  });

  it("does not require Grok login for a non-Grok model reported by the agent", () => {
    expect(selectedModelNeedsGrokLogin(state("local-model", "Local Model"))).toBe(
      false,
    );
  });
});

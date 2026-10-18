import type { ModelState } from "../../electron/preload";
import { detectBrand } from "./modelBrand";

/** Grok models need the Grok account from the login screen. */
export function selectedModelNeedsGrokLogin(models: ModelState): boolean {
  const modelId = models.currentModelId;
  if (!modelId) return true;
  const selected = models.availableModels.find(
    (model) => model.modelId === modelId,
  );
  return detectBrand(modelId, selected?.name).id === "grok";
}

import { useCallback, useEffect, useState } from "react";
import type {
  VisionFallbackInput,
  VisionFallbackSettings,
} from "../../../electron/preload";

/**
 * Vision model used when the selected model cannot read images. The main
 * process owns the API key, so the form only ever sends one and reads back
 * whether one is stored.
 */
export function useVisionFallback() {
  const [settings, setSettings] = useState<VisionFallbackSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.grok?.getVisionFallback?.().then(setSettings);
  }, []);

  const save = useCallback(async (input: VisionFallbackInput) => {
    if (!window.grok?.saveVisionFallback) return;
    setBusy(true);
    try {
      setSettings(await window.grok.saveVisionFallback(input));
    } finally {
      setBusy(false);
    }
  }, []);

  return { settings, busy, save };
}

import "./VisionFallbackSettings.css";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVisionFallback } from "./useVisionFallback";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";

/**
 * Reading images with a second model. Text-only models — DeepSeek V4 Flash and
 * Pro among them — cannot take an attachment, so it is transcribed first and
 * the transcription is what reaches them.
 */
export function VisionFallbackSettings() {
  const { t } = useTranslation();
  const { settings, busy, save } = useVisionFallback();
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setModel(settings.model);
    setBaseUrl(settings.baseUrl);
  }, [settings]);

  const dirty =
    !!settings &&
    (enabled !== settings.enabled ||
      model !== settings.model ||
      baseUrl !== settings.baseUrl ||
      apiKey.length > 0);

  async function onSave() {
    await save({
      enabled,
      model,
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
    });
    setApiKey("");
  }

  return (
    <section className="settings-section" aria-labelledby="settings-vision">
      <h2 id="settings-vision" className="settings-section-title">
        {t("vision.title")}
      </h2>
      <p className="settings-section-desc">{t("vision.description")}</p>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">{t("vision.enable")}</div>
            <div className="settings-row-hint">{t("vision.enableHint")}</div>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy || !settings}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span aria-hidden="true" />
            <span className="sr-only">{t("vision.enable")}</span>
          </label>
        </div>

        <div className="vision-fields">
          <label className="vision-field">
            <span>{t("vision.model")}</span>
            <input
              className="vision-input"
              value={model}
              spellCheck={false}
              placeholder="qwen/qwen3-vl-30b-a3b-instruct"
              onChange={(event) => setModel(event.target.value)}
            />
          </label>

          <label className="vision-field">
            <span>{t("vision.baseUrl")}</span>
            <input
              className="vision-input"
              value={baseUrl}
              spellCheck={false}
              placeholder="https://openrouter.ai/api/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>

          <label className="vision-field">
            <span>
              {t("vision.apiKey")}
              {/* The main process opens web links externally (window-open handler). */}
              <a
                className="vision-link"
                href={OPENROUTER_KEYS_URL}
                target="_blank"
                rel="noreferrer"
              >
                {t("endpoints.getKey")}
              </a>
            </span>
            <input
              className="vision-input"
              type="password"
              value={apiKey}
              spellCheck={false}
              placeholder={
                settings?.hasApiKey
                  ? t("endpoints.keyStored")
                  : t("vision.keyPlaceholder")
              }
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        </div>

        <div className="settings-inline-note">{t("vision.sharedKeyHint")}</div>

        <div className="settings-permission-check">
          <span>{t("vision.applyHint")}</span>
          <button
            type="button"
            className="settings-permission-button"
            disabled={busy || !dirty}
            onClick={() => void onSave()}
          >
            {busy ? t("endpoints.loading") : t("endpoints.save")}
          </button>
        </div>
      </div>
    </section>
  );
}

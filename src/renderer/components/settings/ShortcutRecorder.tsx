import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  formatShortcut,
  isAllowedShortcut,
  shortcutFromKeyboardEvent,
  type KeyboardShortcut,
} from "../../lib/keyboardShortcut";
import { detectHostPlatform } from "../../lib/platform";

type Props = {
  value: KeyboardShortcut;
  ariaLabel: string;
  allowModifierOnly?: boolean;
  onChange: (shortcut: KeyboardShortcut) => boolean;
};

/** Focused key recorder used by Settings; it never installs a live shortcut. */
export function ShortcutRecorder({
  value,
  ariaLabel,
  allowModifierOnly = false,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState("");
  const modifierCandidate = useRef("");
  const platform = detectHostPlatform();

  function finish(shortcut: KeyboardShortcut) {
    if (!onChange(shortcut)) return;
    modifierCandidate.current = "";
    setPreview("");
    setRecording(false);
  }

  return (
    <button
      type="button"
      className={`shortcut-recorder${recording ? " is-recording" : ""}`}
      aria-label={ariaLabel}
      aria-pressed={recording}
      onClick={() => {
        modifierCandidate.current = "";
        setPreview("");
        setRecording(true);
      }}
      onBlur={() => {
        modifierCandidate.current = "";
        setPreview("");
        setRecording(false);
      }}
      onKeyDown={(event) => {
        if (!recording) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          modifierCandidate.current = "";
          setPreview("");
          setRecording(false);
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          finish("");
          return;
        }
        if (event.repeat) return;
        const shortcut = shortcutFromKeyboardEvent(event.nativeEvent);
        if (!shortcut) return;
        if (isAllowedShortcut(shortcut, { allowModifierOnly: false })) {
          finish(shortcut);
          return;
        }
        if (allowModifierOnly && isAllowedShortcut(shortcut, { allowModifierOnly })) {
          modifierCandidate.current = shortcut;
          setPreview(formatShortcut(shortcut, platform));
          return;
        }
        modifierCandidate.current = "";
        setPreview("");
      }}
      onKeyUp={(event) => {
        if (!recording || modifierCandidate.current !== event.code) return;
        event.preventDefault();
        event.stopPropagation();
        finish(modifierCandidate.current);
      }}
    >
      {recording
        ? preview || t("settings.shortcutRecording")
        : value
          ? formatShortcut(value, platform)
          : t("settings.shortcutNotSet")}
    </button>
  );
}

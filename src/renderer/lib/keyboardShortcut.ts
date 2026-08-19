import type { HostPlatform } from "./platform";

export type KeyboardShortcut = string;

export const DEFAULT_SCREENSHOT_SHORTCUT: KeyboardShortcut = "";
export const DEFAULT_VOICE_SHORTCUT: KeyboardShortcut = "AltLeft";

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

const MODIFIER_ORDER = ["Control", "Alt", "Shift", "Meta"] as const;

type ShortcutParts = {
  code: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
};

function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

function modifierForCode(code: string): (typeof MODIFIER_ORDER)[number] | null {
  if (code.startsWith("Control")) return "Control";
  if (code.startsWith("Alt")) return "Alt";
  if (code.startsWith("Shift")) return "Shift";
  if (code.startsWith("Meta")) return "Meta";
  return null;
}

function parseShortcut(value: string): ShortcutParts | null {
  const tokens = value.split("+").filter(Boolean);
  if (tokens.length === 0) return null;
  const code = tokens.at(-1) ?? "";
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(code)) return null;
  const modifiers = new Set(tokens.slice(0, -1));
  if (
    [...modifiers].some(
      (token) => !MODIFIER_ORDER.includes(token as (typeof MODIFIER_ORDER)[number]),
    )
  ) {
    return null;
  }
  return {
    code,
    alt: modifiers.has("Alt"),
    ctrl: modifiers.has("Control"),
    meta: modifiers.has("Meta"),
    shift: modifiers.has("Shift"),
  };
}

function serializeShortcut(parts: ShortcutParts): KeyboardShortcut {
  if (isModifierCode(parts.code)) return parts.code;
  return [
    parts.ctrl ? "Control" : "",
    parts.alt ? "Alt" : "",
    parts.shift ? "Shift" : "",
    parts.meta ? "Meta" : "",
    parts.code,
  ]
    .filter(Boolean)
    .join("+");
}

export function shortcutFromKeyboardEvent(
  event: Pick<
    KeyboardEvent,
    "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
): KeyboardShortcut {
  const code = event.code;
  if (!code || code === "Unidentified") return "";
  return serializeShortcut({
    code,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  });
}

export function isAllowedShortcut(
  shortcut: KeyboardShortcut,
  options: { allowModifierOnly?: boolean } = {},
): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  if (isModifierCode(parsed.code)) return options.allowModifierOnly === true;
  if (parsed.alt || parsed.ctrl || parsed.meta || parsed.shift) return true;
  return /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(parsed.code);
}

export function isModifierOnlyShortcut(shortcut: KeyboardShortcut): boolean {
  const parsed = parseShortcut(shortcut);
  return !!parsed && isModifierCode(parsed.code);
}

export function shortcutsConflict(
  first: KeyboardShortcut,
  second: KeyboardShortcut,
): boolean {
  if (!first || !second) return false;
  if (first === second) return true;
  const firstParsed = parseShortcut(first);
  const secondParsed = parseShortcut(second);
  if (!firstParsed || !secondParsed) return false;

  const modifierConflict = (
    modifierShortcut: ShortcutParts,
    combination: ShortcutParts,
  ) => {
    if (!isModifierCode(modifierShortcut.code)) return false;
    const modifier = modifierForCode(modifierShortcut.code);
    return (
      (modifier === "Alt" && combination.alt) ||
      (modifier === "Control" && combination.ctrl) ||
      (modifier === "Meta" && combination.meta) ||
      (modifier === "Shift" && combination.shift)
    );
  };
  return (
    modifierConflict(firstParsed, secondParsed) ||
    modifierConflict(secondParsed, firstParsed)
  );
}

export function normalizeShortcut(
  raw: unknown,
  fallback: KeyboardShortcut,
  options: { allowModifierOnly?: boolean } = {},
): KeyboardShortcut {
  if (raw === "") return "";
  if (typeof raw !== "string") return fallback;
  const parsed = parseShortcut(raw.trim());
  if (!parsed) return fallback;
  const normalized = serializeShortcut(parsed);
  return isAllowedShortcut(normalized, options) ? normalized : fallback;
}

export function keyboardEventMatchesShortcut(
  event: Pick<
    KeyboardEvent,
    "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
  shortcut: KeyboardShortcut,
): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed || event.code !== parsed.code) return false;
  const ownModifier = modifierForCode(parsed.code);
  return (
    event.altKey === (parsed.alt || ownModifier === "Alt") &&
    event.ctrlKey === (parsed.ctrl || ownModifier === "Control") &&
    event.metaKey === (parsed.meta || ownModifier === "Meta") &&
    event.shiftKey === (parsed.shift || ownModifier === "Shift")
  );
}

export function keyboardEventReleasesShortcut(
  event: Pick<KeyboardEvent, "code">,
  shortcut: KeyboardShortcut,
): boolean {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return false;
  if (event.code === parsed.code) return true;
  return (
    (parsed.alt && event.code.startsWith("Alt")) ||
    (parsed.ctrl && event.code.startsWith("Control")) ||
    (parsed.meta && event.code.startsWith("Meta")) ||
    (parsed.shift && event.code.startsWith("Shift"))
  );
}

function codeLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const labels: Record<string, string> = {
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Enter: "Enter",
    Equal: "=",
    Minus: "-",
    Period: ".",
    Quote: "'",
    Semicolon: ";",
    Slash: "/",
    Space: "Space",
    Tab: "Tab",
  };
  return labels[code] ?? code.replace(/Left$|Right$/, "");
}

export function formatShortcut(
  shortcut: KeyboardShortcut,
  platform: HostPlatform,
): string {
  const parsed = parseShortcut(shortcut);
  if (!parsed) return "";
  if (isModifierCode(parsed.code)) {
    const modifier = modifierForCode(parsed.code);
    if (platform === "darwin") {
      return modifier === "Alt"
        ? "⌥"
        : modifier === "Control"
          ? "⌃"
          : modifier === "Meta"
            ? "⌘"
            : "⇧";
    }
    return modifier === "Meta" ? "Super" : (modifier ?? parsed.code);
  }
  const labels = platform === "darwin"
    ? [
        parsed.ctrl ? "⌃" : "",
        parsed.alt ? "⌥" : "",
        parsed.shift ? "⇧" : "",
        parsed.meta ? "⌘" : "",
      ]
    : [
        parsed.ctrl ? "Ctrl" : "",
        parsed.alt ? "Alt" : "",
        parsed.shift ? "Shift" : "",
        parsed.meta ? "Super" : "",
      ];
  const joiner = platform === "darwin" ? "" : "+";
  return [...labels.filter(Boolean), codeLabel(parsed.code)].join(joiner);
}

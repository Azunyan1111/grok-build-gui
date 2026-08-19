// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  formatShortcut,
  isAllowedShortcut,
  isModifierOnlyShortcut,
  keyboardEventMatchesShortcut,
  keyboardEventReleasesShortcut,
  normalizeShortcut,
  shortcutFromKeyboardEvent,
  shortcutsConflict,
} from "./keyboardShortcut";

describe("keyboard shortcuts", () => {
  it("serializes and formats a modified key", () => {
    const shortcut = shortcutFromKeyboardEvent({
      code: "Digit4",
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
    });
    expect(shortcut).toBe("Shift+Meta+Digit4");
    expect(formatShortcut(shortcut, "darwin")).toBe("⇧⌘4");
    expect(formatShortcut(shortcut, "win32")).toBe("Shift+Super+4");
  });

  it("allows modifier-only voice shortcuts but rejects bare typing keys", () => {
    expect(isAllowedShortcut("AltLeft", { allowModifierOnly: true })).toBe(true);
    expect(isAllowedShortcut("AltLeft")).toBe(false);
    expect(isAllowedShortcut("KeyV")).toBe(false);
    expect(isAllowedShortcut("F8")).toBe(true);
    expect(isModifierOnlyShortcut("AltLeft")).toBe(true);
    expect(isModifierOnlyShortcut("Alt+KeyV")).toBe(false);
  });

  it("matches press and release for a held combination", () => {
    expect(
      keyboardEventMatchesShortcut(
        {
          code: "KeyV",
          altKey: true,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
        },
        "Alt+KeyV",
      ),
    ).toBe(true);
    expect(
      keyboardEventReleasesShortcut({ code: "AltLeft" }, "Alt+KeyV"),
    ).toBe(true);
  });

  it("falls back for invalid stored values and preserves an explicit clear", () => {
    expect(normalizeShortcut("KeyV", "F8")).toBe("F8");
    expect(normalizeShortcut("", "F8")).toBe("");
  });

  it("detects exact and modifier-prefix conflicts", () => {
    expect(shortcutsConflict("F8", "F8")).toBe(true);
    expect(shortcutsConflict("AltLeft", "Alt+KeyS")).toBe(true);
    expect(shortcutsConflict("AltLeft", "Shift+KeyS")).toBe(false);
    expect(shortcutsConflict("", "AltLeft")).toBe(false);
  });
});

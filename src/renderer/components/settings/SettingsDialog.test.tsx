// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../lib/i18n";
import { DEFAULT_GUI_SETTINGS } from "../../lib/guiSettings";
import { SettingsDialog } from "./SettingsDialog";
import type { AppUpdate } from "../../hooks/useAppUpdate";

const NO_UPDATE: AppUpdate = {
  status: null,
  actionable: false,
  percent: null,
  checking: false,
  check: async () => {},
  download: async () => {},
  install: async () => {},
};

function renderDialog(overrides?: { onClose?: () => void }) {
  const onChange = vi.fn();
  const onClose = overrides?.onClose ?? vi.fn();
  render(
    <SettingsDialog
      open
      settings={DEFAULT_GUI_SETTINGS}
      onChange={onChange}
      onClose={onClose}
      update={NO_UPDATE}
    />,
  );
  return { onChange, onClose };
}

describe("SettingsDialog", () => {
  // No `globals: true` in this project, so auto-cleanup is not registered and
  // dialogs from earlier cases would collide on `getByRole("dialog")`.
  afterEach(cleanup);

  it("renders nothing while closed", () => {
    render(
      <SettingsDialog
        open={false}
        settings={DEFAULT_GUI_SETTINGS}
        onChange={vi.fn()}
        onClose={vi.fn()}
        update={NO_UPDATE}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on the first category and swaps the body when another is picked", () => {
    renderDialog();

    // Interface category: language row, and nothing from the other categories.
    expect(screen.getByLabelText("Language")).toBeTruthy();
    expect(screen.queryByLabelText("Terminal theme")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));

    expect(screen.getByLabelText("Terminal theme")).toBeTruthy();
    expect(screen.queryByLabelText("Language")).toBeNull();
  });

  it("opens the requested category and reapplies it when reopened", async () => {
    const props = {
      settings: DEFAULT_GUI_SETTINGS,
      onChange: vi.fn(),
      onClose: vi.fn(),
      update: NO_UPDATE,
    };
    const { rerender } = render(
      <SettingsDialog open initialSection="interface" {...props} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(screen.getByLabelText("Terminal theme")).toBeTruthy();

    rerender(
      <SettingsDialog open={false} initialSection="update" {...props} />,
    );
    rerender(<SettingsDialog open initialSection="update" {...props} />);

    expect(await screen.findByText("Current version")).toBeTruthy();
    expect(screen.queryByLabelText("Terminal theme")).toBeNull();
  });

  it("reports edits without mutating the passed settings", () => {
    const { onChange } = renderDialog();

    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "zh-CN" },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_GUI_SETTINGS,
      uiLanguage: "zh-CN",
    });
    expect(DEFAULT_GUI_SETTINGS.uiLanguage).toBe("system");
  });

  it("records shortcuts and clears with Backspace", () => {
    const { onChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));

    const screenshot = screen.getByRole("button", {
      name: "Capture screenshot",
    });
    fireEvent.click(screenshot);
    fireEvent.keyDown(screenshot, {
      key: "4",
      code: "Digit4",
      metaKey: true,
      shiftKey: true,
    });
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_GUI_SETTINGS,
      screenshotShortcut: "Shift+Meta+Digit4",
    });

    const voice = screen.getByRole("button", { name: "Voice input" });
    fireEvent.click(voice);
    fireEvent.keyDown(voice, { key: "Backspace", code: "Backspace" });
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_GUI_SETTINGS,
      voiceShortcut: "",
    });
  });

  it("rejects a shortcut already assigned to the other action", () => {
    const onChange = vi.fn();
    render(
      <SettingsDialog
        open
        initialSection="shortcuts"
        settings={{
          ...DEFAULT_GUI_SETTINGS,
          screenshotShortcut: "Shift+Meta+Digit4",
        }}
        onChange={onChange}
        onClose={vi.fn()}
        update={NO_UPDATE}
      />,
    );
    const voice = screen.getByRole("button", { name: "Voice input" });
    fireEvent.click(voice);
    fireEvent.keyDown(voice, {
      key: "4",
      code: "Digit4",
      metaKey: true,
      shiftKey: true,
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("This shortcut is already in use.")).toBeTruthy();
  });

  it("closes on Escape and on a backdrop click, but not from inside", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(document.querySelector(".modal-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

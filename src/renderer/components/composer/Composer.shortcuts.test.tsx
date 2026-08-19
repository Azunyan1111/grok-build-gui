// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../lib/i18n";
import type { ComposerProps } from "./Composer";
import { Composer } from "./Composer";

function props(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    value: "",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    disabled: false,
    busy: false,
    permissionMode: "auto",
    onPermissionModeChange: vi.fn(),
    models: {
      currentModelId: null,
      currentReasoningEffort: null,
      availableModels: [],
    },
    onModelChange: vi.fn(),
    ...overrides,
  };
}

describe("Composer shortcuts", () => {
  afterEach(cleanup);

  it("captures a region once from the configured shortcut", () => {
    const capture = vi.fn();
    render(
      <Composer
        {...props({
          onCaptureScreenshot: capture,
          screenshotShortcut: "Shift+Meta+Digit4",
          primaryShortcutTarget: true,
        })}
      />,
    );

    fireEvent.keyDown(window, {
      code: "Digit4",
      key: "4",
      metaKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(window, {
      code: "Digit4",
      key: "4",
      metaKey: true,
      shiftKey: true,
      repeat: true,
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("region");
  });

  it("does not steal a primary shortcut from another editable field", () => {
    const capture = vi.fn();
    render(
      <>
        <input aria-label="Other input" />
        <Composer
          {...props({
            onCaptureScreenshot: capture,
            screenshotShortcut: "F8",
            primaryShortcutTarget: true,
          })}
        />
      </>,
    );
    const other = screen.getByLabelText("Other input");
    fireEvent.keyDown(other, { code: "F8", key: "F8" });
    expect(capture).not.toHaveBeenCalled();
  });

  it("shows the configured voice shortcut in the prompt", () => {
    render(<Composer {...props({ voiceShortcut: "F8" })} />);
    expect(
      screen.getByPlaceholderText(/Hold F8 to speak/),
    ).toBeTruthy();
  });
});

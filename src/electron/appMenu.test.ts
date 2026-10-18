import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => template),
  setApplicationMenu: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getVersion: () => "0.1.4" },
  BrowserWindow: {},
  Menu: electron,
}));

import {
  buildMacApplicationMenuTemplate,
  installMacApplicationMenu,
} from "./appMenu";

describe("macOS application menu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps Command+Q to the application quit role", () => {
    const template = buildMacApplicationMenuTemplate();
    const applicationMenu = template[0];
    const quitItem = Array.isArray(applicationMenu.submenu)
      ? applicationMenu.submenu.find(
          (item) => "role" in item && item.role === "quit",
        )
      : undefined;

    expect(applicationMenu.label).toBe("Grok GUI");
    expect(quitItem).toMatchObject({
      role: "quit",
      accelerator: "Command+Q",
    });
  });

  it("installs the macOS application menu", () => {
    installMacApplicationMenu();
    expect(electron.buildFromTemplate).toHaveBeenCalledOnce();
    expect(electron.setApplicationMenu).toHaveBeenCalledOnce();
  });
});

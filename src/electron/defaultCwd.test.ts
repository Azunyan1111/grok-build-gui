import { describe, expect, it } from "vitest";
import path from "node:path";
import { pickDefaultCwd } from "./defaultCwd";

const home = path.resolve("/Users/tester");

describe("pickDefaultCwd", () => {
  it("keeps a shell-launched working directory", () => {
    const cwd = path.resolve("/Users/tester/code/app");
    expect(
      pickDefaultCwd({ cwd, exePath: path.resolve("/Applications/Grok.app/Contents/MacOS/Grok"), home }),
    ).toBe(cwd);
  });

  it("rejects the install directory a packaged launch reports", () => {
    // Packaged Windows: process.cwd() is the install tree, and an agent run
    // there writes files the next update deletes.
    const exePath = path.resolve("/Programs/grok-gui/Grok Build GUI.exe");
    expect(
      pickDefaultCwd({ cwd: path.resolve("/Programs/grok-gui"), exePath, home }),
    ).toBe(home);
    expect(
      pickDefaultCwd({ cwd: path.resolve("/Programs/grok-gui/resources"), exePath, home }),
    ).toBe(home);
  });

  it("rejects a cwd inside the macOS Electron bundle", () => {
    expect(
      pickDefaultCwd({
        cwd: "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS",
        exePath: "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        home,
      }),
    ).toBe(home);
  });

  it("rejects a rootless or empty cwd", () => {
    const exePath = path.resolve("/Programs/grok-gui/Grok Build GUI.exe");
    expect(pickDefaultCwd({ cwd: "/", exePath, home })).toBe(home);
    expect(pickDefaultCwd({ cwd: "", exePath, home })).toBe(home);
  });
});

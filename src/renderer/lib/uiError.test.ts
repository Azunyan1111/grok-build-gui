import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { localizeUiError } from "./uiError";

const t = ((key: string) => `[${key}]`) as unknown as TFunction<"translation">;

describe("localizeUiError", () => {
  it("localizes the agent's generic internal error in any casing", () => {
    expect(localizeUiError("Internal error", t)).toBe("[errors.internalError]");
    expect(localizeUiError("internal error", t)).toBe("[errors.internalError]");
    expect(localizeUiError("Internal error: context window exceeded", t)).toBe(
      "[errors.internalError]",
    );
  });

  it("falls back to the supplied translation key for an empty error", () => {
    expect(localizeUiError("", t, "composer.promptFailed")).toBe(
      "[composer.promptFailed]",
    );
  });

  it("keeps unknown error text as-is", () => {
    expect(localizeUiError("Some other failure", t)).toBe("Some other failure");
  });
});

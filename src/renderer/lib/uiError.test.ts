import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { localizeUiError } from "./uiError";

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts?.detail ? `[${key}:${String(opts.detail)}]` : `[${key}]`) as unknown as
  TFunction<"translation">;

describe("localizeUiError", () => {
  it("localizes the agent's bare internal error in any casing", () => {
    expect(localizeUiError("Internal error", t)).toBe("[errors.internalError]");
    expect(localizeUiError("internal error", t)).toBe("[errors.internalError]");
    expect(localizeUiError("Internal error.", t)).toBe(
      "[errors.internalError]",
    );
  });

  it("blames the context window only when the agent says so", () => {
    expect(localizeUiError("Internal error: context window exceeded", t)).toBe(
      "[errors.contextWindowExceeded]",
    );
    expect(localizeUiError("context_length_exceeded", t)).toBe(
      "[errors.contextWindowExceeded]",
    );
  });

  it("reports an exhausted plan as a quota problem, not an internal error", () => {
    expect(
      localizeUiError("Internal error: your team has exhausted its quota", t),
    ).toBe("[errors.quotaExhausted]");
    expect(
      localizeUiError("Internal error: 429 Too Many Requests", t),
    ).toBe("[errors.quotaExhausted]");
    expect(
      localizeUiError("Internal error: subscription credits exhausted", t),
    ).toBe("[errors.quotaExhausted]");
  });

  it("keeps an unclassified internal-error detail visible", () => {
    expect(localizeUiError("Internal error: upstream connect failed", t)).toBe(
      "[errors.internalErrorDetail:upstream connect failed]",
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

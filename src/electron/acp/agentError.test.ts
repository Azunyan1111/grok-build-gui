import { describe, expect, it } from "vitest";
import { describeAgentError } from "./agentError";

class RequestErrorLike extends Error {
  constructor(
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

describe("describeAgentError", () => {
  it("keeps the bare message when the failure carries no data", () => {
    expect(describeAgentError(new RequestErrorLike("Internal error"))).toBe(
      "Internal error",
    );
  });

  it("appends a string data payload", () => {
    expect(
      describeAgentError(new RequestErrorLike("Internal error", "quota used")),
    ).toBe("Internal error: quota used");
  });

  it("digs the cause out of a nested data object", () => {
    const err = new RequestErrorLike("Internal error", {
      error: { message: "429 rate limited" },
    });
    expect(describeAgentError(err)).toBe("Internal error: 429 rate limited");
  });

  it("falls back to JSON for a shapeless data payload", () => {
    const err = new RequestErrorLike("Internal error", { status: 402 });
    expect(describeAgentError(err)).toBe('Internal error: {"status":402}');
  });

  it("does not repeat a detail already present in the message", () => {
    const err = new RequestErrorLike("Internal error: boom", "boom");
    expect(describeAgentError(err)).toBe("Internal error: boom");
  });

  it("handles non-Error rejections", () => {
    expect(describeAgentError("plain string")).toBe("plain string");
  });
});

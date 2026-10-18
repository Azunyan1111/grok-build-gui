import { describe, expect, it, vi } from "vitest";
import { createBeforeQuitHandler } from "./appQuit";

describe("application quit", () => {
  it("waits for cleanup once and then allows the application to quit", async () => {
    let finishCleanup = () => {};
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    const quit = vi.fn();
    const handler = createBeforeQuitHandler(cleanup, quit);
    const firstEvent = { preventDefault: vi.fn() };
    const repeatedEvent = { preventDefault: vi.fn() };

    handler(firstEvent);
    handler(repeatedEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();

    finishCleanup();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    const finalEvent = { preventDefault: vi.fn() };
    handler(finalEvent);
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePanelSessionKey } from "./usePanelSessionKey";

function setup(activeId: string | null = null) {
  return renderHook(({ id }: { id: string | null }) => usePanelSessionKey(id), {
    initialProps: { id: activeId },
  });
}

describe("usePanelSessionKey", () => {
  it("carries the new-chat key through provisional and real ids", () => {
    const { result, rerender } = setup(null);
    const draft = result.current.panelSessionKey;

    rerender({ id: "local:pending-1" });
    expect(result.current.panelSessionKey).toBe(draft);

    rerender({ id: "sess-1" });
    expect(result.current.panelSessionKey).toBe(draft);
  });

  it("restores a chat's key when the user comes back to it", () => {
    const { result, rerender } = setup(null);
    const draft = result.current.panelSessionKey;
    rerender({ id: "sess-1" });

    act(() => result.current.enterSession("sess-2"));
    const other = result.current.panelSessionKey;
    rerender({ id: "sess-2" });
    expect(result.current.panelSessionKey).toBe(other);
    expect(other).not.toBe(draft);

    act(() => result.current.enterSession("sess-1"));
    rerender({ id: "sess-1" });
    expect(result.current.panelSessionKey).toBe(draft);
  });

  it("gives every new chat its own key", () => {
    const { result, rerender } = setup(null);
    const first = result.current.panelSessionKey;
    rerender({ id: "sess-1" });

    act(() => result.current.enterSession(null));
    rerender({ id: null });

    expect(result.current.panelSessionKey).not.toBe(first);
  });

  it("drops a settled key when the focused chat disappears", () => {
    const { result, rerender } = setup(null);
    rerender({ id: "sess-1" });
    const settled = result.current.panelSessionKey;

    // Deleting the active chat clears activeId without a switch.
    rerender({ id: null });

    expect(result.current.panelSessionKey).not.toBe(settled);
  });
});

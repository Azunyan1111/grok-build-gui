// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSplitTabs } from "./useSplitTabs";
import type { SplitEntry } from "./types";

const browserClose = vi.fn();
const terminalKill = vi.fn();

beforeEach(() => {
  browserClose.mockClear();
  terminalKill.mockClear();
  (window as unknown as { grok: unknown }).grok = {
    browserClose,
    terminalKill,
  };
});

function setup(entry: SplitEntry = "home", sessionKey = "chat:a") {
  const onCollapse = vi.fn();
  const onRestore = vi.fn();
  const view = renderHook(
    (props: { sessionKey?: string; open?: boolean }) =>
      useSplitTabs({
        placement: "right",
        entry,
        open: props.open ?? true,
        size: 320,
        focusTool: null,
        sessionKey: props.sessionKey,
        onCollapse,
        onRestore,
      }),
    { initialProps: { sessionKey, open: true } as { sessionKey?: string; open?: boolean } },
  );
  return { ...view, onCollapse, onRestore };
}

function openFileView(
  result: { current: ReturnType<typeof useSplitTabs> },
  path: string,
  root?: string,
) {
  act(() => {
    result.current.openTool("fileview", {
      fileView: { path, root, mode: "diff", oldText: "ONE.", newText: "TWO." },
    });
  });
}

describe("useSplitTabs per-session tabs", () => {
  it("hides another chat's tabs and restores them on return", () => {
    const { result, rerender, onCollapse, onRestore } = setup();
    act(() => result.current.openTool("browser"));
    const browserId = result.current.tabs[0]!.id;

    rerender({ sessionKey: "chat:b", open: true });

    expect(result.current.tabs).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
    expect(onCollapse).toHaveBeenCalled();
    // Parked, not closed — the webview must survive the switch.
    expect(browserClose).not.toHaveBeenCalled();

    rerender({ sessionKey: "chat:a", open: true });

    expect(result.current.tabs.map((t) => t.id)).toEqual([browserId]);
    expect(result.current.activeId).toBe(browserId);
    expect(onRestore).toHaveBeenCalled();
  });

  it("keeps file views with the chat that opened them", () => {
    const { result, rerender } = setup();
    openFileView(result, "/tmp/alpha.txt");

    rerender({ sessionKey: "chat:b", open: true });
    expect(result.current.tabs).toHaveLength(0);

    rerender({ sessionKey: "chat:a", open: true });
    expect(result.current.tabs.map((t) => t.fileView?.path)).toEqual([
      "/tmp/alpha.txt",
    ]);
  });

  it("does not re-open the panel for a chat that was left collapsed", () => {
    const { result, rerender, onRestore, onCollapse } = setup();
    act(() => result.current.openTool("browser"));

    // Collapse, then leave and come back.
    rerender({ sessionKey: "chat:a", open: false });
    rerender({ sessionKey: "chat:b", open: false });
    rerender({ sessionKey: "chat:a", open: false });

    expect(result.current.tabs).toHaveLength(1);
    expect(onRestore).not.toHaveBeenCalled();
    expect(onCollapse).toHaveBeenCalled();
  });

  it("tears down the least recently focused chat's tabs", () => {
    const { result, rerender } = setup();
    act(() => result.current.openTool("browser"));
    const doomedId = result.current.tabs[0]!.id;

    // Seven chats in total: the first one falls out of the retained set.
    for (const key of ["b", "c", "d", "e", "f", "g"]) {
      rerender({ sessionKey: `chat:${key}`, open: true });
      act(() => result.current.openTool("terminal"));
    }

    expect(browserClose).toHaveBeenCalledWith(doomedId);

    rerender({ sessionKey: "chat:a", open: true });
    expect(result.current.tabs).toHaveLength(0);
  });

  it("leaves tabs alone when the panel has no session identity", () => {
    const { result, rerender } = setup("terminal", undefined);
    act(() => result.current.openTool("browser"));
    const ids = result.current.tabs.map((t) => t.id);

    rerender({ sessionKey: undefined, open: true });

    expect(result.current.tabs.map((t) => t.id)).toEqual(ids);
    expect(browserClose).not.toHaveBeenCalled();
  });

  it("does not merge the same relative path from different session roots", () => {
    const { result } = setup();
    openFileView(result, "report.xlsx", "/workspace/one");
    openFileView(result, "report.xlsx", "/workspace/two");

    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.tabs.map((tab) => tab.fileView?.root)).toEqual([
      "/workspace/one",
      "/workspace/two",
    ]);
  });

  it("does not merge the same relative path from different session roots", () => {
    const { result } = setup();
    openFileView(result, "report.xlsx", "/workspace/one");
    openFileView(result, "report.xlsx", "/workspace/two");

    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.tabs.map((tab) => tab.fileView?.root)).toEqual([
      "/workspace/one",
      "/workspace/two",
    ]);
  });
});

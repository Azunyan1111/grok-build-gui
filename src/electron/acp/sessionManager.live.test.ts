import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

const runLiveTest = process.env.GROK_GUI_LIVE_TEST === "1";
type CapturedEvent = { channel: string; payload: unknown };

function streamedAgentText(events: CapturedEvent[]): string {
  return events
    .filter(({ channel, payload }) => {
      const update = (payload as { update?: { sessionUpdate?: unknown } }).update;
      return (
        channel === "agent:session-update" &&
        update?.sessionUpdate === "agent_message_chunk"
      );
    })
    .map(({ payload }) => {
      const update = (
        payload as { update: { content?: { text?: unknown } } }
      ).update;
      return typeof update.content?.text === "string"
        ? update.content.text
        : "";
    })
    .join("");
}

describe.skipIf(!runLiveTest)("Grok Build session lifecycle", () => {
  it(
    "creates a chat, receives a response, reloads its history, and deletes it",
    async () => {
      const { SessionManager } = await import("./sessionManager.js");
      const cwd = process.cwd();
      const events: CapturedEvent[] = [];
      const window = {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => {
            if (
              channel === "agent:session-update" ||
              channel === "agent:turn" ||
              channel === "agent:history-end"
            ) {
              events.push({ channel, payload });
            }
          },
        },
      };
      const first = new SessionManager();
      let second: typeof first | null = null;
      let sessionId: string | null = null;

      first.setWindow(window as never);
      try {
        const connected = await first.connect(cwd);
        expect(connected.status).toBe("ready");

        const created = await first.newSession(cwd);
        expect(created.status).toBe("ready");
        sessionId = created.status === "ready" ? created.sessionId : null;
        expect(sessionId).toBeTruthy();

        const prompted = await first.prompt(
          "Reply with exactly GROK_GUI_OK and do not use tools.",
          [],
          sessionId ?? undefined,
          [],
        );
        expect(prompted).toEqual({ ok: true });
        expect(
          events.some(
            ({ channel, payload }) =>
              channel === "agent:turn" &&
              (payload as { status?: unknown }).status === "stopped",
          ),
        ).toBe(true);
        expect(streamedAgentText(events)).toContain("GROK_GUI_OK");

        await first.disconnect();
        second = new SessionManager();
        second.setWindow(window as never);
        const reconnected = await second.connect(cwd);
        expect(reconnected.status).toBe("ready");

        const loaded = await second.loadSession(sessionId ?? "", cwd);
        expect(loaded.status).toBe("ready");
        const historyEnd = events
          .slice()
          .reverse()
          .find(
            ({ channel, payload }) =>
              channel === "agent:history-end" &&
              (payload as { sessionId?: unknown }).sessionId === sessionId,
          );
        expect(historyEnd).toBeDefined();
        expect(JSON.stringify(historyEnd)).toContain("GROK_GUI_OK");

        const deleted = await second.deleteSession(sessionId ?? "", {
          emitSessions: false,
        });
        expect(deleted).toEqual({ ok: true });
        sessionId = null;
      } finally {
        if (sessionId) {
          await (second ?? first).deleteSession(sessionId, {
            emitSessions: false,
          });
        }
        await second?.disconnect();
        await first.disconnect();
      }
    },
    120_000,
  );
});

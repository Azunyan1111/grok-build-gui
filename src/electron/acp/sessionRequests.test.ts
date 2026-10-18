import { describe, expect, it } from "vitest";
import { loadSessionRequest, newSessionRequest } from "./sessionRequests";

const meta = {
  yoloMode: false,
  autoMode: true,
  permission_mode: "auto",
};

describe("ACP session requests", () => {
  it("creates a session without exposing any MCP servers", () => {
    expect(newSessionRequest("/workspace", meta)).toEqual({
      cwd: "/workspace",
      mcpServers: [],
      _meta: meta,
    });
  });

  it("loads a session without exposing any MCP servers", () => {
    expect(loadSessionRequest("session-1", "/workspace", meta)).toEqual({
      sessionId: "session-1",
      cwd: "/workspace",
      mcpServers: [],
      _meta: meta,
    });
  });
});

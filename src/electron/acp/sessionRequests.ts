import type {
  LoadSessionRequest,
  NewSessionRequest,
} from "@agentclientprotocol/sdk";

type SessionRequestMeta = NonNullable<NewSessionRequest["_meta"]>;

export function newSessionRequest(
  cwd: string,
  meta: SessionRequestMeta,
): NewSessionRequest {
  return {
    cwd,
    mcpServers: [],
    _meta: meta,
  };
}

export function loadSessionRequest(
  sessionId: string,
  cwd: string,
  meta: SessionRequestMeta,
): LoadSessionRequest {
  return {
    sessionId,
    cwd,
    mcpServers: [],
    _meta: meta,
  };
}

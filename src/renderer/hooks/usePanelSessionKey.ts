import { useCallback, useEffect, useRef, useState } from "react";
import { isProvisionalSessionId } from "../lib/sessionList";

/** Opaque identity for one chat's side-panel tab set. */
export type PanelSessionKey = string;

/**
 * Stable identity for "which chat owns the side panel's tabs".
 *
 * A chat reaches its real session id late — new-chat draft (`activeId` null) →
 * provisional row → agent id — so keying panel state on `activeId` alone would
 * scatter one chat's tabs across three buckets. Instead the key is minted once
 * and every id the focused chat later adopts is aliased back onto it.
 */
export function usePanelSessionKey(activeId: string | null): {
  panelSessionKey: PanelSessionKey;
  /** Call before switching chats (see `App.leaveSession`). */
  enterSession: (sessionId: string | null) => void;
} {
  const seqRef = useRef(0);
  const aliasRef = useRef(new Map<string, PanelSessionKey>());
  const mintDraft = useCallback(() => `draft:${seqRef.current++}`, []);
  const [key, setKey] = useState<PanelSessionKey>(mintDraft);
  const keyRef = useRef(key);
  /** True once the live key belongs to a settled (non-provisional) chat. */
  const claimedRef = useRef(false);

  const apply = useCallback((next: PanelSessionKey, claimed: boolean) => {
    keyRef.current = next;
    claimedRef.current = claimed;
    setKey(next);
  }, []);

  const bind = useCallback(
    (sessionId: string, next: PanelSessionKey) => {
      aliasRef.current.set(sessionId, next);
      apply(next, !isProvisionalSessionId(sessionId));
    },
    [apply],
  );

  const enterSession = useCallback(
    (sessionId: string | null) => {
      if (!sessionId) {
        // Every new chat starts on its own empty panel.
        apply(mintDraft(), false);
        return;
      }
      bind(sessionId, aliasRef.current.get(sessionId) ?? `chat:${sessionId}`);
    },
    [apply, bind, mintDraft],
  );

  // Id changes the user did not ask for: first send adopting an id, or the
  // focused chat disappearing (delete / side-task close).
  useEffect(() => {
    if (!activeId) {
      // A settled key must not leak its tabs into the new-chat screen.
      if (claimedRef.current) apply(mintDraft(), false);
      return;
    }
    const known = aliasRef.current.get(activeId);
    if (known) {
      bind(activeId, known);
      return;
    }
    // Unclaimed key: this is the draft the user just sent, now wearing an id.
    bind(activeId, claimedRef.current ? `chat:${activeId}` : keyRef.current);
  }, [activeId, apply, bind, mintDraft]);

  return { panelSessionKey: key, enterSession };
}

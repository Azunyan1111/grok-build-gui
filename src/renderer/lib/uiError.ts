import type { TFunction } from "i18next";
import type { TranslationKey } from "../locales/en";

const KNOWN_ERRORS: Readonly<Record<string, TranslationKey>> = {
  "The Grok authentication bridge is unavailable.": "auth.bridgeUnavailable",
  "Could not sign in to Grok.": "auth.signInFailed",
  "Grok is not signed in.": "auth.notSignedInDetail",
  "Not signed in": "auth.notSignedInDetail",
  "Not signed in — run `grok login` or set XAI_API_KEY.":
    "auth.notSignedInDetail",
  "Terminal is not running": "tools.terminalNotRunning",
  "Live voice is unavailable — restart the app after update.":
    "composer.voiceUnavailable",
  "Microphone permission denied.": "composer.microphoneDenied",
  "Microphone permission denied — allow mic for this app.":
    "composer.microphoneAllow",
  "Speech recognition connect timed out.":
    "composer.voiceConnectTimeout",
  "Speech recognition failed.": "composer.voiceFailed",
  "Could not connect to speech recognition (check network / SuperGrok).":
    "composer.voiceConnectFailed",
  "Speech recognition connection error.":
    "composer.voiceConnectionError",
  "Speech recognition closed before ready.":
    "composer.voiceClosedBeforeReady",
  "Speech recognition unauthorized — run `grok login` or set XAI_API_KEY.":
    "composer.voiceUnauthorized",
  "No speech detected — try speaking closer to the mic.":
    "composer.voiceNoSpeech",
  "Recording too short — try again.": "composer.voiceTooShort",
  "Speech recognition timed out.": "composer.voiceTimedOut",
  "Speech recognition timed out waiting for transcript.":
    "composer.voiceTimedOut",
  "Speech recognition returned invalid JSON.":
    "composer.voiceInvalidResponse",
};

const CONTEXT_WINDOW_PATTERNS: readonly RegExp[] = [
  /context[ _-]?(window|length|limit|size)/i,
  /context_length_exceeded/i,
  /maximum context/i,
  /(prompt|input|message) is too long/i,
  /too many tokens/i,
  /token limit/i,
];

const QUOTA_PATTERNS: readonly RegExp[] = [
  /quota/i,
  /credits?\b/i,
  /billing/i,
  /insufficient[ _-]?(funds|balance|credit)/i,
  /(usage|plan|monthly|daily) limit/i,
  /rate[ _-]?limit/i,
  /too many requests/i,
  /\b429\b/,
  /out of (credits|tokens|usage)/i,
  /subscription/i,
  /payment required/i,
  /\b402\b/,
];

/**
 * `null` when `raw` is not the agent's generic internal error; otherwise the
 * cause appended after it (empty string when the agent sent none).
 */
function internalErrorDetail(raw: string): string | null {
  const match = /internal(?: json-?rpc)? error/i.exec(raw);
  if (!match) return null;
  const rest = raw.slice(match.index + match[0].length);
  return rest.replace(/^[\s:;,.\u2014\u2013-]+/, "").trim();
}

export function localizeUiError(
  error: string | null | undefined,
  t: TFunction<"translation">,
  fallbackKey?: TranslationKey,
): string {
  const raw = error?.trim();
  if (!raw) return fallbackKey ? t(fallbackKey) : "";

  const exact = KNOWN_ERRORS[raw];
  if (exact) return t(exact);

  if (
    raw ===
    "Grok session expired or rejected. Run `grok login` to re-authenticate."
  ) {
    return t("auth.sessionExpired");
  }

  // Fatal backend failures reach us as a generic "Internal error", sometimes
  // with the real cause appended from the JSON-RPC `data` payload. Classify on
  // that detail — blaming the context window for every one of them sends users
  // to start a new chat when the account simply ran out of quota.
  const detail = internalErrorDetail(raw);
  const classified = detail ?? raw;

  if (CONTEXT_WINDOW_PATTERNS.some((re) => re.test(classified))) {
    return t("errors.contextWindowExceeded");
  }
  if (QUOTA_PATTERNS.some((re) => re.test(classified))) {
    return t("errors.quotaExhausted");
  }
  if (detail !== null) {
    return detail
      ? t("errors.internalErrorDetail", { detail })
      : t("errors.internalError");
  }

  return raw;
}

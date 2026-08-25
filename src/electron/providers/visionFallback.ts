/**
 * Image understanding for models that cannot see.
 *
 * DeepSeek V4 Flash and V4 Pro are text-only, so an attached screenshot would
 * either be dropped or rejected upstream. This module sends the attachments to
 * a multimodal model instead — Qwen3-VL over OpenRouter by default — and
 * returns a transcription that can be spliced into the prompt as plain text.
 *
 * Settings are plain JSON so the settings UI can render them; the API key is
 * encrypted through the shared vault and never leaves the main process.
 */

import fs from "node:fs";
import path from "node:path";
import type { SecretVault } from "./tokenStore.js";

/**
 * Reads a screenshot accurately in seconds for a fraction of a cent. The free
 * stealth alternatives measured far worse: Ox Alpha rate-limits or answers
 * empty after minutes of waiting, and the free Nemotron/Gemma tiers either
 * throttle or hallucinate — a wrong transcript is worse than none, because the
 * blind model has no way to tell.
 */
export const DEFAULT_VISION_MODEL = "qwen/qwen3-vl-30b-a3b-instruct";
export const DEFAULT_VISION_BASE_URL = "https://openrouter.ai/api/v1";

/** A transcription pass is a single non-streaming call, but images are slow. */
const REQUEST_TIMEOUT_MS = 180_000;
/** Free stealth models 429/502 under load — retry briefly. */
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1_500;
/** Upstream states worth another try; a rate limit often clears in seconds. */
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
/** Guard the upstream payload; base64 inflates the original bytes by ~4/3. */
const MAX_TOTAL_BASE64_BYTES = 24 * 1024 * 1024;
const MAX_IMAGES = 8;
const MAX_OUTPUT_TOKENS = 8_000;

const SETTINGS_FILE = "vision-fallback.json";
const KEY_FILE = "vision-fallback-key.bin";

const SYSTEM_PROMPT = [
  "You are the eyes of another AI assistant that cannot see images.",
  "Report the attached image(s) so completely that the assistant can act on them without seeing them.",
  "",
  "For each image, in order:",
  "- Transcribe every piece of visible text verbatim, preserving line breaks, spelling, and case. Never translate, summarize, or correct it.",
  "- Reproduce code, logs, stack traces, terminal output, and error messages exactly, inside a fenced code block, naming the language when it is clear.",
  "- Reproduce tables and structured data as Markdown tables, keeping every row.",
  "- For interface screenshots, describe the layout and name the visible controls, labels, states (selected, disabled, error), and how they are arranged.",
  "- For charts and diagrams, state the type, the axes, labels, and legend, and the values or relationships they encode.",
  "- Describe non-text content (photographs, drawings, people, objects, colors) plainly.",
  "",
  "Say what you cannot make out instead of guessing.",
  "Do not answer the assistant's task, do not give advice, and do not comment on your own role — report only what the image(s) contain.",
].join("\n");

export type VisionFallbackSettings = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  /** True when a key is stored; the key itself never reaches the renderer. */
  hasApiKey: boolean;
};

export type VisionFallbackInput = {
  enabled: boolean;
  baseUrl?: string;
  model?: string;
  /** Omit to keep the stored key; empty string clears it. */
  apiKey?: string;
};

export type VisionImage = { data: string; mimeType: string };

/** The pass only posts to one URL. Keeping this narrow lets Electron's
 * proxy-aware `net.fetch` and the standard fetch interoperate. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type VisionDescription =
  | { ok: true; text: string }
  | { ok: false; error: string };

export const DEFAULT_VISION_FALLBACK: VisionFallbackSettings = {
  enabled: false,
  baseUrl: DEFAULT_VISION_BASE_URL,
  model: DEFAULT_VISION_MODEL,
  hasApiKey: false,
};

function writeFileAtomic(file: string, data: Buffer): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Persisted configuration for the fallback pass. */
export class VisionFallbackStore {
  private readonly dir: string;
  private readonly vault: SecretVault;

  constructor(options: { dir: string; vault: SecretVault }) {
    this.dir = options.dir;
    this.vault = options.vault;
  }

  private settingsPath(): string {
    return path.join(this.dir, SETTINGS_FILE);
  }

  private keyPath(): string {
    return path.join(this.dir, KEY_FILE);
  }

  read(): VisionFallbackSettings {
    let stored: Partial<VisionFallbackSettings> = {};
    try {
      const parsed: unknown = JSON.parse(
        fs.readFileSync(this.settingsPath(), "utf8"),
      );
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        stored = parsed as Partial<VisionFallbackSettings>;
      }
    } catch {
      // No settings yet — the defaults below describe an unconfigured fallback.
    }
    return {
      enabled: stored.enabled === true,
      baseUrl: normalizeBaseUrl(stored.baseUrl ?? "") || DEFAULT_VISION_BASE_URL,
      model: stored.model?.trim() || DEFAULT_VISION_MODEL,
      hasApiKey: Boolean(this.getApiKey()),
    };
  }

  getApiKey(): string | null {
    try {
      return this.vault.decrypt(fs.readFileSync(this.keyPath())) || null;
    } catch {
      return null;
    }
  }

  save(input: VisionFallbackInput): VisionFallbackSettings {
    fs.mkdirSync(this.dir, { recursive: true });
    if (input.apiKey !== undefined) {
      if (input.apiKey) {
        writeFileAtomic(this.keyPath(), this.vault.encrypt(input.apiKey));
      } else {
        fs.rmSync(this.keyPath(), { force: true });
      }
    }
    const settings = {
      enabled: input.enabled,
      baseUrl: normalizeBaseUrl(input.baseUrl ?? "") || DEFAULT_VISION_BASE_URL,
      model: input.model?.trim() || DEFAULT_VISION_MODEL,
    };
    writeFileAtomic(
      this.settingsPath(),
      Buffer.from(`${JSON.stringify(settings, null, 2)}\n`, "utf8"),
    );
    return { ...settings, hasApiKey: Boolean(this.getApiKey()) };
  }
}

function errorSummary(status: number, body: string): string {
  const raw = body.trim();
  if (!raw) return `HTTP ${status}`;
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    const detail =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.error?.message === "string"
          ? parsed.error.message
          : typeof parsed.message === "string"
            ? parsed.message
            : "";
    if (detail) return `HTTP ${status}: ${detail}`;
  } catch {
    // Fall through to the raw body for non-JSON errors.
  }
  return `HTTP ${status}: ${raw.slice(0, 500)}`;
}

/**
 * A failed upstream call. OpenRouter often answers 200 with an `{ error }`
 * body — a provider being rate-limited or 502-ing shows up here, not in the
 * HTTP status — so callers must inspect the body even on a 2xx response.
 */
function readBodyError(body: unknown): string | null {
  const error = (body as { error?: unknown })?.error;
  if (!error) return null;
  if (typeof error === "string") return error.trim() || null;
  if (typeof error !== "object") return null;

  const message = (error as { message?: unknown }).message;
  const code = (error as { code?: unknown }).code;
  // Provider passthroughs stash the human-readable reason under metadata.raw.
  const raw = (error as { metadata?: { raw?: unknown } }).metadata?.raw;
  const detail =
    typeof raw === "string" && raw.trim()
      ? raw.trim()
      : typeof message === "string" && message.trim()
        ? message.trim()
        : "Upstream error";
  return typeof code === "number" ? `HTTP ${code}: ${detail}` : detail;
}

/** The numeric code from a 200-body error, for deciding whether to retry. */
function bodyErrorCode(body: unknown): number | undefined {
  const code = (body as { error?: { code?: unknown } })?.error?.code;
  return typeof code === "number" ? code : undefined;
}

function isTransientStatus(code: number | undefined): boolean {
  return code !== undefined && TRANSIENT_STATUS.has(code);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Pull the assistant text out of a chat-completions response. */
function readCompletionText(body: unknown): string {
  const choices = (body as { choices?: unknown })?.choices;
  if (!Array.isArray(choices)) return "";
  const parts: string[] = [];
  const reasoning: string[] = [];
  for (const choice of choices) {
    const message = (choice as {
      message?: { content?: unknown; reasoning?: unknown };
    })?.message;
    const content = message?.content;
    if (typeof content === "string") {
      parts.push(content);
    } else if (Array.isArray(content)) {
      // Some gateways answer with the multipart content shape.
      for (const part of content) {
        const text = (part as { text?: unknown })?.text;
        if (typeof text === "string") parts.push(text);
      }
    }
    if (typeof message?.reasoning === "string") reasoning.push(message.reasoning);
  }
  const text = parts.join("\n").trim();
  // Ox Alpha is a reasoning model: under a tight token budget it can leave
  // `content` empty and put the whole description in the reasoning channel.
  // Prefer real content, but fall back rather than report nothing.
  return text || reasoning.join("\n").trim();
}

/**
 * Transcribe images with a multimodal model. `userText` is passed as context so
 * the pass emphasizes what the request actually needs, not so it answers it.
 */
export async function describeImages(options: {
  images: VisionImage[];
  userText: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  /** Retry policy for transient upstream errors; tests override the delay. */
  retry?: { attempts?: number; delayMs?: number };
}): Promise<VisionDescription> {
  const base = normalizeBaseUrl(options.baseUrl);
  const model = options.model.trim();
  if (!base) return { ok: false, error: "No vision endpoint is configured." };
  if (!model) return { ok: false, error: "No vision model is configured." };
  if (!options.apiKey) {
    return { ok: false, error: "No API key is stored for the vision model." };
  }

  const images = options.images.filter((image) => image.data && image.mimeType);
  if (images.length === 0) return { ok: false, error: "No images to read." };
  if (images.length > MAX_IMAGES) {
    return {
      ok: false,
      error: `Too many images for one pass (${images.length}, limit ${MAX_IMAGES}).`,
    };
  }
  const totalBytes = images.reduce((sum, image) => sum + image.data.length, 0);
  if (totalBytes > MAX_TOTAL_BASE64_BYTES) {
    return {
      ok: false,
      error: `The attachments are too large to transcribe (${Math.round(totalBytes / 1024 / 1024)} MB).`,
    };
  }

  const task = options.userText.trim();
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: task
        ? `The assistant was asked the following, so cover whatever it needs — but do not answer it yourself:\n\n${task}`
        : "No accompanying request was given; report the image(s) in full.",
    },
    ...images.map((image) => ({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    })),
  ];

  const payload: Record<string, unknown> = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
  };
  // Transcription does not need deep thinking, and Ox Alpha reasons at max by
  // default. OpenRouter is the only endpoint documented to accept this field.
  if (/(?:^|\.)openrouter\.ai$/.test(hostOf(base))) {
    payload.reasoning = { effort: "low" };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Title": "Grok GUI",
  };

  const fetchImpl = options.fetchImpl ?? fetch;
  const body = JSON.stringify(payload);

  type Attempt =
    | { ok: true; text: string }
    | { ok: false; error: string; transient: boolean };

  const attemptOnce = async (): Promise<Attempt> => {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A dropped connection or timeout is worth another try.
      return {
        ok: false,
        transient: true,
        error:
          error instanceof Error
            ? `Could not reach ${base}: ${error.message}`
            : `Could not reach ${base}.`,
      };
    }

    if (!response.ok) {
      let text = "";
      try {
        text = await response.text();
      } catch {
        // Keep the status code even when the body cannot be read.
      }
      return {
        ok: false,
        transient: isTransientStatus(response.status),
        error: errorSummary(response.status, text),
      };
    }

    // Read as text, not `.json()`: while a slow provider thinks, OpenRouter
    // holds the connection open with whitespace padding, and a stream that
    // dies mid-wait leaves nothing but that padding behind.
    let raw: string;
    try {
      raw = (await response.text()).trim();
    } catch (error) {
      return {
        ok: false,
        transient: true,
        error:
          error instanceof Error
            ? `${model} dropped the connection: ${error.message}`
            : `${model} dropped the connection.`,
      };
    }
    if (!raw) {
      // Padding with no payload: the upstream hung up before answering.
      return {
        ok: false,
        transient: true,
        error: `${model} closed the connection without answering.`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        transient: false,
        error: `${model} did not return JSON: ${raw.slice(0, 200)}`,
      };
    }

    // OpenRouter reports a rate-limited or failing provider in the body with a
    // 200 status, so surface that instead of a misleading "no description".
    const bodyError = readBodyError(parsed);
    if (bodyError) {
      return {
        ok: false,
        transient: isTransientStatus(bodyErrorCode(parsed)),
        error: bodyError,
      };
    }

    const described = readCompletionText(parsed);
    if (!described) {
      // Keep a hint of the shape so a silent empty answer is diagnosable.
      return {
        ok: false,
        transient: false,
        error: `${model} returned no description (${raw.slice(0, 150)}).`,
      };
    }
    return { ok: true, text: described };
  };

  const attempts = Math.max(1, options.retry?.attempts ?? DEFAULT_RETRY_ATTEMPTS);
  const delayMs = options.retry?.delayMs ?? DEFAULT_RETRY_DELAY_MS;
  let last: Attempt = { ok: false, transient: false, error: "No attempt ran." };
  for (let i = 0; i < attempts; i++) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    last = await attemptOnce();
    if (last.ok) return { ok: true, text: last.text };
    if (!last.transient) return { ok: false, error: last.error };
  }
  return { ok: false, error: last.error };
}

/**
 * Wrap a transcription for injection into the prompt. The blind model must know
 * the images are gone and that the text below stands in for them.
 */
export function renderVisionTranscript(options: {
  text: string;
  model: string;
  imageCount: number;
}): string {
  const noun =
    options.imageCount === 1 ? "an image" : `${options.imageCount} images`;
  return [
    `<image_transcription model="${options.model}">`,
    `The user attached ${noun} that you cannot see, so ${options.model} read them for you.`,
    "Treat the following as your only view of the attachment(s):",
    "",
    options.text,
    "</image_transcription>",
  ].join("\n");
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plaintextVault } from "./tokenStore";
import {
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
  VisionFallbackStore,
  describeImages,
  renderVisionTranscript,
} from "./visionFallback";

const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vision-"));
  dirs.push(dir);
  return dir;
}

function store(): VisionFallbackStore {
  return new VisionFallbackStore({ dir: tempDir(), vault: plaintextVault });
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completion(text: string): unknown {
  return { choices: [{ message: { role: "assistant", content: text } }] };
}

const call = {
  images: [{ data: "aGVsbG8=", mimeType: "image/png" }],
  userText: "What does this error say?",
  baseUrl: DEFAULT_VISION_BASE_URL,
  model: DEFAULT_VISION_MODEL,
  apiKey: "sk-or-1",
};

describe("VisionFallbackStore", () => {
  it("starts disabled on the Qwen3-VL defaults", () => {
    expect(store().read()).toEqual({
      enabled: false,
      baseUrl: DEFAULT_VISION_BASE_URL,
      model: DEFAULT_VISION_MODEL,
      hasApiKey: false,
    });
  });

  it("keeps the stored key when the input omits one", () => {
    const s = store();
    s.save({ enabled: true, apiKey: "sk-or-1" });
    expect(s.save({ enabled: false }).hasApiKey).toBe(true);
    expect(s.getApiKey()).toBe("sk-or-1");
    expect(s.read()).toEqual({
      enabled: false,
      baseUrl: DEFAULT_VISION_BASE_URL,
      model: DEFAULT_VISION_MODEL,
      hasApiKey: true,
    });
  });

  it("clears the key on an empty string", () => {
    const s = store();
    s.save({ enabled: true, apiKey: "sk-or-1" });
    expect(s.save({ enabled: true, apiKey: "" }).hasApiKey).toBe(false);
    expect(s.getApiKey()).toBeNull();
  });

  it("normalizes a trailing slash and falls back to the defaults", () => {
    const saved = store().save({
      enabled: true,
      baseUrl: "https://relay.example.com/v1/",
      model: "  ",
    });
    expect(saved.baseUrl).toBe("https://relay.example.com/v1");
    expect(saved.model).toBe(DEFAULT_VISION_MODEL);
  });
});

describe("describeImages", () => {
  it("posts the images as data URLs and returns the transcription", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(completion("ReferenceError: x is not defined")),
    );

    const result = await describeImages({
      ...call,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      text: "ReferenceError: x is not defined",
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-or-1",
    );
    const body = JSON.parse(init.body as string) as {
      model: string;
      reasoning?: { effort: string };
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.model).toBe(DEFAULT_VISION_MODEL);
    // Transcription does not need a reasoning model's max-effort default.
    expect(body.reasoning).toEqual({ effort: "low" });
    const parts = body.messages[1]!.content as Array<Record<string, unknown>>;
    expect(parts[0]).toEqual({
      type: "text",
      text: expect.stringContaining("What does this error say?") as string,
    });
    expect(parts[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,aGVsbG8=" },
    });
  });

  it("omits the reasoning hint for a non-OpenRouter endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(completion("a chart")));

    await describeImages({
      ...call,
      baseUrl: "https://relay.example.com/v1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).not.toHaveProperty("reasoning");
  });

  it("reads the multipart content shape some gateways return", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: [{ type: "text", text: "a form" }] } }],
      }),
    );

    await expect(
      describeImages({
        ...call,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ ok: true, text: "a form" });
  });

  it("surfaces the upstream error message without retrying a 404", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "No endpoints found" } }, 404),
    );

    const result = await describeImages({
      ...call,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: { delayMs: 0 },
    });

    expect(result).toEqual({
      ok: false,
      error: "HTTP 404: No endpoints found",
    });
    // A 404 is permanent — one attempt, no retry.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces a provider error returned in a 200 body", async () => {
    // OpenRouter answers 200 while the stealth provider is rate-limited.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        error: {
          message: "Provider returned error",
          code: 429,
          metadata: { raw: "stealth/ox-alpha is temporarily rate-limited." },
        },
      }),
    );

    const result = await describeImages({
      ...call,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: { delayMs: 0 },
    });

    expect(result).toEqual({
      ok: false,
      error: "HTTP 429: stealth/ox-alpha is temporarily rate-limited.",
    });
    // 429 is transient — it should have retried before giving up.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a transient upstream error and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 502 } }))
      .mockResolvedValueOnce(jsonResponse(completion("A green circle.")));

    const result = await describeImages({
      ...call,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: { attempts: 3, delayMs: 0 },
    });

    expect(result).toEqual({ ok: true, text: "A green circle." });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to the reasoning channel when content is empty", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          { message: { content: null, reasoning: "A sidebar with four items." } },
        ],
      }),
    );

    await expect(
      describeImages({
        ...call,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ ok: true, text: "A sidebar with four items." });
  });

  it("reports an unreachable endpoint", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    const result = await describeImages({
      ...call,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: { delayMs: 0 },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Could not reach");
  });

  it("refuses to call without a key, a model, or images", async () => {
    const fetchImpl = vi.fn();
    const asFetch = fetchImpl as unknown as typeof fetch;

    expect(
      await describeImages({ ...call, apiKey: "", fetchImpl: asFetch }),
    ).toEqual({ ok: false, error: "No API key is stored for the vision model." });
    expect(
      await describeImages({ ...call, model: " ", fetchImpl: asFetch }),
    ).toEqual({ ok: false, error: "No vision model is configured." });
    expect(
      await describeImages({ ...call, images: [], fetchImpl: asFetch }),
    ).toEqual({ ok: false, error: "No images to read." });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an answer with no text rather than sending an empty transcript", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [] }));
    const result = await describeImages({
      ...call,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
  });
});

describe("renderVisionTranscript", () => {
  it("tells the blind model the images are gone", () => {
    const block = renderVisionTranscript({
      text: "A login form.",
      model: DEFAULT_VISION_MODEL,
      imageCount: 2,
    });
    expect(block).toContain(`<image_transcription model="${DEFAULT_VISION_MODEL}">`);
    expect(block).toContain("2 images");
    expect(block).toContain("A login form.");
    expect(block.endsWith("</image_transcription>")).toBe(true);
  });
});

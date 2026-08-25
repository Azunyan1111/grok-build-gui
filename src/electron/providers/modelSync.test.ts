import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenSet } from "./types";
import { DEFAULT_VISION_MODEL } from "./visionFallback";

const dirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const hoisted = vi.hoisted(() => ({
  userData: "",
  loginResult: null as TokenSet | null,
}));

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.userData },
  // Resolved per call so a test can stub `fetch` and still be seen through it.
  net: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openExternal: async () => {} },
}));

vi.mock("./openaiOauth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./openaiOauth")>();
  return {
    ...actual,
    startLogin: () => ({
      completed: Promise.resolve(hoisted.loginResult!),
      cancel: () => {},
    }),
  };
});

function paidTokens(): TokenSet {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = {
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: "user@example.com",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acc-1",
      chatgpt_plan_type: "pro",
    },
  };
  return {
    accessToken: `${encode({ alg: "none" })}.${encode(payload)}.sig`,
    refreshToken: "rt-1",
    idToken: null,
  };
}

const relayEndpoint = {
  label: "My relay",
  baseUrl: "https://relay.example.com/v1",
  apiBackend: "chat_completions" as const,
  presetId: "custom",
  apiKey: "sk-relay-secret",
  models: [{ id: "deepseek-chat", label: "DeepSeek V4", contextWindow: 128_000 }],
};

function configText(): string {
  return fs.readFileSync(
    path.join(process.env.GROK_HOME!, "config.toml"),
    "utf8",
  );
}

beforeEach(() => {
  vi.resetModules();
  hoisted.userData = tempDir("grok-gui-userdata-");
  hoisted.loginResult = paidTokens();
  process.env.GROK_HOME = tempDir("grok-gui-grokhome-");
});

afterEach(async () => {
  const provider = await import("./chatgptProvider.js");
  await provider.shutdownChatGptProvider().catch(() => {});
  delete process.env.GROK_HOME;
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("syncManagedModelConfig", () => {
  it("writes subscription and endpoint models into one block", async () => {
    const provider = await import("./chatgptProvider.js");
    const sync = await import("./modelSync.js");

    await provider.loginToChatGpt();
    await sync.saveEndpoint(relayEndpoint);

    const config = configText();
    expect(config).toContain("[model.chatgpt-gpt-5-6-sol]");
    expect(config).toContain("[model.chatgpt-gpt-5-6-terra]");
    expect(config).toContain("[model.chatgpt-gpt-5-6-luna]");
    expect(config).toContain("[model.chatgpt-gpt-5-5]");
    expect(config).toContain("[model.chatgpt-gpt-5-2]");
    expect(config).not.toContain("gpt-5-3");
    expect(config).toContain("[model.custom-deepseek-chat]");
    // One managed region, not two competing ones.
    expect(config.match(/grok-gui managed models — edited/g)).toHaveLength(1);
  });

  it("keeps endpoint models when the subscription signs out", async () => {
    const provider = await import("./chatgptProvider.js");
    const sync = await import("./modelSync.js");

    await provider.loginToChatGpt();
    await sync.saveEndpoint(relayEndpoint);
    await provider.logoutFromChatGpt();
    await sync.syncManagedModelConfig();

    const config = configText();
    expect(config).not.toContain("[model.chatgpt-");
    expect(config).toContain("[model.custom-deepseek-chat]");
  });

  it("keeps subscription models when an endpoint is removed", async () => {
    const provider = await import("./chatgptProvider.js");
    const sync = await import("./modelSync.js");

    await provider.loginToChatGpt();
    const saved = await sync.saveEndpoint(relayEndpoint);
    expect(saved.ok).toBe(true);

    await sync.removeEndpoint(sync.listEndpoints()[0]!.id);

    const config = configText();
    expect(config).toContain("[model.chatgpt-");
    expect(config).not.toContain("custom-deepseek-chat");
  });

  it("never writes an endpoint key into the agent config", async () => {
    const sync = await import("./modelSync.js");
    await sync.saveEndpoint(relayEndpoint);

    const config = configText();
    expect(config).not.toContain("sk-relay-secret");
    expect(config).toContain("env_key = ");
    // The key reaches the agent through its environment instead.
    expect(Object.values(sync.managedModelEnvironment())).toContain(
      "sk-relay-secret",
    );
  });

  it("refuses an endpoint with no URL", async () => {
    const sync = await import("./modelSync.js");
    const result = await sync.saveEndpoint({ ...relayEndpoint, baseUrl: "  " });

    expect(result).toEqual({ ok: false, error: "An endpoint URL is required." });
    expect(sync.listEndpoints()).toEqual([]);
  });
});

describe("visionModelChain", () => {
  it("puts a backup behind the configured OpenRouter model", async () => {
    const { visionModelChain } = await import("./modelSync.js");
    const chain = visionModelChain(
      "https://openrouter.ai/api/v1",
      "stealth/ox-alpha",
    );
    expect(chain[0]).toBe("stealth/ox-alpha");
    expect(chain.length).toBeGreaterThan(1);
  });

  it("never repeats a model already chosen as the primary", async () => {
    const { visionModelChain } = await import("./modelSync.js");
    const chain = visionModelChain(
      "https://openrouter.ai/api/v1",
      "qwen/qwen3-vl-30b-a3b-instruct",
    );
    expect(new Set(chain).size).toBe(chain.length);
  });

  it("leaves a non-OpenRouter endpoint with only its own model", async () => {
    const { visionModelChain } = await import("./modelSync.js");
    expect(visionModelChain("https://api.vendor.com/v1", "vendor-vl")).toEqual([
      "vendor-vl",
    ]);
  });
});

describe("describeImagesForBlindModel", () => {
  const deepSeekEndpoint = {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiBackend: "chat_completions" as const,
    presetId: "deepseek",
    apiKey: "sk-deepseek",
    models: [
      { id: "deepseek-v4-pro", label: "V4 Pro", contextWindow: 128_000 },
    ],
  };
  const images = [{ data: "aGk=", mimeType: "image/png" }];

  it("leaves the images alone for a model that is not known to be blind", async () => {
    const sync = await import("./modelSync.js");
    await sync.saveEndpoint(relayEndpoint);

    await expect(
      sync.describeImagesForBlindModel({
        modelKey: "custom-deepseek-chat",
        images: [],
        userText: "hi",
      }),
    ).resolves.toEqual({ status: "not-needed" });
    await expect(
      sync.describeImagesForBlindModel({
        modelKey: "grok-4",
        images,
        userText: "hi",
      }),
    ).resolves.toEqual({ status: "not-needed" });
  });

  it("says what to do when a blind model has no fallback configured", async () => {
    const sync = await import("./modelSync.js");
    await sync.saveEndpoint(deepSeekEndpoint);

    const disabled = await sync.describeImagesForBlindModel({
      modelKey: "custom-deepseek-v4-pro",
      images,
      userText: "read this",
    });
    expect(disabled.status).toBe("unavailable");
    expect(disabled.status === "unavailable" && disabled.reason).toContain(
      "Settings",
    );

    sync.saveVisionFallbackSettings({ enabled: true });
    const keyless = await sync.describeImagesForBlindModel({
      modelKey: "custom-deepseek-v4-pro",
      images,
      userText: "read this",
    });
    expect(keyless.status).toBe("unavailable");
    expect(keyless.status === "unavailable" && keyless.reason).toContain(
      "API key",
    );
  });

  it("transcribes with a saved OpenRouter key when the fallback has none", async () => {
    const sync = await import("./modelSync.js");
    await sync.saveEndpoint(deepSeekEndpoint);
    await sync.saveEndpoint({
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiBackend: "chat_completions",
      presetId: "openrouter",
      apiKey: "sk-or-shared",
      models: [
        { id: "stealth/ox-alpha", label: "Ox Alpha", contextWindow: 1_048_576 },
      ],
    });
    sync.saveVisionFallbackSettings({ enabled: true });

    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "A stack trace." } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await expect(
        sync.describeImagesForBlindModel({
          modelKey: "custom-deepseek-v4-pro",
          images,
          userText: "read this",
        }),
      ).resolves.toEqual({
        status: "described",
        text: "A stack trace.",
        // The configured model — the first link of the chain — answered.
        model: DEFAULT_VISION_MODEL,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-or-shared",
    );
  });
});

/**
 * Single owner of the agent's managed model configuration.
 *
 * Two sources feed it — subscription models behind the local relay, and
 * user-added endpoints — and they share one marker-delimited block in
 * `config.toml`. Writing must therefore go through here: if each source wrote
 * its own entries, whichever ran last would erase the other's.
 */

import path from "node:path";
import { app, net } from "electron";
import { safeStorage } from "electron";
import { ensureChatGptModels } from "./chatgptProvider.js";
import {
  CustomEndpointStore,
  type CustomEndpoint,
  type CustomEndpointInput,
} from "./customEndpoints.js";
import { syncManagedModels } from "./customModels.js";
import {
  discoverModels,
  type DiscoveryResult,
} from "./modelDiscovery.js";
import { detectModelVisionCapability } from "./modelVisionCapabilities.js";
import { plaintextVault, type SecretVault } from "./tokenStore.js";
import {
  describeImages,
  VisionFallbackStore,
  type VisionFallbackInput,
  type VisionFallbackSettings,
  type VisionImage,
} from "./visionFallback.js";

/**
 * Models to fall back on when the configured one fails, in order. Both read
 * images well; they differ in who is likely to be down at the time.
 */
const VISION_BACKUP_MODELS = [
  "qwen/qwen3-vl-30b-a3b-instruct",
  "stealth/ox-alpha",
] as const;

let endpointStore: CustomEndpointStore | null = null;
let visionStore: VisionFallbackStore | null = null;

function createVault(): SecretVault {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return {
        encrypted: true,
        encrypt: (plain) => safeStorage.encryptString(plain),
        decrypt: (payload) => safeStorage.decryptString(payload),
      };
    }
  } catch {
    // Fall through to the plaintext vault below.
  }
  return plaintextVault;
}

function providerDir(): string {
  return path.join(app.getPath("userData"), "providers");
}

function getEndpointStore(): CustomEndpointStore {
  if (!endpointStore) {
    endpointStore = new CustomEndpointStore({
      dir: providerDir(),
      vault: createVault(),
    });
  }
  return endpointStore;
}

function getVisionStore(): VisionFallbackStore {
  if (!visionStore) {
    visionStore = new VisionFallbackStore({
      dir: providerDir(),
      vault: createVault(),
    });
  }
  return visionStore;
}

/**
 * Rewrite the managed block from both sources. Must run before the agent is
 * spawned: the relay's port and token change on every launch.
 */
export async function syncManagedModelConfig(): Promise<void> {
  const subscription = await ensureChatGptModels();
  syncManagedModels([...subscription, ...getEndpointStore().managedModels()]);
}

/**
 * Credentials for the agent process. Vendor keys travel in the environment so
 * they never reach `config.toml`, which users copy and share.
 */
export function managedModelEnvironment(): Record<string, string> {
  return getEndpointStore().environment();
}

export function listEndpoints(): CustomEndpoint[] {
  return getEndpointStore().list();
}

export async function saveEndpoint(
  input: CustomEndpointInput,
): Promise<{ ok: true; endpoint: CustomEndpoint } | { ok: false; error: string }> {
  if (!input.baseUrl.trim()) {
    return { ok: false, error: "An endpoint URL is required." };
  }
  try {
    const endpoint = getEndpointStore().upsert(input);
    await syncManagedModelConfig();
    return { ok: true, endpoint };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function removeEndpoint(endpointId: string): Promise<void> {
  getEndpointStore().remove(endpointId);
  await syncManagedModelConfig();
}

export function getVisionFallbackSettings(): VisionFallbackSettings {
  return getVisionStore().read();
}

export function saveVisionFallbackSettings(
  input: VisionFallbackInput,
): VisionFallbackSettings {
  return getVisionStore().save(input);
}

/**
 * Whether the model behind an agent model key can read images. Undefined when
 * neither the endpoint catalog nor the vendor rules decide — the images are
 * then left alone rather than rewritten on a guess.
 */
function modelReadsImages(modelKey: string): boolean | undefined {
  const source = getEndpointStore().managedModelSource(modelKey);
  if (source) {
    return detectModelVisionCapability({
      presetId: source.endpoint.presetId,
      modelId: source.model.id,
    }).supportsVision;
  }
  // A hand-written `[model.custom-…]` entry still names its upstream model.
  return detectModelVisionCapability({
    presetId: "custom",
    modelId: modelKey.replace(/^custom-/, ""),
  }).supportsVision;
}

/** Credential for the fallback pass, borrowing a saved OpenRouter key. */
function visionApiKey(baseUrl: string): string | null {
  const own = getVisionStore().getApiKey();
  if (own) return own;
  const store = getEndpointStore();
  const shared = store
    .list()
    .find(
      (endpoint) =>
        endpoint.hasApiKey &&
        (endpoint.presetId === "openrouter" ||
          endpoint.baseUrl.includes("openrouter.ai")) &&
        baseUrl.includes("openrouter.ai"),
    );
  return shared ? store.getApiKey(shared.id) : null;
}

/**
 * Models to try, in order, for one transcription. Any single provider can be
 * rate-limited or down, so an OpenRouter key gets alternates behind its choice
 * rather than losing the attachment to one bad upstream.
 */
export function visionModelChain(
  baseUrl: string,
  configured: string,
): string[] {
  const primary = configured.trim();
  const chain = primary ? [primary] : [];
  if (!baseUrl.includes("openrouter.ai")) return chain;
  for (const backup of VISION_BACKUP_MODELS) {
    if (!chain.includes(backup)) chain.push(backup);
  }
  return chain;
}

export type ImageFallbackOutcome =
  /** The model reads images itself, or is not known to be blind. */
  | { status: "not-needed" }
  /** The model cannot see and no usable fallback is configured. */
  | { status: "unavailable"; reason: string }
  | { status: "described"; text: string; model: string };

/**
 * Transcribe attachments for a model that cannot see them. Returns
 * `not-needed` whenever the images can travel as they are, so callers only
 * rewrite a prompt when the fallback actually produced something.
 */
export async function describeImagesForBlindModel(options: {
  modelKey: string | null | undefined;
  images: VisionImage[];
  userText: string;
}): Promise<ImageFallbackOutcome> {
  if (options.images.length === 0 || !options.modelKey?.trim()) {
    return { status: "not-needed" };
  }
  if (modelReadsImages(options.modelKey.trim()) !== false) {
    return { status: "not-needed" };
  }

  const settings = getVisionFallbackSettings();
  if (!settings.enabled) {
    return {
      status: "unavailable",
      reason:
        "Turn on image reading under Settings → Model providers to attach images to a text-only model.",
    };
  }
  const apiKey = visionApiKey(settings.baseUrl);
  if (!apiKey) {
    return {
      status: "unavailable",
      reason: `Add an API key for ${settings.model} under Settings → Model providers.`,
    };
  }

  // Try the configured model first, then the backups: upstream providers go
  // down or rate-limit often enough that one failure must not cost the user
  // their screenshot.
  const candidates = visionModelChain(settings.baseUrl, settings.model);
  const failures: string[] = [];
  for (const model of candidates) {
    const result = await describeImages({
      images: options.images,
      userText: options.userText,
      baseUrl: settings.baseUrl,
      model,
      apiKey,
      // `net.fetch` follows Electron/Chromium's system proxy and PAC routing,
      // which a vendor endpoint often needs.
      fetchImpl: net.fetch,
    });
    if (result.ok) return { status: "described", text: result.text, model };
    failures.push(`${model}: ${result.error}`);
  }
  return { status: "unavailable", reason: failures.join(" | ") };
}

/**
 * Probe an endpoint's catalog. A saved endpoint may omit the key to reuse the
 * stored one, so the form never has to round-trip a secret.
 */
export function discoverEndpointModels(options: {
  endpointId?: string;
  baseUrl: string;
  apiKey?: string;
  apiBackend: CustomEndpointInput["apiBackend"];
  presetId?: string;
}): Promise<DiscoveryResult> {
  const stored = options.endpointId
    ? getEndpointStore().getApiKey(options.endpointId)
    : null;
  return discoverModels({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey ?? stored ?? "",
    apiBackend: options.apiBackend,
    presetId: options.presetId,
  });
}

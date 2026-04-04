export { VERSION } from "./version";

import { createLogger } from "./logger";
import type { LockoLogger } from "./logger";

export interface ConfigEntry {
  key: string;
  value: string;
  value_type: string;
  is_secret: boolean;
}

export interface ConfigMetadata {
  contentHash: string;
  environment: string;
  service: string;
}

export class LockoApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(`Locko API error (${statusCode}): ${message}`);
    this.name = "LockoApiError";
    this.statusCode = statusCode;
  }
}

export interface GetConfigOptions {
  override?: boolean;
}

export interface LockoClientOptions {
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  /** Override the API base URL (e.g. for staging). Defaults to https://api-locko.barelyacompany.com */
  baseUrl?: string;
  /** Service slug appended as ?service_slug=<value> — required for lko_ prefixed keys. */
  serviceSlug?: string;
  /** Enable debug logging. Can also be set via LOCKO_DEBUG=1 env var. */
  debug?: boolean;
}

interface LockoApiPayload {
  content_hash: string;
  environment: string;
  service: string;
  data: ConfigEntry[];
}

interface LockoApiResponse {
  success: boolean;
  code: number;
  message: string;
  payload: LockoApiPayload;
}

type FetchResult =
  | { entries: ConfigEntry[]; metadata: ConfigMetadata; warning: null }
  | { entries: null; metadata: null; warning: string };

export class LockoClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private _cache: FetchResult | null = null;
  private readonly _prefetch: Promise<FetchResult>;

  private readonly API_URL: string;
  private readonly DEFAULT_TIMEOUT_MS = 3_000;
  private readonly DEFAULT_BASE_URL = "https://api-locko.barelyacompany.com";
  private readonly logger: LockoLogger;
  private readonly fetch: typeof globalThis.fetch;

  constructor(apiKey: string, options?: LockoClientOptions) {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("apiKey is required");
    }

    const isOrgKey = apiKey.startsWith("lko_");
    if (isOrgKey && (!options?.serviceSlug || options.serviceSlug.trim() === "")) {
      throw new Error("serviceSlug is required for org API keys (lko_ prefix)");
    }

    this.apiKey = apiKey;
    this.timeoutMs = options?.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    this.fetch = options?.fetch ?? globalThis.fetch;
    this.logger = createLogger(options?.debug ?? false);

    const base = (options?.baseUrl ?? this.DEFAULT_BASE_URL).replace(/\/$/, "");
    const slug = options?.serviceSlug;
    this.API_URL = `${base}/api/api-keys/config${slug ? `?service_slug=${encodeURIComponent(slug)}` : ""}`;

    this.logger.log("Client initialized", {
      url: this.API_URL,
      keyPrefix: apiKey.slice(0, 8) + "… (masked)",
      keyType: isOrgKey ? "org (lko_)" : "service (lk_)",
      serviceSlug: slug ?? null,
      timeoutMs: this.timeoutMs,
    });

    this._prefetch = this.runPrefetch();
  }

  async initialize(): Promise<void> {
    if (!this._cache) {
      this._cache = await this._prefetch;
    }
  }

  getConfig(options?: GetConfigOptions): Record<string, string> {
    const { entries, warning } = this.resolvedCache();
    if (warning) console.warn(warning);

    const envMap = processEnvToMap();
    if (!entries) return envMap;

    const lockoMap = entriesToMap(entries);
    return options?.override
      ? { ...envMap, ...lockoMap }
      : { ...lockoMap, ...envMap };
  }

  getSecrets(options?: GetConfigOptions): Record<string, string> {
    const { entries, warning } = this.resolvedCache();
    if (warning) console.warn(warning);

    if (!entries) return processEnvToMap();

    const result: Record<string, string> = {};
    for (const entry of entries.filter((e) => e.is_secret)) {
      const envVal = process.env[entry.key];
      result[entry.key] =
        options?.override || envVal === undefined ? entry.value : envVal;
    }
    return result;
  }

  getVariables(options?: GetConfigOptions): Record<string, string> {
    const { entries, warning } = this.resolvedCache();
    if (warning) console.warn(warning);

    if (!entries) return processEnvToMap();

    const result: Record<string, string> = {};
    for (const entry of entries.filter((e) => !e.is_secret)) {
      const envVal = process.env[entry.key];
      result[entry.key] =
        options?.override || envVal === undefined ? entry.value : envVal;
    }
    return result;
  }

  getMetadata(): ConfigMetadata | null {
    return this._cache?.metadata ?? null;
  }

  async injectIntoEnv(options?: { override?: boolean }): Promise<void> {
    await this.initialize();
    const { entries } = this._cache!;
    if (!entries) return;
    const override = options?.override ?? false;
    for (const entry of entries) {
      if (override || process.env[entry.key] === undefined) {
        process.env[entry.key] = entry.value;
      }
    }
  }

  private resolvedCache(): FetchResult {
    return (
      this._cache ?? {
        entries: null,
        metadata: null,
        warning:
          "[Locko] getConfig() called before initialize() — " +
          "using process environment only. Call await client.initialize() at startup.",
      }
    );
  }

  private async runPrefetch(): Promise<FetchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const { entries, metadata } = await Promise.race([
        this.fetchEntries(controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError"))
          );
        }),
      ]);
      this.logger.log("Config loaded", {
        entryCount: entries.length,
        environment: metadata.environment,
        service: metadata.service,
      });
      return { entries, metadata, warning: null };
    } catch (err) {
      const reason = controller.signal.aborted
        ? `request timed out after ${this.timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      const warning = `[Locko] Failed to fetch remote config — ${reason}. Falling back to process environment.`;
      this.logger.warn(warning);
      return { entries: null, metadata: null, warning };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchEntries(
    signal?: AbortSignal
  ): Promise<{ entries: ConfigEntry[]; metadata: ConfigMetadata }> {
    this.logger.log("Sending request", { url: this.API_URL, method: "GET" });

    let response: Response;
    try {
      response = await this.fetch(this.API_URL, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
        },
        signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("Network request failed", { message });
      throw new Error(`Locko: network request failed — ${message}`);
    }

    this.logger.log("Response received", { status: response.status, ok: response.ok });

    if (!response.ok) {
      let body = "";
      try {
        body = await response.text();
      } catch {
      }
      const detail = body.trim() || response.statusText || "Unknown error";
      this.logger.error("API error response", { status: response.status, detail });
      throw new LockoApiError(response.status, detail);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      this.logger.error("Failed to parse response as JSON");
      throw new Error("Locko: failed to parse API response as JSON.");
    }

    const parsed = data as LockoApiResponse;
    if (!parsed?.payload || !Array.isArray(parsed.payload.data)) {
      this.logger.error("Unexpected response shape", { data });
      throw new Error(
        "Locko: unexpected API response shape — expected { payload: { data: [] } }."
      );
    }

    return {
      entries: parsed.payload.data,
      metadata: {
        contentHash: parsed.payload.content_hash,
        environment: parsed.payload.environment,
        service: parsed.payload.service,
      },
    };
  }
}

function processEnvToMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function entriesToMap(entries: ConfigEntry[]): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, entry) => {
    acc[entry.key] = entry.value;
    return acc;
  }, {});
}

export function createClient(
  apiKey: string,
  options?: LockoClientOptions
): LockoClient {
  return new LockoClient(apiKey, options);
}

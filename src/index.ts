export { VERSION } from "./version";

export interface ConfigEntry {
  key: string;
  value: string;
  secret: boolean;
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
}

type FetchResult =
  | { entries: ConfigEntry[]; warning: null }
  | { entries: null; warning: string };

export class LockoClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private _cache: FetchResult | null = null;
  private readonly _prefetch: Promise<FetchResult>;

  private readonly API_URL = "https://api-locko.barelyacompany.com/api/api-keys/config";
  private readonly ERROR_PREFIX = "[Locko-Error]";
  private readonly DEFAULT_TIMEOUT_MS = 3_000;
  private readonly logger: Console = console;
  private readonly fetch: typeof globalThis.fetch;

  constructor(apiKey: string, options?: LockoClientOptions) {
    if (!apiKey || apiKey.trim() === "") {
      const error = "apiKey is required";
      this.logger.error(`${this.ERROR_PREFIX} ${error}`);
      throw new Error(error);
    }

    this.apiKey = apiKey;
    this.timeoutMs = options?.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    this.fetch = options?.fetch ?? globalThis.fetch;
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
    for (const entry of entries.filter((e) => e.secret)) {
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
    for (const entry of entries.filter((e) => !e.secret)) {
      const envVal = process.env[entry.key];
      result[entry.key] =
        options?.override || envVal === undefined ? entry.value : envVal;
    }
    return result;
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
      const entries = await this.fetchEntries(controller.signal);
      return { entries, warning: null };
    } catch (err) {
      const reason = controller.signal.aborted
        ? `request timed out after ${this.timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      return {
        entries: null,
        warning: `[Locko] Failed to fetch remote config — ${reason}. Falling back to process environment.`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchEntries(signal?: AbortSignal): Promise<ConfigEntry[]> {
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
      throw new Error(`Locko: network request failed — ${message}`);
    }

    if (!response.ok) {
      let body = "";
      try {
        body = await response.text();
      } catch {
      }
      const detail = body.trim() || response.statusText || "Unknown error";
      throw new LockoApiError(response.status, detail);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("Locko: failed to parse API response as JSON.");
    }

    if (!Array.isArray(data)) {
      throw new Error(
        "Locko: unexpected API response shape — expected an array of config entries."
      );
    }

    return data as ConfigEntry[];
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

export { VERSION } from "./version";

const API_URL = "https://api-locko.barelyacompany.com/api/api-keys/config";

/**
 * Represents a single config/secret entry returned by the Locko API.
 */
export interface ConfigEntry {
  key: string;
  value: string;
  secret: boolean;
}

/**
 * Error thrown when the Locko API returns a non-2xx response.
 */
export class LockoApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(`Locko API error (${statusCode}): ${message}`);
    this.name = "LockoApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Client for the Locko secrets and config management API.
 */
export class LockoClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("Locko: apiKey is required and must not be empty.");
    }
    this.apiKey = apiKey;
  }

  /**
   * Fetches all config entries and returns them as a flat key→value map
   * (both secrets and plain variables).
   */
  async getConfig(): Promise<Record<string, string>> {
    const entries = await this.fetchEntries();
    return entriesToMap(entries);
  }

  /**
   * Fetches config entries and returns only those marked as secrets (`secret: true`).
   */
  async getSecrets(): Promise<Record<string, string>> {
    const entries = await this.fetchEntries();
    return entriesToMap(entries.filter((e) => e.secret === true));
  }

  /**
   * Fetches config entries and returns only those not marked as secrets (`secret: false`).
   */
  async getVariables(): Promise<Record<string, string>> {
    const entries = await this.fetchEntries();
    return entriesToMap(entries.filter((e) => e.secret === false));
  }

  /**
   * Fetches all config entries and writes them into `process.env`.
   *
   * Existing `process.env` keys are NOT overwritten unless `{ override: true }` is passed.
   */
  async injectIntoEnv(options?: { override?: boolean }): Promise<void> {
    const entries = await this.fetchEntries();
    const override = options?.override ?? false;
    for (const entry of entries) {
      if (override || process.env[entry.key] === undefined) {
        process.env[entry.key] = entry.value;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchEntries(): Promise<ConfigEntry[]> {
    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
        },
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
        // Ignore body-read errors; we already have the status.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entriesToMap(entries: ConfigEntry[]): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, entry) => {
    acc[entry.key] = entry.value;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Creates a new {@link LockoClient} instance.
 *
 * @example
 * ```ts
 * import { createClient } from "locko";
 *
 * const client = createClient(process.env.LOCKO_API_KEY!);
 * const config = await client.getConfig();
 * ```
 */
export function createClient(apiKey: string): LockoClient {
  return new LockoClient(apiKey);
}

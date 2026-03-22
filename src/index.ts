const DEFAULT_SERVER_URL = "https://api-locko.barelyacompany.com/api";

/**
 * Represents a single config/secret entry returned by the Locko API.
 */
export interface ConfigEntry {
  key: string;
  value: string;
  secret: boolean;
}

/**
 * Options for constructing a LockoClient.
 */
export interface LockoClientOptions {
  /** Your Locko API key. */
  apiKey: string;
  /**
   * Base URL of the Locko API server.
   * Defaults to https://api-locko.barelyacompany.com/api
   */
  serverUrl?: string;
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
  private readonly serverUrl: string;

  constructor(options: LockoClientOptions) {
    if (!options.apiKey || options.apiKey.trim() === "") {
      throw new Error("Locko: apiKey is required and must not be empty.");
    }

    this.apiKey = options.apiKey;
    // Normalise: strip trailing slash so we can always append paths cleanly.
    const base = options.serverUrl ?? DEFAULT_SERVER_URL;
    this.serverUrl = base.replace(/\/+$/, "");
  }

  /**
   * Fetches all config entries from the Locko API and returns them as a
   * flat key→value map (both secrets and plain variables).
   */
  async getConfig(): Promise<Record<string, string>> {
    const entries = await this.fetchEntries();
    return entriesToMap(entries);
  }

  /**
   * Fetches config entries and returns only those marked as secrets
   * (`secret: true`) as a flat key→value map.
   */
  async getSecrets(): Promise<Record<string, string>> {
    const entries = await this.fetchEntries();
    return entriesToMap(entries.filter((e) => e.secret === true));
  }

  /**
   * Fetches config entries and returns only those NOT marked as secrets
   * (`secret: false`) as a flat key→value map.
   */
  async getVariables(): Promise<Record<string, string>> {
    const entries = await this.fetchEntries();
    return entriesToMap(entries.filter((e) => e.secret === false));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchEntries(): Promise<ConfigEntry[]> {
    const url = `${this.serverUrl}/api-keys/config`;

    let response: Response;
    try {
      response = await fetch(url, {
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
 * const client = createClient({ apiKey: process.env.LOCKO_API_KEY! });
 * const config = await client.getConfig();
 * ```
 */
export function createClient(options: LockoClientOptions): LockoClient {
  return new LockoClient(options);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockoClient = exports.LockoApiError = void 0;
exports.createClient = createClient;
const DEFAULT_SERVER_URL = "https://api-locko.barelyacompany.com/api";
/**
 * Error thrown when the Locko API returns a non-2xx response.
 */
class LockoApiError extends Error {
    constructor(statusCode, message) {
        super(`Locko API error (${statusCode}): ${message}`);
        this.name = "LockoApiError";
        this.statusCode = statusCode;
    }
}
exports.LockoApiError = LockoApiError;
/**
 * Client for the Locko secrets and config management API.
 */
class LockoClient {
    constructor(options) {
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
    async getConfig() {
        const entries = await this.fetchEntries();
        return entriesToMap(entries);
    }
    /**
     * Fetches config entries and returns only those marked as secrets
     * (`secret: true`) as a flat key→value map.
     */
    async getSecrets() {
        const entries = await this.fetchEntries();
        return entriesToMap(entries.filter((e) => e.secret === true));
    }
    /**
     * Fetches config entries and returns only those NOT marked as secrets
     * (`secret: false`) as a flat key→value map.
     */
    async getVariables() {
        const entries = await this.fetchEntries();
        return entriesToMap(entries.filter((e) => e.secret === false));
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    async fetchEntries() {
        const url = `${this.serverUrl}/api-keys/config`;
        let response;
        try {
            response = await fetch(url, {
                method: "GET",
                headers: {
                    "X-API-Key": this.apiKey,
                    Accept: "application/json",
                },
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Locko: network request failed — ${message}`);
        }
        if (!response.ok) {
            let body = "";
            try {
                body = await response.text();
            }
            catch {
                // Ignore body-read errors; we already have the status.
            }
            const detail = body.trim() || response.statusText || "Unknown error";
            throw new LockoApiError(response.status, detail);
        }
        let data;
        try {
            data = await response.json();
        }
        catch {
            throw new Error("Locko: failed to parse API response as JSON.");
        }
        if (!Array.isArray(data)) {
            throw new Error("Locko: unexpected API response shape — expected an array of config entries.");
        }
        return data;
    }
}
exports.LockoClient = LockoClient;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function entriesToMap(entries) {
    return entries.reduce((acc, entry) => {
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
function createClient(options) {
    return new LockoClient(options);
}
//# sourceMappingURL=index.js.map
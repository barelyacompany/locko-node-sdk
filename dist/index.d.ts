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
export declare class LockoApiError extends Error {
    readonly statusCode: number;
    constructor(statusCode: number, message: string);
}
/**
 * Client for the Locko secrets and config management API.
 */
export declare class LockoClient {
    private readonly apiKey;
    private readonly serverUrl;
    constructor(options: LockoClientOptions);
    /**
     * Fetches all config entries from the Locko API and returns them as a
     * flat key→value map (both secrets and plain variables).
     */
    getConfig(): Promise<Record<string, string>>;
    /**
     * Fetches config entries and returns only those marked as secrets
     * (`secret: true`) as a flat key→value map.
     */
    getSecrets(): Promise<Record<string, string>>;
    /**
     * Fetches config entries and returns only those NOT marked as secrets
     * (`secret: false`) as a flat key→value map.
     */
    getVariables(): Promise<Record<string, string>>;
    private fetchEntries;
}
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
export declare function createClient(options: LockoClientOptions): LockoClient;
//# sourceMappingURL=index.d.ts.map
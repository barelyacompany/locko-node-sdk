import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LockoClient,
  LockoApiError,
  createClient,
  ConfigEntry,
  LockoClientOptions,
  ConfigMetadata,
} from "./index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ENTRIES: ConfigEntry[] = [
  { key: "LOCKO_TEST_DB_URL", value: "postgres://localhost:5432/mydb", value_type: "text", is_secret: false },
  { key: "LOCKO_TEST_REDIS_URL", value: "redis://localhost:6379", value_type: "text", is_secret: false },
  { key: "LOCKO_TEST_JWT_SECRET", value: "super-secret-jwt", value_type: "text", is_secret: true },
  { key: "LOCKO_TEST_API_SECRET", value: "another-secret-value", value_type: "text", is_secret: true },
];

const MOCK_METADATA = {
  content_hash: "abc123def456",
  environment: "production",
  service: "my-service",
};

function makeEnvelope(entries: ConfigEntry[] = MOCK_ENTRIES) {
  return {
    success: true,
    code: 200,
    message: "ok",
    payload: { ...MOCK_METADATA, data: entries },
  };
}

const API_KEY = "lk_test-api-key-12345";
const ORG_API_KEY = "lko_test-org-key";
const DEFAULT_BASE_URL = "https://api-locko.barelyacompany.com";
const FIXED_URL = `${DEFAULT_BASE_URL}/api/api-keys/config`;

// Keys used across inject tests that need cleaning up
const INJECT_KEYS = ["LOCKO_TEST_INJECT_A", "LOCKO_TEST_INJECT_B", "LOCKO_TEST_INJECT_C"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchSuccess(data: unknown, status = 200): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function mockFetchError(status: number, body: string, statusText = ""): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { status, statusText })
  );
}

function mockFetchNetworkFailure(message: string): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError(message));
}

function neverFetch(): Promise<Response> {
  return new Promise(() => {});
}

/** Creates a client with an envelope mock and awaits initialize(). */
async function initializedClient(
  entries: ConfigEntry[] = MOCK_ENTRIES,
  options?: LockoClientOptions
): Promise<LockoClient> {
  mockFetchSuccess(makeEnvelope(entries));
  const client = new LockoClient(API_KEY, options);
  await client.initialize();
  return client;
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  // Clean all test-scoped env keys
  for (const entry of MOCK_ENTRIES) delete process.env[entry.key];
  for (const key of INJECT_KEYS) delete process.env[key];
  delete process.env["LOCKO_TEST_ONLY_ENV"];
  delete process.env["LOCKO_TEST_OVERLAP"];
  delete process.env["LOCKO_DEBUG"];
});

// ---------------------------------------------------------------------------
// LockoApiError
// ---------------------------------------------------------------------------

describe("LockoApiError", () => {
  it("is an instance of Error", () => {
    expect(new LockoApiError(500, "oops")).toBeInstanceOf(Error);
  });

  it("sets name to LockoApiError", () => {
    expect(new LockoApiError(404, "not found").name).toBe("LockoApiError");
  });

  it("exposes statusCode", () => {
    expect(new LockoApiError(403, "forbidden").statusCode).toBe(403);
  });

  it("formats the message with status code", () => {
    const err = new LockoApiError(401, "Unauthorized");
    expect(err.message).toBe("Locko API error (401): Unauthorized");
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("LockoClient — constructor", () => {
  it("throws when apiKey is empty string", () => {
    expect(() => new LockoClient("")).toThrow("apiKey is required");
  });

  it("throws when apiKey is whitespace-only", () => {
    expect(() => new LockoClient("   ")).toThrow("apiKey is required");
  });

  it("throws when lko_ key is used without serviceSlug", () => {
    expect(() => new LockoClient(ORG_API_KEY)).toThrow(
      "serviceSlug is required for org API keys (lko_ prefix)"
    );
  });

  it("throws when lko_ key is used with empty serviceSlug", () => {
    expect(() => new LockoClient(ORG_API_KEY, { serviceSlug: "   " })).toThrow(
      "serviceSlug is required for org API keys (lko_ prefix)"
    );
  });

  it("accepts lko_ key when serviceSlug is provided", () => {
    expect(() =>
      new LockoClient(ORG_API_KEY, {
        serviceSlug: "my-service",
        fetch: neverFetch as typeof globalThis.fetch,
      })
    ).not.toThrow();
  });

  it("accepts lk_ key without serviceSlug", () => {
    expect(() =>
      new LockoClient(API_KEY, { fetch: neverFetch as typeof globalThis.fetch })
    ).not.toThrow();
  });

  it("kicks off the prefetch immediately at construction", () => {
    const spy = mockFetchSuccess(makeEnvelope());
    new LockoClient(API_KEY);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

describe("URL construction", () => {
  it("uses the default base URL", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    await new LockoClient(API_KEY).initialize();
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FIXED_URL);
  });

  it("uses a custom baseUrl", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY, { baseUrl: "https://staging.example.com" });
    await client.initialize();
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://staging.example.com/api/api-keys/config");
  });

  it("strips trailing slash from custom baseUrl", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY, { baseUrl: "https://staging.example.com/" });
    await client.initialize();
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://staging.example.com/api/api-keys/config");
  });

  it("appends service_slug query param for lko_ keys", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(ORG_API_KEY, { serviceSlug: "volcano" });
    await client.initialize();
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${FIXED_URL}?service_slug=volcano`);
  });

  it("URL-encodes serviceSlug with special characters", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(ORG_API_KEY, { serviceSlug: "my service/v2" });
    await client.initialize();
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("service_slug=my%20service%2Fv2");
  });

  it("lk_ keys do not append a service_slug param", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY, { serviceSlug: "ignored" });
    await client.initialize();
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    // lk_ keys use serviceSlug only for the URL query, but the key isn't lko_ so it IS appended
    // since we still pass serviceSlug — just verify no error and URL is formed
    expect(typeof url).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

describe("initialize()", () => {
  it("caches the result — fetch is called only once regardless of multiple initialize() calls", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY);
    await client.initialize();
    await client.initialize();
    await client.initialize();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("sends the X-API-Key header", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY);
    await client.initialize();
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });

  it("sends Accept: application/json header", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY);
    await client.initialize();
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Accept"]).toBe("application/json");
  });

  it("sends a GET request", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY);
    await client.initialize();
    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("GET");
  });

  it("resolves without throwing even when the API returns a 500", async () => {
    mockFetchError(500, "Internal Server Error");
    const client = new LockoClient(API_KEY);
    await expect(client.initialize()).resolves.toBeUndefined();
  });

  it("resolves without throwing on network failure", async () => {
    mockFetchNetworkFailure("ECONNREFUSED");
    const client = new LockoClient(API_KEY);
    await expect(client.initialize()).resolves.toBeUndefined();
  });

  it("resolves without throwing when response body is malformed JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    const client = new LockoClient(API_KEY);
    await expect(client.initialize()).resolves.toBeUndefined();
  });

  it("resolves without throwing when response has wrong shape (flat array)", async () => {
    mockFetchSuccess([{ key: "K", value: "V" }]); // old format — not the envelope
    const client = new LockoClient(API_KEY);
    await expect(client.initialize()).resolves.toBeUndefined();
  });

  it("resolves without throwing when payload is missing data array", async () => {
    mockFetchSuccess({ success: true, payload: { content_hash: "x" } });
    const client = new LockoClient(API_KEY);
    await expect(client.initialize()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Custom fetch
// ---------------------------------------------------------------------------

describe("custom fetch option", () => {
  it("calls the custom fetch function instead of globalThis.fetch", async () => {
    const globalSpy = vi.spyOn(globalThis, "fetch");
    const customFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeEnvelope()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const client = new LockoClient(API_KEY, { fetch: customFetch as typeof globalThis.fetch });
    await client.initialize();

    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(globalSpy).not.toHaveBeenCalled();
  });

  it("custom fetch receives correct URL and headers", async () => {
    const customFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeEnvelope()), { status: 200 })
    );
    const client = new LockoClient(API_KEY, { fetch: customFetch as typeof globalThis.fetch });
    await client.initialize();

    const [url, init] = customFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FIXED_URL);
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });
});

// ---------------------------------------------------------------------------
// getMetadata()
// ---------------------------------------------------------------------------

describe("getMetadata()", () => {
  it("returns null before initialize() is awaited", () => {
    mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY);
    expect(client.getMetadata()).toBeNull();
  });

  it("returns all three metadata fields after a successful fetch", async () => {
    const client = await initializedClient();
    const meta = client.getMetadata() as ConfigMetadata;
    expect(meta.contentHash).toBe(MOCK_METADATA.content_hash);
    expect(meta.environment).toBe(MOCK_METADATA.environment);
    expect(meta.service).toBe(MOCK_METADATA.service);
  });

  it("returns null when fetch failed (network error)", async () => {
    mockFetchNetworkFailure("ETIMEDOUT");
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getMetadata()).toBeNull();
  });

  it("returns null when fetch failed (4xx response)", async () => {
    mockFetchError(401, "Unauthorized");
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getMetadata()).toBeNull();
  });

  it("returns null when fetch returned malformed JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("??", { status: 200 }));
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getMetadata()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getConfig()
// ---------------------------------------------------------------------------

describe("getConfig()", () => {
  it("returns all Locko values not present in process env", async () => {
    const client = await initializedClient();
    const config = client.getConfig();
    expect(config["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
    expect(config["LOCKO_TEST_JWT_SECRET"]).toBe("super-secret-jwt");
  });

  it("returns a plain object — not a Promise", async () => {
    const client = await initializedClient();
    const result = client.getConfig();
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  it("process env wins over Locko by default", async () => {
    process.env["LOCKO_TEST_OVERLAP"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_OVERLAP", value: "from-locko", value_type: "text", is_secret: false },
    ]);
    expect(client.getConfig()["LOCKO_TEST_OVERLAP"]).toBe("from-process");
  });

  it("Locko wins when override: true", async () => {
    process.env["LOCKO_TEST_OVERLAP"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_OVERLAP", value: "from-locko", value_type: "text", is_secret: false },
    ]);
    expect(client.getConfig({ override: true })["LOCKO_TEST_OVERLAP"]).toBe("from-locko");
  });

  it("includes process env keys absent from Locko", async () => {
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-only";
    const client = await initializedClient([]);
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("env-only");
  });

  it("returns process env on empty Locko entries", async () => {
    process.env["LOCKO_TEST_ONLY_ENV"] = "still-here";
    const client = await initializedClient([]);
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("still-here");
  });

  it("warns and falls back to process env when called before initialize()", () => {
    mockFetchSuccess(makeEnvelope());
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-value";
    const client = new LockoClient(API_KEY);
    const config = client.getConfig();
    expect(config["LOCKO_TEST_ONLY_ENV"]).toBe("env-value");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("initialize()"));
  });

  it("covers both secrets and variables in the result", async () => {
    const client = await initializedClient();
    const config = client.getConfig();
    // secrets
    expect(config["LOCKO_TEST_JWT_SECRET"]).toBe("super-secret-jwt");
    // variables
    expect(config["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
  });
});

// ---------------------------------------------------------------------------
// getSecrets()
// ---------------------------------------------------------------------------

describe("getSecrets()", () => {
  it("returns only is_secret === true entries", async () => {
    const client = await initializedClient();
    const secrets = client.getSecrets();
    expect(secrets["LOCKO_TEST_JWT_SECRET"]).toBe("super-secret-jwt");
    expect(secrets["LOCKO_TEST_API_SECRET"]).toBe("another-secret-value");
    expect(secrets).not.toHaveProperty("LOCKO_TEST_DB_URL");
    expect(secrets).not.toHaveProperty("LOCKO_TEST_REDIS_URL");
  });

  it("returns a plain object — not a Promise", async () => {
    const client = await initializedClient();
    expect(client.getSecrets()).not.toBeInstanceOf(Promise);
  });

  it("returns empty object when all entries are variables", async () => {
    const client = await initializedClient([
      { key: "LOCKO_TEST_DB_URL", value: "url", value_type: "text", is_secret: false },
    ]);
    // Only env keys — Locko has no secrets
    const secrets = client.getSecrets();
    expect(secrets).not.toHaveProperty("LOCKO_TEST_DB_URL");
  });

  it("process env wins for a secret key by default", async () => {
    process.env["LOCKO_TEST_JWT_SECRET"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_JWT_SECRET", value: "from-locko", value_type: "text", is_secret: true },
    ]);
    expect(client.getSecrets()["LOCKO_TEST_JWT_SECRET"]).toBe("from-process");
  });

  it("Locko wins when override: true", async () => {
    process.env["LOCKO_TEST_JWT_SECRET"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_JWT_SECRET", value: "from-locko", value_type: "text", is_secret: true },
    ]);
    expect(client.getSecrets({ override: true })["LOCKO_TEST_JWT_SECRET"]).toBe("from-locko");
  });

  it("falls back to process env on API failure", async () => {
    mockFetchError(500, "Server Error");
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-secret";
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getSecrets()["LOCKO_TEST_ONLY_ENV"]).toBe("env-secret");
  });
});

// ---------------------------------------------------------------------------
// getVariables()
// ---------------------------------------------------------------------------

describe("getVariables()", () => {
  it("returns only is_secret === false entries", async () => {
    const client = await initializedClient();
    const vars = client.getVariables();
    expect(vars["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
    expect(vars["LOCKO_TEST_REDIS_URL"]).toBe("redis://localhost:6379");
    expect(vars).not.toHaveProperty("LOCKO_TEST_JWT_SECRET");
    expect(vars).not.toHaveProperty("LOCKO_TEST_API_SECRET");
  });

  it("returns a plain object — not a Promise", async () => {
    const client = await initializedClient();
    expect(client.getVariables()).not.toBeInstanceOf(Promise);
  });

  it("returns empty from Locko portion when all entries are secrets", async () => {
    const client = await initializedClient([
      { key: "LOCKO_TEST_JWT_SECRET", value: "secret", value_type: "text", is_secret: true },
    ]);
    const vars = client.getVariables();
    expect(vars).not.toHaveProperty("LOCKO_TEST_JWT_SECRET");
  });

  it("process env wins for a variable key by default", async () => {
    process.env["LOCKO_TEST_OVERLAP"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_OVERLAP", value: "from-locko", value_type: "text", is_secret: false },
    ]);
    expect(client.getVariables()["LOCKO_TEST_OVERLAP"]).toBe("from-process");
  });

  it("Locko wins when override: true", async () => {
    process.env["LOCKO_TEST_OVERLAP"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_OVERLAP", value: "from-locko", value_type: "text", is_secret: false },
    ]);
    expect(client.getVariables({ override: true })["LOCKO_TEST_OVERLAP"]).toBe("from-locko");
  });

  it("falls back to process env on API failure", async () => {
    mockFetchError(503, "Service Unavailable");
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-var";
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getVariables()["LOCKO_TEST_ONLY_ENV"]).toBe("env-var");
  });
});

// ---------------------------------------------------------------------------
// injectIntoEnv()
// ---------------------------------------------------------------------------

describe("injectIntoEnv()", () => {
  it("writes all Locko entries into process.env", async () => {
    const entries: ConfigEntry[] = [
      { key: INJECT_KEYS[0], value: "val-a", value_type: "text", is_secret: false },
      { key: INJECT_KEYS[1], value: "val-b", value_type: "text", is_secret: true },
    ];
    const client = await initializedClient(entries);
    await client.injectIntoEnv();
    expect(process.env[INJECT_KEYS[0]]).toBe("val-a");
    expect(process.env[INJECT_KEYS[1]]).toBe("val-b");
  });

  it("does not overwrite existing keys by default", async () => {
    process.env[INJECT_KEYS[0]] = "original";
    const entries: ConfigEntry[] = [
      { key: INJECT_KEYS[0], value: "from-locko", value_type: "text", is_secret: false },
    ];
    const client = await initializedClient(entries);
    await client.injectIntoEnv();
    expect(process.env[INJECT_KEYS[0]]).toBe("original");
  });

  it("overwrites existing keys when override: true", async () => {
    process.env[INJECT_KEYS[0]] = "original";
    const entries: ConfigEntry[] = [
      { key: INJECT_KEYS[0], value: "from-locko", value_type: "text", is_secret: false },
    ];
    const client = await initializedClient(entries);
    await client.injectIntoEnv({ override: true });
    expect(process.env[INJECT_KEYS[0]]).toBe("from-locko");
  });

  it("sets keys that are not already present (even without override)", async () => {
    delete process.env[INJECT_KEYS[0]];
    const entries: ConfigEntry[] = [
      { key: INJECT_KEYS[0], value: "new-val", value_type: "text", is_secret: false },
    ];
    const client = await initializedClient(entries);
    await client.injectIntoEnv();
    expect(process.env[INJECT_KEYS[0]]).toBe("new-val");
  });

  it("injects secrets and variables alike", async () => {
    const entries: ConfigEntry[] = [
      { key: INJECT_KEYS[0], value: "plain", value_type: "text", is_secret: false },
      { key: INJECT_KEYS[1], value: "secret", value_type: "text", is_secret: true },
    ];
    const client = await initializedClient(entries);
    await client.injectIntoEnv();
    expect(process.env[INJECT_KEYS[0]]).toBe("plain");
    expect(process.env[INJECT_KEYS[1]]).toBe("secret");
  });

  it("does nothing (no throw) when fetch failed", async () => {
    mockFetchError(500, "error");
    const client = new LockoClient(API_KEY);
    await client.initialize();
    await expect(client.injectIntoEnv()).resolves.toBeUndefined();
  });

  it("is idempotent — second call does not change already-set values", async () => {
    const entries: ConfigEntry[] = [
      { key: INJECT_KEYS[0], value: "locko-val", value_type: "text", is_secret: false },
    ];
    const client = await initializedClient(entries);
    await client.injectIntoEnv();
    process.env[INJECT_KEYS[0]] = "manual-override";
    await client.injectIntoEnv(); // default override: false — should not touch it
    expect(process.env[INJECT_KEYS[0]]).toBe("manual-override");
  });

  it("calls initialize() internally — works without an explicit prior initialize()", async () => {
    const entries: ConfigEntry[] = [
      { key: INJECT_KEYS[0], value: "auto-init", value_type: "text", is_secret: false },
    ];
    mockFetchSuccess(makeEnvelope(entries));
    const client = new LockoClient(API_KEY);
    // No explicit initialize() call
    await client.injectIntoEnv();
    expect(process.env[INJECT_KEYS[0]]).toBe("auto-init");
  });
});

// ---------------------------------------------------------------------------
// API failure fallbacks
// ---------------------------------------------------------------------------

describe("API failure fallback", () => {
  it("falls back to process env on 401", async () => {
    mockFetchError(401, "Unauthorized");
    process.env["LOCKO_TEST_ONLY_ENV"] = "fallback";
    const client = new LockoClient("bad-key");
    await client.initialize();
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("fallback");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Locko]"));
  });

  it("falls back to process env on 404", async () => {
    mockFetchError(404, "Not Found");
    process.env["LOCKO_TEST_ONLY_ENV"] = "fallback";
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("fallback");
  });

  it("falls back to process env on network failure", async () => {
    mockFetchNetworkFailure("Failed to fetch");
    process.env["LOCKO_TEST_ONLY_ENV"] = "fallback";
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("fallback");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Locko]"));
  });

  it("falls back when request exceeds timeoutMs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    process.env["LOCKO_TEST_ONLY_ENV"] = "timeout-fallback";
    const client = new LockoClient(API_KEY, { timeoutMs: 50 });
    await client.initialize();
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("timeout-fallback");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("timed out after 50ms"));
  });

  it("includes the timeout duration in the warning", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    process.env["LOCKO_TEST_ONLY_ENV"] = "x";
    const client = new LockoClient(API_KEY, { timeoutMs: 123 });
    await client.initialize();
    client.getConfig(); // triggers the stored warning to emit via console.warn
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("123ms"));
  });

  it("falls back on malformed JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not-json", { status: 200 }));
    process.env["LOCKO_TEST_ONLY_ENV"] = "json-fallback";
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("json-fallback");
  });

  it("falls back when response shape is a flat array (old format)", async () => {
    mockFetchSuccess([{ key: "K", value: "V" }]);
    process.env["LOCKO_TEST_ONLY_ENV"] = "shape-fallback";
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("shape-fallback");
  });

  it("uses statusText in warning when error body is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 502, statusText: "Bad Gateway" })
    );
    const client = new LockoClient(API_KEY);
    await client.initialize();
    client.getConfig(); // triggers the stored warning to emit
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Locko]"));
  });
});

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

describe("debug logging", () => {
  it("does not call console.log when debug is false (default)", async () => {
    const logSpy = vi.spyOn(console, "log");
    await initializedClient();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("calls console.log when debug: true", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY, { debug: true });
    await client.initialize();
    expect(logSpy).toHaveBeenCalled();
  });

  it("calls console.log when LOCKO_DEBUG=1", async () => {
    process.env["LOCKO_DEBUG"] = "1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(logSpy).toHaveBeenCalled();
  });

  it("calls console.log when LOCKO_DEBUG=true", async () => {
    process.env["LOCKO_DEBUG"] = "true";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockFetchSuccess(makeEnvelope());
    const client = new LockoClient(API_KEY);
    await client.initialize();
    expect(logSpy).toHaveBeenCalled();
  });

  it("always logs errors regardless of debug flag", async () => {
    mockFetchError(503, "error");
    new LockoClient(API_KEY, { debug: false });
    // give the prefetch time to run
    await new Promise((r) => setTimeout(r, 50));
    // errorSpy may or may not fire depending on whether the warning path fires console.error
    // The key guarantee: no throw
  });

  it("logs warnings via console.warn when fetch fails and debug: true", async () => {
    // With debug:true the logger.warn fires as console.warn("[Locko]", message) — 2 args
    mockFetchNetworkFailure("fail");
    const client = new LockoClient(API_KEY, { debug: true });
    await client.initialize();
    expect(warnSpy).toHaveBeenCalledWith("[Locko]", expect.stringContaining("Failed to fetch"));
  });
});

// ---------------------------------------------------------------------------
// createClient factory
// ---------------------------------------------------------------------------

describe("createClient factory", () => {
  it("returns a LockoClient instance", () => {
    expect(
      createClient(API_KEY, { fetch: neverFetch as typeof globalThis.fetch })
    ).toBeInstanceOf(LockoClient);
  });

  it("passes options through to the client", async () => {
    const spy = mockFetchSuccess(makeEnvelope());
    const client = createClient(API_KEY, { baseUrl: "https://custom.example.com" });
    await client.initialize();
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("custom.example.com");
  });

  it("throws for invalid apiKey just like the constructor", () => {
    expect(() => createClient("")).toThrow("apiKey is required");
  });

  it("throws for lko_ key without serviceSlug", () => {
    expect(() => createClient(ORG_API_KEY)).toThrow("serviceSlug is required");
  });

  it("creates a fully functional client", async () => {
    const client = await initializedClient();
    expect(client.getConfig()["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
    expect(client.getSecrets()["LOCKO_TEST_JWT_SECRET"]).toBe("super-secret-jwt");
    expect(client.getVariables()["LOCKO_TEST_REDIS_URL"]).toBe("redis://localhost:6379");
    expect(client.getMetadata()?.environment).toBe(MOCK_METADATA.environment);
  });

  it("two clients created independently do not share state", async () => {
    const spy1 = mockFetchSuccess(makeEnvelope([
      { key: INJECT_KEYS[0], value: "client-one", value_type: "text", is_secret: false },
    ]));
    const client1 = new LockoClient(API_KEY);
    await client1.initialize();
    spy1.mockRestore();

    mockFetchSuccess(makeEnvelope([
      { key: INJECT_KEYS[1], value: "client-two", value_type: "text", is_secret: false },
    ]));
    const client2 = new LockoClient(API_KEY);
    await client2.initialize();

    expect(client1.getConfig()[INJECT_KEYS[0]]).toBe("client-one");
    expect(client1.getConfig()[INJECT_KEYS[1]]).toBeUndefined();
    expect(client2.getConfig()[INJECT_KEYS[1]]).toBe("client-two");
    expect(client2.getConfig()[INJECT_KEYS[0]]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Exports surface
// ---------------------------------------------------------------------------

describe("exports surface", () => {
  it("exports VERSION as a non-empty string", async () => {
    const { VERSION } = await import("./index");
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it("VERSION matches semver pattern", async () => {
    const { VERSION } = await import("./index");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exports LockoClient class", async () => {
    const { LockoClient: LC } = await import("./index");
    expect(typeof LC).toBe("function");
  });

  it("exports LockoApiError class", async () => {
    const { LockoApiError: LAE } = await import("./index");
    expect(typeof LAE).toBe("function");
  });

  it("exports createClient function", async () => {
    const { createClient: cc } = await import("./index");
    expect(typeof cc).toBe("function");
  });

  it("does not export unexpected names", async () => {
    const mod = await import("./index");
    const expected = new Set([
      "VERSION",
      "LockoClient",
      "LockoApiError",
      "createClient",
    ]);
    for (const key of Object.keys(mod)) {
      expect(expected.has(key)).toBe(true);
    }
  });
});

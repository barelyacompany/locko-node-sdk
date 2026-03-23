import { LockoClient, LockoApiError, createClient, ConfigEntry, LockoClientOptions } from "./index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ENTRIES: ConfigEntry[] = [
  { key: "LOCKO_TEST_DB_URL", value: "postgres://localhost:5432/mydb", secret: false },
  { key: "LOCKO_TEST_REDIS_URL", value: "redis://localhost:6379", secret: false },
  { key: "LOCKO_TEST_JWT_SECRET", value: "super-secret-jwt", secret: true },
  { key: "LOCKO_TEST_API_SECRET", value: "another-secret-value", secret: true },
];

const API_KEY = "test-api-key-12345";
const FIXED_URL = "https://api-locko.barelyacompany.com/api/api-keys/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchSuccess(data: unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function mockFetchError(status: number, body: string): jest.SpyInstance {
  return jest.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { status })
  );
}

function mockFetchNetworkFailure(message: string): jest.SpyInstance {
  return jest
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new TypeError(message));
}

/** Creates a client, mocks the fetch, then initializes — returns a ready-to-use client. */
async function initializedClient(
  data: unknown,
  options?: LockoClientOptions
): Promise<LockoClient> {
  mockFetchSuccess(data);
  const client = new LockoClient(API_KEY, options);
  await client.initialize();
  return client;
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const entry of MOCK_ENTRIES) delete process.env[entry.key];
  delete process.env["LOCKO_TEST_ONLY_ENV"];
  delete process.env["LOCKO_TEST_OVERLAP"];
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("LockoClient — constructor", () => {
  it("throws when apiKey is empty", () => {
    expect(() => new LockoClient("")).toThrow("apiKey is required");
  });

  it("throws when apiKey is whitespace-only", () => {
    expect(() => new LockoClient("   ")).toThrow("apiKey is required");
  });
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

describe("initialize()", () => {
  it("fires the fetch at construction and caches it", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient(API_KEY);

    // Fetch must already be in-flight at this point.
    expect(spy).toHaveBeenCalledTimes(1);

    await client.initialize();

    // Calling initialize() again must not trigger another fetch.
    await client.initialize();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("calls the fixed Locko API URL", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient(API_KEY);
    await client.initialize();

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FIXED_URL);
  });

  it("sends the X-API-Key header", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient(API_KEY);
    await client.initialize();

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });

  it("resolves without throwing even when the API fails", async () => {
    mockFetchError(500, "Internal Server Error");
    const client = new LockoClient(API_KEY);
    await expect(client.initialize()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getConfig() — synchronous
// ---------------------------------------------------------------------------

describe("LockoClient.getConfig() — synchronous", () => {
  it("returns Locko values for keys not present in process env", async () => {
    const client = await initializedClient(MOCK_ENTRIES);

    const config = client.getConfig();

    expect(config["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
    expect(config["LOCKO_TEST_JWT_SECRET"]).toBe("super-secret-jwt");
  });

  it("is synchronous — returns a plain object, not a Promise", async () => {
    const client = await initializedClient(MOCK_ENTRIES);
    const result = client.getConfig();
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe("object");
  });

  it("process env values win over Locko values by default", async () => {
    process.env["LOCKO_TEST_OVERLAP"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_OVERLAP", value: "from-locko", secret: false },
    ]);

    expect(client.getConfig()["LOCKO_TEST_OVERLAP"]).toBe("from-process");
  });

  it("Locko values win when override: true", async () => {
    process.env["LOCKO_TEST_OVERLAP"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_OVERLAP", value: "from-locko", secret: false },
    ]);

    expect(client.getConfig({ override: true })["LOCKO_TEST_OVERLAP"]).toBe("from-locko");
  });

  it("includes process env keys not present in Locko", async () => {
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-only";
    const client = await initializedClient([]);

    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("env-only");
  });

  it("warns and returns process env when called before initialize()", () => {
    mockFetchSuccess(MOCK_ENTRIES);
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-value";

    const client = new LockoClient(API_KEY);
    // No await client.initialize() — call synchronously right away.
    const config = client.getConfig();

    expect(config["LOCKO_TEST_ONLY_ENV"]).toBe("env-value");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("initialize()"));
  });
});

// ---------------------------------------------------------------------------
// getSecrets() — synchronous
// ---------------------------------------------------------------------------

describe("LockoClient.getSecrets() — synchronous", () => {
  it("returns only entries where secret is true", async () => {
    const client = await initializedClient(MOCK_ENTRIES);
    const secrets = client.getSecrets();

    expect(secrets["LOCKO_TEST_JWT_SECRET"]).toBe("super-secret-jwt");
    expect(secrets["LOCKO_TEST_API_SECRET"]).toBe("another-secret-value");
    expect(secrets).not.toHaveProperty("LOCKO_TEST_DB_URL");
    expect(secrets).not.toHaveProperty("LOCKO_TEST_REDIS_URL");
  });

  it("is synchronous", async () => {
    const client = await initializedClient(MOCK_ENTRIES);
    expect(client.getSecrets()).not.toBeInstanceOf(Promise);
  });

  it("process env value wins for a secret key by default", async () => {
    process.env["LOCKO_TEST_JWT_SECRET"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_JWT_SECRET", value: "from-locko", secret: true },
    ]);

    expect(client.getSecrets()["LOCKO_TEST_JWT_SECRET"]).toBe("from-process");
  });

  it("Locko value wins when override: true", async () => {
    process.env["LOCKO_TEST_JWT_SECRET"] = "from-process";
    const client = await initializedClient([
      { key: "LOCKO_TEST_JWT_SECRET", value: "from-locko", secret: true },
    ]);

    expect(client.getSecrets({ override: true })["LOCKO_TEST_JWT_SECRET"]).toBe("from-locko");
  });
});

// ---------------------------------------------------------------------------
// getVariables() — synchronous
// ---------------------------------------------------------------------------

describe("LockoClient.getVariables() — synchronous", () => {
  it("returns only entries where secret is false", async () => {
    const client = await initializedClient(MOCK_ENTRIES);
    const vars = client.getVariables();

    expect(vars["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
    expect(vars["LOCKO_TEST_REDIS_URL"]).toBe("redis://localhost:6379");
    expect(vars).not.toHaveProperty("LOCKO_TEST_JWT_SECRET");
    expect(vars).not.toHaveProperty("LOCKO_TEST_API_SECRET");
  });

  it("is synchronous", async () => {
    const client = await initializedClient(MOCK_ENTRIES);
    expect(client.getVariables()).not.toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// API failure fallback
// ---------------------------------------------------------------------------

describe("API failure fallback", () => {
  it("falls back to process env on 401 and warns", async () => {
    mockFetchError(401, "Unauthorized");
    process.env["LOCKO_TEST_ONLY_ENV"] = "fallback-value";

    const client = new LockoClient("bad-key");
    await client.initialize();

    const config = client.getConfig();
    expect(config["LOCKO_TEST_ONLY_ENV"]).toBe("fallback-value");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Locko]"));
  });

  it("falls back to process env on network failure and warns", async () => {
    mockFetchNetworkFailure("Failed to fetch");
    process.env["LOCKO_TEST_ONLY_ENV"] = "fallback-value";

    const client = new LockoClient(API_KEY);
    await client.initialize();

    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("fallback-value");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Locko]"));
  });

  it("falls back when API exceeds timeoutMs", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {}) // hangs forever
    );
    process.env["LOCKO_TEST_ONLY_ENV"] = "timeout-fallback";

    const client = new LockoClient(API_KEY, { timeoutMs: 50 });
    await client.initialize();

    expect(client.getConfig()["LOCKO_TEST_ONLY_ENV"]).toBe("timeout-fallback");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("timed out after 50ms")
    );
  });

  it("getSecrets() falls back to process env on API failure", async () => {
    mockFetchError(500, "Server Error");
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-secret";

    const client = new LockoClient(API_KEY);
    await client.initialize();

    expect(client.getSecrets()["LOCKO_TEST_ONLY_ENV"]).toBe("env-secret");
  });

  it("getVariables() falls back to process env on API failure", async () => {
    mockFetchError(503, "Service Unavailable");
    process.env["LOCKO_TEST_ONLY_ENV"] = "env-var";

    const client = new LockoClient(API_KEY);
    await client.initialize();

    expect(client.getVariables()["LOCKO_TEST_ONLY_ENV"]).toBe("env-var");
  });
});

// ---------------------------------------------------------------------------
// createClient factory
// ---------------------------------------------------------------------------

describe("createClient factory", () => {
  it("returns a LockoClient instance", () => {
    expect(createClient(API_KEY)).toBeInstanceOf(LockoClient);
  });

  it("creates a functional client after initialization", async () => {
    const client = await initializedClient(MOCK_ENTRIES);
    expect(client.getConfig()["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
  });

  it("accepts timeout option", async () => {
    const options: LockoClientOptions = { timeoutMs: 5000 };
    mockFetchSuccess(MOCK_ENTRIES);
    const client = createClient(API_KEY, options);
    await client.initialize();
    expect(client.getConfig()["LOCKO_TEST_DB_URL"]).toBe("postgres://localhost:5432/mydb");
  });
});

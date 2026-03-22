import { LockoClient, LockoApiError, createClient, ConfigEntry } from "./index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ENTRIES: ConfigEntry[] = [
  { key: "DATABASE_URL", value: "postgres://localhost:5432/mydb", secret: false },
  { key: "REDIS_URL", value: "redis://localhost:6379", secret: false },
  { key: "JWT_SECRET", value: "super-secret-jwt", secret: true },
  { key: "API_SECRET", value: "another-secret-value", secret: true },
];

const API_KEY = "test-api-key-12345";
const DEFAULT_URL = "https://api-locko.barelyacompany.com/api";
const CUSTOM_URL = "https://my-locko.example.com/api";

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  jest.restoreAllMocks();
});

describe("LockoClient — constructor", () => {
  it("throws when apiKey is empty", () => {
    expect(() => new LockoClient({ apiKey: "" })).toThrow(
      "apiKey is required"
    );
  });

  it("throws when apiKey is whitespace-only", () => {
    expect(() => new LockoClient({ apiKey: "   " })).toThrow(
      "apiKey is required"
    );
  });
});

describe("LockoClient.getConfig()", () => {
  it("returns a flat key→value map of all entries on success", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({ apiKey: API_KEY });
    const config = await client.getConfig();

    expect(config).toEqual({
      DATABASE_URL: "postgres://localhost:5432/mydb",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "super-secret-jwt",
      API_SECRET: "another-secret-value",
    });
  });

  it("sends the X-API-Key header", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({ apiKey: API_KEY });
    await client.getConfig();

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });
});

describe("LockoClient.getSecrets()", () => {
  it("returns only entries where secret is true", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({ apiKey: API_KEY });
    const secrets = await client.getSecrets();

    expect(secrets).toEqual({
      JWT_SECRET: "super-secret-jwt",
      API_SECRET: "another-secret-value",
    });
    expect(secrets).not.toHaveProperty("DATABASE_URL");
    expect(secrets).not.toHaveProperty("REDIS_URL");
  });

  it("returns an empty map when there are no secrets", async () => {
    const noSecrets: ConfigEntry[] = [
      { key: "PORT", value: "3000", secret: false },
    ];
    mockFetchSuccess(noSecrets);
    const client = new LockoClient({ apiKey: API_KEY });
    expect(await client.getSecrets()).toEqual({});
  });
});

describe("LockoClient.getVariables()", () => {
  it("returns only entries where secret is false", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({ apiKey: API_KEY });
    const vars = await client.getVariables();

    expect(vars).toEqual({
      DATABASE_URL: "postgres://localhost:5432/mydb",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(vars).not.toHaveProperty("JWT_SECRET");
    expect(vars).not.toHaveProperty("API_SECRET");
  });

  it("returns an empty map when everything is a secret", async () => {
    const allSecrets: ConfigEntry[] = [
      { key: "JWT_SECRET", value: "abc", secret: true },
    ];
    mockFetchSuccess(allSecrets);
    const client = new LockoClient({ apiKey: API_KEY });
    expect(await client.getVariables()).toEqual({});
  });
});

describe("Error handling", () => {
  it("throws LockoApiError with status 401 on unauthorized response", async () => {
    mockFetchError(401, "Unauthorized");
    const client = new LockoClient({ apiKey: "bad-key" });

    await expect(client.getConfig()).rejects.toThrow(LockoApiError);
    await expect(client.getConfig()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("includes the HTTP status code in the error message", async () => {
    mockFetchError(403, "Forbidden");
    const client = new LockoClient({ apiKey: API_KEY });

    await expect(client.getConfig()).rejects.toThrow("403");
  });

  it("throws a plain Error on network failure", async () => {
    mockFetchNetworkFailure("Failed to fetch");
    const client = new LockoClient({ apiKey: API_KEY });

    await expect(client.getConfig()).rejects.toThrow(
      "Locko: network request failed"
    );
    // Should NOT be a LockoApiError
    await expect(client.getConfig()).rejects.not.toBeInstanceOf(LockoApiError);
  });

  it("throws when the API returns a non-array JSON body", async () => {
    mockFetchSuccess({ error: "unexpected" });
    const client = new LockoClient({ apiKey: API_KEY });

    await expect(client.getConfig()).rejects.toThrow(
      "unexpected API response shape"
    );
  });
});

describe("Server URL handling", () => {
  it("uses the default server URL when none is provided", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({ apiKey: API_KEY });
    await client.getConfig();

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_URL}/api-keys/config`);
  });

  it("uses a custom server URL when provided", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({ apiKey: API_KEY, serverUrl: CUSTOM_URL });
    await client.getConfig();

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CUSTOM_URL}/api-keys/config`);
  });

  it("strips a trailing slash from the provided serverUrl", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({
      apiKey: API_KEY,
      serverUrl: `${CUSTOM_URL}/`,
    });
    await client.getConfig();

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CUSTOM_URL}/api-keys/config`);
    // Must not contain double slashes in the path
    expect(url).not.toContain("//api-keys");
  });

  it("strips multiple trailing slashes from serverUrl", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    const client = new LockoClient({
      apiKey: API_KEY,
      serverUrl: `${CUSTOM_URL}///`,
    });
    await client.getConfig();

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${CUSTOM_URL}/api-keys/config`);
  });
});

describe("createClient factory", () => {
  it("returns a LockoClient instance", () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const client = createClient({ apiKey: API_KEY });
    expect(client).toBeInstanceOf(LockoClient);
  });

  it("creates a functional client via the factory", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const client = createClient({ apiKey: API_KEY });
    const config = await client.getConfig();
    expect(Object.keys(config)).toHaveLength(MOCK_ENTRIES.length);
  });
});

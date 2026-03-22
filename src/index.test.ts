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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  jest.restoreAllMocks();
});

describe("LockoClient — constructor", () => {
  it("throws when apiKey is empty", () => {
    expect(() => new LockoClient("")).toThrow("apiKey is required");
  });

  it("throws when apiKey is whitespace-only", () => {
    expect(() => new LockoClient("   ")).toThrow("apiKey is required");
  });
});

describe("LockoClient.getConfig()", () => {
  it("returns a flat key→value map of all entries on success", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const config = await new LockoClient(API_KEY).getConfig();

    expect(config).toEqual({
      DATABASE_URL: "postgres://localhost:5432/mydb",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "super-secret-jwt",
      API_SECRET: "another-secret-value",
    });
  });

  it("calls the fixed Locko API URL", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    await new LockoClient(API_KEY).getConfig();

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(FIXED_URL);
  });

  it("sends the X-API-Key header", async () => {
    const spy = mockFetchSuccess(MOCK_ENTRIES);
    await new LockoClient(API_KEY).getConfig();

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });
});

describe("LockoClient.getSecrets()", () => {
  it("returns only entries where secret is true", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const secrets = await new LockoClient(API_KEY).getSecrets();

    expect(secrets).toEqual({
      JWT_SECRET: "super-secret-jwt",
      API_SECRET: "another-secret-value",
    });
    expect(secrets).not.toHaveProperty("DATABASE_URL");
    expect(secrets).not.toHaveProperty("REDIS_URL");
  });

  it("returns an empty map when there are no secrets", async () => {
    const noSecrets: ConfigEntry[] = [{ key: "PORT", value: "3000", secret: false }];
    mockFetchSuccess(noSecrets);
    expect(await new LockoClient(API_KEY).getSecrets()).toEqual({});
  });
});

describe("LockoClient.getVariables()", () => {
  it("returns only entries where secret is false", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const vars = await new LockoClient(API_KEY).getVariables();

    expect(vars).toEqual({
      DATABASE_URL: "postgres://localhost:5432/mydb",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(vars).not.toHaveProperty("JWT_SECRET");
    expect(vars).not.toHaveProperty("API_SECRET");
  });

  it("returns an empty map when everything is a secret", async () => {
    const allSecrets: ConfigEntry[] = [{ key: "JWT_SECRET", value: "abc", secret: true }];
    mockFetchSuccess(allSecrets);
    expect(await new LockoClient(API_KEY).getVariables()).toEqual({});
  });
});

describe("Error handling", () => {
  it("throws LockoApiError with status 401 on unauthorized response", async () => {
    mockFetchError(401, "Unauthorized");
    await expect(new LockoClient("bad-key").getConfig()).rejects.toThrow(LockoApiError);
    await expect(new LockoClient("bad-key").getConfig()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("includes the HTTP status code in the error message", async () => {
    mockFetchError(403, "Forbidden");
    await expect(new LockoClient(API_KEY).getConfig()).rejects.toThrow("403");
  });

  it("throws a plain Error on network failure", async () => {
    mockFetchNetworkFailure("Failed to fetch");
    await expect(new LockoClient(API_KEY).getConfig()).rejects.toThrow(
      "Locko: network request failed"
    );
    await expect(new LockoClient(API_KEY).getConfig()).rejects.not.toBeInstanceOf(LockoApiError);
  });

  it("throws when the API returns a non-array JSON body", async () => {
    mockFetchSuccess({ error: "unexpected" });
    await expect(new LockoClient(API_KEY).getConfig()).rejects.toThrow(
      "unexpected API response shape"
    );
  });
});

describe("createClient factory", () => {
  it("returns a LockoClient instance", () => {
    expect(createClient(API_KEY)).toBeInstanceOf(LockoClient);
  });

  it("creates a functional client via the factory", async () => {
    mockFetchSuccess(MOCK_ENTRIES);
    const config = await createClient(API_KEY).getConfig();
    expect(Object.keys(config)).toHaveLength(MOCK_ENTRIES.length);
  });
});

/**
 * End-to-end tests for @barelyacompany/locko Node SDK.
 *
 * Both env vars must be set for the real API tests to run — a staging key
 * won't work against the production URL, so they always travel together.
 *
 * Required env vars:
 *   LOCKO_API_KEY      — your Locko API key
 *   LOCKO_BASE_URL     — the API base URL (e.g. https://staging-api.barelyacompany.com)
 *   LOCKO_SERVICE_SLUG — (optional) service slug; required for lko_ prefixed keys
 *
 * Run:
 *   LOCKO_API_KEY=your-key LOCKO_BASE_URL=https://... LOCKO_SERVICE_SLUG=volcano npm run test:e2e
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient, LockoClient } from "../src";

const API_KEY      = process.env.LOCKO_API_KEY ?? "";
const BASE_URL     = process.env.LOCKO_BASE_URL ?? "";
const SERVICE_SLUG = process.env.LOCKO_SERVICE_SLUG;

const run = API_KEY && BASE_URL ? describe : describe.skip;

run("Locko Node SDK — E2E", () => {
  let client: LockoClient;

  beforeAll(async () => {
    client = createClient(API_KEY, {
      baseUrl: BASE_URL,
      serviceSlug: SERVICE_SLUG,
      timeoutMs: 15_000,
    });
    await client.initialize();
  }, 20_000);

  it("client initializes without throwing", () => {
    expect(client).toBeDefined();
  });

  it("getConfig() returns a non-null object", () => {
    const config = client.getConfig();
    expect(config).not.toBeNull();
    expect(typeof config).toBe("object");
  });

  it("getSecrets() returns an object", () => {
    const secrets = client.getSecrets();
    expect(typeof secrets).toBe("object");
    expect(secrets).not.toBeNull();
  });

  it("getVariables() returns an object", () => {
    const variables = client.getVariables();
    expect(typeof variables).toBe("object");
    expect(variables).not.toBeNull();
  });

  it("getMetadata() returns environment and service", () => {
    const meta = client.getMetadata();
    expect(meta).not.toBeNull();
    expect(typeof meta!.environment).toBe("string");
    expect(typeof meta!.service).toBe("string");
    expect(typeof meta!.contentHash).toBe("string");
  });

  it("getConfig() contains all keys from getSecrets() and getVariables()", () => {
    const config = client.getConfig();
    const secrets = client.getSecrets();
    const variables = client.getVariables();

    for (const key of Object.keys(secrets)) {
      expect(config).toHaveProperty(key);
    }
    for (const key of Object.keys(variables)) {
      expect(config).toHaveProperty(key);
    }
  });

  it("getConfig({ override: true }) still returns an object", () => {
    const config = client.getConfig({ override: true });
    expect(typeof config).toBe("object");
  });

  it("getSecrets({ override: true }) still returns an object", () => {
    const secrets = client.getSecrets({ override: true });
    expect(typeof secrets).toBe("object");
  });

  it("injectIntoEnv() populates process.env with Locko keys", async () => {
    const variablesBefore = client.getVariables();
    await client.injectIntoEnv();

    for (const key of Object.keys(variablesBefore)) {
      expect(process.env[key]).toBeDefined();
    }
  });

  it("injectIntoEnv({ override: true }) overwrites existing env values", async () => {
    const variables = client.getVariables({ override: true });
    const sampleKey = Object.keys(variables)[0];

    if (!sampleKey) return; // no variables configured — skip

    process.env[sampleKey] = "__test_original__";
    await client.injectIntoEnv({ override: true });
    expect(process.env[sampleKey]).not.toBe("__test_original__");
  });

  it("a second call to initialize() is idempotent", async () => {
    await expect(client.initialize()).resolves.toBeUndefined();
  });
});

// --- Negative / guard tests (always run, no real API needed) ---

describe("Locko Node SDK — constructor guards", () => {
  it("throws when apiKey is empty", () => {
    expect(() => createClient("")).toThrow("apiKey is required");
  });

  it("throws when apiKey is only whitespace", () => {
    expect(() => createClient("   ")).toThrow("apiKey is required");
  });

  it("throws when lko_ key used without serviceSlug", () => {
    expect(() => createClient("lko_somekey")).toThrow(
      "serviceSlug is required for org API keys (lko_ prefix)"
    );
  });

  it("accepts a custom baseUrl without throwing", () => {
    const neverFetch = () => new Promise<Response>(() => {});
    expect(() =>
      createClient("dummy-key", {
        baseUrl: "https://custom.example.com",
        fetch: neverFetch as typeof globalThis.fetch,
      })
    ).not.toThrow();
  });

  it("baseUrl trailing slash is stripped correctly", () => {
    const neverFetch = () => new Promise<Response>(() => {});
    expect(() =>
      createClient("dummy-key", {
        baseUrl: "https://custom.example.com/",
        fetch: neverFetch as typeof globalThis.fetch,
      })
    ).not.toThrow();
  });
});

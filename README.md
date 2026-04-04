# @barelyacompany/locko-node-sdk

Official Node.js SDK for [Locko](https://locko.barelyacompany.com) — secrets and config management.

## Requirements

Node.js 18 or later (uses native `fetch`).

## Installation

```bash
npm install @barelyacompany/locko-node-sdk
```

## Quick start

> **You need an API key to fetch config.** The API key is the one credential you must supply yourself — as a real environment variable, a CI secret, or a vault entry. It cannot come from Locko itself.

```ts
import { createClient } from "@barelyacompany/locko-node-sdk";

const client = createClient(process.env.LOCKO_API_KEY!);
await client.initialize();

// All entries (secrets + plain variables) as a flat key-value map
const config = client.getConfig();

const db = new DataSource({ url: config.DATABASE_URL });
const redis = new Redis(config.REDIS_URL);
```

Call `await client.initialize()` once at startup — it waits for the background fetch to complete and caches the result. All read methods (`getConfig`, `getSecrets`, `getVariables`) are synchronous after that.

---

## API keys

| Prefix | Scope | Extra requirement |
|--------|-------|-------------------|
| `lk_`  | Single service | None |
| `lko_` | Org-wide | Must pass `serviceSlug` |

```ts
// lk_ key — no extra config needed
const client = createClient("lk_...");

// lko_ key — serviceSlug is required (throws if omitted)
const client = createClient("lko_...", { serviceSlug: "my-service" });
```

---

## API

### `createClient(apiKey, options?)` → `LockoClient`

Convenience factory. Equivalent to `new LockoClient(apiKey, options)`.

---

### `new LockoClient(apiKey, options?)`

Constructs a new client and immediately starts fetching config in the background. Throws synchronously if:
- `apiKey` is empty or whitespace
- `apiKey` starts with `lko_` and `serviceSlug` is not provided

---

### `await client.initialize()` → `Promise<void>`

Waits for the background fetch to settle and caches the result. Safe to call multiple times — subsequent calls are no-ops. **Never throws** — if the API is unreachable, it falls back to `process.env` silently and emits a console warning.

---

### `client.getConfig(options?)` → `Record<string, string>`

Returns all config entries (secrets + variables) merged with `process.env`. By default, `process.env` values win over Locko values for any key that exists in both.

```ts
const config = client.getConfig();                   // process.env wins on conflict
const config = client.getConfig({ override: true }); // Locko wins on conflict
```

---

### `client.getSecrets(options?)` → `Record<string, string>`

Returns only entries where `is_secret` is `true`, merged with `process.env` using the same precedence rules.

---

### `client.getVariables(options?)` → `Record<string, string>`

Returns only entries where `is_secret` is `false`, merged with `process.env` using the same precedence rules.

---

### `client.getMetadata()` → `ConfigMetadata | null`

Returns metadata from the last successful fetch. Returns `null` if the fetch failed or `initialize()` has not been awaited yet.

```ts
const meta = client.getMetadata();
// { contentHash: "abc123", environment: "production", service: "my-service" }
```

---

### `client.injectIntoEnv(options?)` → `Promise<void>`

Writes all config entries into `process.env`. Calls `initialize()` internally if not already called. Existing keys are preserved unless `{ override: true }` is passed.

```ts
await client.injectIntoEnv();                    // won't clobber existing keys
await client.injectIntoEnv({ override: true });  // force-overwrite
```

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeoutMs` | `number` | `3000` | Request timeout in milliseconds |
| `baseUrl` | `string` | `https://api-locko.barelyacompany.com` | Override the API base URL (e.g. for staging) |
| `serviceSlug` | `string` | — | Service slug; required for `lko_` keys |
| `debug` | `boolean` | `false` | Enable verbose debug logging |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation (useful for testing) |

---

## Fallback behaviour

If the Locko API is unreachable for any reason (network failure, timeout, non-2xx response, malformed JSON), all read methods fall back to `process.env` transparently and emit a single `console.warn`. Your app keeps running.

---

## Error handling

The only methods that throw are the **constructor** and `createClient`:

```ts
import { createClient } from "@barelyacompany/locko-node-sdk";

// These throw synchronously
createClient("");                      // Error: apiKey is required
createClient("lko_...");               // Error: serviceSlug is required for org API keys (lko_ prefix)
createClient("lko_...", { serviceSlug: "svc" }); // OK
```

`initialize()` and all read methods never throw — they fall back to `process.env` on any API error.

`LockoApiError` is exported for cases where you need to identify HTTP errors by status code in your own error boundaries or retry logic:

```ts
import { LockoApiError } from "@barelyacompany/locko-node-sdk";

if (err instanceof LockoApiError) {
  console.error(`HTTP ${err.statusCode}: ${err.message}`);
}
```

---

## Debug logging

Pass `debug: true` to log request and response details to the console:

```ts
const client = createClient(process.env.LOCKO_API_KEY!, { debug: true });
```

Or set the environment variable without changing code:

```bash
LOCKO_DEBUG=1 node server.js
```

Accepted values: `"1"` or `"true"`. Errors are always logged regardless of the debug flag.

---

## Testing

```bash
npm test                 # unit tests (101 tests, always safe to run)
npm run test:watch       # watch mode
npm run test:coverage    # with v8 coverage report
npm run test:e2e         # E2E tests against the live API
npm run typecheck        # TypeScript type check without building
```

### E2E tests

E2E tests auto-skip when credentials are absent, so `npm test` is always safe in CI.

To run them, create a `.env` file in the project root (see `.env.example`):

```bash
cp .env.example .env
# fill in your values
npm run test:e2e
```

Or pass credentials inline:

```bash
LOCKO_API_KEY=lk_... LOCKO_BASE_URL=https://api-locko.barelyacompany.com npm run test:e2e
```

Required variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `LOCKO_API_KEY` | Yes | Your Locko API key |
| `LOCKO_BASE_URL` | Yes | API base URL |
| `LOCKO_SERVICE_SLUG` | For `lko_` keys | Service slug |

---

## TypeScript

All types are bundled. The package ships both CJS and ESM builds — use whichever your bundler or runtime prefers.

Key exported types:

```ts
interface ConfigEntry {
  key: string;
  value: string;
  value_type: string;
  is_secret: boolean;
}

interface ConfigMetadata {
  contentHash: string;
  environment: string;
  service: string;
}

interface LockoClientOptions {
  timeoutMs?: number;
  baseUrl?: string;
  serviceSlug?: string;
  debug?: boolean;
  fetch?: typeof globalThis.fetch;
}

interface GetConfigOptions {
  override?: boolean;
}
```

## License

MIT

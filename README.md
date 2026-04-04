# @barelyacompany/locko

Official Node.js SDK for [Locko](https://locko.barelyacompany.com) — secrets and config management.

## Requirements

Node.js 18 or later (uses native `fetch`).

## Installation

```bash
npm install @barelyacompany/locko
```

## Quick start

> **You need an API key to fetch config.** The API key is the one credential you must supply yourself — as a real environment variable, a CI secret, or a vault entry.

```ts
import { createClient } from "@barelyacompany/locko";

const client = createClient(process.env.LOCKO_API_KEY!);
await client.initialize();

// All entries (secrets + plain variables) as a flat map
const config = client.getConfig();

const db = new DataSource({ url: config.DATABASE_URL });
const redis = new Redis(config.REDIS_URL);
```

## API keys

| Prefix | Scope | Extra requirement |
|--------|-------|-------------------|
| `lk_`  | Single service | None |
| `lko_` | Org-wide | Must pass `serviceSlug` |

```ts
// Org key — serviceSlug is required
const client = createClient(process.env.LOCKO_API_KEY!, { serviceSlug: "my-service" });
```

## API

### `createClient(apiKey, options?)` → `LockoClient`

Convenience factory. Throws synchronously if `apiKey` is empty or an `lko_` key is used without `serviceSlug`.

---

### `new LockoClient(apiKey, options?)`

Constructs a new client. The fetch is started immediately in the background.

---

### `await client.initialize()`

Waits for the background fetch to complete and caches the result. Call this once at startup before reading config. Safe to call multiple times — subsequent calls are no-ops.

---

### `client.getConfig(options?)` → `Record<string, string>`

Returns all config entries (secrets + variables) merged with `process.env`. `process.env` values win by default; pass `{ override: true }` to let Locko values win.

```ts
const config = client.getConfig();
const config = client.getConfig({ override: true }); // Locko wins
```

---

### `client.getSecrets(options?)` → `Record<string, string>`

Returns only entries where `is_secret` is `true`.

---

### `client.getVariables(options?)` → `Record<string, string>`

Returns only entries where `is_secret` is `false`.

---

### `client.getMetadata()` → `ConfigMetadata | null`

Returns metadata from the last successful fetch, or `null` if the fetch failed or `initialize()` hasn't been called.

```ts
const meta = client.getMetadata();
// { contentHash: "...", environment: "production", service: "my-service" }
```

---

### `client.injectIntoEnv(options?)` → `Promise<void>`

Writes all config entries into `process.env`. Existing keys are not overwritten unless `{ override: true }` is passed.

```ts
await client.injectIntoEnv();                    // safe — won't clobber existing
await client.injectIntoEnv({ override: true });  // force-overwrite
```

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeoutMs` | `number` | `3000` | Request timeout in milliseconds |
| `baseUrl` | `string` | `https://api-locko.barelyacompany.com` | Override the API base URL |
| `serviceSlug` | `string` | — | Service slug; required for `lko_` keys |
| `debug` | `boolean` | `false` | Enable debug logging |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |

---

## Fallback behaviour

If the Locko API is unreachable (network failure, timeout, non-2xx response), all methods fall back to `process.env` and emit a console warning. Your app keeps running.

---

## Error handling

```ts
import { createClient, LockoApiError } from "@barelyacompany/locko";

try {
  const client = createClient(process.env.LOCKO_API_KEY!);
  await client.initialize();
} catch (err) {
  if (err instanceof LockoApiError) {
    console.error(`API error ${err.statusCode}: ${err.message}`);
  }
}
```

| Error class | When thrown |
|-------------|-------------|
| `LockoApiError` | Non-2xx HTTP response. Has `.statusCode: number`. |
| `Error` | Empty `apiKey`, missing `serviceSlug` for `lko_` key, or unexpected response shape. |

---

## Debug logging

Pass `debug: true` or set `LOCKO_DEBUG=1` (or `LOCKO_DEBUG=true`) in your environment:

```bash
LOCKO_DEBUG=1 node server.js
```

Errors are always logged regardless of the debug flag.

---

## Testing

```bash
npm test                 # unit tests
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report
npm run test:e2e         # E2E tests against the live API (requires env vars)
```

E2E tests require:

```
LOCKO_API_KEY=lk_...
LOCKO_BASE_URL=https://api-locko.barelyacompany.com
LOCKO_SERVICE_SLUG=my-service   # only for lko_ keys
```

E2E tests auto-skip when env vars are absent, so `npm test` is always safe to run without them.

---

## TypeScript

All types are bundled. Key exported interfaces:

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
```

## License

MIT

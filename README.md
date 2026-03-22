# locko

Official Node.js SDK for [Locko](https://barelyacompany.com) — a secrets and config management tool.

## Requirements

- Node.js 18 or later (uses native `fetch`)

## Installation

```bash
npm install locko
```

## Quick start

```ts
import { createClient } from "locko";

const client = createClient({
  apiKey: process.env.LOCKO_API_KEY!,
});

// All config entries (secrets + plain variables) as a flat map
const config = await client.getConfig();
console.log(config.DATABASE_URL);

// Only secret entries
const secrets = await client.getSecrets();
console.log(secrets.JWT_SECRET);

// Only non-secret (plain variable) entries
const vars = await client.getVariables();
console.log(vars.PORT);
```

## Configuration

| Option      | Type     | Required | Default                                         | Description                        |
| ----------- | -------- | -------- | ----------------------------------------------- | ---------------------------------- |
| `apiKey`    | `string` | Yes      | —                                               | Your Locko API key                 |
| `serverUrl` | `string` | No       | `https://api-locko.barelyacompany.com/api`      | Override the Locko API base URL    |

### Custom server URL

```ts
const client = createClient({
  apiKey: process.env.LOCKO_API_KEY!,
  serverUrl: "https://my-self-hosted-locko.example.com/api",
});
```

## API

### `createClient(options)` → `LockoClient`

Convenience factory that creates and returns a `LockoClient` instance.

---

### `new LockoClient(options)`

Constructs a new client. Throws synchronously if `apiKey` is empty or missing.

---

### `client.getConfig()` → `Promise<Record<string, string>>`

Fetches **all** config entries (both secrets and plain variables) and returns them as a flat `{ key: value }` map.

```ts
const config = await client.getConfig();
// { DATABASE_URL: "postgres://...", JWT_SECRET: "..." }
```

---

### `client.getSecrets()` → `Promise<Record<string, string>>`

Fetches config entries and returns only those where `secret: true`.

```ts
const secrets = await client.getSecrets();
// { JWT_SECRET: "..." }
```

---

### `client.getVariables()` → `Promise<Record<string, string>>`

Fetches config entries and returns only those where `secret: false`.

```ts
const vars = await client.getVariables();
// { DATABASE_URL: "postgres://...", PORT: "3000" }
```

---

## Error handling

The SDK throws two kinds of errors:

| Error class    | When thrown                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `LockoApiError` | The API responded with a non-2xx HTTP status. Exposes a `statusCode` field. |
| `Error`        | Network failure, or unexpected response shape.                              |

```ts
import { createClient, LockoApiError } from "locko";

try {
  const config = await client.getConfig();
} catch (err) {
  if (err instanceof LockoApiError) {
    console.error(`API error ${err.statusCode}: ${err.message}`);
  } else {
    console.error("Network or parse error:", err);
  }
}
```

## TypeScript

All types are included. The exported `ConfigEntry` interface mirrors the raw API response shape:

```ts
interface ConfigEntry {
  key: string;
  value: string;
  secret: boolean;
}
```

## License

MIT

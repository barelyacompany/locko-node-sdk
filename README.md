# locko-node-sdk

Node.js SDK for [Locko](https://locko.dev) — a secrets and environment variable management platform. Use this SDK to fetch client-safe config variables or server-side secrets before your app initializes, in any Node.js-based framework (React, Next.js, NestJS, Vue, etc.).

## Installation

```bash
npm install locko-node-sdk
```

## Usage

### Initialize the client

```ts
import { LockoClient } from 'locko-node-sdk';

const locko = new LockoClient({
  apiKey: 'your-api-key',
  apiUrl: 'https://api.locko.dev',
});
```

> **Note:** API keys are scoped with least-privilege access. Use a client-scoped key to access client config, and a server-scoped key to access server secrets.

### Fetch client-safe config variables

Use this in browser or SSR contexts where you only need public configuration (e.g. feature flags, theme settings).

```ts
const clientConfig = await locko.getClientConfig();
console.log(clientConfig.APP_TITLE); // 'My App'
```

### Fetch server-side secrets

Use this in server-only contexts (e.g. API routes, server startup). Never expose these to the client.

```ts
const serverConfig = await locko.getServerConfig();
console.log(serverConfig.DB_HOST); // 'localhost'
```

### Load secrets into `process.env`

Populates `process.env` from your Locko server config. By default, existing environment variables are not overwritten.

```ts
// At app startup, before any other code runs
await locko.loadEnv();

// To overwrite existing env vars:
await locko.loadEnv(true);
```

## API

### `new LockoClient(options)`

| Option   | Type     | Required | Description                       |
|----------|----------|----------|-----------------------------------|
| `apiKey` | `string` | Yes      | Your Locko API key                |
| `apiUrl` | `string` | Yes      | Base URL of the Locko API         |

### `client.getClientConfig(): Promise<Record<string, string>>`

Returns client-safe configuration variables.

### `client.getServerConfig(): Promise<Record<string, string>>`

Returns server-side secret variables.

### `client.loadEnv(overwrite?: boolean): Promise<void>`

Fetches server config and populates `process.env`. Pass `true` to overwrite existing variables.

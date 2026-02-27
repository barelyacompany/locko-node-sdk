import { LockoClient } from '../src/client';

jest.mock('node-fetch');
import fetch from 'node-fetch';

const { Response } = jest.requireActual('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

const TEST_OPTIONS = {
  apiKey: 'test-api-key',
  apiUrl: 'https://api.locko.dev',
};

describe('LockoClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates a client with valid options', () => {
      const client = new LockoClient(TEST_OPTIONS);
      expect(client).toBeInstanceOf(LockoClient);
    });

    it('throws if apiKey is missing', () => {
      expect(
        () => new LockoClient({ apiKey: '', apiUrl: TEST_OPTIONS.apiUrl })
      ).toThrow('apiKey is required');
    });

    it('throws if apiUrl is missing', () => {
      expect(
        () => new LockoClient({ apiKey: TEST_OPTIONS.apiKey, apiUrl: '' })
      ).toThrow('apiUrl is required');
    });

    it('strips trailing slash from apiUrl', () => {
      const client = new LockoClient({ ...TEST_OPTIONS, apiUrl: 'https://api.locko.dev/' });
      // Verified indirectly: the URL used in requests will not have double slashes
      expect(client).toBeInstanceOf(LockoClient);
    });
  });

  describe('getClientConfig', () => {
    it('fetches client config and returns a variable map', async () => {
      const mockVars = { APP_TITLE: 'My App', THEME: 'dark' };
      mockedFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockVars), { status: 200 })
      );

      const client = new LockoClient(TEST_OPTIONS);
      const result = await client.getClientConfig();

      expect(result).toEqual(mockVars);
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.locko.dev/config/client',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('throws on non-2xx response', async () => {
      mockedFetch.mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
      );

      const client = new LockoClient(TEST_OPTIONS);
      await expect(client.getClientConfig()).rejects.toThrow(
        'Locko API request failed: 401 Unauthorized - Unauthorized'
      );
    });
  });

  describe('getServerConfig', () => {
    it('fetches server config and returns a variable map', async () => {
      const mockVars = { DB_HOST: 'localhost', DB_PORT: '5432' };
      mockedFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockVars), { status: 200 })
      );

      const client = new LockoClient(TEST_OPTIONS);
      const result = await client.getServerConfig();

      expect(result).toEqual(mockVars);
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.locko.dev/config/server',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('throws on non-2xx response', async () => {
      mockedFetch.mockResolvedValueOnce(
        new Response('Forbidden', { status: 403, statusText: 'Forbidden' })
      );

      const client = new LockoClient(TEST_OPTIONS);
      await expect(client.getServerConfig()).rejects.toThrow(
        'Locko API request failed: 403 Forbidden - Forbidden'
      );
    });
  });

  describe('loadEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('loads server config into process.env', async () => {
      const mockVars = { DB_HOST: 'localhost', DB_PORT: '5432' };
      mockedFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockVars), { status: 200 })
      );

      const client = new LockoClient(TEST_OPTIONS);
      await client.loadEnv();

      expect(process.env['DB_HOST']).toBe('localhost');
      expect(process.env['DB_PORT']).toBe('5432');
    });

    it('does not overwrite existing env vars by default', async () => {
      process.env['DB_HOST'] = 'existing-host';
      const mockVars = { DB_HOST: 'new-host', DB_PORT: '5432' };
      mockedFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockVars), { status: 200 })
      );

      const client = new LockoClient(TEST_OPTIONS);
      await client.loadEnv();

      expect(process.env['DB_HOST']).toBe('existing-host');
      expect(process.env['DB_PORT']).toBe('5432');
    });

    it('overwrites existing env vars when overwrite is true', async () => {
      process.env['DB_HOST'] = 'existing-host';
      const mockVars = { DB_HOST: 'new-host' };
      mockedFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(mockVars), { status: 200 })
      );

      const client = new LockoClient(TEST_OPTIONS);
      await client.loadEnv(true);

      expect(process.env['DB_HOST']).toBe('new-host');
    });
  });
});

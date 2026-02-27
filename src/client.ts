import fetch from 'node-fetch';
import { LockoClientOptions, LockoVariableMap } from './types';

export class LockoClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(options: LockoClientOptions) {
    if (!options.apiKey) {
      throw new Error('apiKey is required');
    }
    if (!options.apiUrl) {
      throw new Error('apiUrl is required');
    }
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
  }

  /**
   * Fetches client-safe (public) configuration variables from the Locko API.
   * These variables are safe to expose on the client side.
   */
  async getClientConfig(): Promise<LockoVariableMap> {
    return this.fetchVariables('/config/client');
  }

  /**
   * Fetches server-side secret variables from the Locko API.
   * These variables should only be used in server-side contexts.
   */
  async getServerConfig(): Promise<LockoVariableMap> {
    return this.fetchVariables('/config/server');
  }

  /**
   * Fetches server-side config and loads the variables into process.env.
   * Existing process.env values are not overwritten unless overwrite is true.
   */
  async loadEnv(overwrite = false): Promise<void> {
    const vars = await this.getServerConfig();
    for (const [key, value] of Object.entries(vars)) {
      if (overwrite || process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  private async fetchVariables(path: string): Promise<LockoVariableMap> {
    const url = `${this.apiUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Locko API request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`
      );
    }

    const data = (await response.json()) as LockoVariableMap;
    return data;
  }
}
